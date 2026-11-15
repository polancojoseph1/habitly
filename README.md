# Habitly

Habitly is a behavior change workspace built around the Four Laws of Behavior Change and their inversions. User habits, logs, rewards, profiles, preparation state, variations, diagnostics, accountability, community memberships, scorecards, and other workspace data are stored by the backend in a database.

## Features

- Today view, habit builder, technique playbook, habit review, and recovery calendar.
- Build and break plans with cues, starter actions, techniques, and progress tracking.
- Event history, preparation checklists, variations, rewards, diagnostics, accountability invites, and identity circles.
- Browser-local guided sample habits, clearly separated from user-created records and excluded from local data import.

## Architecture and access

The Next.js frontend talks to the FastAPI backend. SQLAlchemy stores relational records for accounts, identities, habits, events, logs, rewards, variations, diagnostics, accountability, and circles. A per-account JSON workspace snapshot also stores UI data that does not have its own relational model. The current Hostinger deployment uses SQLite in a persistent Docker volume; the browser copy is a recovery cache and is not the cross-device source of truth.

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
docker compose -f docker-compose.dev.yml up --build
```

This development Compose file uses SQLite, source bind mounts, and the Next.js development server. Do not use it on the VPS.

## Production deployment

`docker-compose.yml` is the production stack. It pulls the `habitly-api` and `habitly-web` images from GHCR, stores SQLite in the persistent `habitly_habitly_data` volume, and routes the web container through Traefik on the external `n8n_default` network. It publishes no application ports. The API is reachable only inside Docker networks and through the frontend's same-origin API proxy.

Copy `env.production.example` to `.env.production` on the VPS and protect it with mode `600`. Keep Telegram credentials in that server-side file. GitHub Actions builds both images and pushes commit SHA and `latest` tags. Deployment remains disabled until `HABITLY_DEPLOY_ENABLED` is set to `true` after SSH host verification and VPS provisioning.

See [docs/HOSTINGER_DEPLOYMENT.md](docs/HOSTINGER_DEPLOYMENT.md) for setup, health checks, rollback, GitHub Actions configuration, and the n8n preservation requirements.

Do not change or stop n8n, its containers, volumes, proxy routes, or firewall configuration while deploying Habitly. Inspect the existing reverse proxy and port use first. Do not expose the API or database directly to the internet.

## Environment variables

Copy `.env.example` as a local development reference. For the VPS, copy `env.production.example` to an untracked server-side `.env.production`. Never commit secret values.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLAlchemy URL. Unset selects local SQLite in development. Production SQLite must use `/data` so it is stored in the Docker volume. |
| `CORS_ORIGINS` | Comma-separated additional frontend origins. Localhost ports are allowed by default. |
| `NEXT_PUBLIC_API_URL` | Optional browser API base URL. Blank uses the same-origin API proxy. |
| `HABITLY_API_INTERNAL_URL` | Next.js server-side proxy destination. Local default is `http://127.0.0.1:8000`; the production image uses `http://api:8000`. |
| `HABITLY_ENV` | Set to `production` in the production Compose stack. SQLite is accepted only at a path below `/data`. |
| `TELEGRAM_BOT_TOKEN` | Optional Telegram integration token. |
| `TELEGRAM_WEBHOOK_SECRET` | Optional Telegram webhook verification secret. |

No database password is needed for SQLite. Do not point the production database URL outside `/data`, because only that directory is persisted across container replacement.

## Schema changes

SQLite schema creation and incremental compatibility updates run when the API starts. Keep a backup of the Docker volume before making schema changes that remove or transform data.

Review schema changes before release and back up the SQLite volume first if a change removes or transforms data.

## Backup, restore, import, and export

For local SQLite, stop the local API and copy `backend/habitly.db` to a safe location. For the VPS, back up the `habitly_data` volume and enable Hostinger daily backups before accepting live user data. Review any added backup cost in hPanel first.

To migrate browser data, sign in, choose **Import this browser’s data** in Settings, and wait for the success message. Import is one-time and idempotent: if the account already has server data, Habitly keeps that server copy and will not overwrite it. The import excludes sample habits and carries user habits, logs, events, variations, rewards, diagnostics, profile data, and workspace state. The browser copy is retained after import. If import fails, use **Download local backup** in Settings; it contains the workspace JSON but not the account token. To restore it, sign in to an account with an empty workspace, choose **Restore from backup**, and select that JSON file.

The import recognizes the current `habitly-workspace-v2` browser format. Older custom browser formats may need manual field mapping from the downloaded JSON. Previous API accounts were created without passwords or authorization tokens, so they cannot be safely claimed by email alone; their database rows remain in the local database, but must be exported and assigned to a verified account by an administrator before they can be served through the authenticated API. No existing browser data is deleted automatically. Local and production databases are separate; the app does not copy data between them automatically.

## Verification

```sh
cd backend && python -m pytest -q
cd frontend && npm run build
```

The API tests cover account data isolation, persistence across independent database connections, and idempotent local workspace import.
