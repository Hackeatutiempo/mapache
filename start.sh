#!/usr/bin/env sh
# Arranca Mapache (si no estaba en marcha) y lo abre en el navegador. macOS y Linux.
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-4321}"
URL="http://localhost:$PORT/"
if ! curl -s -o /dev/null "$URL"; then
  nohup node server.js --no-star > /dev/null 2>&1 &
  i=0
  while [ $i -lt 20 ] && ! curl -s -o /dev/null "$URL"; do sleep 0.25; i=$((i + 1)); done
fi
if command -v open > /dev/null 2>&1; then open "$URL"; else xdg-open "$URL" > /dev/null 2>&1 & fi
