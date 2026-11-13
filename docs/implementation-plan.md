# Habitly implementation plan

## Product principles

1. Measure identity votes (completed actions), not outcome goals or generic XP.
2. Capture cue, motive, response, and reward for every routine.
3. Require a specific implementation intention or anchor habit.
4. Store both target and small gateway actions.
5. Reward completion immediately and use one grace day to encourage recovery.
6. Keep the interface supportive and avoid punitive streak resets.

## Milestone 1 — Backend foundation (started)

- FastAPI, SQLAlchemy models for users, identities, habits, and logs.
- Endpoints for user/identity/habit creation, habit listing, and logging.
- Completion logs update identity votes; a unique daily log prevents duplicates.
- SQLite local default and PostgreSQL Docker service.
- Remaining: migrations, fuller CRUD, and API integration tests.

## Milestone 2 — Core web app (started)

- Next.js and Tailwind dashboard showing identity, habits, cues, and completion action.
- Completion invokes the API and shows vote/streak feedback with vibration where supported.
- Remaining: persistent onboarding, habit creation form, calendar/history, and recovery visuals.

## Milestone 3 — Resilient streak and votes (started)

- Completed actions count as identity votes.
- One missed calendar day is bridged; two consecutive misses break the streak.
- Unit tests cover completed days, one grace day, two misses, and the open current day.
- Remaining: calendar-based API/UI integration and careful timezone handling.

## Milestone 4 — Telegram bot (scaffolded)

- Webhook checks Telegram's configured secret token.
- Remaining: account linking, command-to-habit mapping, Telegram replies, webhook registration, and end-to-end tests. A verified Telegram chat association is needed before messages can safely log actions.

## Follow-on features from the blueprint

- Identity setup and onboarding.
- Four-law habit builder, time/location and anchor stack options.
- Two-minute downscaler interaction.
- Environment preparation check-in and anti-habit friction tools.
- Reward vault and temptation-bundling unlocks.
- Recovery screen, calendar visualization, and accessible feedback.
- Database migrations and production authentication/authorization.

## API contracts available

- `POST /api/users`
- `POST /api/identities`
- `GET /api/identities/{identity_id}`
- `POST /api/habits`
- `GET /api/habits?identity_id=...`
- `POST /api/habits/{habit_id}/log`
- `GET /api/habits/{habit_id}/logs`
- `POST /webhook/telegram`
- `GET /health`
