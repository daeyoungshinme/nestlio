@echo off
cd /d "%~dp0"

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

echo [dev.bat] starting backend (uvicorn --reload) on http://127.0.0.1:8899
start "nestlio-backend" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8899 --reload"

echo [dev.bat] starting frontend (vite dev server) on http://localhost:5273
start "nestlio-frontend" cmd /k "cd frontend && npm run dev"

echo [dev.bat] ready — open http://localhost:5273 (frontend/backend edits reload automatically)
echo [dev.bat] close the two opened windows to stop the dev servers.
