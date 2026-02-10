#!/bin/bash
# Sprawdza status ActivityWatch i wszystkich watcherów

echo "========================================="
echo "  ActivityWatch Status Check"
echo "========================================="

# 1. Sprawdź czy ActivityWatch API działa
echo ""
echo "🔍 Sprawdzanie API..."
if curl -s http://localhost:5600/api/0/info > /dev/null 2>&1; then
    VERSION=$(curl -s http://localhost:5600/api/0/info | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
    echo "✅ ActivityWatch działa (v$VERSION)"
else
    echo "❌ ActivityWatch API nie odpowiada"
    echo "   Uruchom ActivityWatch i spróbuj ponownie"
    exit 1
fi

# 2. Lista wszystkich bucketów
echo ""
echo "📦 Dostępne buckety:"
curl -s "http://localhost:5600/api/0/buckets/" | python3 << 'EOF'
import json, sys
from datetime import datetime

try:
    data = json.load(sys.stdin)
    for name in sorted(data.keys()):
        bucket = data[name]
        btype = bucket.get("type", "unknown")
        last = bucket.get("last_updated", "N/A")

        if last != "N/A":
            try:
                dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
                last = dt.strftime("%Y-%m-%d %H:%M")
            except:
                pass

        # Ikona na podstawie typu
        if "window" in btype:
            icon = "🪟"
        elif "web" in btype or "browser" in btype:
            icon = "🌐"
        elif "afk" in btype:
            icon = "💤"
        elif "editor" in btype or "vscode" in btype or "cursor" in btype:
            icon = "📝"
        else:
            icon = "📦"

        print(f"  {icon} {name}")
        print(f"     Type: {btype} | Last: {last}")
except Exception as e:
    print(f"Error: {e}")
EOF

# 3. Sprawdź aktywne procesy
echo ""
echo "🔧 Aktywne procesy ActivityWatch:"
ps aux | grep -E "aw-watcher|ActivityWatch" | grep -v grep | awk '{print "  " $11 " " $12}' || echo "  Brak aktywnych procesów"

echo ""
echo "========================================="
