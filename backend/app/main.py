from datetime import date, datetime, timedelta, timezone
import secrets
import hashlib
import hmac
import os
from uuid import NAMESPACE_URL, uuid5
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, inspect, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from .config import settings
from .database import Base, engine, get_db
import httpx

from .models import (AccountabilityInvite, CircleMembership, CommunityCircle, Habit, HabitContract, HabitEvent, HabitVariation,
                     HabitDiagnostic, HabitLog, Identity, Reward, TelegramLink, UnifiedHabitEvent, User)
from .models import WorkspaceState, AccountToken
from .models import new_id
from .schemas import (UserCreate, UserOut, IdentityCreate, IdentityOut, HabitCreate, HabitOut,
                      HabitLogOut, HabitUpdate, IdentityUpdate, LogCreate, LogOut, PrepUpdate,
                      RewardCreate, RewardStatusOut, RewardOut, TelegramLinkOut, HabitEventCreate, HabitEventOut)
from .schemas import (AccountabilityInviteCreate, CircleCreate, CircleOut, DiagnosticCreate, DiagnosticOut,
                      HabitVariationCreate, HabitVariationOut, HabitVariationUpdate)
from .streaks import calculate_streak

if settings.database_url.startswith("sqlite"):
    Base.metadata.create_all(bind=engine)
    # Local-only compatibility for existing Codex SQLite files. Production PostgreSQL
    # schema changes are deliberately applied through the deployment's reviewed schema workflow.
    with engine.begin() as connection:
        inspector = inspect(connection)
        local_additions = {
            "users": {"password_hash": "VARCHAR(256)", "api_token_hash": "VARCHAR(64)", "telegram_chat_id": "VARCHAR(64)"},
            "habits": {"display_name": "VARCHAR(300)", "gateway_minutes": "INTEGER NOT NULL DEFAULT 2", "cue_to_hide": "VARCHAR(300)", "friction_strategy": "VARCHAR(300)", "habit_contract": "VARCHAR(300)", "motivation_ritual": "VARCHAR(300)", "shaping_milestones": "VARCHAR(1200)", "shaping_current_step": "INTEGER NOT NULL DEFAULT 0", "accountability_partner": "VARCHAR(200)", "accountability_cost": "VARCHAR(300)", "accountability_partner_email": "VARCHAR(320)", "alternative_routine": "VARCHAR(300)", "replacement_actions": "JSON NOT NULL DEFAULT '[]'", "replacement_options": "JSON NOT NULL DEFAULT '[]'", "replacement_mode": "VARCHAR(20) NOT NULL DEFAULT 'STACK'", "break_plan_answers": "JSON NOT NULL DEFAULT '{}'", "aversion_reminder": "VARCHAR(300)", "friction_votes": "INTEGER NOT NULL DEFAULT 0", "technique_ids": "JSON", "technique_notes": "JSON", "baseline_daily": "INTEGER"},
            "habit_logs": {"environment_prepped": "BOOLEAN NOT NULL DEFAULT FALSE"},
            "habit_events": {"actual_minutes": "INTEGER", "strategy": "VARCHAR(300)", "variation_id": "VARCHAR(36)", "variation_name": "VARCHAR(160)"},
            "workspace_states": {"revision": "INTEGER NOT NULL DEFAULT 1"},
        }
        for table, columns in local_additions.items():
            if table not in inspector.get_table_names():
                continue
            existing = {column["name"] for column in inspector.get_columns(table)}
            for name, declaration in columns.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {declaration}"))
        if "habits" in inspector.get_table_names():
            connection.execute(text("UPDATE habits SET technique_ids='[]' WHERE technique_ids IS NULL"))
            connection.execute(text("UPDATE habits SET technique_notes='{}' WHERE technique_notes IS NULL"))
            connection.execute(text("UPDATE habits SET replacement_actions='[]' WHERE replacement_actions IS NULL"))
            connection.execute(text("UPDATE habits SET break_plan_answers='{}' WHERE break_plan_answers IS NULL"))
