from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.attempts import (
    create_attempt,
    finish_attempt,
    get_attempt_state,
    list_attempts,
    list_modules,
    record_attention_action,
    record_memory_answer,
)
from app.database import get_session
from app.schemas import (
    AttemptHistoryItem,
    AttemptState,
    AttentionActionRequest,
    HealthResponse,
    MemoryAnswerRequest,
    ModuleSummary,
    StartAttemptRequest,
)

router = APIRouter()
SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("/health", response_model=HealthResponse, tags=["system"])
async def health(session: SessionDep) -> HealthResponse:
    await session.execute(text("SELECT 1"))
    return HealthResponse(status="ok")


@router.get("/modules", response_model=list[ModuleSummary], tags=["modules"])
async def modules(session: SessionDep) -> list[ModuleSummary]:
    return await list_modules(session)


@router.post("/attempts", response_model=AttemptState, tags=["attempts"])
async def start_attempt(request: StartAttemptRequest, session: SessionDep) -> AttemptState:
    return await create_attempt(session, request.module_code)


@router.get("/attempts", response_model=list[AttemptHistoryItem], tags=["attempts"])
async def attempts(session: SessionDep) -> list[AttemptHistoryItem]:
    return await list_attempts(session)


@router.get("/attempts/{attempt_id}", response_model=AttemptState, tags=["attempts"])
async def attempt_state(attempt_id: int, session: SessionDep) -> AttemptState:
    return await get_attempt_state(session, attempt_id)


@router.post("/attempts/{attempt_id}/actions", response_model=AttemptState, tags=["attempts"])
async def attention_action(
    attempt_id: int,
    request: AttentionActionRequest,
    session: SessionDep,
) -> AttemptState:
    return await record_attention_action(session, attempt_id, request)


@router.post("/attempts/{attempt_id}/finish", response_model=AttemptState, tags=["attempts"])
async def finish(attempt_id: int, session: SessionDep) -> AttemptState:
    return await finish_attempt(session, attempt_id)


@router.post(
    "/attempts/{attempt_id}/rounds/{round_number}/answer",
    response_model=AttemptState,
    tags=["attempts"],
)
async def memory_answer(
    attempt_id: int,
    round_number: int,
    request: MemoryAnswerRequest,
    session: SessionDep,
) -> AttemptState:
    return await record_memory_answer(session, attempt_id, round_number, request)
