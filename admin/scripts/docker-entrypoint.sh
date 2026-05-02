#!/bin/sh
set -eu

RUNTIME_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:4100}"

mkdir -p /app/public
cat > /app/public/runtime-config.js <<CONFIG
window.__CLAWFORGE_CONFIG__ = {
  apiUrl: "${RUNTIME_API_URL}"
};
CONFIG

exec "$@"