app = FastAPI(title="Habitly API", version="0.2.0", description="Four Laws habit building and behavior change API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*", "Authorization"],
)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def password_digest(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return f"{salt.hex()}:{derived.hex()}"


def password_matches(password: str, stored: str | None) -> bool:
    if not stored or ":" not in stored:
        return False
    salt_hex, expected = stored.split(":", 1)
    return hmac.compare_digest(password_digest(password, bytes.fromhex(salt_hex)).split(":", 1)[1], expected)


def sync_unified_events(db: Session, user_id: str, workspace: dict | None = None,
                        journal_source: str = "LEGACY_MIGRATION") -> None:
    """Idempotently expose legacy records and workspace journal logs in v2."""
    identity_ids = select(Identity.id).where(Identity.user_id == user_id)
    habits = list(db.scalars(select(Habit).where(Habit.identity_id.in_(identity_ids))))
    habit_ids = {habit.id for habit in habits}
    if not habit_ids:
        return

    def upsert(event_id: str, habit_id: str, event_type: str, occurred_at: datetime, effective_date: date,
               context: dict, source: str, intensity: int | None = None, verification: dict | None = None,
               created_at: datetime | None = None) -> None:
        if occurred_at.tzinfo is None:
            occurred_at = occurred_at.replace(tzinfo=timezone.utc)
        if created_at and created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        existing = db.get(UnifiedHabitEvent, event_id)
        if existing:
            previous_moment = existing.occurred_at
            if previous_moment.tzinfo is None:
                previous_moment = previous_moment.replace(tzinfo=timezone.utc)
            changed = (existing.event_type != event_type or previous_moment != occurred_at
                       or existing.effective_date != effective_date or existing.context_payload != context
                       or existing.intensity != intensity or existing.verification_15m != verification)
            if changed:
                existing.event_type = event_type
                existing.occurred_at = occurred_at
                existing.effective_date = effective_date
                existing.context_payload = context
                existing.intensity = intensity
                existing.verification_15m = verification
                existing.updated_at = datetime.now(timezone.utc)
            return
        db.add(UnifiedHabitEvent(id=event_id, habit_id=habit_id, event_type=event_type,
                                 occurred_at=occurred_at, effective_date=effective_date,
                                 intensity=intensity, context_payload=context, verification_15m=verification,
                                 source=source, created_at=created_at or datetime.now(timezone.utc)))

    for row in db.scalars(select(HabitLog).where(HabitLog.habit_id.in_(habit_ids))):
        moment = datetime.combine(row.logged_date, datetime.min.time(), tzinfo=timezone.utc).replace(hour=12)
        event_id = str(uuid5(NAMESPACE_URL, f"habitly:legacy-log:{row.id}"))
        upsert(event_id, row.habit_id, "DAILY_CHECKIN", moment, row.logged_date,
               {"status": row.status, "completed_via": row.completed_via,
                "environment_prepped": row.environment_prepped}, "LEGACY_MIGRATION")
    for row in db.scalars(select(HabitEvent).where(HabitEvent.habit_id.in_(habit_ids))):
        moment = row.occurred_at if row.occurred_at.tzinfo else row.occurred_at.replace(tzinfo=timezone.utc)
        event_id = str(uuid5(NAMESPACE_URL, f"habitly:legacy-event:{row.id}"))
        upsert(event_id, row.habit_id, row.event_type, moment, moment.date(),
               {"note": row.note, "strategy": row.strategy, "replacement_action": row.variation_name},
               "LEGACY_MIGRATION")

    payload = workspace or {}
    for row in payload.get("behaviorLogs", []):
        if not isinstance(row, dict) or row.get("habitId") not in habit_ids or not row.get("id") or not row.get("at"):
            continue
        try:
            moment = datetime.fromisoformat(str(row["at"]).replace("Z", "+00:00"))
            if moment.tzinfo is None:
                moment = moment.replace(tzinfo=timezone.utc)
            local_day = date.fromisoformat(row.get("localDate", "")) if row.get("localDate") else moment.date()
        except (TypeError, ValueError):
            continue
        outcome = row.get("outcome")
        kind = row.get("type")
        event_type = ("URGE_RESISTED" if outcome == "resisted" else "URGE_SLIPPED" if outcome == "smoked"
                      else "URGE_LOGGED") if kind == "craving" else "PROACTIVE_REPLACEMENT" if kind == "technique_applied" else "HABIT_OCCURRENCE"
        context = {key: row.get(key) for key in ("trigger", "replacementAction", "context", "note", "episodeId", "timezone", "createdAt") if row.get(key) is not None}
        verification = {key: row.get(key) for key in ("urgeFollowUpStatus", "urgeFollowUpAt", "urgeFollowUpDueAt", "intensityAfter") if row.get(key) is not None}
        try:
            created_at = datetime.fromisoformat(str(row.get("createdAt", "")).replace("Z", "+00:00")) if row.get("createdAt") else None
        except ValueError:
            created_at = None
        event_id = str(uuid5(NAMESPACE_URL, f"habitly:behavior:{row['habitId']}:{row['id']}"))
        upsert(event_id, row["habitId"], event_type, moment, local_day, context,
               journal_source, row.get("intensity"), verification or None, created_at)


@app.middleware("http")
async def account_boundary(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS" or path in {"/health", "/api/auth/register", "/api/auth/login", "/webhook/telegram"} or path.startswith("/api/accountability-invites/"):
        return await call_next(request)
    if not path.startswith("/api/"):
        return await call_next(request)
    authorization = request.headers.get("authorization", "")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        return Response('{"detail":"Authentication required"}', status_code=401, media_type="application/json")
    db_provider = app.dependency_overrides.get(get_db, get_db)
    db = next(db_provider())
    try:
        digest = token_digest(token)
        user = db.scalar(select(User).where(User.api_token_hash == digest)) or db.scalar(select(AccountToken.user_id).where(AccountToken.token_hash == digest).join(User, AccountToken.user_id == User.id))
        if isinstance(user, str):
            user = db.get(User, user)
        if not user:
            return Response('{"detail":"Invalid account token"}', status_code=401, media_type="application/json")
        segments = [part for part in path.split("/") if part]
        owner_id = None
        if len(segments) >= 3 and segments[1] == "users":
            owner_id = segments[2]
        elif len(segments) >= 3 and segments[1] == "identities":
            identity = db.get(Identity, segments[2]); owner_id = identity.user_id if identity else ""
        elif len(segments) >= 3 and segments[1] == "habits":
            if segments[2] == "" or segments[2] == "habits":
                owner_id = None
            else:
                habit = db.get(Habit, segments[2]); owner_id = habit.identity.user_id if habit else ""
        elif len(segments) >= 3 and segments[1] == "diagnostics":
            owner_id = None
        if owner_id is not None and owner_id != user.id:
            return Response('{"detail":"Record not found"}', status_code=404, media_type="application/json")
        identity_id = request.query_params.get("identity_id")
        if identity_id:
            identity = db.get(Identity, identity_id)
            if not identity or identity.user_id != user.id:
                return Response('{"detail":"Record not found"}', status_code=404, media_type="application/json")
        if request.method in {"POST", "PUT", "PATCH"} and (path.endswith("/api/habits") or path.endswith("/api/diagnostics") or path.endswith("/api/identities") or path.endswith("/api/rewards")):
            body = await request.body()
            request._body = body
            try:
                from json import loads
                payload = loads(body or b"{}")
            except Exception:
                payload = {}
            requested_identity = payload.get("identity_id")
            requested_user = payload.get("user_id")
            if requested_identity:
                identity = db.get(Identity, requested_identity)
                if not identity or identity.user_id != user.id:
                    return Response('{"detail":"Record not found"}', status_code=404, media_type="application/json")
            requested_habit = payload.get("habit_id")
            if requested_habit:
                habit = db.get(Habit, requested_habit)
                if not habit or habit.identity.user_id != user.id:
                    return Response('{"detail":"Record not found"}', status_code=404, media_type="application/json")
            if requested_user and requested_user != user.id:
                return Response('{"detail":"Record not found"}', status_code=404, media_type="application/json")
        request.state.user_id = user.id
        return await call_next(request)
    finally:
        db.close()


@app.post("/api/auth/register", status_code=201)
def register(payload: dict, db: Session = Depends(get_db)):
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    if len(email) > 320 or "@" not in email or len(password) < 10:
        raise HTTPException(422, "Enter a valid email and password with at least 10 characters")
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "An account with that email already exists")
    token = secrets.token_urlsafe(32)
    user = User(email=email, password_hash=password_digest(password))
    db.add(user); db.commit(); db.refresh(user)
    db.add(AccountToken(token_hash=token_digest(token), user_id=user.id)); db.commit()
    return {"id": user.id, "email": user.email, "token": token}


@app.post("/api/auth/login")
def login(payload: dict, db: Session = Depends(get_db)):
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    user = db.scalar(select(User).where(User.email == email))
    if not user or not password_matches(password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect")
    token = secrets.token_urlsafe(32)
    db.add(AccountToken(token_hash=token_digest(token), user_id=user.id)); db.commit()
    return {"id": user.id, "email": user.email, "token": token}


@app.get("/api/account")
def account_info(request: Request, db: Session = Depends(get_db)):
    user = db.get(User, request.state.user_id)
    identity = db.scalar(select(Identity).where(Identity.user_id == user.id).order_by(Identity.id).limit(1))
    return {"id": user.id, "email": user.email, "identity": identity}


def build_workspace(db: Session, user_id: str, state: WorkspaceState | None):
    identity = db.scalar(select(Identity).where(Identity.user_id == user_id).order_by(Identity.id).limit(1))
    habits = list(db.scalars(select(Habit).join(Identity).where(Identity.user_id == user_id, Habit.is_active.is_(True)).order_by(text("habits.rowid") if settings.database_url.startswith("sqlite") else Habit.id)))
    if not state and not habits:
        return {}
    data = dict(state.payload) if state else {}
    data["identity"] = identity.identity_statement if identity else data.get("identity", "")
    data["votes"] = identity.total_votes if identity else data.get("votes", 0)
    data["habits"] = []
    history: dict[str, list[str]] = {}
    prep: dict[str, bool] = {}
    events: list[dict] = []
    variations: list[dict] = []
    for habit in habits:
        logs = list(db.scalars(select(HabitLog).where(HabitLog.habit_id == habit.id).order_by(HabitLog.logged_date.desc())))
        streak, _warning = calculate_streak(logs)
        today = next((log for log in logs if log.logged_date == date.today()), None)
        yesterday = next((log for log in logs if log.logged_date == date.today() - timedelta(days=1)), None)
        invite_token = db.scalar(select(AccountabilityInvite.token).where(AccountabilityInvite.habit_id == habit.id).order_by(AccountabilityInvite.created_at.desc()).limit(1))
        data["habits"].append({
            "id": habit.id, "name": habit.display_name or habit.target_action, "target": habit.target_action,
            "gateway": habit.gateway_action, "gatewayMinutes": habit.gateway_minutes,
            "cueType": habit.cue_type, "cue": habit.cue_trigger,
            "time": habit.cue_trigger if habit.cue_type == "TIME_LOCATION" else None,
            "location": habit.location, "motive": habit.craving_motive, "reward": habit.reward_payoff,
            "prep": habit.prep_step or "", "completed": bool(today and today.status in {"COMPLETED", "RECOVERED"}),
            "missedYesterday": bool(yesterday and yesterday.status == "MISSED"), "streak": streak,
            "kind": habit.habit_type, "hideCue": habit.cue_to_hide, "friction": habit.friction_strategy,
            "contract": habit.habit_contract, "aversionReminder": habit.aversion_reminder,
            "frictionVotes": habit.friction_votes, "rewardBundle": habit.reward_bundle,
            "alternativeRoutine": habit.alternative_routine, "ritual": habit.motivation_ritual,
            "replacementActions": habit.replacement_actions or [], "replacementOptions": habit.replacement_options or [], "replacementMode": habit.replacement_mode or "STACK", "breakPlanAnswers": habit.break_plan_answers or {},
            "milestones": habit.shaping_milestones.split("\n") if habit.shaping_milestones else [],
            "milestoneIndex": habit.shaping_current_step, "accountabilityPartner": habit.accountability_partner,
            "accountabilityEmail": habit.accountability_partner_email, "accountabilityCost": habit.accountability_cost,
            "techniqueIds": habit.technique_ids or [], "techniqueNotes": habit.technique_notes or {},
            "baselineDaily": habit.baseline_daily, "inviteLink": f"/?accountability={invite_token}" if invite_token else None,
        })
        for log in logs:
            statuses = history.setdefault(log.logged_date.isoformat(), [])
            statuses.append(f"missed:{habit.id}" if log.status == "MISSED" else habit.id if log.status in {"COMPLETED", "RECOVERED"} else "")
            if not statuses[-1]:
                statuses.pop()
            if log.logged_date == date.today() and log.environment_prepped:
                prep[habit.id] = True
        for event in db.scalars(select(HabitEvent).where(HabitEvent.habit_id == habit.id).order_by(HabitEvent.occurred_at.desc())):
            events.append({"id": event.id, "habitId": habit.id, "type": event.event_type, "at": event.occurred_at.isoformat(), "note": event.note, "actualMinutes": event.actual_minutes, "strategy": event.strategy, "variationId": event.variation_id, "variationName": event.variation_name})
        for variation in db.scalars(select(HabitVariation).where(HabitVariation.habit_id == habit.id).order_by(HabitVariation.created_at.desc())):
            variations.append({"id": variation.id, "habitId": habit.id, "law": variation.law, "name": variation.name, "techniqueId": variation.technique_id, "setup": variation.setup, "isActive": variation.is_active, "triedAt": variation.tried_at.isoformat() if variation.tried_at else None, "helped": variation.helped, "outcomeNote": variation.outcome_note, "createdAt": variation.created_at.isoformat()})
    data["history"] = history
    data["preppedHabits"] = prep
    data["habitEvents"] = events
    data["variations"] = variations
    data["rewards"] = [{"id": reward.id, "name": reward.name, "habitId": reward.habit_id, "detail": reward.detail or ""} for reward in db.scalars(select(Reward).join(Habit).join(Identity).where(Identity.user_id == user_id, Reward.is_active.is_(True)))]
    data["diagnostics"] = [{"id": row.id, "routine": row.routine, "craving": row.craving, "rewardExperiment": row.reward_experiment, "cueTime": row.cue_time or "", "cueLocation": row.cue_location or "", "cueEmotion": row.cue_emotion or "", "cuePeople": row.cue_people or "", "plan": row.plan} for row in db.scalars(select(HabitDiagnostic).join(Identity).where(Identity.user_id == user_id).order_by(HabitDiagnostic.created_at.desc()))]
    circles = list(db.scalars(select(CommunityCircle).order_by(CommunityCircle.name)))
    memberships = set(db.scalars(select(CircleMembership.circle_id).where(CircleMembership.identity_id == identity.id))) if identity else set()
    data["communityCircles"] = [{"id": circle.id, "name": circle.name, "category": circle.identity, "detail": circle.description, "members": db.scalar(select(func.count(CircleMembership.id)).where(CircleMembership.circle_id == circle.id)) or 0} for circle in circles]
    data["joinedTribes"] = list(memberships)
    return data


@app.get("/api/identities")
def list_identities(request: Request, db: Session = Depends(get_db)):
    return list(db.scalars(select(Identity).where(Identity.user_id == request.state.user_id).order_by(Identity.id)))


@app.get("/api/workspace")
def read_workspace(request: Request, db: Session = Depends(get_db)):
    state = db.get(WorkspaceState, request.state.user_id)
    sync_unified_events(db, request.state.user_id, state.payload if state else {})
    db.commit()
    data = build_workspace(db, request.state.user_id, state)
    return {"data": data, "revision": state.revision if state else 0}


@app.put("/api/workspace")
def write_workspace(payload: dict, request: Request, db: Session = Depends(get_db)):
    state = db.get(WorkspaceState, request.state.user_id)
    expected_revision = int(payload.get("expected_revision", 0))
    workspace = payload.get("data", payload)
    if state:
        if expected_revision != state.revision:
            raise HTTPException(409, "This workspace changed in another browser. Reconnect to load the latest server copy before saving again.")
        state.payload = workspace
        state.revision += 1
    else:
        if expected_revision != 0:
            raise HTTPException(409, "This workspace was created in another browser. Reconnect to load it before saving again.")
        state = WorkspaceState(user_id=request.state.user_id, payload=workspace, revision=1); db.add(state)
    sync_unified_events(db, request.state.user_id, workspace, "JOURNAL_LOGGER")
    db.commit()
    return {"saved": True, "updated_at": state.updated_at, "revision": state.revision}


@app.post("/api/workspace/import")
def import_workspace(payload: dict, request: Request, db: Session = Depends(get_db)):
    """One-time, idempotent localStorage import. Existing server state always wins."""
    state = db.get(WorkspaceState, request.state.user_id)
    if state:
            return {"imported": False, "reason": "server_data_exists", "habits": len(state.payload.get("habits", [])), "revision": state.revision}
    existing_habits = db.scalar(select(func.count(Habit.id)).join(Identity).where(Identity.user_id == request.state.user_id)) or 0
    if existing_habits:
        return {"imported": False, "reason": "server_data_exists", "habits": existing_habits, "revision": 0}
    clean = dict(payload)
    clean["habits"] = [habit for habit in clean.get("habits", []) if not str(habit.get("id", "")).startswith("demo-")]
    clean["rewards"] = [reward for reward in clean.get("rewards", []) if not str(reward.get("id", "")).startswith("reward-show") and not str(reward.get("habitId", "")).startswith("demo-")]
    state = WorkspaceState(user_id=request.state.user_id, payload=clean)
    db.add(state); db.flush()
    identity = db.scalar(select(Identity).where(Identity.user_id == request.state.user_id).order_by(Identity.id).limit(1))
    if not identity:
        identity = Identity(user_id=request.state.user_id, identity_statement=str(clean.get("identity") or "A person building better habits")[:240])
        db.add(identity); db.flush()
    else:
        identity.identity_statement = str(clean.get("identity") or identity.identity_statement)[:240]
    identity.total_votes = int(clean.get("votes", identity.total_votes) or 0)
    habit_ids = set()
    imported_invites = []
    for row in clean["habits"]:
        habit_id = str(row.get("id", ""))
        if not habit_id or db.get(Habit, habit_id):
            continue
        habit_ids.add(habit_id)
        db.add(Habit(
            id=habit_id, identity_id=identity.id, habit_type=row.get("kind", "BUILD"), display_name=row.get("name"),
            target_action=row.get("target") or row.get("name") or "Habit", gateway_action=row.get("gateway", ""),
            gateway_minutes=int(row.get("gatewayMinutes", 0) or 0), cue_type=row.get("cueType", "STACK"),
            cue_trigger=row.get("cue") or row.get("time") or "", location=row.get("location"),
            craving_motive=row.get("motive", ""), reward_payoff=row.get("reward", ""), prep_step=row.get("prep"),
            reward_bundle=row.get("rewardBundle"), cue_to_hide=row.get("hideCue"), friction_strategy=row.get("friction"),
            habit_contract=row.get("contract"), motivation_ritual=row.get("ritual"),
            shaping_milestones="\n".join(row.get("milestones", [])) or None, shaping_current_step=row.get("milestoneIndex", 0) or 0,
            accountability_partner=row.get("accountabilityPartner"), accountability_partner_email=row.get("accountabilityEmail"),
            accountability_cost=row.get("accountabilityCost"), alternative_routine=row.get("alternativeRoutine"),
            replacement_actions=row.get("replacementActions", []) or [], replacement_options=row.get("replacementOptions", []) or [], replacement_mode=row.get("replacementMode", "STACK"), break_plan_answers=row.get("breakPlanAnswers", {}) or {},
            aversion_reminder=row.get("aversionReminder"), technique_ids=row.get("techniqueIds", []),
            technique_notes=row.get("techniqueNotes", {}), baseline_daily=row.get("baselineDaily"),
            friction_votes=row.get("frictionVotes", 0) or 0,
        ))
        partner_email = str(row.get("accountabilityEmail") or "").strip()
        if partner_email and "@" in partner_email:
            invite_token = secrets.token_urlsafe(24)
            db.add(AccountabilityInvite(habit_id=habit_id, partner_email=partner_email, partner_name=row.get("accountabilityPartner"), token=invite_token))
            imported_invites.append({"habit_id": habit_id, "token": invite_token})
    db.flush()
    for day, values in clean.get("history", {}).items():
        for value in values:
            missed = str(value).startswith("missed:")
            habit_id = str(value).removeprefix("missed:")
            if habit_id in habit_ids:
                db.add(HabitLog(habit_id=habit_id, logged_date=date.fromisoformat(day), status="MISSED" if missed else "COMPLETED", completed_via="WEB"))
    for habit_id, is_prepped in clean.get("preppedHabits", {}).items():
        if is_prepped and habit_id in habit_ids:
            logged = db.scalar(select(HabitLog.id).where(HabitLog.habit_id == habit_id, HabitLog.logged_date == date.today()))
            if logged:
                db.get(HabitLog, logged).environment_prepped = True
            else:
                db.add(HabitLog(habit_id=habit_id, logged_date=date.today(), status="PREPPED", completed_via="WEB", environment_prepped=True))
    for row in clean.get("habitEvents", []):
        if row.get("habitId") in habit_ids:
            db.add(HabitEvent(id=row.get("id") or new_id(), habit_id=row["habitId"], event_type=row.get("type", "ACTION_COMPLETED"), occurred_at=datetime.fromisoformat(row["at"].replace("Z", "+00:00")) if row.get("at") else datetime.now(timezone.utc), note=row.get("note"), actual_minutes=row.get("actualMinutes"), strategy=row.get("strategy"), variation_id=row.get("variationId"), variation_name=row.get("variationName")))
    for row in clean.get("variations", []):
        if row.get("habitId") in habit_ids:
            db.add(HabitVariation(id=row.get("id") or new_id(), habit_id=row["habitId"], law=row.get("law", "response"), name=row.get("name", "Variation"), technique_id=row.get("techniqueId"), setup=row.get("setup", ""), is_active=bool(row.get("isActive")), tried_at=datetime.fromisoformat(row["triedAt"].replace("Z", "+00:00")) if row.get("triedAt") else None, helped=row.get("helped"), outcome_note=row.get("outcomeNote"), created_at=datetime.fromisoformat(row["createdAt"].replace("Z", "+00:00")) if row.get("createdAt") else datetime.now(timezone.utc)))
    for row in clean.get("rewards", []):
        if row.get("habitId") in habit_ids:
            db.add(Reward(id=row.get("id") or new_id(), habit_id=row["habitId"], name=row.get("name", "Reward"), detail=row.get("detail")))
    for row in clean.get("diagnostics", []):
        db.add(HabitDiagnostic(id=row.get("id") or new_id(), identity_id=identity.id, routine=row.get("routine", ""), craving=row.get("craving", ""), reward_experiment=row.get("rewardExperiment", ""), cue_time=row.get("cueTime"), cue_location=row.get("cueLocation"), cue_emotion=row.get("cueEmotion"), cue_people=row.get("cuePeople"), plan=row.get("plan", "")))
    for row in clean.get("communityCircles", []):
        circle = db.scalar(select(CommunityCircle).where(CommunityCircle.name == row.get("name", "")))
        if not circle and row.get("name"):
            circle = CommunityCircle(id=row.get("id") or new_id(), name=row["name"], identity=row.get("category", "Community"), description=row.get("detail", ""))
            db.add(circle); db.flush()
        if circle and row.get("id") in set(clean.get("joinedTribes", [])):
            membership = db.scalar(select(CircleMembership.id).where(CircleMembership.circle_id == circle.id, CircleMembership.identity_id == identity.id))
            if not membership:
                db.add(CircleMembership(circle_id=circle.id, identity_id=identity.id))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.get(WorkspaceState, request.state.user_id)
        if existing:
            return {"imported": False, "reason": "server_data_exists", "habits": len(existing.payload.get("habits", [])), "revision": existing.revision}
        raise
    return {"imported": True, "habits": len(clean["habits"]), "rewards": len(clean["rewards"]), "invites": imported_invites, "revision": 1}


@app.get("/health")
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return Response(
            '{"status":"error","database":"unavailable"}',
            status_code=503,
            media_type="application/json",
        )
    return {"status": "ok", "database": "ok"}


@app.post("/api/users", response_model=UserOut, status_code=201)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    user = User(email=payload.email)
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "A user with that email already exists") from exc
    db.refresh(user)
    return user


@app.post("/api/users/{user_id}/telegram-link", response_model=TelegramLinkOut)
def create_telegram_link(user_id: str, db: Session = Depends(get_db)):
    if not settings.telegram_bot_token:
        raise HTTPException(503, "Telegram bot is not configured")
    if not db.get(User, user_id):
        raise HTTPException(404, "User not found")
    token = secrets.token_urlsafe(24)
    db.add(TelegramLink(token=token, user_id=user_id, expires_at=datetime.now(timezone.utc) + timedelta(minutes=10)))
    db.commit()
    return TelegramLinkOut(start_command=f"/start {token}", expires_in_minutes=10)


@app.post("/api/identities", response_model=IdentityOut, status_code=201)
def create_identity(payload: IdentityCreate, db: Session = Depends(get_db)):
    if not db.get(User, payload.user_id):
        raise HTTPException(404, "User not found")
    identity = Identity(**payload.model_dump())
    db.add(identity)
    db.commit()
    db.refresh(identity)
    return identity


@app.get("/api/identities/{identity_id}", response_model=IdentityOut)
def get_identity(identity_id: str, db: Session = Depends(get_db)):
    identity = db.get(Identity, identity_id)
    if not identity:
        raise HTTPException(404, "Identity not found")
    return identity


@app.patch("/api/identities/{identity_id}", response_model=IdentityOut)
def update_identity(identity_id: str, payload: IdentityUpdate, db: Session = Depends(get_db)):
    identity = db.get(Identity, identity_id)
    if not identity:
        raise HTTPException(404, "Identity not found")
    identity.identity_statement = payload.identity_statement
    db.commit()
    db.refresh(identity)
    return identity


@app.post("/api/habits", response_model=HabitOut, status_code=201)
def create_habit(payload: HabitCreate, db: Session = Depends(get_db)):
    if not db.get(Identity, payload.identity_id):
        raise HTTPException(404, "Identity not found")
    if payload.habit_type == "BUILD" and payload.cue_type == "TIME_LOCATION" and not payload.location:
        raise HTTPException(422, "Time and location cues require a location")
    habit_data = payload.model_dump()
    habit_data["display_name"] = payload.display_name or payload.target_action
    habit = Habit(**habit_data)
    db.add(habit)
    db.commit()
    db.refresh(habit)
    if payload.habit_type == "BREAK" and (payload.habit_contract or payload.accountability_cost or payload.accountability_partner):
        db.add(HabitContract(habit_id=habit.id, agreement=payload.habit_contract or "", consequence=payload.accountability_cost or "", partner_name=payload.accountability_partner or ""))
        db.commit()
    return habit


@app.get("/api/habits", response_model=list[HabitOut])
def list_habits(identity_id: str, db: Session = Depends(get_db)):
    query = select(Habit).where(Habit.is_active.is_(True), Habit.identity_id == identity_id)
    return list(db.scalars(query.order_by(Habit.cue_trigger)))


@app.post("/api/diagnostics", response_model=DiagnosticOut, status_code=201)
def create_diagnostic(payload: DiagnosticCreate, db: Session = Depends(get_db)):
    if not db.get(Identity, payload.identity_id):
        raise HTTPException(404, "Identity not found")
    diagnostic = HabitDiagnostic(**payload.model_dump())
    db.add(diagnostic)
    db.commit()
    db.refresh(diagnostic)
    return diagnostic


@app.get("/api/diagnostics", response_model=list[DiagnosticOut])
def list_diagnostics(identity_id: str, db: Session = Depends(get_db)):
    if not db.get(Identity, identity_id):
        raise HTTPException(404, "Identity not found")
    return list(db.scalars(select(HabitDiagnostic).where(HabitDiagnostic.identity_id == identity_id).order_by(HabitDiagnostic.created_at.desc())))


@app.post("/api/habits/{habit_id}/accountability-invites", status_code=201)
def create_accountability_invite(habit_id: str, payload: AccountabilityInviteCreate, db: Session = Depends(get_db)):
    habit = db.get(Habit, habit_id)
    if not habit:
        raise HTTPException(404, "Habit not found")
    invite = AccountabilityInvite(habit_id=habit_id, **payload.model_dump())
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return {"id": invite.id, "token": invite.token, "status": invite.status, "partner_email": invite.partner_email}


@app.get("/api/accountability-invites/{token}")
def get_accountability_invite(token: str, db: Session = Depends(get_db)):
    invite = db.scalar(select(AccountabilityInvite).where(AccountabilityInvite.token == token))
    if not invite:
        raise HTTPException(404, "Invite not found")
    habit = db.get(Habit, invite.habit_id)
    recent_logs = list(db.scalars(select(HabitLog).where(HabitLog.habit_id == habit.id).order_by(HabitLog.logged_date.desc()).limit(7)))
    return {"status": invite.status, "partner_name": invite.partner_name, "partner_email": invite.partner_email,
            "habit": habit.target_action, "agreement": habit.habit_contract, "consequence": habit.accountability_cost,
            "recent_activity": [{"date": row.logged_date.isoformat(), "status": row.status} for row in recent_logs]}


@app.post("/api/accountability-invites/{token}/accept")
def accept_accountability_invite(token: str, db: Session = Depends(get_db)):
    invite = db.scalar(select(AccountabilityInvite).where(AccountabilityInvite.token == token))
    if not invite:
        raise HTTPException(404, "Invite not found")
    invite.status = "ACCEPTED"
    db.commit()
    return {"status": invite.status}


@app.post("/api/habits/{habit_id}/events", response_model=HabitEventOut, status_code=201)
def create_habit_event(habit_id: str, payload: HabitEventCreate, db: Session = Depends(get_db)):
    habit = db.get(Habit, habit_id)
    if not habit:
        raise HTTPException(404, "Habit not found")
    event = HabitEvent(habit_id=habit_id, **payload.model_dump())
    db.add(event)
    db.flush()
    sync_unified_events(db, habit.identity.user_id)
    db.commit()
    db.refresh(event)
    return event


@app.get("/api/habits/{habit_id}/events", response_model=list[HabitEventOut])
def list_habit_events(habit_id: str, db: Session = Depends(get_db)):
    if not db.get(Habit, habit_id):
        raise HTTPException(404, "Habit not found")
    return list(db.scalars(select(HabitEvent).where(HabitEvent.habit_id == habit_id).order_by(HabitEvent.occurred_at.desc()).limit(500)))


@app.get("/api/habits/{habit_id}/variations", response_model=list[HabitVariationOut])
def list_habit_variations(habit_id: str, db: Session = Depends(get_db)):
    if not db.get(Habit, habit_id):
        raise HTTPException(404, "Habit not found")
    return list(db.scalars(select(HabitVariation).where(HabitVariation.habit_id == habit_id).order_by(HabitVariation.created_at.desc())))


@app.post("/api/habits/{habit_id}/variations", response_model=HabitVariationOut, status_code=201)
def create_habit_variation(habit_id: str, payload: HabitVariationCreate, db: Session = Depends(get_db)):
    if not db.get(Habit, habit_id):
        raise HTTPException(404, "Habit not found")
    variation = HabitVariation(habit_id=habit_id, **payload.model_dump())
    db.add(variation)
    db.commit()
    db.refresh(variation)
    return variation


@app.patch("/api/habits/{habit_id}/variations/{variation_id}", response_model=HabitVariationOut)
def update_habit_variation(habit_id: str, variation_id: str, payload: HabitVariationUpdate, db: Session = Depends(get_db)):
    variation = db.scalar(select(HabitVariation).where(HabitVariation.id == variation_id, HabitVariation.habit_id == habit_id))
    if not variation:
        raise HTTPException(404, "Variation not found")
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("is_active"):
        db.query(HabitVariation).filter(HabitVariation.habit_id == habit_id).update({"is_active": False})
        changes.setdefault("tried_at", datetime.now(timezone.utc))
    for key, value in changes.items():
        setattr(variation, key, value)
    db.commit()
    db.refresh(variation)
    return variation


@app.delete("/api/habits/{habit_id}/variations/{variation_id}", status_code=204)
def delete_habit_variation(habit_id: str, variation_id: str, db: Session = Depends(get_db)):
    variation = db.scalar(select(HabitVariation).where(HabitVariation.id == variation_id, HabitVariation.habit_id == habit_id))
    if not variation:
        raise HTTPException(404, "Variation not found")
    db.delete(variation)
    db.commit()


DEFAULT_CIRCLES = [
    {"name": "Morning Movers", "identity": "The Runner", "description": "Make a little movement part of the morning."},
    {"name": "The Daily Readers", "identity": "The Reader", "description": "A page a day, alongside people who love books."},
    {"name": "Makers’ Hour", "identity": "The Maker", "description": "Show up for one focused creative session."},
]


def ensure_default_circles(db: Session):
    if not db.scalar(select(CommunityCircle.id).limit(1)):
        db.add_all([CommunityCircle(**circle) for circle in DEFAULT_CIRCLES])
        db.commit()


@app.get("/api/community/circles", response_model=list[CircleOut])
def list_community_circles(identity_id: str | None = None, db: Session = Depends(get_db)):
    ensure_default_circles(db)
    if identity_id and not db.get(Identity, identity_id):
        raise HTTPException(404, "Identity not found")
    circles = list(db.scalars(select(CommunityCircle).order_by(CommunityCircle.name)))
    return [{"id": circle.id, "name": circle.name, "identity": circle.identity, "description": circle.description,
             "member_count": db.scalar(select(func.count(CircleMembership.id)).where(CircleMembership.circle_id == circle.id)) or 0,
             "joined": bool(identity_id and db.scalar(select(CircleMembership.id).where(CircleMembership.circle_id == circle.id, CircleMembership.identity_id == identity_id)))} for circle in circles]


@app.post("/api/community/circles", response_model=CircleOut, status_code=201)
def create_community_circle(payload: CircleCreate, db: Session = Depends(get_db)):
    circle = CommunityCircle(**payload.model_dump())
    db.add(circle)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "A circle with that name already exists") from exc
    db.refresh(circle)
    return {"id": circle.id, **payload.model_dump(), "member_count": 0, "joined": False}


