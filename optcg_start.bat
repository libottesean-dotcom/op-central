@echo off
REM Avvia OP Central: sync cloud (8778) + server web (8777) + apre browser
cd /d "C:\Users\libot\Downloads"
start "OP Central Sync" /MIN "C:\Program Files\nodejs\node.exe" optcg_sync_server.mjs
start "OP Central Web" /MIN python -m http.server 8777 --bind 0.0.0.0
timeout /t 2 /nobreak >nul
start "" "http://localhost:8777/chase-tracker%%20(2).html"
echo.
echo OP Central avviato.
echo   Web:  http://localhost:8777  (o http://TUO-IP:8777 dalla rete locale)
echo   Sync: http://localhost:8778
echo.
echo Chiudi le finestre "OP Central Sync" e "OP Central Web" per fermare.
