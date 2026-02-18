#!/bin/bash
# TimeTracker Health Check Script
# Usage: ./scripts/health-check.sh
# Exit codes: 0=OK, 1=WARNING, 2=CRITICAL

PROCESS="ai-timetracker"
HEALTH_URL="http://localhost:5666/timetracker/api/health"
EXIT_CODE=0

echo "$(date '+%Y-%m-%d %H:%M:%S') | TimeTracker Health Check"
echo "---"

# 1. PM2 Process Check
PM2_JSON=$(pm2 jlist 2>/dev/null)
if [ $? -ne 0 ]; then
  echo "CRITICAL: PM2 not running"
  exit 2
fi

STATUS=$(echo "$PM2_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data:
    if p['name'] == '$PROCESS':
        env = p.get('pm2_env', {})
        monit = p.get('monit', {})
        print(f\"status={env.get('status','unknown')}\")
        print(f\"restarts={env.get('restart_time',0)}\")
        print(f\"memory_mb={monit.get('memory',0) // 1024 // 1024}\")
        print(f\"cpu={monit.get('cpu',0)}\")
        print(f\"pid={p.get('pid','?')}\")
" 2>/dev/null)

if [ -z "$STATUS" ]; then
  echo "CRITICAL: Process $PROCESS not found in PM2"
  exit 2
fi

eval "$STATUS"

if [ "$status" != "online" ]; then
  echo "CRITICAL: Process is $status (PID: $pid)"
  exit 2
fi

echo "PM2: online | PID: $pid | Restarts: $restarts | Memory: ${memory_mb}MB | CPU: ${cpu}%"

if [ "$memory_mb" -gt 450 ]; then
  echo "WARNING: Memory ${memory_mb}MB approaching 500MB limit"
  EXIT_CODE=1
fi

# 2. HTTP Health Endpoint Check
HEALTH=$(curl -s --max-time 5 "$HEALTH_URL" 2>/dev/null)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" 2>/dev/null)

if [ "$HTTP_CODE" != "200" ]; then
  echo "CRITICAL: Health endpoint returned HTTP $HTTP_CODE"
  exit 2
fi

HEAP_USED=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['memory']['heapUsed'])" 2>/dev/null)
HEAP_TOTAL=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['memory']['heapTotal'])" 2>/dev/null)
UPTIME=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['uptime'])" 2>/dev/null)
VERSION=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['version'])" 2>/dev/null)

HEAP_PCT=0
if [ -n "$HEAP_TOTAL" ] && [ "$HEAP_TOTAL" -gt 0 ]; then
  HEAP_PCT=$((HEAP_USED * 100 / HEAP_TOTAL))
fi

UPTIME_H=$((UPTIME / 3600))
UPTIME_M=$(((UPTIME % 3600) / 60))

echo "HTTP: 200 OK | v$VERSION | Uptime: ${UPTIME_H}h ${UPTIME_M}m | Heap: ${HEAP_USED}/${HEAP_TOTAL}MB (${HEAP_PCT}%)"

if [ "$HEAP_PCT" -gt 90 ]; then
  echo "WARNING: Heap usage ${HEAP_PCT}% > 90%"
  EXIT_CODE=1
fi

echo "---"
if [ "$EXIT_CODE" -eq 0 ]; then
  echo "STATUS: OK"
else
  echo "STATUS: WARNING"
fi

exit $EXIT_CODE
