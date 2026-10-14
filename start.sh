#!/usr/bin/env sh
# Abre Mapache: lo arranca en segundo plano si hace falta y lo abre en el navegador. macOS y Linux.
cd "$(dirname "$0")" || exit 1
if ! command -v node > /dev/null 2>&1; then echo "Node.js is not installed: https://nodejs.org"; exit 1; fi
node bin/mapache.js open "$@"
code=$?
if [ "$code" -eq 2 ]; then
  printf "Stop the older version of Mapache and open the new one? [y/N] "
  read -r answer
  case "$answer" in [yYsS]*) node bin/mapache.js stop && exec node bin/mapache.js open "$@" ;; esac
fi
exit "$code"
