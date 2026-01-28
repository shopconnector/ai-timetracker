# AI TimeTracker

**Automatyczny system logowania czasu pracy z ActivityWatch do Tempo/Jira z wsparciem AI**

TimeTracker zbiera dane o tym co robisz na komputerze (ActivityWatch) i pozwala zalogować czas pracy do Tempo/Jira. AI pomaga w przypisywaniu tasków.

```
ActivityWatch  ───▶  TimeTracker  ───▶  Tempo/Jira
 (monitoring)         (web UI)          (worklogs)
```

## Demo

**Live:** https://ai.beecommerce.pl/timetracker

---

## Instalacja

### Wymagania wstępne

| Wymaganie | Wersja | Link |
|-----------|--------|------|
| Node.js | >= 18 | https://nodejs.org/ |
| pnpm | >= 8 | https://pnpm.io/installation |
| ActivityWatch | latest | https://activitywatch.net/downloads/ |

---

## Instalacja na macOS

### Krok 1: Zainstaluj Homebrew (jeśli nie masz)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Krok 2: Zainstaluj Node.js i pnpm

```bash
brew install node
npm install -g pnpm
```

### Krok 3: Zainstaluj ActivityWatch

```bash
brew install --cask activitywatch
```

Lub pobierz z: https://activitywatch.net/downloads/

### Krok 4: Skonfiguruj uprawnienia ActivityWatch

1. Otwórz **System Preferences** (Ustawienia systemowe)
2. Przejdź do **Privacy & Security** → **Accessibility**
3. Kliknij kłódkę, aby odblokować
4. Dodaj **ActivityWatch** do listy
5. Powtórz dla **Screen Recording** (jeśli chcesz śledzić tytuły okien)

### Krok 5: Uruchom ActivityWatch

```bash
open -a ActivityWatch
```

ActivityWatch pojawi się w pasku menu. Kliknij ikonę i wybierz "Open Dashboard".

### Krok 6: Sklonuj i uruchom TimeTracker

```bash
git clone https://github.com/shopconnector/ai-timetracker.git
cd ai-timetracker
pnpm install
cp .env.example apps/web/.env.local
# Edytuj apps/web/.env.local (patrz sekcja "Konfiguracja API")
pnpm dev
```

### Szybka instalacja (macOS/Linux)

```bash
curl -sSL https://raw.githubusercontent.com/gacabartosz/ai-timetracker/main/install.sh | bash
```

---

## Instalacja na Windows (krok po kroku)

> **WAŻNE:** Wykonuj komendy POJEDYNCZO, nie kopiuj wielu na raz!
> Po każdej instalacji narzędzia ZAMKNIJ PowerShell i otwórz NOWE okno!

---

### ETAP 1: Instalacja narzędzi

#### 1.1 Zainstaluj Git

Otwórz **PowerShell** i wpisz:

```powershell
winget install Git.Git
```

Poczekaj na zakończenie instalacji.

**→ ZAMKNIJ PowerShell i otwórz NOWE okno PowerShell**

Sprawdź czy działa:
```powershell
git --version
```

Powinno wyświetlić: `git version 2.xx.x`

---

#### 1.2 Zainstaluj Node.js

```powershell
winget install OpenJS.NodeJS.LTS
```

**→ ZAMKNIJ PowerShell i otwórz NOWE okno PowerShell**

Sprawdź czy działa:
```powershell
node --version
```

Powinno wyświetlić: `v20.xx.x` lub wyżej

---

#### 1.3 Zainstaluj pnpm

```powershell
iwr https://get.pnpm.io/install.ps1 -useb | iex
```

**→ ZAMKNIJ PowerShell i otwórz NOWE okno PowerShell**

Sprawdź czy działa:
```powershell
pnpm --version
```

Powinno wyświetlić: `10.xx.x` lub wyżej

---

#### 1.4 Zainstaluj ActivityWatch

1. Otwórz w przeglądarce: https://activitywatch.net/downloads/
2. Pobierz wersję dla **Windows**
3. Uruchom pobrany plik `.exe`
4. Zainstaluj (klikaj "Dalej")
5. Po instalacji ActivityWatch uruchomi się automatycznie
6. Sprawdź czy ikona ActivityWatch pojawiła się w zasobniku systemowym (przy zegarze)

Aby sprawdzić czy działa, otwórz: http://localhost:5600

---

### ETAP 2: Instalacja TimeTracker

#### 2.1 Sklonuj repozytorium

```powershell
cd ~\Documents
```

```powershell
git clone https://github.com/shopconnector/ai-timetracker.git
```

```powershell
cd ai-timetracker
```

---

#### 2.2 Zainstaluj zależności

```powershell
pnpm install
```

Poczekaj aż się zakończy (może potrwać kilka minut).

---

#### 2.3 Skonfiguruj API

Skopiuj plik konfiguracyjny:

```powershell
Copy-Item .env.example -Destination apps\web\.env.local
```

