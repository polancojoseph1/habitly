from datetime import date, datetime, timedelta, timezone
import secrets
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .database import Base, engine, get_db
import httpx

from .models import Habit, HabitLog, Identity, Reward, TelegramLink, User
from .schemas import (UserCreate, UserOut, IdentityCreate, IdentityOut, HabitCreate, HabitOut,
                      HabitLogOut, HabitUpdate, IdentityUpdate, LogCreate, LogOut, PrepUpdate,
                      RewardCreate, RewardStatusOut, RewardOut, TelegramLinkOut)
from .streaks import calculate_streak

Base.metadata.create_all(bind=engine)
# Keep databases created by the first Habitly commit usable as fields evolve.
with engine.begin() as connection:
    additions = {
        "users": {"telegram_chat_id": "VARCHAR(64)"},
        "habits": {
            "gateway_minutes": "INTEGER NOT NULL DEFAULT 2",
            "cue_to_hide": "VARCHAR(300)",
            "friction_strategy": "VARCHAR(300)",
            "habit_contract": "VARCHAR(300)",
            "friction_votes": "INTEGER NOT NULL DEFAULT 0",
        },
        "habit_logs": {"environment_prepped": "BOOLEAN NOT NULL DEFAULT FALSE"},
    }
    inspector = inspect(connection)
    for table, columns in additions.items():
        existing = {column["name"] for column in inspector.get_columns(table)}
        for column, declaration in columns.items():
            if column not in existing:
                connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}"))
                existing.add(column)
app = FastAPI(title="Habitly API", version="0.1.0", description="Identity-based habit building API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


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
    if payload.cue_type == "TIME_LOCATION" and not payload.location:
        raise HTTPException(422, "Time and location cues require a location")
    habit = Habit(**payload.model_dump())
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return habit


@app.get("/api/habits", response_model=list[HabitOut])
def list_habits(identity_id: str | None = None, db: Session = Depends(get_db)):
    query = select(Habit).where(Habit.is_active.is_(True))
    if identity_id:
        query = query.where(Habit.identity_id == identity_id)
    return list(db.scalars(query.order_by(Habit.cue_trigger)))


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
def list_rewards(db: Session = Depends(get_db)):
    rewards = list(db.scalars(select(Reward).where(Reward.is_active.is_(True))))
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
