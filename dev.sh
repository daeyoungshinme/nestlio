#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# 로그인 셸이 아닌 bash.exe로 직접 실행되면 /usr/bin이 PATH에 없어 curl/sleep과 npm 래퍼
# 스크립트(dirname/sed/uname)가 실패한다(growlio dev.sh와 같은 보정).
for _BIN in /usr/bin /mingw64/bin; do
  case ":$PATH:" in
    *":$_BIN:"*) ;;
    *) [ -d "$_BIN" ] && PATH="$_BIN:$PATH" ;;
  esac
done
export PATH
unset _BIN

MODE="dev"
MIGRATE=0
for arg in "$@"; do
  case "$arg" in
    run) MODE="run" ;;
    migrate) MIGRATE=1 ;;
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

# DATABASE_URL은 대개 운영과 공유하는 Supabase Postgres라, 마이그레이션/시드는 명시적으로
# "migrate" 인자를 줄 때만 돌린다 — 머지 안 된 로컬 마이그레이션이 운영 DB에 적용되는 사고 방지.
# 운영 DB는 배포(render.yaml의 alembic upgrade head)가 항상 head로 맞춘다.
if [ "$MIGRATE" = "1" ]; then
  echo "[dev.sh] running database migrations against DATABASE_URL (shared with production)..."
  if ! "$PYTHON" -m alembic upgrade head; then
    echo "[dev.sh] ERROR: alembic upgrade failed." >&2
    echo "[dev.sh]        Set a real DATABASE_URL in .env — nestlio shares growlio's Supabase" >&2
    echo "[dev.sh]        Postgres (copy that project's connection string, sync psycopg2 driver)." >&2
    exit 1
  fi
  # seed_data.py는 idempotent다 (이미 있는 행은 건너뜀).
  echo "[dev.sh] seeding default data (skips rows that already exist)..."
  "$PYTHON" scripts/seed_data.py
else
  echo "[dev.sh] skipping migrations/seed (pass \"migrate\" to apply them — DATABASE_URL is shared with production)"
fi

if [ ! -d "frontend/node_modules" ]; then
  echo "[dev.sh] frontend/node_modules not found, installing frontend dependencies..."
  (cd frontend && npm install)
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
  local pid winpid
  for pid in "$BACKEND_PID" "$FRONTEND_PID"; do
    if [ -n "$pid" ]; then
      # $!는 MSYS PID라 taskkill에 그대로 주면 엉뚱한(또는 없는) 프로세스를 가리킨다 — Windows PID로
      # 바꿔야 venv 런처 → python → reload 워커 / npm → node 트리 전체가 정리된다.
      winpid=$(cat "/proc/$pid/winpid" 2>/dev/null || true)
      if [ -n "$winpid" ]; then
        taskkill //PID "$winpid" //F //T > /dev/null 2>&1 || true
      fi
      kill "$pid" 2>/dev/null || true
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

# wait_until_up <pid> <url> <label>: 응답이 올 때까지 최대 ~30초 폴링. 그 전에 프로세스가
# 사라지면(import 에러, npm 실패 등) 반쪽만 살아 있는 상태로 두지 않고 즉시 실패한다.
wait_until_up() {
  local pid="$1" url="$2" label="$3" i
  for i in $(seq 1 60); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[dev.sh] ERROR: $label exited right after start — see the log above." >&2
      exit 1
    fi
    if curl -s -o /dev/null "$url" 2>/dev/null; then
      return 0
    fi
    sleep 0.5
  done
  echo "[dev.sh] WARNING: $label did not respond at $url within 30s, still waiting."
}

wait_until_up "$BACKEND_PID" "http://127.0.0.1:$BACKEND_PORT/openapi.json" "backend"

echo "[dev.sh] starting frontend (vite dev server) on http://localhost:$FRONTEND_PORT"
export VITE_DEV_PORT="$FRONTEND_PORT"
export VITE_BACKEND_PORT="$BACKEND_PORT"
(cd frontend && npm run dev) &
FRONTEND_PID=$!

wait_until_up "$FRONTEND_PID" "http://localhost:$FRONTEND_PORT/" "frontend"

echo "[dev.sh] ready — open http://localhost:$FRONTEND_PORT (frontend/backend edits reload automatically)"
echo "[dev.sh] Ctrl+C stops both servers; if either one exits, the other is stopped too."

# 한쪽만 종료돼도 나머지를 정리하고 끝낸다 — 반쪽만 살아 있는 상태 방지(정리는 trap cleanup).
wait -n "$BACKEND_PID" "$FRONTEND_PID" || true
if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
  echo "[dev.sh] frontend exited — stopping backend too."
else
  echo "[dev.sh] backend exited — stopping frontend too."
fi
exit 1