@app.post("/api/community/circles/{circle_id}/join")
def join_community_circle(circle_id: str, identity_id: str, db: Session = Depends(get_db)):
    if not db.get(CommunityCircle, circle_id) or not db.get(Identity, identity_id):
        raise HTTPException(404, "Circle or identity not found")
    existing = db.scalar(select(CircleMembership).where(CircleMembership.circle_id == circle_id, CircleMembership.identity_id == identity_id))
    if not existing:
        db.add(CircleMembership(circle_id=circle_id, identity_id=identity_id))
        db.commit()
    return {"joined": True}


@app.delete("/api/community/circles/{circle_id}/join")
def leave_community_circle(circle_id: str, identity_id: str, db: Session = Depends(get_db)):
    membership = db.scalar(select(CircleMembership).where(CircleMembership.circle_id == circle_id, CircleMembership.identity_id == identity_id))
    if membership:
        db.delete(membership)
        db.commit()
    return {"joined": False}


@app.post("/api/habits/{habit_id}/log", response_model=LogOut, status_code=201)
def log_habit(habit_id: str, payload: LogCreate, db: Session = Depends(get_db)):
    habit = db.get(Habit, habit_id)
    if not habit:
        raise HTTPException(404, "Habit not found")
    logged_date = payload.logged_date or date.today()
    existing = db.scalar(select(HabitLog).where(HabitLog.habit_id == habit_id, HabitLog.logged_date == logged_date))
    previous_status = existing.status if existing else None
    if existing:
        existing.status = payload.status
        existing.completed_via = payload.completed_via
        log = existing
    else:
        log = HabitLog(habit_id=habit_id, logged_date=logged_date, status=payload.status, completed_via=payload.completed_via)
        db.add(log)
    if payload.status in {"COMPLETED", "RECOVERED"} and previous_status not in {"COMPLETED", "RECOVERED"}:
        habit.identity.total_votes += 1
    log.environment_prepped = payload.environment_prepped or (existing.environment_prepped if existing else False)
    db.flush()
    sync_unified_events(db, habit.identity.user_id)
    db.commit()
    db.refresh(log)
    rows = list(db.scalars(select(HabitLog).where(HabitLog.habit_id == habit_id).order_by(HabitLog.logged_date.desc())))
    streak, warning = calculate_streak(rows)
    return LogOut(id=log.id, habit_id=habit_id, logged_date=log.logged_date, status=log.status,
                  completed_via=log.completed_via, identity_votes=habit.identity.total_votes,
                  resilient_streak=streak, warning_active=warning)


