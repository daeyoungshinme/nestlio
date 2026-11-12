@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "MODE=dev"
set "MIGRATE=0"
for %%A in (%*) do (
  if /i "%%A"=="run" set "MODE=run"
  if /i "%%A"=="migrate" set "MIGRATE=1"
)

set "BACKEND_PORT=8899"
set "FRONTEND_PORT=5273"

rem Keep this file ASCII-only: cmd reads it in the console codepage (CP949), and UTF-8 Korean text
rem (even in rem lines) gets misparsed as commands.
rem If a port is busy (usually the user's own running dev server), don't kill it - use the next free port.
set "ORIG_BACKEND_PORT=%BACKEND_PORT%"
call :find_free_port %BACKEND_PORT% BACKEND_PORT
if not "!BACKEND_PORT!"=="!ORIG_BACKEND_PORT!" (
  echo [dev.bat] port !ORIG_BACKEND_PORT! busy, using !BACKEND_PORT! for backend instead
)
if /i "%MODE%"=="dev" (
  set "ORIG_FRONTEND_PORT=%FRONTEND_PORT%"
  call :find_free_port %FRONTEND_PORT% FRONTEND_PORT
  if not "!FRONTEND_PORT!"=="!ORIG_FRONTEND_PORT!" (
    echo [dev.bat] port !ORIG_FRONTEND_PORT! busy, using !FRONTEND_PORT! for frontend instead
  )
)

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

echo [dev.bat] installing dependencies (runtime + dev/test)...
"%PYTHON%" -m pip install -q -r requirements.txt -r requirements-dev.txt

rem DATABASE_URL is usually the Supabase Postgres shared with production, so migrations/seed only run
rem with the explicit "migrate" argument - prevents unmerged local migrations from hitting prod.
rem Production is always brought to head by the deploy (render.yaml: alembic upgrade head).
if "%MIGRATE%"=="1" (
  echo [dev.bat] running database migrations against DATABASE_URL ^(shared with production^)...
  "%PYTHON%" -m alembic upgrade head
  if errorlevel 1 (
    echo [dev.bat] ERROR: alembic upgrade failed.
    echo [dev.bat]        Set a real DATABASE_URL in .env - nestlio shares growlio's Supabase
    echo [dev.bat]        Postgres ^(copy that project's connection string, sync psycopg2 driver^).
    exit /b 1
  )
  echo [dev.bat] seeding default data ^(skips rows that already exist^)...
  "%PYTHON%" scripts\seed_data.py
) else (
  echo [dev.bat] skipping migrations/seed ^(pass "migrate" to apply them - DATABASE_URL is shared with production^)
)

if not exist "frontend\node_modules" (
  echo [dev.bat] frontend\node_modules not found, installing frontend dependencies...
  pushd frontend
  call npm install
  popd
)

if not exist "frontend\.env" (
  if exist "frontend\.env.example" (
    echo [dev.bat] frontend\.env not found, copying from frontend\.env.example
    copy /y "frontend\.env.example" "frontend\.env" >nul
  )
)

if /i "%MODE%"=="run" (
  echo [dev.bat] building frontend ^(frontend\dist^)...
  pushd frontend
  call npm run build
  popd

  echo [dev.bat] starting server on http://0.0.0.0:%BACKEND_PORT%
  "%PYTHON%" -m uvicorn app.main:app --host 0.0.0.0 --port %BACKEND_PORT%
) else (
  rem Runs backend + frontend in this console and stops both when either exits - Ctrl+C stops both too.
  rem Never put an unescaped closing paren inside this if/else block: cmd ends the block there.
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev_supervisor.ps1 -Python "%PYTHON%" -BackendPort %BACKEND_PORT% -FrontendPort %FRONTEND_PORT%
  exit /b !errorlevel!
)

goto :eof

:find_free_port
setlocal
set "PORT=%~1"
set "TRIES=0"
:find_free_port_loop
set "PORT_STATUS="
for /f %%R in ('powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue) { 'busy' }"') do set "PORT_STATUS=%%R"
if "%PORT_STATUS%"=="busy" (
  set /a TRIES+=1
  if !TRIES! GEQ 50 (
    echo [dev.bat] ERROR: no free port found near %~1
    exit /b 1
  )
  set /a PORT+=1
  goto find_free_port_loop
)
endlocal & set "%~2=%PORT%"
goto :eof
