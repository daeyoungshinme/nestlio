#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

BACKEND_PORT=8899
FRONTEND_PORT=5273

kill_port() {
  local port="$1"
  echo "[dev.sh] stopping existing process on port $port (if any)..."
  timeout 10 powershell.exe -NoProfile -Command \
    "Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id \$_ -Force -ErrorAction SilentlyContinue }" \
    < /dev/null || true
}

kill_port "$BACKEND_PORT"
kill_port "$FRONTEND_PORT"
sleep 1
echo "[dev.sh] stop step done, continuing..."

VENV_PY=".venv/Scripts/python.exe"

if [ ! -x "$VENV_PY" ]; then
  echo "[dev.sh] .venv not found, creating virtualenv..."
  python -m venv .venv
fi

PYTHON="$VENV_PY"

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  echo "[dev.sh] .env not found, copying from .env.example"
  echo "[dev.sh] WARNING: edit .env and fill in SECRET_KEY / spouse passwords before real use"
  cp ".env.example" ".env"
fi

echo "[dev.sh] installing dependencies..."
"$PYTHON" -m pip install -q -r requirements.txt

mkdir -p data

echo "[dev.sh] running database migrations..."
"$PYTHON" -m alembic upgrade head

if [ ! -f "data/.seeded" ]; then
  echo "[dev.sh] first run detected, seeding initial data..."
  "$PYTHON" scripts/seed_data.py
  touch "data/.seeded"
  echo "[dev.sh] seeding done (delete data/.seeded to re-run seed_data.py later)"
fi

if [ ! -d "frontend/node_modules" ]; then
  echo "[dev.sh] frontend/node_modules not found, installing frontend dependencies..."
  (cd frontend && npm install --legacy-peer-deps)
fi

if [ ! -f "frontend/.env" ] && [ -f "frontend/.env.example" ]; then
  echo "[dev.sh] frontend/.env not found, copying from frontend/.env.example"
  cp "frontend/.env.example" "frontend/.env"
fi

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo "[dev.sh] stopping dev servers..."
  for pid in "$BACKEND_PID" "$FRONTEND_PID"; do
    if [ -n "$pid" ]; then
      taskkill //PID "$pid" //F //T > /dev/null 2>&1 || true
    fi
  done
}
trap cleanup EXIT INT TERM

echo "[dev.sh] starting backend (uvicorn --reload) on http://127.0.0.1:$BACKEND_PORT"
"$PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT" --reload &
BACKEND_PID=$!

echo "[dev.sh] starting frontend (vite dev server) on http://localhost:$FRONTEND_PORT"
(cd frontend && npm run dev) &
FRONTEND_PID=$!

echo "[dev.sh] ready — open http://localhost:$FRONTEND_PORT (frontend/backend edits reload automatically)"

wait "$BACKEND_PID" "$FRONTEND_PID"
