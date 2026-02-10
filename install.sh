#!/bin/bash
set -e

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     TimeTracker + ActivityWatch Installer                    ║"
echo "║     Automatyczne logowanie czasu pracy do Tempo/Jira         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Kolory
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funkcje pomocnicze
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# ═══════════════════════════════════════════════════════════════
# KROK 1: Sprawdzanie wymagań
# ═══════════════════════════════════════════════════════════════
echo "📋 Sprawdzanie wymagań..."
echo ""

check_command() {
    if command -v $1 &> /dev/null; then
        log_success "$1: $(command -v $1)"
        return 0
    else
        log_error "Brak: $1"
        return 1
    fi
}

MISSING=0

# Node.js
if check_command node; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        log_warning "Node.js $NODE_VERSION jest za stary. Wymagana wersja >= 18"
        MISSING=1
    fi
else
    log_error "Zainstaluj Node.js >= 18: https://nodejs.org/"
    MISSING=1
fi

# pnpm
if ! check_command pnpm; then
    log_warning "Instaluję pnpm..."
    npm install -g pnpm
    check_command pnpm || { log_error "Nie udało się zainstalować pnpm"; MISSING=1; }
fi

# git
if ! check_command git; then
    log_error "Zainstaluj git: https://git-scm.com/"
    MISSING=1
fi

if [ $MISSING -eq 1 ]; then
    echo ""
    log_error "Brakuje wymaganych narzędzi. Zainstaluj je i uruchom ponownie."
    exit 1
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# KROK 2: Instalacja ActivityWatch
# ═══════════════════════════════════════════════════════════════
echo "📦 Instalacja ActivityWatch..."
echo ""

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    if [ -d "/Applications/ActivityWatch.app" ]; then
        log_success "ActivityWatch już zainstalowany"
    else
        if command -v brew &> /dev/null; then
            log_info "Instaluję ActivityWatch przez Homebrew..."
            brew install --cask activitywatch
            log_success "ActivityWatch zainstalowany"
        else
            log_warning "Homebrew nie jest zainstalowany"
            log_info "Pobierz ActivityWatch z: https://activitywatch.net/downloads/"
            read -p "Naciśnij Enter po zainstalowaniu ActivityWatch..."
        fi
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if command -v activitywatch &> /dev/null || command -v aw-qt &> /dev/null; then
        log_success "ActivityWatch już zainstalowany"
    else
        log_info "Instalacja ActivityWatch na Linux:"
        echo "  - snap install activitywatch"
        echo "  - lub pobierz z: https://activitywatch.net/downloads/"
        read -p "Naciśnij Enter po zainstalowaniu ActivityWatch..."
    fi
else
    log_warning "Nieobsługiwany system: $OSTYPE"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# KROK 3: Uruchomienie ActivityWatch
# ═══════════════════════════════════════════════════════════════
echo "🚀 Uruchamianie ActivityWatch..."
echo ""

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS - uruchom jeśli nie działa
    if ! pgrep -x "ActivityWatch" > /dev/null; then
        open -a ActivityWatch 2>/dev/null || true
        sleep 3
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if ! pgrep -f "aw-server" > /dev/null; then
        if command -v activitywatch &> /dev/null; then
            activitywatch &
        elif command -v aw-qt &> /dev/null; then
            aw-qt &
        fi
        sleep 3
    fi
fi

# Sprawdź czy API działa
if curl -s http://localhost:5600/api/0/info > /dev/null 2>&1; then
    log_success "ActivityWatch działa na http://localhost:5600"
else
    log_warning "ActivityWatch może wymagać ręcznego uruchomienia"
    log_info "Uruchom ActivityWatch i kontynuuj instalację"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# KROK 4: Instalacja TimeTracker
# ═══════════════════════════════════════════════════════════════
echo "📥 Instalacja TimeTracker..."
echo ""

