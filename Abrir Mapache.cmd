@echo off
rem Arranca el servidor local (si no lo estaba) y abre la app en el navegador.
cd /d "%~dp0"
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://localhost:4321/ | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 start "Mapache (servidor)" /min node server.js --no-star
timeout /t 1 /nobreak >nul
start "" http://localhost:4321/
