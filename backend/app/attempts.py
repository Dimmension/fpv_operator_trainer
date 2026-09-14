from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.config import get_settings
from app.generators import generate_memory_rounds, generate_number_grid
from app.models import (
    Attempt,
    AttemptEvent,
    AttemptRound,
    AttemptStatus,
    EventType,
    FinishReason,
    ModuleLevel,
    OperatorStats,
    TrainingModule,
    User,
)
from app.schemas import (
    AttemptHistoryItem,
    AttemptMetrics,
    AttemptState,
    AttentionActionRequest,
    MemoryAnswerRequest,
    MemoryRoundState,
    ModuleSummary,
)
from app.scoring import attention_grade, evaluate_memory_answer, per_minute_pace


def utc_now() -> datetime:
    return datetime.now(UTC)


def elapsed_ms(attempt: Attempt, now: datetime | None = None) -> int:
    current = now or utc_now()
    started_at = attempt.started_at
    if started_at.tzinfo is None:
        current = current.replace(tzinfo=None)
    return max(0, int((current - started_at).total_seconds() * 1000))


def as_float(value: Decimal | None) -> float | None:
    return float(value) if value is not None else None


def as_utc(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=UTC)


def next_event_sequence(attempt: Attempt) -> int:
    return max((event.sequence_number for event in attempt.events), default=-1) + 1


async def get_demo_operator(session: AsyncSession) -> User:
    operator = await session.scalar(
        select(User).where(User.email == get_settings().demo_operator_email)
    )
    if operator is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Демонстрационный оператор не создан. Выполните начальное заполнение БД.",
        )
    return operator


def attempt_query(attempt_id: int, operator_id: int, *, lock: bool = False):
    query = (
        select(Attempt)
        .where(Attempt.id == attempt_id, Attempt.operator_id == operator_id)
        .options(
            joinedload(Attempt.level).joinedload(ModuleLevel.module),
            selectinload(Attempt.events),
            selectinload(Attempt.rounds),
        )
    )
    return query.with_for_update(of=Attempt) if lock else query


async def load_attempt(
    session: AsyncSession, attempt_id: int, operator_id: int, *, lock: bool = False
) -> Attempt:
    attempt = await session.scalar(attempt_query(attempt_id, operator_id, lock=lock))
    if attempt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Попытка не найдена")
    return attempt


def build_attempt_state(attempt: Attempt) -> AttemptState:
    module = attempt.level.module
    config = attempt.level_config_snapshot
    started_at = as_utc(attempt.started_at)
    assert started_at is not None
    deadline = None
    current_round = None

    if module.exercise_type == "sequential_search":
        deadline = started_at + timedelta(milliseconds=config["time_limit_ms"])
        task = {
            **attempt.task_snapshot,
            "grid_rows": config["grid_rows"],
            "grid_columns": config["grid_columns"],
            "min_number": config["min_number"],
            "max_number": config["max_number"],
            "time_limit_ms": config["time_limit_ms"],
            "font_size_pt": config.get("font_size_pt", 16),
            "font_style": config.get("font_style", "standard"),
            "show_cell_borders": config.get("show_cell_borders", True),
            "next_number": min(
                config["min_number"] + attempt.items_found,
                config["max_number"],
            ),
            "next_action_sequence": next_event_sequence(attempt),
            "normative_range": config["normative_range"],
        }
    else:
        task = {
            "grid_rows": config["grid_rows"],
            "grid_columns": config["grid_columns"],
            "round_count": config["round_count"],
            "shape_count": config["shape_count"],
            "shapes": config["shapes"],
        }
        active_round = next((item for item in attempt.rounds if item.answered_at is None), None)
        if attempt.status == AttemptStatus.in_progress and active_round is not None:
            current_round = MemoryRoundState(
                round_number=active_round.round_number,
                total_rounds=config["round_count"],
                exposure_ms=config["exposure_ms"],
                stimulus=active_round.stimulus,
            )

    return AttemptState(
        id=attempt.id,
        module_code=module.code,
        module_title=module.title,
        status=attempt.status,
        finish_reason=attempt.finish_reason,
        started_at=started_at,
        deadline_at=deadline,
        duration_ms=attempt.duration_ms,
        task=task,
        metrics=AttemptMetrics(
            score=as_float(attempt.score),
            accuracy=as_float(attempt.accuracy),
            correct_actions=attempt.correct_actions,
            incorrect_actions=attempt.incorrect_actions,
            total_actions=attempt.total_actions,
            items_found=attempt.items_found,
            average_reaction_ms=attempt.average_reaction_ms,
            max_reaction_ms=attempt.max_reaction_ms,
            speed_per_minute=as_float(attempt.speed_per_minute),
        ),
        current_round=current_round,
        result=attempt.result_data,
    )