Otwórz plik w Notatniku:

```powershell
notepad apps\web\.env.local
```

Uzupełnij dane (patrz sekcja "Jak uzyskać tokeny API" poniżej):

```
ACTIVITYWATCH_URL=http://localhost:5600
TEMPO_API_TOKEN=twój_token_tempo
JIRA_BASE_URL=https://twoja-firma.atlassian.net
JIRA_SERVICE_EMAIL=twoj.email@firma.com
JIRA_API_KEY=twój_token_jira
OPENROUTER_API_KEY=sk-or-xxx
```

**Zapisz plik (Ctrl+S) i zamknij Notatnik.**

---

### ETAP 3: Uruchamianie aplikacji

#### Opcja A: Uruchom ręcznie (najprostsza)

```powershell
pnpm dev
```

Otwórz w przeglądarce: **http://localhost:5666**

> ⚠️ **UWAGA:** NIE zamykaj okna PowerShell! Zminimalizuj je.
> Zamknięcie PowerShell zatrzyma aplikację.

---

#### Opcja B: Uruchom jako usługę w tle (zalecane)

Dzięki temu możesz zamknąć PowerShell a aplikacja będzie nadal działać.

**Krok 1:** Zainstaluj pm2:

```powershell
npm install -g pm2
```

**Krok 2:** Uruchom TimeTracker jako usługę:

```powershell
cd ~\Documents\ai-timetracker
```

```powershell
pm2 start "pnpm dev" --name timetracker
```

**Krok 3:** Zapisz konfigurację:

```powershell
pm2 save
```

Teraz możesz zamknąć PowerShell - aplikacja działa w tle!

**Zarządzanie usługą:**

```powershell
pm2 status              # sprawdź status
pm2 logs timetracker    # zobacz logi
pm2 stop timetracker    # zatrzymaj
pm2 restart timetracker # restart
pm2 delete timetracker  # usuń usługę
```

---

#### Opcja C: Uruchom jednym kliknięciem

1. Otwórz folder `C:\Users\TWOJA_NAZWA\Documents\ai-timetracker`
2. Kliknij dwukrotnie na **`start-timetracker.bat`**

Skrypt automatycznie:
- Sprawdzi i uruchomi ActivityWatch
- Uruchomi TimeTracker
- Otworzy przeglądarkę

---

### ETAP 4: Autostart przy uruchamianiu Windows

Aby TimeTracker uruchamiał się automatycznie po włączeniu komputera:

**Metoda 1: Autostart ze skryptem .bat**

1. Naciśnij `Win + R`
2. Wpisz `shell:startup` i naciśnij Enter
3. Otworzył się folder Autostart
4. Kliknij prawym przyciskiem → **Nowy** → **Skrót**
5. W polu "lokalizacja" wpisz:
   ```
   C:\Users\TWOJA_NAZWA\Documents\ai-timetracker\start-timetracker.bat
   ```
   (zamień TWOJA_NAZWA na swoją nazwę użytkownika Windows)
6. Kliknij **Dalej**
7. Nazwij skrót: `AI TimeTracker`
8. Kliknij **Zakończ**

**Metoda 2: Autostart z pm2 (zalecane dla zaawansowanych)**

```powershell
pm2 startup
```

Skopiuj i uruchom komendę którą wyświetli pm2, następnie:

```powershell
pm2 save
```

---

### Rozwiązywanie problemów

| Problem | Rozwiązanie |
|---------|-------------|
| `git` / `pnpm` / `node` nie rozpoznany | Zamknij PowerShell i otwórz NOWE okno |
| Nadal nie działa | Uruchom: `$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")` |
| `corepack enable` błąd EPERM | Uruchom PowerShell jako Administrator |
| Błąd przy `copy` | Użyj: `Copy-Item .env.example -Destination apps\web\.env.local` |
| ActivityWatch nie działa | Uruchom ręcznie z menu Start lub pobierz ponownie z https://activitywatch.net/downloads/ |
| Strona nie otwiera się po zamknięciu PowerShell | Użyj pm2 (Opcja B powyżej) |
| Port 5666 zajęty | Uruchom: `netstat -ano | findstr :5666` aby znaleźć proces, lub zmień port w `apps/web/package.json` |

---

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

---

## Jak uzyskać token API Jira

### Krok 1: Zaloguj się do Atlassian

Przejdź do: https://id.atlassian.com/manage-profile/security/api-tokens

### Krok 2: Utwórz token

1. Kliknij **"Create API token"**
2. Wpisz nazwę tokena, np. "TimeTracker"
3. Kliknij **"Create"**
4. **Skopiuj token** (wyświetli się tylko raz!)

### Krok 3: Znajdź swój JIRA_BASE_URL

Twój JIRA_BASE_URL to adres Twojej instancji Jira, np.:
- `https://twoja-firma.atlassian.net`
- `https://jira.twoja-firma.com`

### Krok 4: Ustaw zmienne w .env.local

