# Habitly

Habitly turns behavioral science into a practical daily habit workspace: identity votes, small starter actions, clear cues, recovery after a miss, and immediate rewards.

## What’s in the app

- **Today:** identity statement, identity votes, weekly activity, daypart habit groups, starter actions, completion/recovery actions, and preparation checklists.
- **Habit builder:** implementation intention or habit stack, anchor routines, cue/motive/action/reward fields, a two-minute downscaler, and optional temptation bundles.
- **Recovery:** one grace day, a 28-day activity calendar, and a circuit breaker after two misses.
- **Reward vault:** rewards unlock when their linked habit is completed.
- **Habit to break:** cue hiding, friction strategy, replacement action, habit contract, and friction shield votes.
- **Settings:** local workspace persistence, optional API account sync, and Telegram linking.

The app opens with a guided sample workspace and saves changes in browser storage. Connect a deployed API in **Settings** to persist user-created habits and logs to PostgreSQL. The demo entries remain labeled as sample content.

## Stack

- `frontend/`: Next.js, React, Tailwind CSS, installable PWA manifest
- `backend/`: FastAPI, SQLAlchemy 2, PostgreSQL (SQLite is the local API default)
- `docker-compose.yml`: PostgreSQL and both development servers

## Run locally with Docker

```sh
docker compose up --build
```

Open the dashboard at http://localhost:3000 and API docs at http://localhost:8000/docs. The dashboard includes sample habits immediately. API-backed user habits are created after connecting an API account in Settings.

## Run separately

```sh
cd backend
python -m venv .venv && . .venv/bin/activate
python -m pip install -e '.[dev]'
uvicorn app.main:app --reload
```

In another terminal:

```sh
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Set `DATABASE_URL` and `CORS_ORIGINS` for the API deployment. Telegram requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`; configure the webhook with Telegram to point at `/webhook/telegram`. Users can create a short-lived `/start` link from Settings after connecting an API account. Once linked, messages such as `done reading` log an unambiguous habit and reply with the resilient streak.

## Verification

```sh
cd backend && python -m pytest -q
cd frontend && npm run build
```

## Current limits

The local sample workspace is browser-local until an API account is connected. API mode is an early MVP without authentication; don’t expose it to untrusted users or store sensitive personal data until authentication and authorization are added. Telegram secrets are never placed in the frontend.
