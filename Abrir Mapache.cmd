@echo off
rem Abre Mapache: lo arranca en segundo plano (sin ventana) si hace falta y lo abre en el navegador.
cd /d "%~dp0"
node bin\mapache.js open
if errorlevel 1 (
  echo.
  echo No se pudo abrir Mapache. Comprueba que Node.js esta instalado: https://nodejs.org
  pause
)