```env
JIRA_BASE_URL=https://twoja-firma.atlassian.net
JIRA_SERVICE_EMAIL=twoj.email@firma.com
JIRA_API_KEY=ATATT3xFfGF0... (skopiowany token)
```

---

## Jak uzyskać token API Tempo

### Krok 1: Zaloguj się do Tempo

Przejdź do Tempo w Jira:
1. Otwórz Jira
2. W górnym menu kliknij **"Apps"** → **"Tempo"**

### Krok 2: Przejdź do ustawień API

1. Kliknij ikonę **ustawień** (koło zębate) w Tempo
2. Wybierz **"API Integration"** lub **"Integrations"**
3. Przejdź do zakładki **"API Tokens"**

Lub bezpośrednio: `https://twoja-firma.atlassian.net/plugins/servlet/ac/io.tempo.jira/tempo-app#!/configuration/api-integration`

### Krok 3: Utwórz token

1. Kliknij **"New Token"** lub **"+ Create token"**
2. Wpisz nazwę tokena, np. "TimeTracker"
3. Ustaw uprawnienia:
   - **Worklogs**: View, Create, Edit (wymagane)
   - **Accounts**: View (opcjonalne)
4. Kliknij **"Create"**
5. **Skopiuj token** (wyświetli się tylko raz!)

### Krok 4: Ustaw zmienną w .env.local

```env
TEMPO_API_TOKEN=twoj_tempo_token
```

---

## Jak uzyskać API Key OpenRouter (opcjonalne - dla AI)

OpenRouter pozwala na używanie różnych modeli AI (GPT-4, Claude, Llama) przez jedno API.

### Krok 1: Zarejestruj się

Przejdź do: https://openrouter.ai/

### Krok 2: Utwórz API Key

1. Zaloguj się
2. Przejdź do **"Keys"** (https://openrouter.ai/keys)
3. Kliknij **"Create Key"**
4. Skopiuj klucz (zaczyna się od `sk-or-`)

### Krok 3: Doładuj konto

1. Przejdź do **"Credits"**
2. Dodaj środki (minimum $5)

### Krok 4: Ustaw zmienną w .env.local

```env
OPENROUTER_API_KEY=sk-or-v1-xxx
```

---

## Adresy po instalacji

| Usługa | URL |
|--------|-----|
| **TimeTracker** | http://localhost:5666 |
| ActivityWatch | http://localhost:5600 |

---

## Funkcje

- **Automatyczne zbieranie aktywności** - wszystkie aplikacje, przeglądarki, terminal
- **Wykrywanie spotkań** - Google Meet, Zoom, Teams, Slack Huddle
- **Grupowanie aktywności** - po projekcie, aplikacji, spotkaniu
- **Agregacja wielu aktywności** - połącz kilka w jeden worklog
- **Sugestie AI** - LLM sugeruje odpowiedni task na podstawie aktywności
- **Historia** - uczy się na podstawie poprzednich logowań
- **Uniwersalne** - działa na macOS, Windows, Linux

---

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

---

## Struktura projektu

```
ai-timetracker/
├── activitywatch/          # Konfiguracja ActivityWatch
│   ├── config/             # Pliki konfiguracyjne
│   └── scripts/            # Skrypty pomocnicze
├── apps/
│   └── web/                # Aplikacja Next.js
│       ├── src/app/        # Strony i API
│       ├── src/components/ # Komponenty UI
│       └── src/lib/        # Logika biznesowa
├── packages/
│   ├── ai/                 # Logika AI/LLM
│   └── shared/             # Współdzielony kod
├── install.sh              # Instalator macOS/Linux
├── install.ps1             # Instalator Windows
└── .env.example            # Przykładowa konfiguracja
```

---

## Rozwiązywanie problemów

### ActivityWatch nie zbiera danych

**macOS:**
```bash
# Sprawdź status
curl http://localhost:5600/api/0/buckets/

# Sprawdź uprawnienia
# System Preferences → Privacy & Security → Accessibility
# Dodaj ActivityWatch do listy
```

**Windows:**
```powershell
# Sprawdź czy ActivityWatch działa
Get-Process | Where-Object {$_.Name -like "*activitywatch*"}

# Uruchom ręcznie
Start-Process "$env:LOCALAPPDATA\Programs\activitywatch\aw-qt.exe"
```

### TimeTracker nie startuje

```bash
# Sprawdź czy port 3000 jest wolny
# macOS/Linux:
lsof -i :3000

# Windows:
netstat -ano | findstr :3000

# Sprawdź logi
pnpm dev
```

---

## Rozwój

```bash
# Uruchom dev server
pnpm dev

# Build
pnpm build

# Start produkcyjny
pnpm start

# Linting
pnpm lint
```

---

## Deployment (PM2)

```bash
# Build
pnpm build

# Uruchom przez PM2
pm2 start ecosystem.config.js

# Zapisz konfigurację
pm2 save
```

---

## Licencja

MIT
