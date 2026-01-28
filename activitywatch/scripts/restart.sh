#!/bin/bash
# Restartuje ActivityWatch i wszystkie watchery

echo "🔄 Restartuję ActivityWatch..."

# Wykryj system operacyjny
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo "System: macOS"

    # Zatrzymaj wszystkie procesy AW
    pkill -f "ActivityWatch" 2>/dev/null || true
    pkill -f "aw-server" 2>/dev/null || true
    pkill -f "aw-watcher" 2>/dev/null || true

    sleep 2

    # Uruchom ponownie
    if [ -d "/Applications/ActivityWatch.app" ]; then
        open -a ActivityWatch
        echo "✅ ActivityWatch uruchomiony"
    else
        echo "❌ Nie znaleziono ActivityWatch.app w /Applications"
        echo "   Zainstaluj: brew install --cask activitywatch"
        exit 1
    fi

elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    echo "System: Linux"

    # Zatrzymaj
    killall aw-qt 2>/dev/null || true
    killall aw-server 2>/dev/null || true
    pkill -f "aw-watcher" 2>/dev/null || true

    sleep 2

    # Uruchom
    if command -v activitywatch &> /dev/null; then
        activitywatch &
        echo "✅ ActivityWatch uruchomiony"
    elif command -v aw-qt &> /dev/null; then
        aw-qt &
        echo "✅ ActivityWatch uruchomiony"
    else
        echo "❌ Nie znaleziono ActivityWatch"
        echo "   Zainstaluj: snap install activitywatch"
        exit 1
    fi
else
    echo "❌ Nieobsługiwany system: $OSTYPE"
    echo "   Dla Windows użyj restart.ps1"
    exit 1
fi

# Poczekaj na start
sleep 3

# Sprawdź status
if curl -s http://localhost:5600/api/0/info > /dev/null 2>&1; then
    echo ""
    echo "✅ ActivityWatch API działa na http://localhost:5600"
else
    echo ""
    echo "⚠️ ActivityWatch uruchomiony, ale API jeszcze nie odpowiada"
    echo "   Poczekaj kilka sekund i sprawdź http://localhost:5600"
fi
