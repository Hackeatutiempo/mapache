#!/usr/bin/env sh
# Abre Mapache: lo arranca en segundo plano si hace falta y lo abre en el navegador. macOS y Linux.
cd "$(dirname "$0")" || exit 1
exec node bin/mapache.js open "$@"
