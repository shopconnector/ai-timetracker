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
# KROK 6: Podsumowanie i uruchomienie
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

read -p "Czy uruchomić TimeTracker teraz? (Y/n): " RUN_NOW

if [[ ! "$RUN_NOW" =~ ^[Nn]$ ]]; then
    echo ""
    log_info "Uruchamiam TimeTracker..."
    echo ""
    pnpm dev
else
    echo ""
    log_info "Aby uruchomić później, wejdź do folderu i uruchom:"
    echo "  cd ai-timetracker"
    echo "  pnpm dev"
    echo ""
fi