@app.patch("/api/habits/{habit_id}", response_model=HabitOut)
def update_habit(habit_id: str, payload: HabitUpdate, db: Session = Depends(get_db)):
    habit = db.get(Habit, habit_id)
    if not habit:
        raise HTTPException(404, "Habit not found")
    changes = payload.model_dump(exclude_unset=True)
    if "friction_votes" in changes:
        changes["friction_votes"] = max(habit.friction_votes, changes["friction_votes"])
    for key, value in changes.items():
        setattr(habit, key, value)
    db.commit()
    db.refresh(habit)
    return habit


@app.post("/api/habits/{habit_id}/prep")
def update_environment_prep(habit_id: str, payload: PrepUpdate, db: Session = Depends(get_db)):
    habit = db.get(Habit, habit_id)
    if not habit:
        raise HTTPException(404, "Habit not found")
    logged_date = payload.logged_date or date.today()
    log = db.scalar(select(HabitLog).where(HabitLog.habit_id == habit_id, HabitLog.logged_date == logged_date))
    if log:
        log.environment_prepped = payload.environment_prepped
    elif payload.environment_prepped:
        log = HabitLog(habit_id=habit_id, logged_date=logged_date, status="PREPPED", environment_prepped=True)
        db.add(log)
    db.commit()
    return {"habit_id": habit_id, "logged_date": logged_date, "environment_prepped": payload.environment_prepped}


