#!/bin/sh
set -e
# Only substitute ${BACKEND_URL} — leave nginx variables ($uri, $host, etc.) intact
envsubst '${BACKEND_URL}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf
exec "$@"
