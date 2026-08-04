@echo off
cd /d "%~dp0"

set "MODE=dev"
if /i "%~1"=="run" set "MODE=run"

if not exist ".venv\Scripts\python.exe" (
  echo [dev.bat] .venv not found, creating virtualenv...
  python -m venv .venv
)

set "PYTHON=.venv\Scripts\python.exe"

if not exist ".env" (
  if exist ".env.example" (
    echo [dev.bat] .env not found, copying from .env.example
    echo [dev.bat] WARNING: edit .env and fill in Supabase / DB settings before real use
    copy /y ".env.example" ".env" >nul
  )
)

echo [dev.bat] installing dependencies...
"%PYTHON%" -m pip install -q -r requirements.txt

if not exist "data" mkdir data

echo [dev.bat] running database migrations...
"%PYTHON%" -m alembic upgrade head

if not exist "data\.seeded" (
  echo [dev.bat] first run detected, seeding initial data...
  "%PYTHON%" scripts\seed_data.py
  type nul > "data\.seeded"
  echo [dev.bat] seeding done (delete data\.seeded to re-run seed_data.py later)
)

if not exist "frontend\node_modules" (
  echo [dev.bat] frontend\node_modules not found, installing frontend dependencies...
  pushd frontend
  call npm install --legacy-peer-deps
  popd
)

if not exist "frontend\.env" (
  if exist "frontend\.env.example" (
    echo [dev.bat] frontend\.env not found, copying from frontend\.env.example
    copy /y "frontend\.env.example" "frontend\.env" >nul
  )
)

if /i "%MODE%"=="run" (
  echo [dev.bat] building frontend (frontend\dist)...
  pushd frontend
  call npm run build
  popd

  echo [dev.bat] starting server on http://0.0.0.0:8899
  "%PYTHON%" -m uvicorn app.main:app --host 0.0.0.0 --port 8899
) else (
  echo [dev.bat] starting backend (uvicorn --reload) on http://127.0.0.1:8899
  start "nestlio-backend" cmd /k "%PYTHON% -m uvicorn app.main:app --host 127.0.0.1 --port 8899 --reload"

  echo [dev.bat] starting frontend (vite dev server) on http://localhost:5273
  start "nestlio-frontend" cmd /k "cd frontend && npm run dev"

  echo [dev.bat] ready — open http://localhost:5273 (frontend/backend edits reload automatically)
  echo [dev.bat] close the two opened windows to stop the dev servers.
)
