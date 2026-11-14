# Habitly implementation status

## Product principles

- Track completed actions as **identity votes**, not generic XP.
- Capture cue, motive, response, and payoff when building a routine.
- Attach routines to a specific time and place or to an existing anchor.
- Keep the starter action within two minutes while the routine forms.
- Make desirable behaviors visible and easy; make unwanted loops harder.
- Reinforce completion immediately and make recovery gentler than punishment.

## Implemented in the current MVP

### Identity and onboarding

- Outcome-to-identity reframing suggestions and editable identity statement.
- Identity statement and vote count on the Today dashboard.
- Browser-local persistence; API-backed identity update after account setup.

### Habit creation and tracking

- Time/location implementation intention and anchor-based stacking paths.
- Draggable anchor chips and a stack drop target.
- Required target, two-minute gateway action, cue, motive, and immediate payoff.
- Two-minute starter length enforced by a one- or two-minute selector.
- Optional environment preparation and temptation bundle.
- Chronological daypart grouping, button completion, mobile swipe completion/miss, haptic feedback, vote toast, and 28-day progress calendar.
- Habit logs store web or Telegram source and a per-day preparation flag.

### Recovery, rewards, and anti-habits

- One missed day is bridged; two misses break the chain and trigger the circuit breaker message.
- Recovery screen uses supportive language and preserves identity votes.
- Reward Vault links a wanted activity to a needed habit and unlocks when completed.
- Anti-habit plans capture the cue to hide, friction to add, replacement action, and a required habit contract; users can earn friction shield votes.

### API and Telegram

- FastAPI and SQLAlchemy data models for users, identities, habits, logs, rewards, and one-time Telegram links.
- User and identity creation/update, habit creation/listing/update, daily logs, prep updates, reward creation/listing, streak calculation, health check.
- Telegram webhook verifies Telegram's secret header, links one-time expiring codes, resolves explicit habit names (or a single remaining habit), logs completions, and replies with the streak.
- Additive startup schema updates support databases created by the first MVP commit.

## Run and configure

- `docker compose up --build` starts PostgreSQL, the API, and the web app.
- The web app's sample workspace works in browser storage before API setup.
- Configure API URL and connect an account in **Settings** to use the backend.
- Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and production `CORS_ORIGINS`; register the webhook with Telegram.

## Remaining before production

- Add authentication/authorization and account deletion/export flows.
- Replace the additive startup schema updater with versioned Alembic migrations.
- Add robust timezone preferences, notification scheduling, and reliable offline-to-server conflict resolution.
- Verify Telegram webhook deployment and linking with a real bot token and public API URL.
- Add full API integration and frontend interaction tests.
