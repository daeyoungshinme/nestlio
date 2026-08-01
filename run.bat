@echo off
cd /d "%~dp0"

if not exist "frontend\node_modules" (
  echo [run.bat] frontend\node_modules not found, installing frontend dependencies...
  pushd frontend
  call npm install --legacy-peer-deps
  popd
)

if not exist "frontend\.env" (
  if exist "frontend\.env.example" (
    echo [run.bat] frontend\.env not found, copying from frontend\.env.example
    copy /y "frontend\.env.example" "frontend\.env" >nul
  )
)

echo [run.bat] building frontend (frontend\dist)...
pushd frontend
call npm run build
popd

".venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8899
