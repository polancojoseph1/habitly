from datetime import datetime, timezone
import re

from sqlalchemy import delete, func, or_, select, text, update
from sqlalchemy.engine import Engine

from .models import (
    AccountabilityInvite,
    Habit,
    HabitContract,
    HabitDiagnostic,
    HabitEvent,
    HabitLog,
    HabitVariation,
    Reward,
    WorkspaceState,
)


SMOKING_TEXT = re.compile(r"smok|cigarette|tobacco", re.IGNORECASE)
MIGRATION_NAME = "20261117_remove_legacy_smoking_workspace_data"


def _is_smoking_habit(habit: dict) -> bool:
    if str(habit.get("id", "")) == "demo-smoking":
        return True
    fields = (
        habit.get("name"),
        habit.get("target"),
        habit.get("display_name"),
        habit.get("target_action"),
    )
    return bool(SMOKING_TEXT.search(" ".join(str(value or "") for value in fields)))


def without_smoking_workspace_data(workspace: dict) -> dict:
    if not isinstance(workspace, dict):
        return workspace

    cleaned = dict(workspace)
    habits = cleaned.get("habits")
    smoking_ids = {"demo-smoking"}
    if isinstance(habits, list):
        smoking_ids.update(
            str(habit.get("id"))
            for habit in habits
            if isinstance(habit, dict) and _is_smoking_habit(habit) and habit.get("id")
        )
        cleaned["habits"] = [
            habit for habit in habits
            if not isinstance(habit, dict) or not _is_smoking_habit(habit)
        ]

    def belongs_to_removed_habit(row: object) -> bool:
        if not isinstance(row, dict):
            return False
        habit_id = str(row.get("habitId", row.get("habit_id", "")))
        record_id = str(row.get("id", ""))
        return habit_id in smoking_ids or record_id.startswith("sample-log-smoking-")

    for key in ("behaviorLogs", "habitEvents", "variations", "dailyConfirmations", "rewards"):
        rows = cleaned.get(key)
        if isinstance(rows, list):
            cleaned[key] = [row for row in rows if not belongs_to_removed_habit(row)]

    order = cleaned.get("habitOrder")
    if isinstance(order, list):
        cleaned["habitOrder"] = [habit_id for habit_id in order if str(habit_id) not in smoking_ids]

    prepped = cleaned.get("preppedHabits")
    if isinstance(prepped, dict):
        cleaned["preppedHabits"] = {
            habit_id: value for habit_id, value in prepped.items()
            if str(habit_id) not in smoking_ids
        }

    history = cleaned.get("history")
    if isinstance(history, dict):
        filtered_history = {}
        for day, values in history.items():
            if not isinstance(values, list):
                filtered_history[day] = values
                continue
            filtered = [
                value for value in values
                if str(value).removeprefix("missed:") not in smoking_ids
            ]
            if filtered:
                filtered_history[day] = filtered
        cleaned["history"] = filtered_history

    scorecard = cleaned.get("scorecard")
    if isinstance(scorecard, list):
        cleaned["scorecard"] = [
            row for row in scorecard
            if not isinstance(row, dict) or not SMOKING_TEXT.search(str(row.get("behavior", "")))
        ]

    diagnostics = cleaned.get("diagnostics")
    if isinstance(diagnostics, list):
        fields = ("routine", "craving", "rewardExperiment", "plan")
        cleaned["diagnostics"] = [
            row for row in diagnostics
            if not isinstance(row, dict)
            or not SMOKING_TEXT.search(" ".join(str(row.get(field, "")) for field in fields))
        ]

    tags = cleaned.get("customContextTags")
    if isinstance(tags, list):
        cleaned["customContextTags"] = [
            tag for tag in tags if not SMOKING_TEXT.search(str(tag))
        ]

    return cleaned


def purge_legacy_smoking_data(engine: Engine) -> None:
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE IF NOT EXISTS app_migrations "
            "(name VARCHAR(160) PRIMARY KEY, applied_at VARCHAR(40) NOT NULL)"
        ))
        applied = connection.scalar(
            text("SELECT 1 FROM app_migrations WHERE name = :name"),
            {"name": MIGRATION_NAME},
        )
        if applied:
            return

        smoking_habits = or_(
            Habit.id == "demo-smoking",
            func.lower(func.coalesce(Habit.id, "")).like("%smok%"),
            func.lower(func.coalesce(Habit.display_name, "")).like("%smok%"),
            func.lower(func.coalesce(Habit.display_name, "")).like("%cigarette%"),
            func.lower(func.coalesce(Habit.display_name, "")).like("%tobacco%"),
            func.lower(func.coalesce(Habit.target_action, "")).like("%smok%"),
            func.lower(func.coalesce(Habit.target_action, "")).like("%cigarette%"),
            func.lower(func.coalesce(Habit.target_action, "")).like("%tobacco%"),
        )
        smoking_ids = set(connection.execute(select(Habit.id).where(smoking_habits)).scalars())
        if smoking_ids:
            for model in (HabitLog, HabitEvent, HabitVariation, Reward, HabitContract, AccountabilityInvite):
                connection.execute(delete(model).where(model.habit_id.in_(smoking_ids)))
            connection.execute(delete(Habit).where(Habit.id.in_(smoking_ids)))

        diagnostic_match = or_(
            *[
                func.lower(func.coalesce(getattr(HabitDiagnostic, field), "")).like(pattern)
                for field in ("routine", "craving", "reward_experiment", "plan")
                for pattern in ("%smok%", "%cigarette%", "%tobacco%")
            ]
        )
        connection.execute(delete(HabitDiagnostic).where(diagnostic_match))

        for user_id, payload in connection.execute(
            select(WorkspaceState.user_id, WorkspaceState.payload)
        ):
            cleaned = without_smoking_workspace_data(payload)
            if cleaned != payload:
                connection.execute(
                    update(WorkspaceState)
                    .where(WorkspaceState.user_id == user_id)
                    .values(payload=cleaned, revision=WorkspaceState.revision + 1)
                )

        connection.execute(
            text("INSERT INTO app_migrations (name, applied_at) VALUES (:name, :applied_at)"),
            {"name": MIGRATION_NAME, "applied_at": datetime.now(timezone.utc).isoformat()},
        )
