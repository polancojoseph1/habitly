from datetime import datetime, date, timezone
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def new_id() -> str:
    return str(uuid4())


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str | None] = mapped_column(String(320), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    identities: Mapped[list["Identity"]] = relationship(back_populates="user", cascade="all, delete-orphan")


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
    target_action: Mapped[str] = mapped_column(String(300))
    gateway_action: Mapped[str] = mapped_column(String(300))
    cue_type: Mapped[str] = mapped_column(String(20))
    cue_trigger: Mapped[str] = mapped_column(String(300))
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    craving_motive: Mapped[str | None] = mapped_column(String(300), nullable=True)
    reward_payoff: Mapped[str | None] = mapped_column(String(300), nullable=True)
    prep_step: Mapped[str | None] = mapped_column(String(300), nullable=True)
    reward_bundle: Mapped[str | None] = mapped_column(String(300), nullable=True)
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
    habit: Mapped[Habit] = relationship(back_populates="logs")
