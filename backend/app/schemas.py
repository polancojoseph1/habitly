from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class UserCreate(BaseModel):
    email: str | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: str | None


class IdentityCreate(BaseModel):
    user_id: str
    identity_statement: str = Field(min_length=3, max_length=240)


class IdentityUpdate(BaseModel):
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
    gateway_minutes: int = Field(default=2, ge=1, le=2)
    cue_type: Literal["TIME_LOCATION", "STACK"]
    cue_trigger: str = Field(min_length=1, max_length=300)
    location: str | None = None
    craving_motive: str = Field(min_length=1, max_length=300)
    reward_payoff: str = Field(min_length=1, max_length=300)
    prep_step: str | None = None
    reward_bundle: str | None = None
    cue_to_hide: str | None = None
    friction_strategy: str | None = None
    habit_contract: str | None = None

    @model_validator(mode="after")
    def validate_habit_fields(self):
        if self.habit_type == "BREAK" and (not self.cue_to_hide or not self.friction_strategy or not self.habit_contract):
            raise ValueError("Habits to break require a cue to hide, friction strategy, and habit contract")
        return self


class HabitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    identity_id: str
    habit_type: str
    target_action: str
    gateway_action: str
    gateway_minutes: int
    cue_type: str
    cue_trigger: str
    location: str | None
    craving_motive: str | None
    reward_payoff: str | None
    prep_step: str | None
    reward_bundle: str | None
    cue_to_hide: str | None
    friction_strategy: str | None
    habit_contract: str | None
    friction_votes: int
    is_active: bool


class LogCreate(BaseModel):
    status: Literal["COMPLETED", "MISSED", "RECOVERED"] = "COMPLETED"
    logged_date: date | None = None
    completed_via: Literal["WEB", "TELEGRAM_BOT"] = "WEB"
    environment_prepped: bool = False


class LogOut(BaseModel):
    id: str
    habit_id: str
    logged_date: date
    status: str
    completed_via: str
    identity_votes: int
    resilient_streak: int
    warning_active: bool


class HabitLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    habit_id: str
    logged_date: date
    status: str
    completed_via: str
    environment_prepped: bool


class PrepUpdate(BaseModel):
    environment_prepped: bool
    logged_date: date | None = None


class HabitUpdate(BaseModel):
    is_active: bool | None = None
    friction_votes: int | None = None


class RewardCreate(BaseModel):
    habit_id: str
    name: str = Field(min_length=1, max_length=160)
    detail: str | None = None


class RewardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    habit_id: str
    name: str
    detail: str | None
    is_active: bool


class RewardStatusOut(RewardOut):
    unlocked: bool


class TelegramLinkOut(BaseModel):
    start_command: str
    expires_in_minutes: int
