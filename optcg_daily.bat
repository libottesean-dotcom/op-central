@echo off
REM Pipeline giornaliera One Piece TCG:
REM 1) download catalogo tcggo (riprendibile)  2) mapping id Cardmarket (riprendibile)
REM 3) fetch prezzi cardmarketapi (rotazione nel budget)  4) snapshot storico giornaliero
REM 5) rigenerazione catalog.js
cd /d "C:\Users\libot\Downloads"
echo ==== %DATE% %TIME% ==== >> optcg_daily.log
"C:\Program Files\nodejs\node.exe" optcg_build.mjs >> optcg_daily.log 2>&1
"C:\Program Files\nodejs\node.exe" optcg_map.mjs >> optcg_daily.log 2>&1
"C:\Program Files\nodejs\node.exe" optcg_prices.mjs >> optcg_daily.log 2>&1
"C:\Program Files\nodejs\node.exe" optcg_history.mjs >> optcg_daily.log 2>&1
"C:\Program Files\nodejs\node.exe" optcg_history_db.mjs >> optcg_daily.log 2>&1
"C:\Program Files\nodejs\node.exe" optcg_catalog.mjs >> optcg_daily.log 2>&1
"C:\Program Files\nodejs\node.exe" optcg_telegram.mjs >> optcg_daily.log 2>&1
echo. >> optcg_daily.log
