from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class UserCreate(BaseModel):
    email: str | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: str | None


class IdentityCreate(BaseModel):
    user_id: str
    identity_statement: str = Field(min_length=3, max_length=240)


class IdentityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    identity_statement: str
    total_votes: int


class HabitCreate(BaseModel):
    identity_id: str
    habit_type: Literal["BUILD", "BREAK"] = "BUILD"
    target_action: str = Field(min_length=1, max_length=300)
    gateway_action: str = Field(min_length=1, max_length=300)
    cue_type: Literal["TIME_LOCATION", "STACK"]
    cue_trigger: str = Field(min_length=1, max_length=300)
    location: str | None = None
    craving_motive: str | None = None
    reward_payoff: str | None = None
    prep_step: str | None = None
    reward_bundle: str | None = None


class HabitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    identity_id: str
    habit_type: str
    target_action: str
    gateway_action: str
    cue_type: str
    cue_trigger: str
    location: str | None
    craving_motive: str | None
    reward_payoff: str | None
    prep_step: str | None
    reward_bundle: str | None
    is_active: bool


class LogCreate(BaseModel):
    status: Literal["COMPLETED", "MISSED"] = "COMPLETED"
    logged_date: date | None = None
    completed_via: Literal["WEB", "TELEGRAM_BOT"] = "WEB"


class LogOut(BaseModel):
    id: str
    habit_id: str
    logged_date: date
    status: str
    completed_via: str
    identity_votes: int
    resilient_streak: int
    warning_active: bool
