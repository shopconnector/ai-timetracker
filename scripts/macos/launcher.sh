#!/bin/bash
# AI TimeTracker macOS Launcher
# Runs inside .app/Contents/MacOS/

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTENTS_DIR="$(dirname "$SCRIPT_DIR")"
RESOURCES="${CONTENTS_DIR}/Resources"
NODE="${RESOURCES}/node/node"
DATA_DIR="${HOME}/.timetracker"
LOG_DIR="${DATA_DIR}/logs"

# Ensure data directory exists
mkdir -p "${DATA_DIR}" "${LOG_DIR}"

# Copy .env.example on first run
if [ ! -f "${DATA_DIR}/.env.local" ] && [ -f "${RESOURCES}/data/.env.example" ]; then
    cp "${RESOURCES}/data/.env.example" "${DATA_DIR}/.env.local"
    FIRST_RUN=true
fi

# Export environment
export NODE_ENV=production
export HOSTNAME=localhost
export PORT=5666
export ACTIVITYWATCH_URL="${ACTIVITYWATCH_URL:-http://localhost:5600}"
export TIMETRACKER_DATA_DIR="${DATA_DIR}"

# Start ActivityWatch if not running
if ! curl -s -o /dev/null http://localhost:5600/api/0/info 2>/dev/null; then
    AW_PATHS=(
        "/Applications/ActivityWatch.app"
        "${HOME}/Applications/ActivityWatch.app"
        "${RESOURCES}/../../../ActivityWatch/ActivityWatch.app"
    )
    for AW_PATH in "${AW_PATHS[@]}"; do
        if [ -d "$AW_PATH" ]; then
            open "$AW_PATH" 2>/dev/null
            sleep 3
            break
        fi
    done
fi

APP_URL="http://localhost:${PORT}/timetracker"

# Open browser after short delay
(sleep 3 && open "$APP_URL") &

# Start server (logs to file, restart on crash)
while true; do
    echo "[$(date)] Starting AI TimeTracker server on ${APP_URL}" >> "${LOG_DIR}/server.log"
    "${NODE}" "${RESOURCES}/start-server.js" >> "${LOG_DIR}/server.log" 2>&1
    EXIT_CODE=$?
    echo "[$(date)] Server exited with code ${EXIT_CODE}" >> "${LOG_DIR}/server.log"

    if [ -f "${DATA_DIR}/stop.flag" ]; then
        rm -f "${DATA_DIR}/stop.flag"
        break
    fi

    sleep 3
done
