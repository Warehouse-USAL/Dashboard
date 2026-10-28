#!/bin/sh
set -e
# Only substitute ${BACKEND_URL} — leave nginx variables ($uri, $host, etc.) intact
envsubst '${BACKEND_URL}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf
# URL de la página externa de monitoreo: la lee la SPA desde /config.json (ver src/lib/monitoreo-config.ts)
printf '{"monitoreoUrl":"%s"}' "${MONITOREO_URL:-}" > /usr/share/nginx/html/config.json
exec "$@"
