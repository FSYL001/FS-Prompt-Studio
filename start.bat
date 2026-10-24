@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [FS-Prompt Studio] Node.js was not found.
  echo Please install Node.js 20 or newer from https://nodejs.org/
  pause
  exit /b 1
)

netstat -ano | findstr ":8787" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo.
  echo [FS-Prompt Studio] Service already running on port 8787.
  echo Opening http://127.0.0.1:5173/
  start "" "http://127.0.0.1:5173/"
  exit /b 0
)

if not exist "node_modules" (
  echo [FS-Prompt Studio] Installing dependencies. This may take a few minutes...
  call npm install
  if errorlevel 1 (
    echo [FS-Prompt Studio] npm install failed. Check the network and try again.
    pause
    exit /b 1
  )
)

echo.
echo ============================================================
echo   FS-Prompt Studio
echo ------------------------------------------------------------
echo   Web UI : http://127.0.0.1:5173
echo   API    : http://127.0.0.1:8787
echo   ComfyUI: http://127.0.0.1:8188  (button: Go to Studio)
echo ------------------------------------------------------------
echo   Keep this window open. Press Ctrl+C to stop the service.
echo ============================================================
echo.

start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://127.0.0.1:5173/'"
call npm run dev
pause
