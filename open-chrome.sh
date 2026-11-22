#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://127.0.0.1:8000/}"
CDP_PORT="${2:-9222}"
PROFILE_DIR="${CHROME_PROFILE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/retro-idle-chrome}"

mkdir -p "${PROFILE_DIR}"

echo "Opening ${URL} in Google Chrome"
echo "CDP endpoint: http://127.0.0.1:${CDP_PORT}"
echo "Profile dir:  ${PROFILE_DIR}"

exec google-chrome \
  --remote-debugging-port="${CDP_PORT}" \
  --user-data-dir="${PROFILE_DIR}" \
  --no-first-run \
  --no-default-browser-check \
  "${@:3}" \
  "${URL}"
