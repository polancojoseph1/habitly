# Habitly

Habitly is a behavior change workspace built around the Four Laws of Behavior Change and their inversions. Its user-created habits, logs, rewards, profile, preparation state, variations, diagnostics, accountability, community memberships, scorecard, and other workspace data are stored by the backend in a database.

## Features

- Today view, habit builder, technique playbook, habit review, and recovery calendar.
- Build and break plans with cues, starter actions, techniques, and progress tracking.
- Event history, preparation checklists, variations, rewards, diagnostics, accountability invites, and identity circles.
- Browser-local guided sample habits, clearly separated from user-created records and excluded from local data import.

## Architecture and access

The Next.js frontend talks to the FastAPI backend. SQLAlchemy stores relational records for accounts, identities, habits, events, logs, rewards, variations, diagnostics, accountability, and circles. A per-account JSON workspace snapshot also stores UI data that does not have its own relational model. PostgreSQL is the shared production database; the browser copy is a recovery cache and is not the cross-device source of truth.

Accounts use email and a password of at least 10 characters. Passwords are stored as PBKDF2 hashes. Each successful sign-in creates a separate random account token; only its SHA-256 digest is stored, so several browser profiles can stay signed in at once. Every account API route requires that token and verifies record ownership. Accountability invitation links are limited capability links for the invited habit activity.

After connecting, Habitly loads the server workspace and syncs changes to it. If the server is unavailable, the app keeps its browser copy and displays a connection or save error. Changes made offline are not shared with another profile until saved to the server. Settings includes a JSON backup download that strips the account token. Failed imports keep the original browser data. Never clear site data before the import reports success and a backup is available.

The app starts with sample habits. IDs beginning with `demo-` are examples, are never uploaded, and are excluded from import. User-created habits are identified by their own record IDs and import with their logs and related records.

## Local Codex setup

Local development needs no Replit account, hosted database, or credentials. An unset `DATABASE_URL` selects the persistent SQLite file `backend/habitly.db`; the file is ignored by Git.

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

Use any localhost frontend port. The browser defaults to the same-origin API proxy, and the API allows localhost and 127.0.0.1 origins on any port for direct API use. Open Settings and create an account. A local account and database are separate from any Replit account or database.

Docker development is also available:

```sh
docker compose up --build
```

It persists API data in the project’s backend directory. The Compose database is for local development only.

## Replit setup

See [README-REPLIT.md](README-REPLIT.md) for exact Replit setup, managed PostgreSQL provisioning, Secrets, run and deploy commands, schema application and promotion, and restart/publish checks.

Replit development and production databases are separate. Provision the production database in Publish settings before publishing. The app does not run PostgreSQL DDL or migrations at startup or during build. Apply schema changes to the development database and use Replit Publish to promote the reviewed schema. Never direct local Codex schema commands at the production database.

## Environment variables

Copy `.env.example` as a reference. Never commit secret values.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Optional SQLAlchemy URL. Unset means project-local SQLite; Replit must provide managed PostgreSQL. |
| `CORS_ORIGINS` | Comma-separated additional frontend origins. Localhost ports are allowed by default. |
| `NEXT_PUBLIC_API_URL` | API base URL used by the browser. |
| `HABITLY_API_INTERNAL_URL` | Next.js server-side proxy destination, default `http://127.0.0.1:8000`. |
| `TELEGRAM_BOT_TOKEN` | Optional Telegram integration token. |
| `TELEGRAM_WEBHOOK_SECRET` | Optional Telegram webhook verification secret. |
| `PORT` | Replit-assigned public Next.js listener port. |

`DATABASE_URL` may use `postgres://` or `postgresql://`; the backend normalizes it for psycopg. No Replit secret or password is needed for local SQLite development.

## Schema changes

`schema.postgres.sql` is the PostgreSQL schema source. Local SQLite creates or updates its local-only schema when the backend starts. PostgreSQL startup and deployment build commands never create tables or run migrations.

For a new empty Replit development database, apply `schema.postgres.sql` once through Replit's database tooling. Do not rerun the full create-table file on an existing database. For later changes, add reviewed migration statements to the schema source, apply only those statements to the Replit development database, inspect the result, and then follow Replit's Publish schema promotion flow. Review any proposed schema diff before confirming Publish. Back up first if a change removes or transforms data. Do not run DDL against production manually and do not add auto-migrations to startup or build steps.

## Backup, restore, import, and export

For local SQLite, stop the local API and copy `backend/habitly.db` to a safe location. Restore by stopping the API and replacing that file with the backup. For PostgreSQL, use Replit's managed database backup/export workflow; `pg_dump "$DATABASE_URL"` and `pg_restore` are appropriate only when run with the intended database URL and supported network access. Development and production backups are separate.

To migrate existing browser data, sign in, choose **Import this browser’s data** in Settings, and wait for the success message. Import is one-time and idempotent: if the account already has server data, Habitly keeps that server copy and will not overwrite it. The import excludes sample habits and carries user habits, logs, events, variations, rewards, diagnostics, profile data, and workspace state. The browser copy is retained after import. If import fails, use **Download local backup** in Settings; it contains the workspace JSON but not the account token. To restore it, sign in to an account with an empty workspace, choose **Restore from backup**, and select that JSON file.

The import recognizes the current `habitly-workspace-v2` browser format. Older custom browser formats may need manual field mapping from the downloaded JSON. Previous API accounts were created without passwords or authorization tokens, so they cannot be safely claimed by email alone; their database rows remain in the local database, but must be exported and assigned to a verified account by an administrator before they can be served through the authenticated API. No existing browser data is deleted automatically. Replit's development and production databases also require their own Replit Publish schema workflow; this project does not copy data between those environments.

## Verification

```sh
cd backend && python -m pytest -q
cd frontend && npm run build
```

The API tests cover account data isolation, persistence across independent database connections, and idempotent local workspace import.
