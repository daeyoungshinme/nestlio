#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

MODE="dev"
KEEP_PORT=0
for arg in "$@"; do
  case "$arg" in
    run) MODE="run" ;;
    --keep-port) KEEP_PORT=1 ;;
  esac
done

BACKEND_PORT=8899
FRONTEND_PORT=5273

is_port_in_use() {
  local port="$1"
  local result
  result=$(timeout 10 powershell.exe -NoProfile -Command \
    "if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { 'busy' }" \
    < /dev/null)
  [ "$result" = "busy" ]
}

find_free_port() {
  local port="$1"
  local tries=0
  while is_port_in_use "$port"; do
    tries=$((tries + 1))
    if [ "$tries" -ge 50 ]; then
      echo "[dev.sh] ERROR: no free port found near $1" >&2
      exit 1
    fi
    port=$((port + 1))
  done
  echo "$port"
}

# 포트가 사용 중이면(대개 이미 떠 있는 개발 서버) 죽이지 않고 다음 빈 포트로 넘어간다 —
# dev.bat과 동일한 방침(사용자의 실행 중인 백엔드를 무단으로 종료하지 않는다).
# 남아 있는 --keep-port 인자는 하위호환용 no-op이다.
ORIG_BACKEND_PORT="$BACKEND_PORT"
BACKEND_PORT=$(find_free_port "$BACKEND_PORT")
if [ "$BACKEND_PORT" != "$ORIG_BACKEND_PORT" ]; then
  echo "[dev.sh] port $ORIG_BACKEND_PORT busy, using $BACKEND_PORT for backend instead"
fi
if [ "$MODE" = "dev" ]; then
  ORIG_FRONTEND_PORT="$FRONTEND_PORT"
  FRONTEND_PORT=$(find_free_port "$FRONTEND_PORT")
  if [ "$FRONTEND_PORT" != "$ORIG_FRONTEND_PORT" ]; then
    echo "[dev.sh] port $ORIG_FRONTEND_PORT busy, using $FRONTEND_PORT for frontend instead"
  fi
fi

VENV_PY=".venv/Scripts/python.exe"

if [ ! -x "$VENV_PY" ]; then
  echo "[dev.sh] .venv not found, creating virtualenv..."
  python -m venv .venv
fi

PYTHON="$VENV_PY"

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  echo "[dev.sh] .env not found, copying from .env.example"
  echo "[dev.sh] WARNING: edit .env and fill in Supabase / DB settings before real use"
  cp ".env.example" ".env"
fi

echo "[dev.sh] installing dependencies (runtime + dev/test)..."
"$PYTHON" -m pip install -q -r requirements.txt -r requirements-dev.txt

mkdir -p data

echo "[dev.sh] running database migrations..."
if ! "$PYTHON" -m alembic upgrade head; then
  echo "[dev.sh] ERROR: alembic upgrade failed." >&2
  echo "[dev.sh]        Set a real DATABASE_URL in .env — nestlio shares growlio's Supabase" >&2
  echo "[dev.sh]        Postgres (copy that project's connection string, sync psycopg2 driver)." >&2
  exit 1
fi

# seed_data.py는 idempotent다 (이미 있는 행은 건너뜀) — 매 실행마다 그냥 돌린다.
echo "[dev.sh] seeding default data (skips rows that already exist)..."
"$PYTHON" scripts/seed_data.py

if [ ! -d "frontend/node_modules" ]; then
  echo "[dev.sh] frontend/node_modules not found, installing frontend dependencies..."
  (cd frontend && npm install --legacy-peer-deps)
fi

if [ ! -f "frontend/.env" ] && [ -f "frontend/.env.example" ]; then
  echo "[dev.sh] frontend/.env not found, copying from frontend/.env.example"
  cp "frontend/.env.example" "frontend/.env"
fi

if [ "$MODE" = "run" ]; then
  echo "[dev.sh] building frontend (frontend/dist)..."
  (cd frontend && npm run build)

  echo "[dev.sh] starting server on http://0.0.0.0:$BACKEND_PORT"
  exec "$PYTHON" -m uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT"
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
# --reload-dir app: reload-dir을 안 주면 uvicorn(watchfiles)이 프로젝트 루트 전체(frontend/node_modules,
# data/*.db, .venv, .git 포함)를 재귀적으로 감시한다 - Windows에서 이 정도 규모를 통째로 감시하면
# 코드와 무관한 변경(Vite 캐시 쓰기, SQLite 파일 갱신 등)에도 백엔드가 계속 재기동해 불안정해진다.
"$PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT" --reload --reload-dir app &
BACKEND_PID=$!

echo "[dev.sh] starting frontend (vite dev server) on http://localhost:$FRONTEND_PORT"
export VITE_DEV_PORT="$FRONTEND_PORT"
export VITE_BACKEND_PORT="$BACKEND_PORT"
(cd frontend && npm run dev) &
FRONTEND_PID=$!

echo "[dev.sh] ready — open http://localhost:$FRONTEND_PORT (frontend/backend edits reload automatically)"

wait "$BACKEND_PID" "$FRONTEND_PID"
