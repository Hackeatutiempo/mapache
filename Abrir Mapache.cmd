@echo off
rem Abre Mapache: lo arranca en segundo plano (sin ventana) si hace falta y lo abre en el navegador.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No encuentro Node.js. Instalalo desde https://nodejs.org y vuelve a abrir Mapache.
  pause
  exit /b 1
)
node bin\mapache.js open
if errorlevel 2 (
  echo.
  choice /c SN /m "Cerrar la version antigua de Mapache y abrir la nueva"
  if errorlevel 2 exit /b 1
  node bin\mapache.js stop
  node bin\mapache.js open
  if errorlevel 1 pause
  exit /b
)
if errorlevel 1 (
  echo.
  echo No se pudo abrir Mapache: mira el mensaje de arriba.
  pause
)
