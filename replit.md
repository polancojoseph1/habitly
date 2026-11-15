# Habitly on Replit

## Preserve both development environments

Habitly must remain usable from local Codex and from Replit. Before changing setup, dependencies, database access, API URLs, or start commands, check both this guidance and `README.md`. Keep environment-specific behavior behind environment variables and the existing scripts; do not replace the local workflow with Replit-only assumptions or make Replit depend on local-only files.

Local Codex development uses SQLite when `DATABASE_URL` is unset and starts the backend and frontend separately as documented in `README.md`. Replit requires its managed PostgreSQL URL and uses `scripts/run-replit.sh`. The app should select the correct database from its environment, without copying data or credentials between environments. Preserve both workflows when making application or schema changes, and update the relevant documentation when either workflow changes.

Habitly uses Replit managed PostgreSQL through `DATABASE_URL`. It must not use SQLite in Replit deployments. The local Codex SQLite database is only for development and is never copied into Replit automatically.

The Replit development database and the published production database are separate. Use the development database while working on schema changes. In Publish settings, enable production database provisioning before publishing. Replit's Publish workflow promotes the development schema to the production database. Do not execute production DDL or migrations from app startup, build commands, or the run script.

`schema.postgres.sql` is the reviewed PostgreSQL schema source. Apply its statements to the development database using Replit's SQL/database tooling. Then review and use Replit's Publish schema promotion flow. If Replit presents a schema diff, inspect it before publishing. Back up data before destructive schema changes. Never point a local command at the production `DATABASE_URL` to make schema changes.

The `.replit` workflow calls `scripts/run-replit.sh`, which installs Python and Node dependencies, builds Next.js, then starts FastAPI privately on `127.0.0.1:8000` and Next.js on Replit's assigned `PORT` (default 5000 for local Replit runs). Next.js proxies `/api/*` to the private FastAPI listener. The script performs no DDL.

Create accounts using the Habitly UI. The API stores only password hashes and token hashes. Account tokens are scoped to the account; one account can have multiple browser sessions. Do not expose FastAPI's internal listener as a public port.
