from datetime import date, timedelta
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base, get_db
from app.main import app


@pytest.fixture
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    test_sessions = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = test_sessions()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def create_identity(client: TestClient):
    user_response = client.post("/api/users", json={"email": f"{uuid4()}@habitly.test"})
    assert user_response.status_code == 201
    identity_response = client.post("/api/identities", json={
        "user_id": user_response.json()["id"],
        "identity_statement": "I am a reader",
    })
    assert identity_response.status_code == 201
    return user_response.json(), identity_response.json()


def create_habit(client: TestClient, identity_id: str, **overrides):
    payload = {
        "identity_id": identity_id,
        "target_action": "Read one page",
        "gateway_action": "Open my book",
        "gateway_minutes": 2,
        "cue_type": "STACK",
        "cue_trigger": "pour my coffee",
        "craving_motive": "Wind down",
        "reward_payoff": "A quiet moment",
    }
    payload.update(overrides)
    response = client.post("/api/habits", json=payload)
    return response


def test_identity_habit_creation_and_formula_validation(client):
    user, identity = create_identity(client)
    assert identity["total_votes"] == 0
    assert client.patch(f"/api/identities/{identity['id']}", json={"identity_statement": "I am a daily reader"}).json()["identity_statement"] == "I am a daily reader"

    habit = create_habit(client, identity["id"], cue_type="TIME_LOCATION", cue_trigger="08:00", location="bedroom")
    assert habit.status_code == 201
    assert habit.json()["gateway_minutes"] == 2
    assert habit.json()["craving_motive"] == "Wind down"

    missing_location = create_habit(client, identity["id"], cue_type="TIME_LOCATION", cue_trigger="08:00")
    assert missing_location.status_code == 422
    missing_fourth_law = create_habit(client, identity["id"], reward_payoff="", cue_type="STACK")
    assert missing_fourth_law.status_code == 422
    too_long_starter = create_habit(client, identity["id"], gateway_minutes=6)
    assert too_long_starter.status_code == 422


def test_completion_votes_are_idempotent_and_reward_unlocks(client):
    _, identity = create_identity(client)
    habit = create_habit(client, identity["id"]).json()
    reward = client.post("/api/rewards", json={"habit_id": habit["id"], "name": "Watch an episode"})
    assert reward.status_code == 201
    assert client.get("/api/rewards").json()[0]["unlocked"] is False

    first = client.post(f"/api/habits/{habit['id']}/log", json={"status": "COMPLETED"}).json()
    second = client.post(f"/api/habits/{habit['id']}/log", json={"status": "COMPLETED"}).json()
    assert first["identity_votes"] == second["identity_votes"] == 1
    assert first["resilient_streak"] == second["resilient_streak"] == 1
    assert client.get("/api/rewards").json()[0]["unlocked"] is True


def test_recovery_bridges_one_miss_and_two_misses_break_chain(client):
    _, identity = create_identity(client)
    one_miss = create_habit(client, identity["id"]).json()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    client.post(f"/api/habits/{one_miss['id']}/log", json={"status": "MISSED", "logged_date": yesterday})
    recovered = client.post(f"/api/habits/{one_miss['id']}/log", json={"status": "RECOVERED"}).json()
    assert recovered["resilient_streak"] == 2
    assert recovered["warning_active"] is True
    assert recovered["identity_votes"] == 1

    two_misses = create_habit(client, identity["id"], target_action="Practice piano").json()
    client.post(f"/api/habits/{two_misses['id']}/log", json={"status": "MISSED", "logged_date": yesterday})
    broken = client.post(f"/api/habits/{two_misses['id']}/log", json={"status": "MISSED"}).json()
    assert broken["resilient_streak"] == 0
    assert broken["warning_active"] is False


def test_prep_record_does_not_break_the_habit_streak(client):
    _, identity = create_identity(client)
    habit = create_habit(client, identity["id"]).json()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    client.post(f"/api/habits/{habit['id']}/log", json={"status": "COMPLETED", "logged_date": yesterday})
    prep = client.post(f"/api/habits/{habit['id']}/prep", json={"environment_prepped": True})
    assert prep.status_code == 200
    history = client.get(f"/api/habits/{habit['id']}/logs").json()
    assert history["resilient_streak"] == 1
    assert any(log["environment_prepped"] for log in history["logs"])


def test_telegram_one_time_link_and_done_message(client, monkeypatch):
    user, identity = create_identity(client)
    habit = create_habit(client, identity["id"]).json()
    monkeypatch.setattr(settings, "telegram_bot_token", "test-token")
    monkeypatch.setattr(settings, "telegram_webhook_secret", "test-secret")

    async def fake_post(self, *args, **kwargs):
        return httpx.Response(200, json={"ok": True})

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    link = client.post(f"/api/users/{user['id']}/telegram-link")
    assert link.status_code == 200
    start_command = link.json()["start_command"]
    start = client.post("/webhook/telegram", headers={"X-Telegram-Bot-Api-Secret-Token": "test-secret"}, json={
        "message": {"chat": {"id": 123456}, "text": start_command},
    })
    assert start.json()["linked"] is True
    log = client.post("/webhook/telegram", headers={"X-Telegram-Bot-Api-Secret-Token": "test-secret"}, json={
        "message": {"chat": {"id": 123456}, "text": "done with reading"},
    })
    assert log.json()["logged"] is True
    history = client.get(f"/api/habits/{habit['id']}/logs").json()["logs"]
    assert history[0]["completed_via"] == "TELEGRAM_BOT"
