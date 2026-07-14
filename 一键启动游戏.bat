@echo off
setlocal
cd /d "%~dp0"
set "VIBE2_URL=http://127.0.0.1:4317/?start=setup"

echo.
echo ==========================================
echo     Graduate Simulator V2 launcher
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 goto missing_node

where npm >nul 2>nul
if errorlevel 1 goto missing_npm

if not exist "node_modules" (
  if exist "package-lock.json" (
    call npm ci
  ) else (
    call npm install
  )
  if errorlevel 1 goto fail
)

call :is_dev_server_ready
if errorlevel 1 (
  echo Starting Vite dev server on 127.0.0.1:4317 ...
  start "vibe2 dev" cmd /k "cd /d ""%~dp0"" && npm run play:local"
) else (
  echo Reusing existing Vite dev server on 127.0.0.1:4317 ...
)

echo Waiting for server ...
call :wait_for_dev_server
if errorlevel 1 goto fail

start "" "%VIBE2_URL%"
goto :eof

:is_dev_server_ready
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4317/' -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
exit /b %errorlevel%

:wait_for_dev_server
for /l %%i in (1,1,30) do (
  call :is_dev_server_ready
  if not errorlevel 1 exit /b 0
  timeout /t 1 /nobreak >nul
)
exit /b 1

:missing_node
echo Node.js was not found.
echo Please install Node.js 20.19+ or 22.12+ and add it to PATH.
pause
exit /b 1

:missing_npm
echo npm was not found.
echo Please install npm and add it to PATH.
pause
exit /b 1

:fail
echo Launcher failed.
pause
exit /b 1