async def create_attempt(session: AsyncSession, module_code: str) -> AttemptState:
    operator = await get_demo_operator(session)
    level = await session.scalar(
        select(ModuleLevel)
        .join(ModuleLevel.module)
        .where(
            TrainingModule.code == module_code,
            TrainingModule.is_active.is_(True),
            ModuleLevel.level_number == 1,
            ModuleLevel.is_active.is_(True),
        )
        .options(joinedload(ModuleLevel.module))
    )
    if level is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Модуль не найден")

    active = await session.scalar(
        select(Attempt)
        .where(
            Attempt.operator_id == operator.id,
            Attempt.level_id == level.id,
            Attempt.status == AttemptStatus.in_progress,
        )
        .order_by(Attempt.started_at.desc())
        .options(
            joinedload(Attempt.level).joinedload(ModuleLevel.module),
            selectinload(Attempt.events),
            selectinload(Attempt.rounds),
        )
        .limit(1)
    )
    if active is not None:
        await ensure_attention_timeout(session, active)
        if active.status == AttemptStatus.in_progress:
            await session.commit()
            return build_attempt_state(active)

    config = dict(level.config)
    if level.module.exercise_type == "sequential_search":
        number_count = config["max_number"] - config["min_number"] + 1
        task_snapshot = {
            "cells": generate_number_grid(number_count, start=config["min_number"])
        }
    else:
        task_snapshot = {"round_count": config["round_count"]}

    attempt = Attempt(
        operator_id=operator.id,
        level=level,
        status=AttemptStatus.in_progress,
        level_config_snapshot=config,
        task_snapshot=task_snapshot,
    )
    attempt.events.append(
        AttemptEvent(
            sequence_number=0,
            event_type=EventType.exercise_started,
            elapsed_ms=0,
            event_data={"module_code": module_code},
        )
    )
    if level.module.exercise_type == "visual_memory":
        for number, stimulus in enumerate(
            generate_memory_rounds(
                config["round_count"],
                config["grid_rows"] * config["grid_columns"],
                shapes=tuple(config["shapes"]),
                shape_count=config["shape_count"],
            ),
            start=1,
        ):
            attempt.rounds.append(AttemptRound(round_number=number, stimulus=stimulus))

    session.add(attempt)
    await session.commit()
    return build_attempt_state(attempt)


async def ensure_attention_timeout(session: AsyncSession, attempt: Attempt) -> None:
    if attempt.status != AttemptStatus.in_progress:
        return
    if attempt.level.module.exercise_type != "sequential_search":
        return
    time_limit = attempt.level_config_snapshot["time_limit_ms"]
    if elapsed_ms(attempt) >= time_limit:
        await finalize_attention(session, attempt, FinishReason.time_limit)


