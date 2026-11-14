# Run Habitly on Replit

Habitly uses Replit managed PostgreSQL for durable data. Replit's development database and published production database are separate. Do not use a deployment filesystem SQLite file for production.

## Initial setup

1. Import this repository into Replit and enable the PostgreSQL managed database integration for the Repl. Confirm the development database is provisioned.

2. In Replit **Secrets**, set `DATABASE_URL` to the managed PostgreSQL connection URL supplied for this Repl. Keep it secret and do not paste it into source files, commits, or logs. `scripts/run-replit.sh` refuses to start without it.

3. Install dependencies. The configured workflow does this at run time, or run manually:

   ```sh
   python -m pip install -e ./backend
   npm ci --prefix frontend
   ```

4. For a new empty Replit **development** database, apply all of `schema.postgres.sql` once using Replit's database SQL tooling. Verify that the tables were created. Do not rerun the full file against an existing database. The app never creates PostgreSQL tables automatically.

5. Run the configured **Habitly** workflow. It builds the frontend, starts FastAPI privately at `127.0.0.1:8000`, then starts Next.js on `0.0.0.0:$PORT` (Replit's assigned port, with 5000 as the local workflow default). Next.js proxies `/api/*` and `/health` to FastAPI. Do not expose the internal API listener as a public port.

6. Open the webview, go to Settings, and create an account with an email and a password of at least 10 characters. The account token is scoped to that account and is never stored as plaintext in PostgreSQL.

## Publish and production database

1. Open Replit **Publish** settings and enable production database provisioning, shown as **Create production database** or the equivalent managed PostgreSQL option.

2. Confirm the production environment receives its managed `DATABASE_URL` through Replit. Do not copy the development database URL into source control or manually point the app to a filesystem database.

3. For a schema change, update and review `schema.postgres.sql`, apply its reviewed changes to the development database, then use Replit's Publish schema promotion flow. Inspect the schema diff Replit proposes. Publish promotes schema through Replit's workflow; do not put production DDL or a migration command in the deployment build or app startup.

4. Publish the app only after production database provisioning is enabled and the schema promotion is ready. The Replit development database is not the production database, and existing local SQLite data is not copied automatically.

## Verify persistence

Create an account and one habit in the Replit development webview. Confirm it remains after restarting the Repl. Then publish with production database provisioning enabled, create or sign in to an account in the published app, add a habit, restart/redeploy, and verify the same account still sees it. Use the production app URL for this check; preview data and production data are separate.

## Safe schema updates

Use Replit's development database console/tooling as the only target for manual schema SQL. Update `schema.postgres.sql` in the same code change. For an existing database, apply only the reviewed additive or data migration statements needed for the change, not the full create-table file. After the development schema is valid, inspect the Replit Publish schema diff and let the Publish flow promote it. Back up data before destructive changes. App startup and `scripts/run-replit.sh` deliberately perform no PostgreSQL DDL or migration.

## Environment

Required Replit Secret:

- `DATABASE_URL`: Replit managed PostgreSQL URL, configured separately for development and production by Replit.

Optional settings:

- `CORS_ORIGINS`: extra browser origins if the frontend is hosted separately.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`: optional Telegram integration.
- `HABITLY_API_INTERNAL_URL`: internal FastAPI proxy target, defaults to `http://127.0.0.1:8000`.

The deployment command is `bash scripts/run-replit.sh`; it binds the frontend to `0.0.0.0:$PORT`. The build step installs and builds application dependencies only and does not modify the database schema.
