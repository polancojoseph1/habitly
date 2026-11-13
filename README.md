# Habitly

Habitly is an identity-based habit tracker built around small actions, clear cues, immediate reinforcement, and resilient recovery. This repository starts the implementation from the provided product blueprint.

## Stack

- `frontend/`: Next.js, React, Tailwind CSS
- `backend/`: FastAPI, SQLAlchemy 2, PostgreSQL (SQLite is the local API default)
- `docker-compose.yml`: PostgreSQL and both development servers

## Run locally with Docker

```sh
docker compose up --build
```

Open the app at http://localhost:3000 and the API docs at http://localhost:8000/docs. The initial dashboard will show its empty state until an identity and habit are created through the API. For example:

```sh
curl -X POST http://localhost:8000/api/users -H 'Content-Type: application/json' -d '{}'
# Use the returned id as user_id below.
curl -X POST http://localhost:8000/api/identities -H 'Content-Type: application/json' -d '{"user_id":"USER_ID","identity_statement":"I am a reader"}'
# Use the returned id as identity_id below.
curl -X POST http://localhost:8000/api/habits -H 'Content-Type: application/json' -d '{"identity_id":"IDENTITY_ID","target_action":"Read one page","gateway_action":"Open my book","cue_type":"TIME_LOCATION","cue_trigger":"8:00 PM","location":"bedroom"}'
```

## Run the API directly

```sh
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -e '.[dev]'
uvicorn app.main:app --reload
```

Set `DATABASE_URL` for PostgreSQL. The default is a local SQLite file. The Telegram route also requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`; see `.env.example`.

## Current implementation

The API includes user and identity creation, habit creation/listing, daily habit logs, identity vote counts, and a resilient streak calculation with a one-day grace rule. The dashboard displays active habits and can log completion with immediate feedback. Telegram requests are secret-checked, but user/chat linking and bot replies still need implementation before remote logging is enabled.

See [the implementation plan](docs/implementation-plan.md) for feature sequencing and known gaps.
