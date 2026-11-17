from datetime import datetime, date, timezone
import secrets
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def new_id() -> str:
    return str(uuid4())


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str | None] = mapped_column(String(320), unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(256), nullable=True)
    api_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    telegram_chat_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    identities: Mapped[list["Identity"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    api_tokens: Mapped[list["AccountToken"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class AccountToken(Base):
    __tablename__ = "account_tokens"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    user: Mapped[User] = relationship(back_populates="api_tokens")


class Identity(Base):
    __tablename__ = "identities"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    identity_statement: Mapped[str] = mapped_column(String(240))
    total_votes: Mapped[int] = mapped_column(Integer, default=0)
    user: Mapped[User] = relationship(back_populates="identities")
    habits: Mapped[list["Habit"]] = relationship(back_populates="identity", cascade="all, delete-orphan")


class Habit(Base):
    __tablename__ = "habits"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    identity_id: Mapped[str] = mapped_column(ForeignKey("identities.id", ondelete="CASCADE"))
    habit_type: Mapped[str] = mapped_column(String(8), default="BUILD")
    display_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    target_action: Mapped[str] = mapped_column(String(300))
    gateway_action: Mapped[str] = mapped_column(String(300))
    gateway_minutes: Mapped[int] = mapped_column(Integer, default=0)
    cue_type: Mapped[str] = mapped_column(String(20))
    cue_trigger: Mapped[str] = mapped_column(String(300))
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    craving_motive: Mapped[str] = mapped_column(String(300))
    reward_payoff: Mapped[str] = mapped_column(String(300))
    prep_step: Mapped[str | None] = mapped_column(String(300), nullable=True)
    reward_bundle: Mapped[str | None] = mapped_column(String(300), nullable=True)
    cue_to_hide: Mapped[str | None] = mapped_column(String(300), nullable=True)
    friction_strategy: Mapped[str | None] = mapped_column(String(300), nullable=True)
    habit_contract: Mapped[str | None] = mapped_column(String(300), nullable=True)
    motivation_ritual: Mapped[str | None] = mapped_column(String(300), nullable=True)
    shaping_milestones: Mapped[str | None] = mapped_column(String(1200), nullable=True)
    shaping_current_step: Mapped[int] = mapped_column(Integer, default=0)
    accountability_partner: Mapped[str | None] = mapped_column(String(200), nullable=True)
    accountability_partner_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    accountability_cost: Mapped[str | None] = mapped_column(String(300), nullable=True)
    alternative_routine: Mapped[str | None] = mapped_column(String(300), nullable=True)
    replacement_actions: Mapped[list[str]] = mapped_column(JSON, default=list)
    replacement_mode: Mapped[str] = mapped_column(String(20), default="STACK")
    break_plan_answers: Mapped[dict[str, list[str]]] = mapped_column(JSON, default=dict)
    aversion_reminder: Mapped[str | None] = mapped_column(String(300), nullable=True)
    technique_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    technique_notes: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    baseline_daily: Mapped[int | None] = mapped_column(Integer, nullable=True)
    friction_votes: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    identity: Mapped[Identity] = relationship(back_populates="habits")
    logs: Mapped[list["HabitLog"]] = relationship(back_populates="habit", cascade="all, delete-orphan")


class HabitLog(Base):
    __tablename__ = "habit_logs"
    __table_args__ = (UniqueConstraint("habit_id", "logged_date", name="uq_habit_log_day"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    habit_id: Mapped[str] = mapped_column(ForeignKey("habits.id", ondelete="CASCADE"))
    logged_date: Mapped[date] = mapped_column(Date, default=date.today)
    status: Mapped[str] = mapped_column(String(12))
    completed_via: Mapped[str] = mapped_column(String(20), default="WEB")
    environment_prepped: Mapped[bool] = mapped_column(Boolean, default=False)
    habit: Mapped[Habit] = relationship(back_populates="logs")


class HabitEvent(Base):
    __tablename__ = "habit_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    habit_id: Mapped[str] = mapped_column(ForeignKey("habits.id", ondelete="CASCADE"))
    event_type: Mapped[str] = mapped_column(String(24))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    actual_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    strategy: Mapped[str | None] = mapped_column(String(300), nullable=True)
    variation_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    variation_name: Mapped[str | None] = mapped_column(String(160), nullable=True)


class HabitVariation(Base):
    __tablename__ = "habit_variations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    habit_id: Mapped[str] = mapped_column(ForeignKey("habits.id", ondelete="CASCADE"))
    law: Mapped[str] = mapped_column(String(24))
    name: Mapped[str] = mapped_column(String(160))
    technique_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    setup: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    tried_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    helped: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    outcome_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Reward(Base):
    __tablename__ = "rewards"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    habit_id: Mapped[str] = mapped_column(ForeignKey("habits.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(160))
    detail: Mapped[str | None] = mapped_column(String(300), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    habit: Mapped[Habit] = relationship()


class TelegramLink(Base):
    __tablename__ = "telegram_links"
    token: Mapped[str] = mapped_column(String(80), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class HabitDiagnostic(Base):
    __tablename__ = "habit_diagnostics"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    identity_id: Mapped[str] = mapped_column(ForeignKey("identities.id", ondelete="CASCADE"))
    routine: Mapped[str] = mapped_column(String(300))
    craving: Mapped[str] = mapped_column(String(300))
    reward_experiment: Mapped[str] = mapped_column(String(300))
    cue_time: Mapped[str | None] = mapped_column(String(120), nullable=True)
    cue_location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    cue_emotion: Mapped[str | None] = mapped_column(String(200), nullable=True)
    cue_people: Mapped[str | None] = mapped_column(String(200), nullable=True)
    plan: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class HabitContract(Base):
    __tablename__ = "habit_contracts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    habit_id: Mapped[str] = mapped_column(ForeignKey("habits.id", ondelete="CASCADE"), unique=True)
    agreement: Mapped[str] = mapped_column(String(300))
    consequence: Mapped[str] = mapped_column(String(300))
    partner_name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class AccountabilityInvite(Base):
    __tablename__ = "accountability_invites"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    habit_id: Mapped[str] = mapped_column(ForeignKey("habits.id", ondelete="CASCADE"))
    partner_email: Mapped[str] = mapped_column(String(320))
    partner_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    token: Mapped[str] = mapped_column(String(80), unique=True, default=lambda: secrets.token_urlsafe(24))
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class CommunityCircle(Base):
    __tablename__ = "community_circles"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    identity: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class CircleMembership(Base):
    __tablename__ = "circle_memberships"
    __table_args__ = (UniqueConstraint("circle_id", "identity_id", name="uq_circle_identity"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    circle_id: Mapped[str] = mapped_column(ForeignKey("community_circles.id", ondelete="CASCADE"))
    identity_id: Mapped[str] = mapped_column(ForeignKey("identities.id", ondelete="CASCADE"))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class WorkspaceState(Base):
    """Complete client workspace snapshot for data not represented by domain tables."""
    __tablename__ = "workspace_states"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