async def finalize_attention(session: AsyncSession, attempt: Attempt, reason: FinishReason) -> None:
    if attempt.status != AttemptStatus.in_progress:
        return
    config = attempt.level_config_snapshot
    raw_duration = elapsed_ms(attempt)
    duration = (
        min(raw_duration, config["time_limit_ms"])
        if reason == FinishReason.time_limit
        else raw_duration
    )
    reactions = [
        event.reaction_time_ms
        for event in attempt.events
        if event.reaction_time_ms is not None
        and event.event_type in {EventType.correct_click, EventType.wrong_click}
    ]
    correct_elapsed = [
        event.elapsed_ms for event in attempt.events if event.event_type == EventType.correct_click
    ]

    attempt.status = (
        AttemptStatus.interrupted if reason == FinishReason.interrupted else AttemptStatus.completed
    )
    attempt.finish_reason = reason
    attempt.completed_at = utc_now()
    attempt.duration_ms = duration
    attempt.score = Decimal(attempt.items_found)
    attempt.accuracy = Decimal(
        round(attempt.correct_actions / attempt.total_actions * 100, 2)
        if attempt.total_actions
        else 0
    )
    attempt.average_reaction_ms = round(sum(reactions) / len(reactions)) if reactions else None
    attempt.max_reaction_ms = max(reactions) if reactions else None
    attempt.speed_per_minute = Decimal(
        str(round(attempt.items_found / max(duration, 1) * 60_000, 2))
    )
    attempt.result_data = {
        "attention_grade": attention_grade(attempt.items_found),
        "per_minute_pace": per_minute_pace(correct_elapsed),
        "normative_range": config["normative_range"],
        "total_numbers": config["max_number"] - config["min_number"] + 1,
    }
    attempt.events.append(
        AttemptEvent(
            sequence_number=next_event_sequence(attempt),
            event_type=(
                EventType.exercise_interrupted
                if reason == FinishReason.interrupted
                else EventType.exercise_completed
            ),
            elapsed_ms=duration,
            event_data={"finish_reason": reason.value},
        )
    )
    await session.flush()
    if attempt.status == AttemptStatus.completed:
        await update_operator_stats(session, attempt)


async def record_attention_action(
    session: AsyncSession, attempt_id: int, request: AttentionActionRequest
) -> AttemptState:
    operator = await get_demo_operator(session)
    attempt = await load_attempt(session, attempt_id, operator.id, lock=True)
    if attempt.level.module.exercise_type != "sequential_search":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Неверный тип модуля")

    await ensure_attention_timeout(session, attempt)
    if attempt.status != AttemptStatus.in_progress:
        await session.commit()
        return build_attempt_state(attempt)

    existing = next(
        (event for event in attempt.events if event.sequence_number == request.sequence_number),
        None,
    )
    if existing is not None:
        return build_attempt_state(attempt)
    expected_sequence = next_event_sequence(attempt)
    if request.sequence_number != expected_sequence:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ожидалось действие с номером {expected_sequence}",
        )

    cells = attempt.task_snapshot["cells"]
    cell = next((item for item in cells if item["position"] == request.grid_position), None)
    if cell is None or cell["value"] != request.selected_number:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Клетка не совпадает с заданием",
        )

    config = attempt.level_config_snapshot
    expected_number = config["min_number"] + attempt.items_found
    is_correct = request.selected_number == expected_number
    attempt.total_actions += 1
    if is_correct:
        attempt.correct_actions += 1
        attempt.items_found += 1
        attempt.last_found_number = request.selected_number
    else:
        attempt.incorrect_actions += 1

    server_elapsed = elapsed_ms(attempt)
    stored_elapsed = min(request.elapsed_ms, server_elapsed + 5_000)
    attempt.events.append(
        AttemptEvent(
            sequence_number=request.sequence_number,
            event_type=EventType.correct_click if is_correct else EventType.wrong_click,
            elapsed_ms=stored_elapsed,
            reaction_time_ms=request.reaction_time_ms,
            target_value=str(expected_number),
            selected_value=str(request.selected_number),
            grid_position=request.grid_position,
            is_correct=is_correct,
            event_data={"number_distance": abs(request.selected_number - expected_number)},
        )
    )
    number_count = config["max_number"] - config["min_number"] + 1
    if attempt.items_found == number_count:
        await finalize_attention(session, attempt, FinishReason.completed)

    await session.commit()
    return build_attempt_state(attempt)


