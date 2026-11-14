#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL in Replit Secrets to the managed PostgreSQL URL}"
export HABITLY_API_INTERNAL_URL="${HABITLY_API_INTERNAL_URL:-http://127.0.0.1:8000}"
export NEXT_TELEMETRY_DISABLED=1

python -m pip install -e ./backend
npm ci --prefix frontend
npm run build --prefix frontend

(cd backend && exec uvicorn app.main:app --host 127.0.0.1 --port 8000) &
api_pid=$!
cleanup() { kill "$api_pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

npm run start --prefix frontend -- --hostname 0.0.0.0 --port "${PORT:-5000}"
