# TimeTracker

**Automatyczny system logowania czasu pracy z ActivityWatch do Tempo/Jira**

TimeTracker zbiera dane o tym co robisz na komputerze (ActivityWatch) i pozwala łatwo zalogować czas pracy do Tempo/Jira. AI pomaga w przypisywaniu tasków.

```
ActivityWatch  ───▶  TimeTracker  ───▶  Tempo/Jira
 (monitoring)         (web UI)          (worklogs)
```

## Szybka instalacja

### macOS / Linux

```bash
curl -sSL https://raw.githubusercontent.com/gacabartosz/timetracker/main/install.sh | bash
```

### Windows (PowerShell jako Administrator)

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
irm https://raw.githubusercontent.com/gacabartosz/timetracker/main/install.ps1 | iex
```

### Manualna instalacja

```bash
# 1. Zainstaluj ActivityWatch
# macOS: brew install --cask activitywatch
# Windows/Linux: https://activitywatch.net/downloads/

# 2. Sklonuj repozytorium
git clone https://github.com/gacabartosz/timetracker.git
cd timetracker

# 3. Zainstaluj zależności
pnpm install

# 4. Skonfiguruj API (skopiuj i wypełnij)
cp .env.example apps/web/.env.local
# Edytuj apps/web/.env.local

# 5. Uruchom
pnpm dev
```

## Adresy po instalacji

| Usługa | URL |
|--------|-----|
| **TimeTracker** | http://localhost:5666 |
| ActivityWatch | http://localhost:5600 |

## Wymagania

- Node.js >= 18
- pnpm >= 8
- ActivityWatch (instalowany automatycznie)
- Konto Jira/Tempo z tokenami API

## Konfiguracja API

Utwórz plik `apps/web/.env.local`:

```env
# ActivityWatch
ACTIVITYWATCH_URL=http://localhost:5600

# Tempo API (wymagane)
TEMPO_API_TOKEN=your_tempo_token

# Jira API (wymagane)
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_SERVICE_EMAIL=your.email@company.com
JIRA_API_KEY=your_jira_api_token

# OpenRouter (opcjonalnie - dla sugestii AI)
OPENROUTER_API_KEY=sk-or-xxx
```

### Jak uzyskać tokeny

**Tempo API Token:**
1. Tempo → Settings → API Integration
2. Create new token with worklog permissions

**Jira API Token:**
1. https://id.atlassian.com/manage-profile/security/api-tokens
2. Create API token

## Funkcje

- **Automatyczne zbieranie aktywności** - wszystkie aplikacje, przeglądarki, terminal
- **Wykrywanie spotkań** - Google Meet, Zoom, Teams, Slack Huddle
- **Grupowanie aktywności** - po projekcie, aplikacji, spotkaniu
- **Agregacja wielu aktywności** - połącz kilka w jeden worklog
- **Sugestie AI** - LLM sugeruje odpowiedni task
- **Historia** - uczy się na podstawie poprzednich logowań
- **Uniwersalne** - działa na każdym komputerze (macOS, Windows, Linux)

## Jak używać

1. Otwórz http://localhost:5666/timesheet
2. Wybierz datę
3. Przejrzyj aktywności z ActivityWatch
4. Wybierz task dla każdej aktywności
5. Kliknij "Log" aby zapisać do Tempo

### Widoki

| Widok | Opis |
|-------|------|
| **Karty** | Każda aktywność jako karta z sugestią i przyciskiem Log |
| **Tabela** | Edytowalna tabela z możliwością agregacji wielu wierszy |

### Agregowanie (widok Tabela)

1. Przełącz na widok Tabela
2. Zaznacz checkboxy przy wierszach do połączenia
3. Kliknij "Agreguj"
4. Edytuj opis, wybierz task, kliknij Log

## Struktura projektu

```
timetracker/
├── activitywatch/          # Konfiguracja ActivityWatch
│   ├── config/            # Pliki konfiguracyjne
│   └── scripts/           # Skrypty pomocnicze
├── apps/
│   └── web/               # Aplikacja Next.js
│       ├── src/app/       # Strony i API
│       ├── src/components/# Komponenty UI
│       └── src/lib/       # Logika biznesowa
├── packages/
│   ├── ai/                # Logika AI/LLM
│   └── shared/            # Współdzielony kod
├── install.sh             # Instalator macOS/Linux
├── install.ps1            # Instalator Windows
└── .env.example           # Przykładowa konfiguracja
```

## Rozwiązywanie problemów

### ActivityWatch nie zbiera danych

```bash
# Sprawdź status
curl http://localhost:5600/api/0/buckets/

# macOS: sprawdź uprawnienia
# System Preferences → Privacy & Security → Accessibility
# Dodaj ActivityWatch do listy
```

### TimeTracker nie startuje

```bash
# Sprawdź czy port 5666 jest wolny
lsof -i :5666

# Sprawdź logi
pnpm dev
```

### Restart ActivityWatch

```bash
# macOS
./activitywatch/scripts/restart.sh

# Lub ręcznie
pkill -f "ActivityWatch" && open -a ActivityWatch
```

## Rozwój

```bash
# Uruchom dev server
pnpm dev

# Build
pnpm build

# Linting
pnpm lint

# Type check
pnpm type-check
```

## Licencja

MIT
