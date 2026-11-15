# Habitly

Habitly is a behavior change workspace built around the Four Laws of Behavior Change and their inversions. User habits, logs, rewards, profiles, preparation state, variations, diagnostics, accountability, community memberships, scorecards, and other workspace data are stored by the backend in a database.

## Features

- Today view, habit builder, technique playbook, habit review, and recovery calendar.
- Build and break plans with cues, starter actions, techniques, and progress tracking.
- Event history, preparation checklists, variations, rewards, diagnostics, accountability invites, and identity circles.
- Browser-local guided sample habits, clearly separated from user-created records and excluded from local data import.

## Architecture and access

The Next.js frontend talks to the FastAPI backend. SQLAlchemy stores relational records for accounts, identities, habits, events, logs, rewards, variations, diagnostics, accountability, and circles. A per-account JSON workspace snapshot also stores UI data that does not have its own relational model. PostgreSQL is the production database; the browser copy is a recovery cache and is not the cross-device source of truth.

Accounts use email and a password of at least 10 characters. Passwords are stored as PBKDF2 hashes. Each successful sign-in creates a separate random account token; only its SHA-256 digest is stored, so several browser profiles can stay signed in at once. Every account API route requires that token and verifies record ownership. Accountability invitation links are limited capability links for the invited habit activity.

After connecting, Habitly loads the server workspace and syncs changes to it. If the server is unavailable, the app keeps its browser copy and displays a connection or save error. Changes made offline are not shared with another profile until saved to the server. Settings includes a JSON backup download that strips the account token. Failed imports keep the original browser data. Never clear site data before the import reports success and a backup is available.

The app starts with sample habits. IDs beginning with `demo-` are examples, are never uploaded, and are excluded from import. User-created habits are identified by their own record IDs and import with their logs and related records.

## Local Codex setup

Local development needs no hosted database or credentials. An unset `DATABASE_URL` selects the persistent SQLite file `backend/habitly.db`; the file is ignored by Git.

```sh
cd backend
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -e '.[dev]'
uvicorn app.main:app --reload --port 8000
```

In another terminal:

```sh
cd frontend
npm ci
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Use any localhost frontend port. The browser defaults to the same-origin API proxy, and the API allows localhost and 127.0.0.1 origins on any port for direct API use. Open Settings and create an account. A local account and database are separate from the production server account and database.

Docker development is also available:

```sh
docker compose up --build
```

This Compose file is for local development. It uses SQLite and starts Next.js in development mode. Do not use it on the VPS.

## Hostinger VPS deployment

The production stack is configured separately in `docker-compose.hostinger.yml`. It uses a persistent PostgreSQL volume, a production Next.js container, and a private FastAPI container. Only the frontend is bound to a loopback port, for routing through the VPS reverse proxy.

See [docs/HOSTINGER_DEPLOYMENT.md](docs/HOSTINGER_DEPLOYMENT.md) for the VPS facts, n8n preservation requirements, production commands, backup requirements, missing deployment inputs, and planned GitHub Actions flow. The repository branch is `main`; a push to `main` will become the production approval event only after the restricted deployment user and workflow secrets are configured.

Do not change or stop n8n, its containers, volumes, proxy routes, or firewall configuration while deploying Habitly. Inspect the existing reverse proxy and port use first. Do not expose the API or database directly to the internet.

## Environment variables

Copy `.env.example` as a local development reference. For the VPS, copy `.env.hostinger.example` to an untracked server-side `.env` and replace the placeholders. Never commit secret values.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLAlchemy URL. Unset selects local SQLite; production requires PostgreSQL. |
| `CORS_ORIGINS` | Comma-separated additional frontend origins. Localhost ports are allowed by default. |
| `NEXT_PUBLIC_API_URL` | Optional browser API base URL. Blank uses the same-origin API proxy. |
| `HABITLY_API_INTERNAL_URL` | Next.js server-side proxy destination. Local default is `http://127.0.0.1:8000`; the production image uses `http://api:8000`. |
| `HABITLY_ENV` | Set to `production` on the VPS. Production mode requires PostgreSQL and rejects SQLite. |
| `TELEGRAM_BOT_TOKEN` | Optional Telegram integration token. |
| `TELEGRAM_WEBHOOK_SECRET` | Optional Telegram webhook verification secret. |

`DATABASE_URL` may use `postgres://` or `postgresql://`; the backend normalizes it for psycopg. No database password is needed for local SQLite development.

## Schema changes

`schema.postgres.sql` is the PostgreSQL schema source. Local SQLite creates or updates its local-only schema when the backend starts. In production, the Postgres image imports the schema file only when its persistent data volume is initialized for the first time. Application startup and image builds never run PostgreSQL DDL or migrations.

Do not rerun the full create-table file against an existing database. For later changes, add reviewed incremental migration statements, back up first if a change removes or transforms data, and apply only the approved statements to the production database. Do not add automatic PostgreSQL migrations to startup or build steps.

## Backup, restore, import, and export

For local SQLite, stop the local API and copy `backend/habitly.db` to a safe location. Restore by stopping the API and replacing that file with the backup. For the VPS database, create and verify an off-server PostgreSQL backup before accepting live user data. Hostinger daily VPS backups are currently reported as disabled. Review any added backup cost in hPanel before enabling it.

To migrate browser data, sign in, choose **Import this browser’s data** in Settings, and wait for the success message. Import is one-time and idempotent: if the account already has server data, Habitly keeps that server copy and will not overwrite it. The import excludes sample habits and carries user habits, logs, events, variations, rewards, diagnostics, profile data, and workspace state. The browser copy is retained after import. If import fails, use **Download local backup** in Settings; it contains the workspace JSON but not the account token. To restore it, sign in to an account with an empty workspace, choose **Restore from backup**, and select that JSON file.

The import recognizes the current `habitly-workspace-v2` browser format. Older custom browser formats may need manual field mapping from the downloaded JSON. Previous API accounts were created without passwords or authorization tokens, so they cannot be safely claimed by email alone; their database rows remain in the local database, but must be exported and assigned to a verified account by an administrator before they can be served through the authenticated API. No existing browser data is deleted automatically. Local and production databases are separate; the app does not copy data between them automatically.

## Verification

```sh
cd backend && python -m pytest -q
cd frontend && npm run build
```

The API tests cover account data isolation, persistence across independent database connections, and idempotent local workspace import.