async def finish_attempt(session: AsyncSession, attempt_id: int) -> AttemptState:
    operator = await get_demo_operator(session)
    attempt = await load_attempt(session, attempt_id, operator.id, lock=True)
    if attempt.status == AttemptStatus.in_progress:
        if attempt.level.module.exercise_type == "sequential_search":
            limit = attempt.level_config_snapshot["time_limit_ms"]
            reason = (
                FinishReason.time_limit
                if elapsed_ms(attempt) >= limit
                else FinishReason.interrupted
            )
            await finalize_attention(session, attempt, reason)
        else:
            attempt.status = AttemptStatus.interrupted
            attempt.finish_reason = FinishReason.interrupted
            attempt.completed_at = utc_now()
            attempt.duration_ms = elapsed_ms(attempt)
    await session.commit()
    return build_attempt_state(attempt)


async def record_memory_answer(
    session: AsyncSession,
    attempt_id: int,
    round_number: int,
    request: MemoryAnswerRequest,
) -> AttemptState:
    operator = await get_demo_operator(session)
    attempt = await load_attempt(session, attempt_id, operator.id, lock=True)
    if attempt.level.module.exercise_type != "visual_memory":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Неверный тип модуля")
    if attempt.status != AttemptStatus.in_progress:
        return build_attempt_state(attempt)

    current_round = next((item for item in attempt.rounds if item.answered_at is None), None)
    requested_round = next(
        (item for item in attempt.rounds if item.round_number == round_number), None
    )
    if requested_round is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Раунд не найден")
    if requested_round.answered_at is not None:
        return build_attempt_state(attempt)
    if current_round is None or current_round.id != requested_round.id:
        expected_round = current_round.round_number if current_round else "-"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Сейчас ожидается ответ для раунда {expected_round}",
        )

    placements = [item.model_dump() for item in request.placements]
    config = attempt.level_config_snapshot
    expected_shapes = set(config["shapes"][: config["shape_count"]])
    response_shapes = {item["shape"] for item in placements}
    grid_cells = config["grid_rows"] * config["grid_columns"]
    if len(placements) != config["shape_count"] or response_shapes != expected_shapes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Нужно разместить {config['shape_count']} разных фигур",
        )
    if any(item["grid_position"] >= grid_cells for item in placements):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Позиция фигуры находится за пределами матрицы",
        )
    result = evaluate_memory_answer(requested_round.stimulus["placements"], placements)
    requested_round.response = {"placements": placements}
    requested_round.exact_matches = result["exact_matches"]
    requested_round.position_matches = result["position_matches"]
    requested_round.response_time_ms = request.response_time_ms
    requested_round.answered_at = utc_now()
    attempt.events.append(
        AttemptEvent(
            sequence_number=next_event_sequence(attempt),
            event_type=EventType.round_answered,
            elapsed_ms=elapsed_ms(attempt),
            reaction_time_ms=request.response_time_ms,
            is_correct=result["exact_matches"] == len(placements),
            event_data={"round_number": round_number, **result},
        )
    )

    if round_number == attempt.level_config_snapshot["round_count"]:
        await finalize_memory(session, attempt)

    await session.commit()
    return build_attempt_state(attempt)


