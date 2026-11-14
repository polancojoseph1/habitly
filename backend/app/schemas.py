from datetime import date, datetime
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
    gateway_action: str = Field(default="", max_length=300)
    gateway_minutes: int = Field(default=0, ge=0, le=1440)
    cue_type: Literal["TIME_LOCATION", "STACK"] = "STACK"
    cue_trigger: str = Field(default="", max_length=300)
    location: str | None = None
    craving_motive: str = Field(default="", max_length=300)
    reward_payoff: str = Field(default="", max_length=300)
    prep_step: str | None = None
    reward_bundle: str | None = None
    cue_to_hide: str | None = None
    friction_strategy: str | None = None
    habit_contract: str | None = None
    motivation_ritual: str | None = None
    shaping_milestones: str | None = None
    shaping_current_step: int = Field(default=0, ge=0)
    accountability_partner: str | None = None
    accountability_partner_email: str | None = None
    accountability_cost: str | None = None
    alternative_routine: str | None = None
    aversion_reminder: str | None = None
    technique_ids: list[str] = Field(default_factory=list)
    technique_notes: dict[str, str] = Field(default_factory=dict)
    baseline_daily: int | None = Field(default=None, ge=0, le=1000)

    @model_validator(mode="after")
    def validate_habit_fields(self):
        if self.habit_type == "BUILD":
            if not self.gateway_action or not self.cue_trigger:
                raise ValueError("Habits to build require a starter action and cue")
            if self.cue_type == "TIME_LOCATION" and not self.location:
                raise ValueError("Time and location cues require a location")
        else:
            if not self.gateway_action:
                raise ValueError("Habits being changed need a replacement action")
            if not (self.technique_ids or self.cue_to_hide or self.friction_strategy or self.alternative_routine):
                raise ValueError("Choose at least one strategy for changing this habit")
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
    motivation_ritual: str | None
    shaping_milestones: str | None
    shaping_current_step: int
    accountability_partner: str | None
    accountability_partner_email: str | None
    accountability_cost: str | None
    alternative_routine: str | None
    aversion_reminder: str | None
    technique_ids: list[str]
    technique_notes: dict[str, str]
    baseline_daily: int | None
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


class HabitEventCreate(BaseModel):
    event_type: Literal["ACTION_COMPLETED", "URGE_PASSED", "REPLACEMENT_USED", "OLD_HABIT"]
    note: str | None = Field(default=None, max_length=500)
    strategy: str | None = Field(default=None, max_length=300)
    variation_id: str | None = None
    variation_name: str | None = Field(default=None, max_length=160)


class HabitEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    habit_id: str
    event_type: str
    occurred_at: datetime
    note: str | None
    strategy: str | None
    variation_id: str | None
    variation_name: str | None


class HabitVariationCreate(BaseModel):
    law: Literal["cue", "craving", "response", "reward"]
    name: str = Field(min_length=1, max_length=160)
    technique_id: str | None = Field(default=None, max_length=100)
    setup: str = Field(min_length=1, max_length=2000)


class HabitVariationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    setup: str | None = Field(default=None, min_length=1, max_length=2000)
    is_active: bool | None = None
    tried_at: datetime | None = None
    helped: bool | None = None
    outcome_note: str | None = Field(default=None, max_length=2000)


class HabitVariationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    habit_id: str
    law: str
    name: str
    technique_id: str | None
    setup: str
    is_active: bool
    tried_at: datetime | None
    helped: bool | None
    outcome_note: str | None
    created_at: datetime


class PrepUpdate(BaseModel):
    environment_prepped: bool
    logged_date: date | None = None


class HabitUpdate(BaseModel):
    is_active: bool | None = None
    habit_type: Literal["BUILD", "BREAK"] | None = None
    friction_votes: int | None = None
    shaping_current_step: int | None = Field(default=None, ge=0)
    target_action: str | None = Field(default=None, min_length=1, max_length=300)
    gateway_action: str | None = Field(default=None, max_length=300)
    gateway_minutes: int | None = Field(default=None, ge=0, le=1440)
    cue_type: Literal["TIME_LOCATION", "STACK"] | None = None
    cue_trigger: str | None = Field(default=None, max_length=300)
    location: str | None = None
    craving_motive: str | None = Field(default=None, max_length=300)
    reward_payoff: str | None = Field(default=None, max_length=300)
    prep_step: str | None = None
    reward_bundle: str | None = None
    cue_to_hide: str | None = None
    friction_strategy: str | None = None
    habit_contract: str | None = None
    motivation_ritual: str | None = None
    shaping_milestones: str | None = None
    technique_ids: list[str] | None = None
    technique_notes: dict[str, str] | None = None
    baseline_daily: int | None = Field(default=None, ge=0, le=1000)
    accountability_partner: str | None = None
    accountability_partner_email: str | None = None
    accountability_cost: str | None = None
    alternative_routine: str | None = None
    aversion_reminder: str | None = None


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


class DiagnosticCreate(BaseModel):
    identity_id: str
    routine: str = Field(min_length=1, max_length=300)
    craving: str = Field(min_length=1, max_length=300)
    reward_experiment: str = Field(min_length=1, max_length=300)
    cue_time: str | None = None
    cue_location: str | None = None
    cue_emotion: str | None = None
    cue_people: str | None = None
    plan: str = Field(min_length=1, max_length=500)


class DiagnosticOut(DiagnosticCreate):
    model_config = ConfigDict(from_attributes=True)
    id: str


class AccountabilityInviteCreate(BaseModel):
    partner_email: str = Field(min_length=5, max_length=320)
    partner_name: str | None = Field(default=None, max_length=200)


class CircleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    identity: str = Field(min_length=2, max_length=120)
    description: str = Field(min_length=5, max_length=300)


class CircleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    identity: str
    description: str
    member_count: int
    joined: bool = False