@app.get("/api/rewards", response_model=list[RewardStatusOut])
def list_rewards(request: Request, db: Session = Depends(get_db)):
    rewards = list(db.scalars(select(Reward).join(Habit).join(Identity).where(Reward.is_active.is_(True), Identity.user_id == request.state.user_id)))
    today = date.today()
    result = []
    for reward in rewards:
        completed = db.scalar(select(HabitLog.id).where(
            HabitLog.habit_id == reward.habit_id, HabitLog.logged_date == today,
            HabitLog.status.in_(["COMPLETED", "RECOVERED"])))
        result.append({"id": reward.id, "habit_id": reward.habit_id, "name": reward.name,
                       "detail": reward.detail, "is_active": reward.is_active, "unlocked": bool(completed)})
    return result


@app.post("/api/rewards", response_model=RewardOut, status_code=201)
def create_reward(payload: RewardCreate, db: Session = Depends(get_db)):
    if not db.get(Habit, payload.habit_id):
        raise HTTPException(404, "Habit not found")
    reward = Reward(**payload.model_dump())
    db.add(reward)
    db.commit()
    db.refresh(reward)
    return reward


@app.get("/api/habits/{habit_id}/logs")
def habit_logs(habit_id: str, db: Session = Depends(get_db)):
    if not db.get(Habit, habit_id):
        raise HTTPException(404, "Habit not found")
    rows = list(db.scalars(select(HabitLog).where(HabitLog.habit_id == habit_id).order_by(HabitLog.logged_date.desc())))
    streak, warning = calculate_streak(rows)
    return {"logs": [HabitLogOut.model_validate(row) for row in rows], "resilient_streak": streak, "warning_active": warning}


