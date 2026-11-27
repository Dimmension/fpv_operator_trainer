from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.models import AttemptStatus, FinishReason


class ModuleSummary(BaseModel):
    code: str
    title: str
    description: str | None
    exercise_type: str
    config: dict[str, Any]
    instructions: str | None = None
    completed_attempts: int = 0
    latest_score: float | None = None
    active_attempt_id: int | None = None
    active_progress: int | None = None
    active_progress_total: int | None = None


class StartAttemptRequest(BaseModel):
    module_code: Literal[
        "sequential-search", "visual-memory", "attention-endurance", "divided-attention",
        "attention-switching", "fine-motor-skills", "nervous-system"
    ]


class AttemptMetrics(BaseModel):
    score: float | None = None
    accuracy: float | None = None
    correct_actions: int
    incorrect_actions: int
    total_actions: int
    items_found: int
    average_reaction_ms: int | None = None
    max_reaction_ms: int | None = None
    speed_per_minute: float | None = None


class MemoryRoundState(BaseModel):
    round_number: int
    total_rounds: int
    exposure_ms: int
    stimulus: dict[str, Any]


class AttemptState(BaseModel):
    id: int
    module_code: str
    module_title: str
    status: AttemptStatus
    finish_reason: FinishReason | None
    started_at: datetime
    deadline_at: datetime | None = None
    duration_ms: int | None = None
    task: dict[str, Any]
    metrics: AttemptMetrics
    current_round: MemoryRoundState | None = None
    result: dict[str, Any] | None = None


class AttentionActionRequest(BaseModel):
    sequence_number: int = Field(ge=1)
    selected_number: int = Field(ge=1)
    grid_position: int = Field(ge=0)
    elapsed_ms: int = Field(ge=0)
    reaction_time_ms: int = Field(ge=0, le=300_000)


class ShapePlacement(BaseModel):
    grid_position: int = Field(ge=0)
    shape: Literal["circle", "triangle", "square", "cross", "rectangle"]


class MemoryAnswerRequest(BaseModel):
    placements: list[ShapePlacement]
    response_time_ms: int = Field(ge=0)

    @model_validator(mode="after")
    def validate_placements(self) -> "MemoryAnswerRequest":
        positions = {item.grid_position for item in self.placements}
        shapes = {item.shape for item in self.placements}
        if len(positions) != len(self.placements):
            raise ValueError("Каждая клетка может содержать только одну фигуру")
        if len(shapes) != len(self.placements):
            raise ValueError("Каждая фигура должна использоваться ровно один раз")
        return self


class CorrectionActionRequest(BaseModel):
    sequence_number: int = Field(ge=1)
    position: int = Field(ge=0)
    selected: bool


class RecallRequest(BaseModel):
    statements: list[str] = Field(max_length=24)


class AttemptHistoryItem(BaseModel):
    id: int
    module_code: str
    module_title: str
    status: AttemptStatus
    finish_reason: FinishReason | None
    started_at: datetime
    completed_at: datetime | None
    duration_ms: int | None
    score: float | None
    accuracy: float | None
    items_found: int
    result: dict[str, Any] | None


class HealthResponse(BaseModel):
    status: Literal["ok"]


class SwitchingActionRequest(BaseModel):
    sequence_number: int = Field(ge=1)
    position: int = Field(ge=0)
    elapsed_ms: int = Field(ge=0)
    reaction_time_ms: int = Field(ge=0)


class MotorTrackingSubmitRequest(BaseModel):
    total_time_ms: int
    time_out_of_line_ms: int
    error_count: int
    smoothness_score: float
    path_length_px: float
    velocity_px_s: float


class TappingSubmitRequest(BaseModel):
    intervals: list[int]


class UserProfile(BaseModel):
    id: int
    email: str
    name: str
    callsign: str | None


class AuthRegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    callsign: str | None = None


class AuthLoginRequest(BaseModel):
    email: str
    password: str


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile