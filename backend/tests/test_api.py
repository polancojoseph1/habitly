from datetime import date, timedelta
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models import WorkspaceState


@pytest.fixture
def client(tmp_path):
    db_path = tmp_path / "test-habitly.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
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
        test_client.db_path = db_path
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def create_identity(client: TestClient):
    user_response = client.post("/api/auth/register", json={"email": f"{uuid4()}@habitly.test", "password": "correct horse battery"})
    assert user_response.status_code == 201
    client.headers.update({"Authorization": f"Bearer {user_response.json()['token']}"})
    user_response.json().pop("token")
    identity_response = client.post("/api/identities", json={
        "user_id": user_response.json()["id"],
        "identity_statement": "I am a reader",
    })
    assert identity_response.status_code == 201
    return user_response.json(), identity_response.json()


def test_account_data_isolation_and_workspace_import_restart(client):
    cors = client.options("/api/auth/login", headers={"Origin": "http://localhost:5174", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"})
    assert cors.status_code == 200
    assert cors.headers["access-control-allow-origin"] == "http://localhost:5174"
    owner, identity = create_identity(client)
    imported = {
        "habits": [{"id": "habit-imported", "name": "Read", "target": "Read one page", "gateway": "Open book", "cueType": "STACK", "cue": "after coffee", "kind": "BUILD", "motive": "learn", "reward": "calm", "gatewayMinutes": 2}],
        "history": {date.today().isoformat(): ["habit-imported"]},
        "rewards": [{"id": "reward-imported", "habitId": "habit-imported", "name": "Tea", "detail": ""}],
        "habitEvents": [{"id": "event-imported", "habitId": "habit-imported", "type": "ACTION_COMPLETED", "at": "2026-11-14T12:00:00Z", "note": "Imported"}],
        "variations": [{"id": "variation-imported", "habitId": "habit-imported", "law": "response", "name": "Short read", "setup": "Read one paragraph", "isActive": True}],
        "identity": "The Reader",
    }
    first = client.post("/api/workspace/import", json=imported)
    assert first.status_code == 200 and first.json()["imported"] is True
    second = client.post("/api/workspace/import", json=imported)
    assert second.status_code == 200 and second.json()["imported"] is False
    habit = client.get("/api/habits", params={"identity_id": identity["id"]}).json()[0]
    assert habit["id"] == "habit-imported"
    assert client.get("/api/habits/habit-imported/logs").json()["logs"][0]["status"] == "COMPLETED"
    assert client.get("/api/habits/habit-imported/events").json()[0]["note"] == "Imported"
    assert client.get("/api/habits/habit-imported/variations").json()[0]["name"] == "Short read"
    restarted_engine = create_engine(f"sqlite:///{client.db_path}")
    restarted_sessions = sessionmaker(bind=restarted_engine)
    with restarted_sessions() as db:
        persisted = db.get(__import__("app.models", fromlist=["Habit"]).Habit, "habit-imported")
        assert persisted is not None and persisted.identity.user_id == owner["id"]
    def override_restarted_db():
        db = restarted_sessions()
        try:
            yield db
        finally:
            db.close()
    app.dependency_overrides[get_db] = override_restarted_db
    assert client.get("/api/habits", params={"identity_id": identity["id"]}).json()[0]["id"] == "habit-imported"
    workspace = client.get("/api/workspace").json()
    assert workspace["data"]["identity"] == "The Reader"
    assert client.put("/api/workspace", json={"data": {"identity": "stale"}, "expected_revision": 0}).status_code == 409
    original_token = client.headers["Authorization"]
    second_session = client.post("/api/auth/login", json={"email": owner["email"], "password": "correct horse battery"}).json()["token"]
    client.headers.update({"Authorization": f"Bearer {second_session}"})
    assert client.get("/api/habits", params={"identity_id": identity["id"]}).status_code == 200
    client.headers.update({"Authorization": original_token})
    assert client.get("/api/habits", params={"identity_id": identity["id"]}).status_code == 200

    other = client.post("/api/auth/register", json={"email": f"{uuid4()}@habitly.test", "password": "another secure pass"}).json()
    client.headers.update({"Authorization": f"Bearer {other['token']}"})
    assert client.get(f"/api/identities/{identity['id']}").status_code == 404
    assert client.patch(f"/api/identities/{identity['id']}", json={"identity_statement": "Not mine"}).status_code == 404
    assert client.get(f"/api/habits/{habit['id']}/logs").status_code == 404
    assert client.patch(f"/api/habits/{habit['id']}", json={"is_active": False}).status_code == 404
    assert client.post("/api/rewards", json={"habit_id": habit["id"], "name": "Cross-account"}).status_code == 404
    assert client.get("/api/workspace").json() == {"data": {}, "revision": 0}
    assert client.get("/api/account", headers={"Authorization": ""}).status_code == 401
    restarted_engine.dispose()


def test_behavior_log_fields_survive_workspace_save_and_reload(client):
    user, identity = create_identity(client)
    habit = create_habit(client, identity['id']).json()
    entry = {
        'id': 'behavior-roundtrip', 'habitId': habit['id'], 'type': 'craving',
        'at': '2026-11-17T16:00:00Z', 'createdAt': '2026-11-17T16:00:00Z',
        'localDate': '2026-11-17', 'timezone': 'America/New_York', 'episodeId': 'episode-one',
        'trigger': 'after coffee', 'intensity': 7, 'outcome': 'resisted',
        'resolvedAt': '2026-11-17T16:04:00Z', 'context': {'emotions': ['stressed'], 'environments': ['home'], 'social': ['alone'], 'activities': ['coffee'], 'bodilyState': 'tired', 'accessibility': 'nearby', 'motives': ['relief'], 'tags': ['routine']},
        'automaticThought': 'I need one', 'belief': 'it helps', 'confidence': 5,
        'reframing': 'wait', 'intensityAfter': 3, 'urgeFollowUpDueAt': '2026-11-17T16:19:00Z',
        'urgeFollowUpStatus': 'stayed_gone', 'urgeFollowUpAt': '2026-11-17T16:20:00Z',
        'postEngagementSatisfaction': 'neutral', 'postEngagementSatisfactionAt': '2026-11-17T16:21:00Z',
        'note': 'recorded', 'questionnaireVersion': 1,
    }
    technique = {'id': 'technique-roundtrip', 'habitId': habit['id'], 'type': 'technique_applied', 'at': entry['at'], 'episodeId': entry['episodeId'], 'technique': 'Delay', 'techniqueId': 'delay', 'law': 'response', 'laws': ['response'], 'variationId': 'variation-one', 'timing': 'responsive', 'intensity': 7}
    occurrence = {'id': 'occurrence-roundtrip', 'habitId': habit['id'], 'type': 'habit_occurrence', 'at': entry['at'], 'episodeId': entry['episodeId'], 'quantity': 2, 'trigger': 'after coffee'}
    confirmation = {'habitId': habit['id'], 'date': '2026-11-17', 'status': 'occurred_recorded', 'updatedAt': '2026-11-17T23:00:00Z'}
    data = {'behaviorLogs': [entry, technique, occurrence], 'dailyConfirmations': [confirmation]}
    saved = client.put('/api/workspace', json={'expected_revision': 0, 'data': data})
    assert saved.status_code == 200
    loaded = client.get('/api/workspace').json()['data']
    assert loaded['behaviorLogs'] == [entry, technique, occurrence]
    assert loaded['dailyConfirmations'] == [confirmation]

    restarted_engine = create_engine(f"sqlite:///{client.db_path}")
    restarted_sessions = sessionmaker(bind=restarted_engine)
    with restarted_sessions() as db:
        persisted = db.get(WorkspaceState, user['id'])
        assert persisted is not None
        assert persisted.payload['behaviorLogs'] == [entry, technique, occurrence]
        assert persisted.payload['dailyConfirmations'] == [confirmation]
    restarted_engine.dispose()


def test_health_checks_database_connectivity(client, monkeypatch):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}

    def unavailable():
        raise SQLAlchemyError("database unavailable")

    monkeypatch.setattr("app.main.engine.connect", unavailable)
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"status": "error", "database": "unavailable"}


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
    habit_id = habit.json()["id"]
    assert client.post(f"/api/habits/{habit_id}/events", json={"event_type": "ACTION_COMPLETED"}).status_code == 201
    assert client.post(f"/api/habits/{habit_id}/events", json={"event_type": "ACTION_COMPLETED", "note": "Second session"}).status_code == 201
    assert len(client.get(f"/api/habits/{habit_id}/events").json()) == 2

    missing_location = create_habit(client, identity["id"], cue_type="TIME_LOCATION", cue_trigger="08:00")
    assert missing_location.status_code == 422
    optional_fourth_law = create_habit(client, identity["id"], craving_motive="", reward_payoff="", cue_type="STACK")
    assert optional_fourth_law.status_code == 201
    longer = create_habit(client, identity["id"], gateway_minutes=30)
    assert longer.status_code == 201
    assert longer.json()["gateway_minutes"] == 30
    no_duration = client.patch(f"/api/habits/{longer.json()['id']}", json={"gateway_minutes": 0})
    assert no_duration.status_code == 200
    assert no_duration.json()["gateway_minutes"] == 0
    assert next(item for item in client.get(f"/api/habits?identity_id={identity['id']}").json() if item["id"] == longer.json()["id"])["gateway_minutes"] == 0
    assert create_habit(client, identity["id"], gateway_minutes=-1).status_code == 422


def test_habit_variations_and_multiple_attributed_checkins(client):
    _, identity = create_identity(client)
    habit = create_habit(client, identity["id"], habit_type="BREAK", technique_ids=["increase-friction"], technique_notes={"response": "Keep the phone outside the bedroom"})
    assert habit.status_code == 201
    habit_id = habit.json()["id"]
    first = client.post(f"/api/habits/{habit_id}/variations", json={"law": "response", "name": "Phone outside", "technique_id": "increase-friction", "setup": "Charge it in the kitchen"})
    second = client.post(f"/api/habits/{habit_id}/variations", json={"law": "response", "name": "App blocker", "setup": "Block social apps after 10 PM"})
    assert first.status_code == second.status_code == 201
    assert client.patch(f"/api/habits/{habit_id}/variations/{first.json()['id']}", json={"is_active": True}).json()["is_active"]
    switched = client.patch(f"/api/habits/{habit_id}/variations/{second.json()['id']}", json={"is_active": True, "helped": True, "outcome_note": "Fewer late scroll sessions"})
    assert switched.json()["is_active"] is True
    rows = client.get(f"/api/habits/{habit_id}/variations").json()
    assert sum(row["is_active"] for row in rows) == 1
    assert client.post(f"/api/habits/{habit_id}/events", json={"event_type": "URGE_PASSED", "variation_id": switched.json()["id"], "variation_name": "App blocker", "strategy": "App blocker: Block social apps after 10 PM", "note": "Closed the browser"}).status_code == 201
    assert client.post(f"/api/habits/{habit_id}/events", json={"event_type": "OLD_HABIT", "variation_id": switched.json()["id"], "variation_name": "App blocker"}).status_code == 201
    events = client.get(f"/api/habits/{habit_id}/events").json()
    assert len(events) == 2
    assert events[0]["variation_name"] == "App blocker"
    assert events[1]["note"] == "Closed the browser"
    assert client.delete(f"/api/habits/{habit_id}/variations/{first.json()['id']}").status_code == 204


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


def test_break_plan_is_optional_accountability_and_tracks_multiple_daily_events(client):
    _, identity = create_identity(client)
    plan = create_habit(
        client,
        identity["id"],
        habit_type="BREAK",
        target_action="Scroll in bed",
        gateway_action="Read one page",
        craving_motive="Unwind after work",
        reward_payoff="Feel rested tomorrow",
        technique_ids=["reduce-exposure", "two-minute-rule", "habit-tracking"],
        technique_notes={
            "reduce-exposure": "Leave phone charging in the kitchen",
            "two-minute-rule": "Open the book on my pillow",
            "habit-tracking": "Mark each urge check-in",
        },
        alternative_routine="Read one page",
    )
    assert plan.status_code == 201
    saved_plan = plan.json()
    assert saved_plan["habit_contract"] is None
    assert saved_plan["accountability_partner"] is None
    assert saved_plan["technique_ids"] == ["reduce-exposure", "two-minute-rule", "habit-tracking"]
    assert saved_plan["technique_notes"]["two-minute-rule"] == "Open the book on my pillow"

    event_url = f"/api/habits/{saved_plan['id']}/events"
    for event_type in ("URGE_PASSED", "REPLACEMENT_USED", "OLD_HABIT"):
        event = client.post(event_url, json={"event_type": event_type})
        assert event.status_code == 201

    events = client.get(event_url)
    assert events.status_code == 200
    assert len(events.json()) == 3
    assert {event["event_type"] for event in events.json()} == {"URGE_PASSED", "REPLACEMENT_USED", "OLD_HABIT"}


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


def test_removing_habit_keeps_activity(client):
    _, identity = create_identity(client)
    habit = create_habit(client, identity["id"]).json()
    habit_id = habit["id"]
    assert client.post(f"/api/habits/{habit_id}/events", json={"event_type": "ACTION_COMPLETED"}).status_code == 201
    assert client.patch(f"/api/habits/{habit_id}", json={"is_active": False}).status_code == 200
    assert all(item["id"] != habit_id for item in client.get(f"/api/habits?identity_id={identity['id']}").json())
    assert len(client.get(f"/api/habits/{habit_id}/events").json()) == 1