async def finalize_memory(session: AsyncSession, attempt: Attempt) -> None:
    total_possible = sum(
        len(item.stimulus["placements"]) for item in attempt.rounds if item.answered_at is not None
    )
    exact = sum(item.exact_matches or 0 for item in attempt.rounds)
    positions = sum(item.position_matches or 0 for item in attempt.rounds)
    response_times = [
        item.response_time_ms for item in attempt.rounds if item.response_time_ms is not None
    ]
    duration = elapsed_ms(attempt)
    accuracy = round(exact / total_possible * 100, 2) if total_possible else 0

    attempt.status = AttemptStatus.completed
    attempt.finish_reason = FinishReason.completed
    attempt.completed_at = utc_now()
    attempt.duration_ms = duration
    attempt.score = Decimal(str(accuracy))
    attempt.accuracy = Decimal(str(accuracy))
    attempt.correct_actions = exact
    attempt.incorrect_actions = total_possible - exact
    attempt.total_actions = total_possible
    attempt.items_found = exact
    attempt.average_reaction_ms = (
        round(sum(response_times) / len(response_times)) if response_times else None
    )
    attempt.max_reaction_ms = max(response_times) if response_times else None
    attempt.result_data = {
        "exact_matches": exact,
        "position_matches": positions,
        "total_possible": total_possible,
        "rounds": [
            {
                "round_number": item.round_number,
                "exact_matches": item.exact_matches,
                "position_matches": item.position_matches,
                "response_time_ms": item.response_time_ms,
            }
            for item in attempt.rounds
        ],
    }
    attempt.events.append(
        AttemptEvent(
            sequence_number=next_event_sequence(attempt),
            event_type=EventType.exercise_completed,
            elapsed_ms=duration,
            event_data={"exact_matches": exact, "position_matches": positions},
        )
    )
    await session.flush()
    await update_operator_stats(session, attempt)


async def update_operator_stats(session: AsyncSession, attempt: Attempt) -> None:
    all_count = await session.scalar(
        select(func.count(Attempt.id)).where(
            Attempt.operator_id == attempt.operator_id,
            Attempt.level_id == attempt.level_id,
        )
    )
    aggregates = (
        await session.execute(
            select(
                func.count(Attempt.id),
                func.max(Attempt.score),
                func.avg(Attempt.score),
                func.avg(Attempt.accuracy),
                func.avg(Attempt.duration_ms),
                func.max(Attempt.items_found),
                func.avg(Attempt.items_found),
                func.max(Attempt.speed_per_minute),
                func.avg(Attempt.speed_per_minute),
                func.avg(Attempt.average_reaction_ms),
            ).where(
                Attempt.operator_id == attempt.operator_id,
                Attempt.level_id == attempt.level_id,
                Attempt.status == AttemptStatus.completed,
            )
        )
    ).one()
    stats = await session.scalar(
        select(OperatorStats).where(
            OperatorStats.operator_id == attempt.operator_id,
            OperatorStats.level_id == attempt.level_id,
        )
    )
    if stats is None:
        stats = OperatorStats(operator_id=attempt.operator_id, level_id=attempt.level_id)
        session.add(stats)

    stats.attempts_count = all_count or 0
    stats.completed_attempts_count = aggregates[0] or 0
    stats.best_score = aggregates[1]
    stats.average_score = aggregates[2]
    stats.average_accuracy = aggregates[3]
    stats.average_duration_ms = round(aggregates[4]) if aggregates[4] is not None else None
    stats.best_items_found = aggregates[5]
    stats.average_items_found = aggregates[6]
    stats.best_speed_per_minute = aggregates[7]
    stats.average_speed_per_minute = aggregates[8]
    stats.average_reaction_ms = round(aggregates[9]) if aggregates[9] is not None else None
    stats.last_attempt_id = attempt.id
    stats.last_completed_at = attempt.completed_at


async def get_attempt_state(session: AsyncSession, attempt_id: int) -> AttemptState:
    operator = await get_demo_operator(session)
    attempt = await load_attempt(session, attempt_id, operator.id)
    await ensure_attention_timeout(session, attempt)
    await session.commit()
    return build_attempt_state(attempt)


