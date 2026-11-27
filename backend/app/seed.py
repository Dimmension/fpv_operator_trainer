from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import SessionFactory
from app.models import (
    AssessmentBand,
    Attempt,
    AttemptStatus,
    FinishReason,
    ModuleLevel,
    TrainingModule,
    User,
    UserRole,
    UserStatus,
)

from app.auth import get_password_hash

MODULES = (
    {
        "code": "sequential-search",
        "title": "Оценка уровня осмотрительности",
        "description": "Последовательно находите числа среди визуальных стимулов.",
        "exercise_type": "sequential_search",
        "level": {
            "level_number": 1,
            "title": "Базовый режим",
            "instructions": "Найдите числа от 1 до 100 по порядку за пять минут.",
            "config": {
                "grid_rows": 5,
                "grid_columns": 5,
                "min_number": 1,
                "max_number": 25,
                "time_limit_ms": 300000,
                "font_size_pt": 20,
                "font_style": "standard",
                "show_cell_borders": True,
                "normative_range": {"min": 40, "max": 60},
            },
        },
    },
    {
        "code": "visual-memory",
        "title": "Определение объёма внимания",
        "description": "Запоминайте фигуры и восстанавливайте их расположение в матрице.",
        "exercise_type": "visual_memory",
        "level": {
            "level_number": 1,
            "title": "Базовый режим",
            "instructions": "Запомните и восстановите пять фигур в одном раунде.",
            "config": {
                "grid_rows": 5,
                "grid_columns": 5,
                "shape_count": 5,
                "round_count": 1,
                "exposure_ms": 3000,
                "shapes": ["circle", "triangle", "square", "cross", "rectangle"],
            },
        },
    },
    {
        "code": "attention-endurance",
        "title": "Оценка уровня стойкости внимания",
        "description": "Отмечайте целевой символ в корректурной таблице в течение пяти минут.",
        "exercise_type": "correction",
        "level": {
            "level_number": 1,
            "title": "Базовый режим",
            "instructions": (
                "Просматривайте таблицу слева направо и отмечайте все буквы А. "
                "Каждые 30 секунд появится отметка «Линия!». Время работы — пять минут."
            ),
            "config": {
                "grid_rows": 15,
                "grid_columns": 20,
                "target_symbol": "А",
                "symbols": ["А", "Б", "В", "Г", "Д", "Е", "Ж", "З"],
                "target_share": 0.12,
                "time_limit_ms": 300000,
                "line_interval_ms": 30000,
            },
        },
    },
    {
        "code": "divided-attention",
        "title": "Оценка уровня распределения внимания",
        "description": "Работайте с корректурной таблицей и одновременно запоминайте сообщения.",
        "exercise_type": "dual_correction",
        "level": {
            "level_number": 1,
            "title": "Базовый режим",
            "instructions": (
                "Отмечайте буквы А и запоминайте сообщения справа. "
                "Через две минуты воспроизведите запомнившееся."
            ),
            "config": {
                "grid_rows": 20,
                "grid_columns": 30,
                "target_symbol": "А",
                "symbols": ["А", "Б", "В", "Г", "Д", "Е", "Ж", "З"],
                "target_share": 0.12,
                "time_limit_ms": 120000,
                "line_interval_ms": 30000,
                "statement_interval_ms": 10000,
                "statement_visible_ms": 5000,
                "statement_count": 12,
            },
        },
    },
    # Добавьте в конец кортежа MODULES в seed.py
    {
        "code": "attention-switching",
        "title": "Оценка уровня переключения внимания",
        "description": "Поочередный поиск арабских (по возрастанию) и римских (по убыванию) чисел.",
        "exercise_type": "switching",
        "level": {
            "level_number": 1,
            "title": "Базовый режим",
            "instructions": "1 этап: Арабские 1-25. 2 этап: Римские XXIV-I. 3 этап: Попеременно 1-XXIV-2-XXIII...",
            "config": {
                "grid_rows": 7,
                "grid_columns": 7,
                "arabic_count": 25,
                "roman_count": 24,
            },
        },
    },
    {
        "code": "fine-motor-skills",
        "title": "Оценка уровня мелкой моторики",
        "description": "Проведение курсора по заданным траекториям.",
        "exercise_type": "motor",
        "level": {
            "level_number": 1,
            "title": "Базовый режим",
            "instructions": "Проведите курсор от начала до конца каждой линии, не выходя за ее границы.",
            "config": {
                "lines_count": 3,
                "line_width_px": 20,
            },
        },
    },
    {
        "code": "nervous-system",
        "title": "Оценка состояния нервной системы",
        "description": "Теппинг-тест. Оценка выносливости и типа нервной системы.",
        "exercise_type": "tapping",
        "level": {
            "level_number": 1,
            "title": "Базовый режим",
            "instructions": "Кликайте как можно быстрее в подсвеченном квадрате. Переход каждые 5 секунд.",
            "config": {
                "intervals_count": 6,
                "interval_ms": 5000,
            },
        },
    },
)

