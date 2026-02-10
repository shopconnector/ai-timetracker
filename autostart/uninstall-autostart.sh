#!/bin/bash
# TimeTracker + ActivityWatch - Usuwanie autostartu (macOS / Linux)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "=== Usuwanie autostartu TimeTracker + ActivityWatch ==="
echo ""

removed=0

if [[ "$OSTYPE" == "darwin"* ]]; then
    # ---- macOS: launchd ----
    echo "System: macOS (launchd)"
    echo ""

    # ActivityWatch plist
    AW_PLIST="$HOME/Library/LaunchAgents/com.timetracker.activitywatch.plist"
    if [ -f "$AW_PLIST" ]; then
        launchctl bootout "gui/$(id -u)" "$AW_PLIST" 2>/dev/null || true
        rm -f "$AW_PLIST"
        echo -e "${GREEN}  Usunięto: com.timetracker.activitywatch.plist${NC}"
        removed=$((removed + 1))
    fi

    # PM2 plist
    PM2_PLIST="$HOME/Library/LaunchAgents/com.timetracker.pm2.plist"
    if [ -f "$PM2_PLIST" ]; then
        launchctl bootout "gui/$(id -u)" "$PM2_PLIST" 2>/dev/null || true
        rm -f "$PM2_PLIST"
        echo -e "${GREEN}  Usunięto: com.timetracker.pm2.plist${NC}"
        removed=$((removed + 1))
    fi

    # Stary plist (migracja)
    OLD_PLIST="$HOME/Library/LaunchAgents/com.gaca.pm2-timetracker.plist"
    if [ -f "$OLD_PLIST" ]; then
        launchctl bootout "gui/$(id -u)" "$OLD_PLIST" 2>/dev/null || true
        rm -f "$OLD_PLIST"
        echo -e "${GREEN}  Usunięto: com.gaca.pm2-timetracker.plist (stary)${NC}"
        removed=$((removed + 1))
    fi

elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # ---- Linux: systemd user ----
    echo "System: Linux (systemd user)"
    echo ""

    # ActivityWatch service
    AW_SERVICE="$HOME/.config/systemd/user/activitywatch.service"
    if [ -f "$AW_SERVICE" ]; then
        systemctl --user disable activitywatch.service 2>/dev/null || true
        systemctl --user stop activitywatch.service 2>/dev/null || true
        rm -f "$AW_SERVICE"
        echo -e "${GREEN}  Usunięto: activitywatch.service${NC}"
        removed=$((removed + 1))
    fi

    # PM2 service
    PM2_SERVICE="$HOME/.config/systemd/user/timetracker-pm2.service"
    if [ -f "$PM2_SERVICE" ]; then
        systemctl --user disable timetracker-pm2.service 2>/dev/null || true
        systemctl --user stop timetracker-pm2.service 2>/dev/null || true
        rm -f "$PM2_SERVICE"
        echo -e "${GREEN}  Usunięto: timetracker-pm2.service${NC}"
        removed=$((removed + 1))
    fi

    systemctl --user daemon-reload 2>/dev/null || true
else
    echo -e "${RED}Nieobsługiwany system: $OSTYPE${NC}"
    exit 1
fi

echo ""
if [ $removed -eq 0 ]; then
    echo "Nie znaleziono wpisów do usunięcia."
else
    echo -e "${GREEN}Usunięto $removed wpisów autostartu.${NC}"
fi
echo ""