@app.post("/webhook/telegram")
async def telegram_webhook(request: Request, db: Session = Depends(get_db)):
    if not settings.telegram_bot_token or not settings.telegram_webhook_secret:
        raise HTTPException(503, "Telegram integration is not configured")
    if request.headers.get("X-Telegram-Bot-Api-Secret-Token") != settings.telegram_webhook_secret:
        raise HTTPException(403, "Invalid webhook secret")
    update = await request.json()
    message = update.get("message", {})
    text = message.get("text", "").strip()
    chat = message.get("chat", {})
    chat_id = str(chat.get("id", ""))
    if not chat_id:
        return {"ok": True}

    async def reply(body: str):
        async with httpx.AsyncClient(timeout=8) as client:
            await client.post(f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
                              json={"chat_id": chat_id, "text": body})

    if text.startswith("/start "):
        token = text.split(maxsplit=1)[1].strip()
        link = db.get(TelegramLink, token)
        if not link:
            await reply("That link code is invalid or already used. Create a fresh link from Habitly.")
            return {"ok": True, "linked": False}
        expires = link.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            db.delete(link)
            db.commit()
            await reply("That link code expired. Create a fresh link from Habitly.")
            return {"ok": True, "linked": False}
        user = db.get(User, link.user_id)
        user.telegram_chat_id = chat_id
        db.delete(link)
        db.commit()
        await reply("Habitly is connected. Send ‘done’ plus a habit name to cast an identity vote.")
        return {"ok": True, "linked": True}

    user = db.scalar(select(User).where(User.telegram_chat_id == chat_id))
    if not user:
        await reply("Connect your account first: create a Telegram link in Habitly, then send its /start code here.")
        return {"ok": True, "linked": False}
    if not text:
        await reply("Send ‘done’ and the habit name you completed.")
        return {"ok": True}

    identities = list(db.scalars(select(Identity).where(Identity.user_id == user.id)))
    identity_ids = [identity.id for identity in identities]
    habits = list(db.scalars(select(Habit).where(Habit.identity_id.in_(identity_ids), Habit.is_active.is_(True)))) if identity_ids else []
    unfinished = []
    for habit in habits:
        today_log = db.scalar(select(HabitLog).where(HabitLog.habit_id == habit.id, HabitLog.logged_date == date.today()))
        if today_log is None or today_log.status not in {"COMPLETED", "RECOVERED"}:
            unfinished.append(habit)
    normalized = text.lower().replace("/done", "").replace("done", "").replace("stack complete", "").strip(" :,-")
    query_words = [word for word in normalized.replace("with ", "").replace("my ", "").replace("the ", "").split() if len(word) > 2]
    if normalized:
        matches = []
        for candidate in unfinished:
            action_words = (candidate.target_action + " " + candidate.gateway_action).lower().split()
            if normalized in candidate.target_action.lower() or normalized in candidate.gateway_action.lower() or any(
                query.startswith(word) or word.startswith(query) for query in query_words for word in action_words if len(word) > 2
            ):
                matches.append(candidate)
    else:
        matches = unfinished if len(unfinished) == 1 else []
    if len(matches) != 1:
        if not unfinished:
            await reply("You’re all caught up for today. Nice work.")
        else:
            names = ", ".join(h.target_action for h in unfinished[:8])
            await reply(f"Which habit did you complete? Send ‘done’ plus its name: {names}")
        return {"ok": True, "logged": False}

    habit = matches[0]
    yesterday = db.scalar(select(HabitLog).where(HabitLog.habit_id == habit.id, HabitLog.logged_date == date.today() - timedelta(days=1)))
    status = "RECOVERED" if yesterday and yesterday.status == "MISSED" else "COMPLETED"
    today_log = db.scalar(select(HabitLog).where(HabitLog.habit_id == habit.id, HabitLog.logged_date == date.today()))
    if today_log:
        today_log.status = status
        today_log.completed_via = "TELEGRAM_BOT"
    else:
        db.add(HabitLog(habit_id=habit.id, logged_date=date.today(), status=status, completed_via="TELEGRAM_BOT"))
    habit.identity.total_votes += 1
    db.commit()
    logs = list(db.scalars(select(HabitLog).where(HabitLog.habit_id == habit.id).order_by(HabitLog.logged_date.desc())))
    streak, _ = calculate_streak(logs)
    await reply(f"{('Recovery vote' if status == 'RECOVERED' else 'Identity vote')} cast for {habit.target_action}. Your resilient streak is {streak} days.")
    return {"ok": True, "logged": True, "habit_id": habit.id, "resilient_streak": streak}
