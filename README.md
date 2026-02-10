# AI TimeTracker

**Automatyczny system logowania czasu pracy z ActivityWatch do Tempo/Jira z wsparciem AI**

```
ActivityWatch  ───▶  TimeTracker  ───▶  Tempo/Jira
 (monitoring)         (web UI)          (worklogs)
```

**Live demo:** https://ai.beecommerce.pl/timetracker

---

# 🚀 SZYBKA INSTALACJA (Windows)

## Opcja 1: Instalator (Zalecane)

1. **Pobierz instalator:** [TimeTracker-Setup-x64.exe](https://github.com/shopconnector/ai-timetracker/releases/latest)
2. **Uruchom instalator** - bez dodatkowych wymagań (Node.js jest wbudowany)
3. **Kliknij skrót "AI TimeTracker"** w menu Start

> ⚠️ **Wymagane:** Zainstaluj [ActivityWatch](https://activitywatch.net/downloads/) przed pierwszym uruchomieniem

## Opcja 2: Portable (bez instalacji)

1. Pobierz `TimeTracker-*-portable-x64.zip` z [Releases](https://github.com/shopconnector/ai-timetracker/releases/latest)
2. Wypakuj do dowolnego folderu
3. Uruchom `TimeTracker.bat`

## Opcja 3: Z kodu źródłowego (dla developerów)

Patrz: [Instalacja z kodu źródłowego](#instalacja-na-windows) poniżej

---

# JAK TO DZIAŁA

```
┌─────────────────────┐        HTTP API         ┌─────────────────────┐
│   ActivityWatch     │ ◄──────────────────────►│    TimeTracker      │
│  (localhost:5600)   │   GET /api/0/buckets/   │  (localhost:5666)   │
│                     │   GET /api/0/events     │                     │
│  Zbiera dane o      │                         │  Wyświetla dane     │
│  aktywnościach      │                         │  i loguje do Jira   │
│  (działa w tle)     │                         │  (strona www)       │
└─────────────────────┘                         └─────────────────────┘
```

**WAŻNE:**
- **ActivityWatch** = program który działa w tle i zapisuje co robisz
- **TimeTracker** = strona www która CZYTA dane z ActivityWatch przez API
- **BEZ ActivityWatch TimeTracker NIE BĘDZIE DZIAŁAĆ!**
- TimeTracker łączy się z ActivityWatch przez `http://localhost:5600`

---

# GDZIE ACTIVITYWATCH PRZECHOWUJE DANE

| System | Lokalizacja bazy danych |
|--------|------------------------|
| **Windows** | `C:\Users\NAZWA\AppData\Local\activitywatch\aw-server\peewee-sqlite.v2.db` |
| **macOS** | `~/Library/Application Support/activitywatch/aw-server/peewee-sqlite.v2.db` |
| **Linux** | `~/.local/share/activitywatch/aw-server/peewee-sqlite.v2.db` |

**Dane NIE giną po restarcie!** ActivityWatch przechowuje całą historię.

---

# INSTALACJA NA WINDOWS (z kodu źródłowego)

## ETAP 1: INSTALACJA NARZĘDZI

### WAŻNE ZASADY:
- Wykonuj komendy **POJEDYNCZO** - nie kopiuj wielu naraz!
- Po każdej instalacji **ZAMKNIJ PowerShell** i **OTWÓRZ NOWE OKNO**!

---

### Krok 1.1: Zainstaluj Git

Otwórz PowerShell i wpisz:

```powershell
winget install Git.Git
```

**ZAMKNIJ PowerShell. Otwórz NOWE okno.**

Sprawdź: `git --version` → powinno pokazać `git version 2.xx.x`

---

### Krok 1.2: Zainstaluj Node.js

```powershell
winget install OpenJS.NodeJS.LTS
```

**ZAMKNIJ PowerShell. Otwórz NOWE okno.**

Sprawdź: `node --version` → powinno pokazać `v20.xx.x` lub wyżej

---

### Krok 1.3: Zainstaluj pnpm

```powershell
iwr https://get.pnpm.io/install.ps1 -useb | iex
```

**ZAMKNIJ PowerShell. Otwórz NOWE okno.**

Sprawdź: `pnpm --version` → powinno pokazać `10.xx.x` lub wyżej

---

### Krok 1.4: Zainstaluj ActivityWatch

1. Otwórz: https://activitywatch.net/downloads/
2. Kliknij **Download for Windows**
3. Uruchom pobrany plik `.exe`
4. Po instalacji ActivityWatch uruchomi się automatycznie
5. Ikona pojawi się przy zegarku (zasobnik systemowy)

**SPRAWDŹ:** Otwórz http://localhost:5600 - powinieneś widzieć dashboard

---

## ETAP 2: POBIERANIE TIMETRACKER

```powershell
cd ~\Documents
git clone https://github.com/shopconnector/ai-timetracker.git
cd ai-timetracker
pnpm install
```

---

## ETAP 3: KONFIGURACJA

```powershell
Copy-Item .env.example -Destination apps\web\.env.local
notepad apps\web\.env.local
```

Uzupełnij dane (ACTIVITYWATCH_URL zostaw bez zmian!):

```
ACTIVITYWATCH_URL=http://localhost:5600
TEMPO_API_TOKEN=twoj_token
JIRA_BASE_URL=https://twoja-firma.atlassian.net
JIRA_SERVICE_EMAIL=twoj.email@firma.com
JIRA_API_KEY=twoj_token
```

---

## ETAP 4: URUCHOMIENIE

### Opcja A: Ręcznie
```powershell
pnpm dev
```
Otwórz: http://localhost:5666

### Opcja B: Jednym kliknięciem
Kliknij dwukrotnie `start-timetracker.bat`

### Opcja C: Jako usługa w tle (pm2)
```powershell
npm install -g pm2
pm2 start "pnpm dev" --name timetracker
pm2 save
```

---

## ETAP 5: AUTOSTART

1. `Win + R` → wpisz `shell:startup` → Enter
2. Utwórz skrót do `start-timetracker.bat`

---

# INSTALACJA NA macOS (krok po kroku)

## ETAP 1: INSTALACJA NARZĘDZI

### Krok 1.1: Zainstaluj Homebrew (jeśli nie masz)

Otwórz Terminal i wpisz:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Po instalacji **ZAMKNIJ Terminal i otwórz NOWY**.

Sprawdź: `brew --version` → powinno pokazać `Homebrew x.x.x`

---

### Krok 1.2: Zainstaluj Node.js

```bash
brew install node
```

Sprawdź: `node --version` → powinno pokazać `v20.xx.x` lub wyżej

---

### Krok 1.3: Zainstaluj pnpm

```bash
npm install -g pnpm
```

Sprawdź: `pnpm --version` → powinno pokazać `10.xx.x` lub wyżej

---

### Krok 1.4: Zainstaluj ActivityWatch

```bash
brew install --cask activitywatch
```

**LUB** pobierz z: https://activitywatch.net/downloads/

---

### Krok 1.5: Skonfiguruj uprawnienia ActivityWatch

**TO JEST BARDZO WAŻNE!** Bez tego ActivityWatch nie będzie zbierać danych!

1. Otwórz **System Preferences** (Ustawienia systemowe)
2. Przejdź do **Privacy & Security** → **Accessibility**
3. Kliknij kłódkę, aby odblokować
4. Dodaj **ActivityWatch** do listy i zaznacz checkbox
5. Powtórz dla **Screen Recording** (opcjonalnie, dla tytułów okien)

---

### Krok 1.6: Uruchom ActivityWatch

```bash
open -a ActivityWatch
```

ActivityWatch pojawi się w pasku menu (góra ekranu).

**SPRAWDŹ:** Otwórz http://localhost:5600 - powinieneś widzieć dashboard

---

## ETAP 2: POBIERANIE TIMETRACKER

```bash
cd ~/Documents
git clone https://github.com/shopconnector/ai-timetracker.git
cd ai-timetracker
pnpm install
```

---

## ETAP 3: KONFIGURACJA

```bash
cp .env.example apps/web/.env.local
nano apps/web/.env.local
```

Lub otwórz w edytorze tekstowym:
```bash
open -a TextEdit apps/web/.env.local
```

Uzupełnij dane (ACTIVITYWATCH_URL zostaw bez zmian!):

```
ACTIVITYWATCH_URL=http://localhost:5600
TEMPO_API_TOKEN=twoj_token
JIRA_BASE_URL=https://twoja-firma.atlassian.net
JIRA_SERVICE_EMAIL=twoj.email@firma.com
JIRA_API_KEY=twoj_token
```

---

## ETAP 4: URUCHOMIENIE

### Opcja A: Ręcznie
```bash
pnpm dev
```
Otwórz: http://localhost:5666

### Opcja B: Jako usługa w tle (pm2)
```bash
npm install -g pm2
cd ~/Documents/ai-timetracker
pm2 start "pnpm dev" --name timetracker
pm2 save
```

---

## ETAP 5: AUTOSTART

### ActivityWatch
ActivityWatch domyślnie dodaje się do autostartu podczas instalacji.
Jeśli nie, otwórz ActivityWatch → Preferences → "Start on login"

### TimeTracker (z pm2)
```bash
pm2 startup
# Skopiuj i uruchom komendę którą wyświetli pm2
pm2 save
```

---

## ROZWIĄZYWANIE PROBLEMÓW (macOS)

| Problem | Rozwiązanie |
|---------|-------------|
| ActivityWatch nie zbiera danych | Sprawdź uprawnienia w System Preferences → Privacy & Security → Accessibility |
| `brew` nie znaleziony | Zamknij Terminal i otwórz nowy po instalacji Homebrew |
| `pnpm` nie znaleziony | Uruchom `source ~/.zshrc` lub otwórz nowy Terminal |
| Port 5666 zajęty | `lsof -i :5666` aby znaleźć proces |

---

# INSTALACJA NA LINUX (krok po kroku)

## ETAP 1: INSTALACJA NARZĘDZI

### Krok 1.1: Zainstaluj Node.js

**Ubuntu/Debian:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Fedora:**
```bash
sudo dnf install nodejs
```

**Arch Linux:**
```bash
sudo pacman -S nodejs npm
```

Sprawdź: `node --version` → powinno pokazać `v20.xx.x` lub wyżej

---

### Krok 1.2: Zainstaluj pnpm

```bash
npm install -g pnpm
```

Sprawdź: `pnpm --version` → powinno pokazać `10.xx.x` lub wyżej

---

### Krok 1.3: Zainstaluj ActivityWatch

**Metoda 1: Snap (Ubuntu/Debian)**
```bash
sudo snap install activitywatch
```

**Metoda 2: Pobranie ręczne**
1. Pobierz z: https://activitywatch.net/downloads/
2. Rozpakuj archiwum
3. Uruchom `./aw-qt`

**Metoda 3: AUR (Arch Linux)**
```bash
yay -S activitywatch-bin
```

---

### Krok 1.4: Uruchom ActivityWatch

```bash
# Jeśli zainstalowane przez snap:
activitywatch

# Jeśli pobrane ręcznie:
./aw-qt
```

ActivityWatch pojawi się w zasobniku systemowym.

**SPRAWDŹ:** Otwórz http://localhost:5600 - powinieneś widzieć dashboard

---

## ETAP 2: POBIERANIE TIMETRACKER

```bash
cd ~/Documents
git clone https://github.com/shopconnector/ai-timetracker.git
cd ai-timetracker
pnpm install
```

---

## ETAP 3: KONFIGURACJA

```bash
cp .env.example apps/web/.env.local
nano apps/web/.env.local
```

Uzupełnij dane (ACTIVITYWATCH_URL zostaw bez zmian!):

```
ACTIVITYWATCH_URL=http://localhost:5600
TEMPO_API_TOKEN=twoj_token
JIRA_BASE_URL=https://twoja-firma.atlassian.net
JIRA_SERVICE_EMAIL=twoj.email@firma.com
JIRA_API_KEY=twoj_token
```

Zapisz: `Ctrl+O`, `Enter`, `Ctrl+X`

---

## ETAP 4: URUCHOMIENIE

### Opcja A: Ręcznie
```bash
pnpm dev
```
Otwórz: http://localhost:5666

### Opcja B: Jako usługa w tle (pm2)
```bash
npm install -g pm2
cd ~/Documents/ai-timetracker
pm2 start "pnpm dev" --name timetracker
pm2 save
```

---

## ETAP 5: AUTOSTART

### ActivityWatch

**Snap:**
ActivityWatch automatycznie uruchamia się przy logowaniu.

**Ręcznie:**
Dodaj `aw-qt` do autostartu w ustawieniach środowiska graficznego.

**Systemd (zaawansowane):**
```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/activitywatch.service << EOF
[Unit]
Description=ActivityWatch
After=graphical-session.target

[Service]
ExecStart=/path/to/aw-qt
Restart=on-failure

[Install]
WantedBy=default.target
EOF

systemctl --user enable activitywatch
systemctl --user start activitywatch
```

### TimeTracker (z pm2)
```bash
pm2 startup
# Skopiuj i uruchom komendę którą wyświetli pm2
pm2 save
```

---

## ROZWIĄZYWANIE PROBLEMÓW (Linux)

| Problem | Rozwiązanie |
|---------|-------------|
| ActivityWatch nie zbiera danych | Upewnij się że masz zainstalowane xdotool i xprop |
| `snap` nie znaleziony | `sudo apt install snapd` |
| `pnpm` nie znaleziony | Dodaj `export PATH="$HOME/.local/share/pnpm:$PATH"` do `~/.bashrc` |
| Port 5666 zajęty | `lsof -i :5666` lub `fuser 5666/tcp` |

---

# SZYBKA INSTALACJA (jeden skrypt)

### macOS / Linux:
```bash
curl -sSL https://raw.githubusercontent.com/shopconnector/ai-timetracker/main/install.sh | bash
```

### Windows:
Pobierz i uruchom `install.ps1` z repozytorium.

---

# SPRAWDZENIE CZY WSZYSTKO DZIAŁA

### Test 1: ActivityWatch
- Otwórz: http://localhost:5600
- Powinieneś widzieć dashboard z aktywnościami
- Jeśli puste - poczekaj chwilę i odśwież

### Test 2: TimeTracker
- Otwórz: http://localhost:5666
- W zakładce "Timesheet" powinny być widoczne aktywności

### Jeśli TimeTracker nie widzi aktywności:
1. Czy ActivityWatch działa? (http://localhost:5600)
2. Czy plik `.env.local` zawiera `ACTIVITYWATCH_URL=http://localhost:5600`?
3. Czy ActivityWatch ma uprawnienia do zbierania danych?

---

# JAK UZYSKAĆ TOKENY API

### Token Jira
1. Wejdź: https://id.atlassian.com/manage-profile/security/api-tokens
2. **Create API token** → nazwij "TimeTracker"
3. Skopiuj token → wklej do `JIRA_API_KEY=`

### Token Tempo
1. Jira → Apps → Tempo → Settings → API Integration
2. **New Token** → nazwij "TimeTracker"
3. Uprawnienia: Worklogs (View, Create, Edit)
4. Skopiuj token → wklej do `TEMPO_API_TOKEN=`

---

# ADRESY

| Co | Adres |
|----|-------|
| **TimeTracker** | http://localhost:5666 |
| **ActivityWatch** | http://localhost:5600 |

---

# STRUKTURA PROJEKTU

```
ai-timetracker/
├── apps/web/                    # Aplikacja Next.js
│   ├── src/lib/activitywatch.ts # Integracja z ActivityWatch API
│   └── .env.local               # KONFIGURACJA (tokeny)
├── scripts/windows/             # Skrypty budowania paczki Windows
│   ├── build-bundle.ps1         # Buduje bundle z Node.js runtime
│   └── test-bundle.ps1          # Testuje lokalnie bundle
├── installer/                   # Definicja instalatora (Inno Setup)
├── start-timetracker.bat        # Uruchamiacz Windows (wymaga Node.js)
├── install.sh                   # Instalator macOS/Linux
└── .env.example                 # Szablon konfiguracji
```

---

## Licencja

MIT

---

<p align="center">
  <a href="https://beecommerce.pl">
    <img src="data:image/png;base64,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" alt="beecommerce.pl" width="40" height="40" />
  </a>
  <br/>
  <strong>Powered by <a href="https://beecommerce.pl">beecommerce.pl</a></strong>
</p>
