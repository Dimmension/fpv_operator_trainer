from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_password_hash, verify_password, create_access_token
from app.attempts import (
    create_attempt,
    finish_attempt,
    get_attempt_state,
    list_attempts,
    list_modules,
    record_attention_action,
    record_correction_action,
    record_memory_answer,
    record_recall,
    record_switching_action,
    record_motor_result,
    record_tapping_result,
)
from app.database import get_session
from app.models import User, UserRole, UserStatus
from app.schemas import (
    AttemptHistoryItem,
    AttemptState,
    AttentionActionRequest,
    CorrectionActionRequest,
    HealthResponse,
    MemoryAnswerRequest,
    ModuleSummary,
    RecallRequest,
    StartAttemptRequest,
    UserProfile,
    AuthRegisterRequest,
    AuthLoginRequest,
    AuthTokenResponse,
    SwitchingActionRequest,
    MotorTrackingSubmitRequest,
    TappingSubmitRequest,
)

router = APIRouter()
SessionDep = Annotated[AsyncSession, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]

@router.get("/health", response_model=HealthResponse, tags=["system"])
async def health(session: SessionDep) -> HealthResponse:
    await session.execute(text("SELECT 1"))
    return HealthResponse(status="ok")

# --- AUTH ---
@router.post("/auth/register", response_model=AuthTokenResponse, tags=["auth"])
async def register(request: AuthRegisterRequest, session: SessionDep) -> AuthTokenResponse:
    existing = await session.scalar(select(User).where(User.email == request.email))
    if existing:
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")
    user = User(
        email=request.email, name=request.name, callsign=request.callsign,
        password_hash=get_password_hash(request.password),
        role=UserRole.operator, status=UserStatus.active
    )
    session.add(user)
    await session.commit()
    return AuthTokenResponse(
        access_token=create_access_token(user.id),
        user=UserProfile(id=user.id, email=user.email, name=user.name, callsign=user.callsign) # type: ignore
    )


@router.post("/auth/login", response_model=AuthTokenResponse, tags=["auth"])
async def login(request: AuthLoginRequest, session: SessionDep) -> AuthTokenResponse:
    user = await session.scalar(select(User).where(User.email == request.email))
    if not user or not user.password_hash or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    return AuthTokenResponse(
        access_token=create_access_token(user.id),
        user=UserProfile(id=user.id, email=user.email, name=user.name, callsign=user.callsign) # type: ignore
    )


@router.get("/auth/me", response_model=UserProfile, tags=["auth"])
async def get_me(user: CurrentUser) -> UserProfile:
    return UserProfile(id=user.id, email=user.email, name=user.name, callsign=user.callsign) # type: ignore


# --- MODULES & ATTEMPTS ---
@router.get("/modules", response_model=list[ModuleSummary], tags=["modules"])
async def modules(session: SessionDep, user: CurrentUser) -> list[ModuleSummary]:
    return await list_modules(session, user)


@router.post("/attempts", response_model=AttemptState, tags=["attempts"])
async def start_attempt(request: StartAttemptRequest, session: SessionDep, user: CurrentUser) -> AttemptState:
    return await create_attempt(session, request.module_code, user)


@router.get("/attempts", response_model=list[AttemptHistoryItem], tags=["attempts"])
async def attempts(session: SessionDep, user: CurrentUser) -> list[AttemptHistoryItem]:
    return await list_attempts(session, user)


@router.get("/attempts/{attempt_id}", response_model=AttemptState, tags=["attempts"])
async def attempt_state(attempt_id: int, session: SessionDep, user: CurrentUser) -> AttemptState:
    return await get_attempt_state(session, attempt_id, user)


@router.post("/attempts/{attempt_id}/actions", response_model=AttemptState, tags=["attempts"])
async def attention_action(
    attempt_id: int,
    request: AttentionActionRequest,
    session: SessionDep,
    user: CurrentUser
) -> AttemptState:
    return await record_attention_action(session, attempt_id, request, user)


@router.post("/attempts/{attempt_id}/finish", response_model=AttemptState, tags=["attempts"])
async def finish(attempt_id: int, session: SessionDep, user: CurrentUser) -> AttemptState:
    return await finish_attempt(session, attempt_id, user)


@router.post(
    "/attempts/{attempt_id}/rounds/{round_number}/answer",
    response_model=AttemptState,
    tags=["attempts"]
)
async def memory_answer(
    attempt_id: int,
    round_number: int,
    request: MemoryAnswerRequest,
    session: SessionDep,
    user: CurrentUser
) -> AttemptState:
    return await record_memory_answer(session, attempt_id, round_number, request, user)


@router.post(
    "/attempts/{attempt_id}/correction/actions", response_model=AttemptState, tags=["attempts"]
)
async def correction_action(
    attempt_id: int,
    request: CorrectionActionRequest,
    session: SessionDep,
    user: CurrentUser
) -> AttemptState:
    return await record_correction_action(session, attempt_id, request, user)


@router.post("/attempts/{attempt_id}/recall", response_model=AttemptState, tags=["attempts"])
async def recall(attempt_id: int, request: RecallRequest, session: SessionDep, user: CurrentUser) -> AttemptState:
    return await record_recall(session, attempt_id, request, user)


@router.post("/attempts/{attempt_id}/switching/actions", response_model=AttemptState, tags=["attempts"])
async def switching_action(attempt_id: int, request: SwitchingActionRequest, session: SessionDep, user: CurrentUser) -> AttemptState:
    return await record_switching_action(session, attempt_id, request, user)


@router.post("/attempts/{attempt_id}/motor/submit", response_model=AttemptState, tags=["attempts"])
async def motor_submit(attempt_id: int, request: MotorTrackingSubmitRequest, session: SessionDep, user: CurrentUser) -> AttemptState:
    return await record_motor_result(session, attempt_id, request, user)


@router.post("/attempts/{attempt_id}/tapping/submit", response_model=AttemptState, tags=["attempts"])
async def tapping_submit(attempt_id: int, request: TappingSubmitRequest, session: SessionDep, user: CurrentUser) -> AttemptState:
    return await record_tapping_result(session, attempt_id, request, user)