async def list_modules(session: AsyncSession) -> list[ModuleSummary]:
    operator = await get_demo_operator(session)
    modules = (
        await session.scalars(
            select(TrainingModule)
            .where(TrainingModule.is_active.is_(True))
            .order_by(TrainingModule.id)
        )
    ).all()
    result: list[ModuleSummary] = []
    for module in modules:
        level = await session.scalar(
            select(ModuleLevel).where(
                ModuleLevel.module_id == module.id,
                ModuleLevel.level_number == 1,
                ModuleLevel.is_active.is_(True),
            )
        )
        if level is None:
            continue
        active = await session.scalar(
            select(Attempt)
            .join(Attempt.level)
            .where(
                Attempt.operator_id == operator.id,
                ModuleLevel.module_id == module.id,
                Attempt.status == AttemptStatus.in_progress,
            )
            .options(
                joinedload(Attempt.level).joinedload(ModuleLevel.module),
                selectinload(Attempt.events),
                selectinload(Attempt.rounds),
            )
            .order_by(Attempt.started_at.desc())
            .limit(1)
        )
        if active is not None:
            await ensure_attention_timeout(session, active)
            if active.status != AttemptStatus.in_progress:
                active = None

        latest = await session.scalar(
            select(Attempt)
            .join(Attempt.level)
            .where(
                Attempt.operator_id == operator.id,
                ModuleLevel.module_id == module.id,
                Attempt.status == AttemptStatus.completed,
            )
            .order_by(Attempt.completed_at.desc())
            .limit(1)
        )
        completed_count = await session.scalar(
            select(func.count(Attempt.id))
            .join(Attempt.level)
            .where(
                Attempt.operator_id == operator.id,
                ModuleLevel.module_id == module.id,
                Attempt.status == AttemptStatus.completed,
            )
        )
        active_progress = None
        active_progress_total = None
        if active is not None:
            if module.exercise_type == "sequential_search":
                active_progress = active.items_found
                active_progress_total = (
                    active.level_config_snapshot["max_number"]
                    - active.level_config_snapshot["min_number"]
                    + 1
                )
            else:
                active_progress = sum(round_.answered_at is not None for round_ in active.rounds)
                active_progress_total = active.level_config_snapshot["round_count"]
        result.append(
            ModuleSummary(
                code=module.code,
                title=module.title,
                description=module.description,
                exercise_type=module.exercise_type,
                config=dict(level.config),
                instructions=level.instructions,
                completed_attempts=completed_count or 0,
                latest_score=as_float(latest.score) if latest else None,
                active_attempt_id=active.id if active else None,
                active_progress=active_progress,
                active_progress_total=active_progress_total,
            )
        )
    await session.commit()
    return result


async def list_attempts(session: AsyncSession) -> list[AttemptHistoryItem]:
    operator = await get_demo_operator(session)
    active = (
        (
            await session.scalars(
                select(Attempt)
                .where(
                    Attempt.operator_id == operator.id, Attempt.status == AttemptStatus.in_progress
                )
                .options(
                    joinedload(Attempt.level).joinedload(ModuleLevel.module),
                    selectinload(Attempt.events),
                    selectinload(Attempt.rounds),
                )
            )
        )
        .unique()
        .all()
    )
    for attempt in active:
        await ensure_attention_timeout(session, attempt)
    await session.commit()

    attempts = (
        (
            await session.scalars(
                select(Attempt)
                .where(
                    Attempt.operator_id == operator.id, Attempt.status != AttemptStatus.in_progress
                )
                .options(joinedload(Attempt.level).joinedload(ModuleLevel.module))
                .order_by(Attempt.started_at.desc())
                .limit(50)
            )
        )
        .unique()
        .all()
    )
    return [
        AttemptHistoryItem(
            id=item.id,
            module_code=item.level.module.code,
            module_title=item.level.module.title,
            status=item.status,
            finish_reason=item.finish_reason,
            started_at=as_utc(item.started_at),
            completed_at=as_utc(item.completed_at),
            duration_ms=item.duration_ms,
            score=as_float(item.score),
            accuracy=as_float(item.accuracy),
            items_found=item.items_found,
            result=item.result_data,
        )
        for item in attempts
    ]
