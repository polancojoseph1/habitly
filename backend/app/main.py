from datetime import date
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .database import Base, engine, get_db
from .models import Habit, HabitLog, Identity, User
from .schemas import UserCreate, UserOut, IdentityCreate, IdentityOut, HabitCreate, HabitOut, LogCreate, LogOut
from .streaks import calculate_streak

Base.metadata.create_all(bind=engine)
app = FastAPI(title="Habitly API", version="0.1.0", description="Identity-based habit building API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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
    if payload.status == "COMPLETED" and previous_status != "COMPLETED":
        habit.identity.total_votes += 1
    db.commit()
    db.refresh(log)
    rows = list(db.scalars(select(HabitLog).where(HabitLog.habit_id == habit_id).order_by(HabitLog.logged_date.desc())))
    streak, warning = calculate_streak(rows)
    return LogOut(id=log.id, habit_id=habit_id, logged_date=log.logged_date, status=log.status,
                  completed_via=log.completed_via, identity_votes=habit.identity.total_votes,
                  resilient_streak=streak, warning_active=warning)


@app.get("/api/habits/{habit_id}/logs")
def habit_logs(habit_id: str, db: Session = Depends(get_db)):
    if not db.get(Habit, habit_id):
        raise HTTPException(404, "Habit not found")
    rows = list(db.scalars(select(HabitLog).where(HabitLog.habit_id == habit_id).order_by(HabitLog.logged_date.desc())))
    streak, warning = calculate_streak(rows)
    return {"logs": rows, "resilient_streak": streak, "warning_active": warning}


@app.post("/webhook/telegram")
async def telegram_webhook(request: Request, db: Session = Depends(get_db)):
    if not settings.telegram_bot_token or not settings.telegram_webhook_secret:
        raise HTTPException(503, "Telegram integration is not configured")
    if request.headers.get("X-Telegram-Bot-Api-Secret-Token") != settings.telegram_webhook_secret:
        raise HTTPException(403, "Invalid webhook secret")
    # Telegram account linking and reply delivery need bot credentials and an explicit
    # user-to-chat mapping; this endpoint only accepts authenticated updates for now.
    update = await request.json()
    message = update.get("message", {})
    text = message.get("text", "").strip()
    if not text:
        return {"ok": True, "message": "Send the habit name you completed."}
    return {"ok": True, "message": "Telegram updates are received; link a chat to a Habitly user to enable logging."}