# Sprawdź czy jesteśmy już w folderze timetracker
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$SCRIPT_DIR/apps/web/package.json" ]; then
    # Uruchomiono z folderu projektu
    cd "$SCRIPT_DIR"
    log_info "Używam istniejącego folderu: $SCRIPT_DIR"
else
    # Sklonuj z GitHub
    if [ -d "ai-timetracker" ]; then
        log_info "Folder timetracker już istnieje, aktualizuję..."
        cd ai-timetracker
        git pull
    else
        log_info "Klonuję repozytorium..."
        git clone https://github.com/shopconnector/ai-timetracker.git
        cd ai-timetracker
    fi
fi

log_info "Instaluję zależności (pnpm install)..."
pnpm install

log_success "TimeTracker zainstalowany"
echo ""

# ═══════════════════════════════════════════════════════════════
# KROK 5: Konfiguracja API
# ═══════════════════════════════════════════════════════════════
echo "⚙️  Konfiguracja API..."
echo ""

ENV_FILE="apps/web/.env.local"

if [ -f "$ENV_FILE" ]; then
    log_success "Plik $ENV_FILE już istnieje"
    read -p "Czy chcesz go nadpisać? (y/N): " OVERWRITE
    if [[ ! "$OVERWRITE" =~ ^[Yy]$ ]]; then
        echo "Zachowuję istniejącą konfigurację."
    else
        rm "$ENV_FILE"
    fi
fi

if [ ! -f "$ENV_FILE" ]; then
    echo ""
    echo "Podaj dane do API (pozostaw puste aby pominąć):"
    echo ""

    read -p "TEMPO_API_TOKEN: " TEMPO_TOKEN
    read -p "JIRA_BASE_URL (np. https://firma.atlassian.net): " JIRA_URL
    read -p "JIRA_SERVICE_EMAIL: " JIRA_EMAIL
    read -p "JIRA_API_KEY: " JIRA_KEY
    read -p "OPENROUTER_API_KEY (opcjonalnie, dla AI): " OPENROUTER_KEY

    cat > "$ENV_FILE" << EOF
# ActivityWatch
ACTIVITYWATCH_URL=http://localhost:5600

# Tempo API
TEMPO_API_TOKEN=$TEMPO_TOKEN

# Jira API
JIRA_BASE_URL=$JIRA_URL
JIRA_SERVICE_EMAIL=$JIRA_EMAIL
JIRA_API_KEY=$JIRA_KEY

# OpenRouter (opcjonalnie - dla sugestii AI)
OPENROUTER_API_KEY=$OPENROUTER_KEY
EOF

    log_success "Konfiguracja zapisana w $ENV_FILE"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# KROK 6: Autostart (PM2 + ActivityWatch)
# ═══════════════════════════════════════════════════════════════
echo "🔄 Konfiguracja produkcyjnego uruchomienia (PM2)..."
echo ""

# --- Detekcja ścieżek Node/PM2 ---
detect_node_paths() {
    # 1. Sprawdź aktualne PATH (respektuje nvm)
    if command -v node &> /dev/null; then
        NODE_BIN=$(command -v node)
        NODE_BIN_DIR=$(dirname "$NODE_BIN")
    fi

    # 2. Fallback: source nvm jeśli nie znaleziono
    if [ -z "$NODE_BIN_DIR" ]; then
        export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
        if [ -s "$NVM_DIR/nvm.sh" ]; then
            source "$NVM_DIR/nvm.sh"
            if command -v node &> /dev/null; then
                NODE_BIN=$(command -v node)
                NODE_BIN_DIR=$(dirname "$NODE_BIN")
            fi
        fi
    fi

    # 3. Fallback: znane ścieżki
    if [ -z "$NODE_BIN_DIR" ]; then
        for dir in /opt/homebrew/bin /usr/local/bin /usr/bin; do
            if [ -x "$dir/node" ]; then
                NODE_BIN="$dir/node"
                NODE_BIN_DIR="$dir"
                break
            fi
        done
    fi

    # Resolve symlinks
    if [ -n "$NODE_BIN" ] && command -v readlink &> /dev/null; then
        REAL_NODE=$(readlink -f "$NODE_BIN" 2>/dev/null || echo "$NODE_BIN")
        NODE_BIN_DIR=$(dirname "$REAL_NODE")
    fi

    # PM2 path
    if command -v pm2 &> /dev/null; then
        PM2_PATH=$(command -v pm2)
    elif [ -n "$NODE_BIN_DIR" ] && [ -x "$NODE_BIN_DIR/pm2" ]; then
        PM2_PATH="$NODE_BIN_DIR/pm2"
    fi

    # Resolve PM2 symlinks
    if [ -n "$PM2_PATH" ] && command -v readlink &> /dev/null; then
        PM2_PATH=$(readlink -f "$PM2_PATH" 2>/dev/null || echo "$PM2_PATH")
    fi
}

