from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

JSON_TYPE = JSON().with_variant(JSONB, "postgresql")
ID_TYPE = BigInteger().with_variant(Integer, "sqlite")


class Base(DeclarativeBase):
    pass


class UserRole(enum.StrEnum):
    operator = "operator"
    instructor = "instructor"
    admin = "admin"


class UserStatus(enum.StrEnum):
    active = "active"
    blocked = "blocked"
    archived = "archived"


class AttemptStatus(enum.StrEnum):
    in_progress = "in_progress"
    completed = "completed"
    interrupted = "interrupted"
    expired = "expired"


class FinishReason(enum.StrEnum):
    completed = "completed"
    time_limit = "time_limit"
    interrupted = "interrupted"
    technical_error = "technical_error"


class EventType(enum.StrEnum):
    exercise_started = "exercise_started"
    correct_click = "correct_click"
    wrong_click = "wrong_click"
    round_answered = "round_answered"
    line_mark = "line_mark"
    exercise_completed = "exercise_completed"
    exercise_interrupted = "exercise_interrupted"


def enum_column(enum_type: type[enum.Enum], name: str) -> Enum:
    return Enum(enum_type, name=name, native_enum=False, validate_strings=True)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True, autoincrement=True)
    role: Mapped[UserRole] = mapped_column(enum_column(UserRole, "user_role"), nullable=False)
    status: Mapped[UserStatus] = mapped_column(
        enum_column(UserStatus, "user_status"), nullable=False, default=UserStatus.active
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    callsign: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    attempts: Mapped[list[Attempt]] = relationship(back_populates="operator")


class TrainingModule(Base):
    __tablename__ = "training_modules"

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    exercise_type: Mapped[str] = mapped_column(String(50), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    levels: Mapped[list[ModuleLevel]] = relationship(
        back_populates="module", cascade="all, delete-orphan"
    )


class ModuleLevel(Base):
    __tablename__ = "module_levels"
    __table_args__ = (UniqueConstraint("module_id", "level_number"),)

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True, autoincrement=True)
    module_id: Mapped[int] = mapped_column(
        ForeignKey("training_modules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    level_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(150))
    instructions: Mapped[str | None] = mapped_column(Text)
    config: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    module: Mapped[TrainingModule] = relationship(back_populates="levels", lazy="joined")
    attempts: Mapped[list[Attempt]] = relationship(back_populates="level")


class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True, autoincrement=True)
    operator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    level_id: Mapped[int] = mapped_column(
        ForeignKey("module_levels.id"), nullable=False, index=True
    )
    status: Mapped[AttemptStatus] = mapped_column(
        enum_column(AttemptStatus, "attempt_status"),
        nullable=False,
        default=AttemptStatus.in_progress,
    )
    finish_reason: Mapped[FinishReason | None] = mapped_column(
        enum_column(FinishReason, "finish_reason")
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    score: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    max_score: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False, default=100)
    accuracy: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    correct_actions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    incorrect_actions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_actions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    items_found: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_found_number: Mapped[int | None] = mapped_column(Integer)
    average_reaction_ms: Mapped[int | None] = mapped_column(Integer)
    max_reaction_ms: Mapped[int | None] = mapped_column(Integer)
    speed_per_minute: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    level_config_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, nullable=False)
    task_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, nullable=False)
    result_data: Mapped[dict[str, Any] | None] = mapped_column(JSON_TYPE)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    operator: Mapped[User] = relationship(back_populates="attempts")
    level: Mapped[ModuleLevel] = relationship(back_populates="attempts", lazy="joined")
    events: Mapped[list[AttemptEvent]] = relationship(
        back_populates="attempt",
        cascade="all, delete-orphan",
        order_by="AttemptEvent.sequence_number",
    )
    rounds: Mapped[list[AttemptRound]] = relationship(
        back_populates="attempt", cascade="all, delete-orphan", order_by="AttemptRound.round_number"
    )


class AttemptEvent(Base):
    __tablename__ = "attempt_events"
    __table_args__ = (UniqueConstraint("attempt_id", "sequence_number"),)

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[EventType] = mapped_column(
        enum_column(EventType, "event_type"), nullable=False
    )
    elapsed_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    reaction_time_ms: Mapped[int | None] = mapped_column(Integer)
    target_value: Mapped[str | None] = mapped_column(String(100))
    selected_value: Mapped[str | None] = mapped_column(String(100))
    grid_position: Mapped[int | None] = mapped_column(Integer)
    is_correct: Mapped[bool | None] = mapped_column(Boolean)
    event_data: Mapped[dict[str, Any] | None] = mapped_column(JSON_TYPE)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    attempt: Mapped[Attempt] = relationship(back_populates="events")


class AttemptRound(Base):
    __tablename__ = "attempt_rounds"
    __table_args__ = (UniqueConstraint("attempt_id", "round_number"),)

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    round_number: Mapped[int] = mapped_column(Integer, nullable=False)
    stimulus: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, nullable=False)
    response: Mapped[dict[str, Any] | None] = mapped_column(JSON_TYPE)
    exact_matches: Mapped[int | None] = mapped_column(Integer)
    position_matches: Mapped[int | None] = mapped_column(Integer)
    response_time_ms: Mapped[int | None] = mapped_column(Integer)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    attempt: Mapped[Attempt] = relationship(back_populates="rounds")


class AssessmentBand(Base):
    __tablename__ = "assessment_bands"
    __table_args__ = (UniqueConstraint("level_id", "metric_code", "sort_order"),)

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True, autoincrement=True)
    level_id: Mapped[int] = mapped_column(
        ForeignKey("module_levels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    metric_code: Mapped[str] = mapped_column(String(50), nullable=False)
    min_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    max_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    grade: Mapped[str] = mapped_column(String(50), nullable=False)
    interpretation: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class OperatorStats(Base):
    __tablename__ = "operator_stats"
    __table_args__ = (UniqueConstraint("operator_id", "level_id"),)

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True, autoincrement=True)
    operator_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    level_id: Mapped[int] = mapped_column(
        ForeignKey("module_levels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    attempts_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_attempts_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    best_score: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    average_score: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    average_accuracy: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    average_duration_ms: Mapped[int | None] = mapped_column(Integer)
    best_items_found: Mapped[int | None] = mapped_column(Integer)
    average_items_found: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    best_speed_per_minute: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    average_speed_per_minute: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    average_reaction_ms: Mapped[int | None] = mapped_column(Integer)
    last_attempt_id: Mapped[int | None] = mapped_column(ForeignKey("attempts.id"))
    last_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