BANDS = (
    (0, 24, "low", "Низкий", "Есть затруднения с выделением главного среди помех."),
    (25, 49, "medium", "Средний", "Концентрация достаточна, но снижается под нагрузкой."),
    (50, 100, "high", "Высокий", "Высокая интенсивность и устойчивость внимания."),
)


async def seed_database(session: AsyncSession) -> None:
    settings = get_settings()
    operator = await session.scalar(select(User).where(User.email == settings.demo_operator_email))
    if operator is None:
        session.add(
            User(
                role=UserRole.operator,
                status=UserStatus.active,
                name="Демонстрационный оператор",
                callsign="Контур-01",
                email=settings.demo_operator_email,
                password_hash=get_password_hash("operator123")
            )
        )
    else:
        if not operator.password_hash:
            operator.password_hash = get_password_hash("operator123")

    for data in MODULES:
        module = await session.scalar(
            select(TrainingModule).where(TrainingModule.code == data["code"])
        )
        if module is None:
            module = TrainingModule(
                code=data["code"],
                title=data["title"],
                description=data["description"],
                exercise_type=data["exercise_type"],
            )
            session.add(module)
            await session.flush()
        else:
            module.title = data["title"]
            module.description = data["description"]
            module.exercise_type = data["exercise_type"]
            module.is_active = True

        level_data = data["level"]
        level = await session.scalar(
            select(ModuleLevel).where(
                ModuleLevel.module_id == module.id,
                ModuleLevel.level_number == 1,
            )
        )
        if level is None:
            level = ModuleLevel(module_id=module.id, **level_data)
            session.add(level)
            await session.flush()
        else:
            level.title = level_data["title"]
            level.instructions = level_data["instructions"]
            level.config = dict(level_data["config"])
            level.is_active = True

        active_attempts = (
            await session.scalars(
                select(Attempt).where(
                    Attempt.level_id == level.id,
                    Attempt.status == AttemptStatus.in_progress,
                )
            )
        ).all()
        for attempt in active_attempts:
            if attempt.level_config_snapshot == level_data["config"]:
                continue
            completed_at = datetime.now(UTC)
            started_at = attempt.started_at
            if started_at.tzinfo is None:
                completed_at = completed_at.replace(tzinfo=None)
            attempt.status = AttemptStatus.interrupted
            attempt.finish_reason = FinishReason.interrupted
            attempt.completed_at = completed_at
            attempt.duration_ms = max(0, int((completed_at - started_at).total_seconds() * 1000))

        if data["code"] == "sequential-search":
            existing_band = await session.scalar(
                select(AssessmentBand.id).where(AssessmentBand.level_id == level.id).limit(1)
            )
            if existing_band is None:
                for order, (minimum, maximum, grade, label, interpretation) in enumerate(BANDS, 1):
                    session.add(
                        AssessmentBand(
                            level_id=level.id,
                            metric_code="items_found",
                            min_value=minimum,
                            max_value=maximum,
                            grade=grade,
                            interpretation=f"{label}. {interpretation}",
                            sort_order=order,
                        )
                    )

    await session.commit()


async def seed_on_startup() -> None:
    async with SessionFactory() as session:
        await seed_database(session)