detect_node_paths

if [ -z "$NODE_BIN_DIR" ]; then
    log_error "Nie znaleziono Node.js - nie mogę skonfigurować PM2"
else
    log_success "Node.js: $NODE_BIN_DIR"

    # Instalacja PM2 jeśli brak
    if [ -z "$PM2_PATH" ]; then
        log_info "Instaluję PM2..."
        npm install -g pm2
        detect_node_paths
    fi

    if [ -n "$PM2_PATH" ]; then
        log_success "PM2: $PM2_PATH"

        # Build produkcyjny
        log_info "Buduję aplikację (pnpm build)..."
        pnpm build

        # Uruchom przez PM2
        log_info "Uruchamiam TimeTracker przez PM2..."
        "$PM2_PATH" start ecosystem.config.js 2>/dev/null || "$PM2_PATH" restart ecosystem.config.js
        "$PM2_PATH" save
        log_success "TimeTracker działa na http://localhost:5666"

        echo ""
        # --- Autostart ---
        read -p "Czy ustawić autostart po restarcie systemu? (Y/n): " SETUP_AUTOSTART

        if [[ ! "$SETUP_AUTOSTART" =~ ^[Nn]$ ]]; then
            # Utwórz katalog na logi
            mkdir -p "$HOME/.timetracker/logs"

            if [[ "$OSTYPE" == "darwin"* ]]; then
                # ═══ macOS: launchd ═══
                log_info "Konfiguruję autostart macOS (launchd)..."

                LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
                AUTOSTART_DIR="$(cd "$(dirname "$0")" && pwd)/autostart/macos"

                # Migracja starego plista
                OLD_PLIST="$LAUNCH_AGENTS/com.gaca.pm2-timetracker.plist"
                if [ -f "$OLD_PLIST" ]; then
                    log_info "Migruję stary plist (com.gaca.pm2-timetracker)..."
                    launchctl bootout "gui/$(id -u)" "$OLD_PLIST" 2>/dev/null || true
                    rm -f "$OLD_PLIST"
                    log_success "Stary plist usunięty"
                fi

                # ActivityWatch plist
                AW_PLIST="$LAUNCH_AGENTS/com.timetracker.activitywatch.plist"
                if [ -f "$AUTOSTART_DIR/com.timetracker.activitywatch.plist" ]; then
                    sed "s|__USER_HOME__|$HOME|g" \
                        "$AUTOSTART_DIR/com.timetracker.activitywatch.plist" > "$AW_PLIST"
                    launchctl bootstrap "gui/$(id -u)" "$AW_PLIST" 2>/dev/null || true
                    log_success "ActivityWatch autostart zainstalowany"
                fi

                # PM2 plist
                PM2_PLIST="$LAUNCH_AGENTS/com.timetracker.pm2.plist"
                if [ -f "$AUTOSTART_DIR/com.timetracker.pm2.plist" ]; then
                    sed -e "s|__PM2_PATH__|$PM2_PATH|g" \
                        -e "s|__NODE_BIN_DIR__|$NODE_BIN_DIR|g" \
                        -e "s|__USER_HOME__|$HOME|g" \
                        "$AUTOSTART_DIR/com.timetracker.pm2.plist" > "$PM2_PLIST"
                    launchctl bootstrap "gui/$(id -u)" "$PM2_PLIST" 2>/dev/null || true
                    log_success "PM2 TimeTracker autostart zainstalowany"
                fi

                echo ""
                log_success "Autostart macOS skonfigurowany!"
                log_info "Weryfikacja: launchctl list | grep timetracker"

            elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
                # ═══ Linux: systemd user ═══
                log_info "Konfiguruję autostart Linux (systemd)..."

                SYSTEMD_DIR="$HOME/.config/systemd/user"
                mkdir -p "$SYSTEMD_DIR"
                AUTOSTART_DIR="$(cd "$(dirname "$0")" && pwd)/autostart/linux"

                # Detekcja ActivityWatch executable
                AW_EXEC=""
                if command -v aw-qt &> /dev/null; then
                    AW_EXEC=$(command -v aw-qt)
                elif [ -x "/snap/bin/activitywatch" ]; then
                    AW_EXEC="/snap/bin/activitywatch"
                elif [ -x "$HOME/activitywatch/aw-qt" ]; then
                    AW_EXEC="$HOME/activitywatch/aw-qt"
                fi

                # ActivityWatch service
                if [ -n "$AW_EXEC" ] && [ -f "$AUTOSTART_DIR/activitywatch.service" ]; then
                    sed "s|__AW_EXEC_PATH__|$AW_EXEC|g" \
                        "$AUTOSTART_DIR/activitywatch.service" > "$SYSTEMD_DIR/activitywatch.service"
                    systemctl --user enable activitywatch.service 2>/dev/null || true
                    log_success "ActivityWatch autostart zainstalowany ($AW_EXEC)"
                else
                    log_warning "ActivityWatch nie znaleziony - pomijam autostart AW"
                fi

                # PM2 service
                if [ -f "$AUTOSTART_DIR/timetracker-pm2.service" ]; then
                    sed -e "s|__PM2_PATH__|$PM2_PATH|g" \
                        -e "s|__NODE_BIN_DIR__|$NODE_BIN_DIR|g" \
                        -e "s|__USER_HOME__|$HOME|g" \
                        "$AUTOSTART_DIR/timetracker-pm2.service" > "$SYSTEMD_DIR/timetracker-pm2.service"
                    systemctl --user enable timetracker-pm2.service 2>/dev/null || true
                    log_success "PM2 TimeTracker autostart zainstalowany"
                fi

                systemctl --user daemon-reload 2>/dev/null || true
                loginctl enable-linger "$USER" 2>/dev/null || true

                echo ""
                log_success "Autostart Linux skonfigurowany!"
                log_info "Weryfikacja: systemctl --user status activitywatch timetracker-pm2"
            fi
        else
            log_info "Pomijam konfigurację autostartu"
        fi
    else
        log_error "Nie udało się zainstalować PM2"
    fi
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# KROK 7: Podsumowanie
# ═══════════════════════════════════════════════════════════════
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                   🎉 Instalacja zakończona!                  ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  ActivityWatch:  http://localhost:5600                       ║"
echo "║  TimeTracker:    http://localhost:5666                       ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

log_info "TimeTracker działa w tle przez PM2."
log_info "Komendy PM2:"
echo "  pm2 status          - sprawdź status"
echo "  pm2 logs             - logi aplikacji"
echo "  pm2 restart all      - restart"
echo ""

if [[ ! "$SETUP_AUTOSTART" =~ ^[Nn]$ ]] 2>/dev/null; then
    log_info "Autostart jest WŁĄCZONY - TimeTracker uruchomi się automatycznie po restarcie."
    log_info "Aby wyłączyć: bash autostart/uninstall-autostart.sh"
fi
echo ""
