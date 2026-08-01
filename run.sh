#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

PORT=8899

echo "[run.sh] stopping existing server on port $PORT (if any)..."
timeout 10 powershell.exe -NoProfile -Command \
  "Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id \$_ -Force -ErrorAction SilentlyContinue }" \
  < /dev/null || true
sleep 1
echo "[run.sh] stop step done, continuing..."

VENV_PY=".venv/Scripts/python.exe"

if [ ! -x "$VENV_PY" ]; then
  echo "[run.sh] .venv not found, creating virtualenv..."
  python -m venv .venv
fi

PYTHON="$VENV_PY"

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  echo "[run.sh] .env not found, copying from .env.example"
  echo "[run.sh] WARNING: edit .env and fill in SECRET_KEY / spouse passwords before real use"
  cp ".env.example" ".env"
fi

echo "[run.sh] installing dependencies..."
"$PYTHON" -m pip install -q -r requirements.txt

mkdir -p data

echo "[run.sh] running database migrations..."
"$PYTHON" -m alembic upgrade head

if [ ! -f "data/.seeded" ]; then
  echo "[run.sh] first run detected, seeding initial data..."
  "$PYTHON" scripts/seed_data.py
  touch "data/.seeded"
  echo "[run.sh] seeding done (delete data/.seeded to re-run seed_data.py later)"
fi

if [ ! -d "frontend/node_modules" ]; then
  echo "[run.sh] frontend/node_modules not found, installing frontend dependencies..."
  (cd frontend && npm install --legacy-peer-deps)
fi

if [ ! -f "frontend/.env" ] && [ -f "frontend/.env.example" ]; then
  echo "[run.sh] frontend/.env not found, copying from frontend/.env.example"
  cp "frontend/.env.example" "frontend/.env"
fi

echo "[run.sh] building frontend (frontend/dist)..."
(cd frontend && npm run build)

echo "[run.sh] starting server on http://0.0.0.0:$PORT"
exec "$PYTHON" -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
