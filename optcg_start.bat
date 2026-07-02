@echo off
REM Avvia OP Central: sync cloud (8778) + server web (8777) + apre browser
cd /d "C:\Users\libot\Downloads"
for /f "usebackq tokens=1,* delims==" %%a in ("C:\Users\libot\Desktop\COMMAND DECK\.env") do (
  if /I "%%a"=="DATABASE_URL" set "DATABASE_URL=%%b"
)
if not defined DATABASE_URL (
  echo ERRORE: DATABASE_URL non trovato in COMMAND DECK\.env
  pause
  exit /b 1
)
start "OP Central Sync" /MIN cmd /c "set DATABASE_URL=%DATABASE_URL%&& node optcg_sync_server.mjs"
start "OP Central Web" /MIN python -m http.server 8777 --bind 0.0.0.0
timeout /t 2 /nobreak >nul
start "" "http://localhost:8777/chase-tracker%%20(2).html"
echo.
echo OP Central avviato.
echo   Web:  http://localhost:8777  (o http://TUO-IP:8777 dalla rete locale)
echo   Sync: http://localhost:8778
echo.
echo Chiudi le finestre "OP Central Sync" e "OP Central Web" per fermare.
