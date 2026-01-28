# AI TimeTracker

**Automatyczny system logowania czasu pracy z ActivityWatch do Tempo/Jira z wsparciem AI**

```
ActivityWatch  ───▶  TimeTracker  ───▶  Tempo/Jira
 (monitoring)         (web UI)          (worklogs)
```

**Live demo:** https://ai.beecommerce.pl/timetracker

---

# INSTALACJA NA WINDOWS (krok po kroku)

## ZANIM ZACZNIESZ - PRZECZYTAJ!

**JAK TO DZIAŁA:**
1. **ActivityWatch** - program który działa w tle i zapisuje co robisz na komputerze
2. **TimeTracker** - strona internetowa która CZYTA dane z ActivityWatch i pozwala je zalogować do Jira

**BEZ ActivityWatch TimeTracker NIE BĘDZIE DZIAŁAĆ!**

TimeTracker łączy się z ActivityWatch przez adres `http://localhost:5600`.
Jeśli ActivityWatch nie działa, TimeTracker nie będzie miał żadnych danych.

---

## ETAP 1: INSTALACJA NARZĘDZI

### WAŻNE ZASADY:
- Wykonuj komendy **POJEDYNCZO** - nie kopiuj wielu naraz!
- Po każdej instalacji **ZAMKNIJ PowerShell** i **OTWÓRZ NOWE OKNO**!
- Bez tego system nie zobaczy nowych programów!

---

### Krok 1.1: Zainstaluj Git

Otwórz PowerShell i wpisz:

```powershell
winget install Git.Git
```

Poczekaj na zakończenie.

**ZAMKNIJ PowerShell. Otwórz NOWE okno PowerShell.**

Sprawdź czy działa:
```powershell
git --version
```
Powinno pokazać: `git version 2.xx.x`

---

### Krok 1.2: Zainstaluj Node.js

```powershell
winget install OpenJS.NodeJS.LTS
```

Poczekaj na zakończenie.

**ZAMKNIJ PowerShell. Otwórz NOWE okno PowerShell.**

Sprawdź czy działa:
```powershell
node --version
```
Powinno pokazać: `v20.xx.x` lub wyżej

---

### Krok 1.3: Zainstaluj pnpm

```powershell
iwr https://get.pnpm.io/install.ps1 -useb | iex
```

**ZAMKNIJ PowerShell. Otwórz NOWE okno PowerShell.**

Sprawdź czy działa:
```powershell
pnpm --version
```
Powinno pokazać: `10.xx.x` lub wyżej

---

### Krok 1.4: Zainstaluj ActivityWatch

**TO JEST NAJWAŻNIEJSZY KROK!**

1. Otwórz przeglądarkę: https://activitywatch.net/downloads/
2. Kliknij przycisk **Download for Windows**
3. Uruchom pobrany plik `.exe`
4. Klikaj **Dalej** do końca instalacji
5. Po instalacji ActivityWatch **URUCHOMI SIĘ AUTOMATYCZNIE**
6. Ikona ActivityWatch pojawi się przy zegarku (w zasobniku systemowym)

**SPRAWDŹ CZY DZIAŁA:**

Otwórz przeglądarkę i wejdź na: **http://localhost:5600**

Powinieneś zobaczyć dashboard ActivityWatch z listą aktywności.

**JEŚLI STRONA SIĘ NIE OTWIERA:**
- Kliknij ikonę ActivityWatch przy zegarku
- Wybierz "Open Dashboard"
- Jeśli ikony nie ma, uruchom ActivityWatch z menu Start

---

## ETAP 2: POBIERANIE TIMETRACKER

### Krok 2.1: Przejdź do folderu Dokumenty

```powershell
cd ~\Documents
```

### Krok 2.2: Pobierz TimeTracker

```powershell
git clone https://github.com/shopconnector/ai-timetracker.git
```

### Krok 2.3: Wejdź do folderu

```powershell
cd ai-timetracker
```

### Krok 2.4: Zainstaluj zależności

```powershell
pnpm install
```

Poczekaj - to może potrwać kilka minut!

---

## ETAP 3: KONFIGURACJA

### Krok 3.1: Skopiuj plik konfiguracyjny

```powershell
Copy-Item .env.example -Destination apps\web\.env.local
```

### Krok 3.2: Otwórz plik w Notatniku

```powershell
notepad apps\web\.env.local
```

### Krok 3.3: Uzupełnij dane

Plik powinien wyglądać tak:

```
# ACTIVITYWATCH - NIE ZMIENIAJ TEJ LINII!
ACTIVITYWATCH_URL=http://localhost:5600

# TEMPO API
TEMPO_API_TOKEN=tutaj_wklej_token_tempo

# JIRA API
JIRA_BASE_URL=https://twoja-firma.atlassian.net
JIRA_SERVICE_EMAIL=twoj.email@firma.com
JIRA_API_KEY=tutaj_wklej_token_jira

# OPENROUTER (opcjonalne - dla AI)
OPENROUTER_API_KEY=
```

**WAŻNE:**
- Linia `ACTIVITYWATCH_URL=http://localhost:5600` MUSI zostać bez zmian!
- To mówi TimeTrackerowi gdzie szukać danych z ActivityWatch!

Zapisz plik: **Ctrl+S** i zamknij Notatnik.

---

## ETAP 4: URUCHOMIENIE

### PRZED URUCHOMIENIEM - SPRAWDŹ!

1. Czy ActivityWatch działa? Sprawdź: **http://localhost:5600**
2. Czy widzisz tam jakieś aktywności?

**Jeśli localhost:5600 nie działa, TimeTracker też nie zadziała!**

---

### Opcja A: Uruchomienie ręczne (najprostsze)

```powershell
pnpm dev
```

Otwórz przeglądarkę: **http://localhost:5666**

**UWAGA:** NIE ZAMYKAJ okna PowerShell! Zminimalizuj je.
Zamknięcie = zatrzymanie aplikacji.

---

### Opcja B: Uruchomienie jednym kliknięciem

1. Otwórz folder: `C:\Users\TWOJA_NAZWA\Documents\ai-timetracker`
2. Kliknij dwukrotnie na **`start-timetracker.bat`**

Skrypt automatycznie:
- Sprawdzi czy ActivityWatch działa
- Uruchomi go jeśli nie działa
- Uruchomi TimeTracker
- Otworzy przeglądarkę

---

### Opcja C: Uruchomienie jako usługa w tle (zalecane)

Dzięki temu możesz zamknąć PowerShell a aplikacja będzie działać!

**Krok 1:** Zainstaluj pm2
```powershell
npm install -g pm2
```

**Krok 2:** Wejdź do folderu (jeśli nie jesteś)
```powershell
cd ~\Documents\ai-timetracker
```

**Krok 3:** Uruchom jako usługę
```powershell
pm2 start "pnpm dev" --name timetracker
```

**Krok 4:** Zapisz konfigurację
```powershell
pm2 save
```

Teraz możesz zamknąć PowerShell!

Otwórz: **http://localhost:5666**

**Zarządzanie usługą:**
```powershell
pm2 status              # sprawdź status
pm2 logs timetracker    # zobacz logi
pm2 stop timetracker    # zatrzymaj
pm2 restart timetracker # restart
pm2 delete timetracker  # usuń usługę
```

---

## ETAP 5: AUTOSTART (opcjonalnie)

Aby TimeTracker uruchamiał się automatycznie po włączeniu komputera:

1. Naciśnij **Win + R**
2. Wpisz `shell:startup` i naciśnij Enter
3. Kliknij prawym przyciskiem → **Nowy** → **Skrót**
4. W polu lokalizacji wpisz:
   ```
   C:\Users\TWOJA_NAZWA\Documents\ai-timetracker\start-timetracker.bat
   ```
   (zamień TWOJA_NAZWA na swoją nazwę użytkownika Windows)
5. Kliknij **Dalej**, nazwij skrót "AI TimeTracker", kliknij **Zakończ**

---

## SPRAWDZENIE CZY WSZYSTKO DZIAŁA

### Test 1: ActivityWatch
- Otwórz: http://localhost:5600
- Powinieneś widzieć dashboard z aktywnościami

### Test 2: TimeTracker
- Otwórz: http://localhost:5666
- Powinieneś widzieć stronę TimeTracker
- W zakładce "Timesheet" powinny być widoczne aktywności z ActivityWatch

### Jeśli TimeTracker nie widzi aktywności:
1. Czy ActivityWatch na pewno działa? (http://localhost:5600)
2. Czy plik `apps\web\.env.local` zawiera linię `ACTIVITYWATCH_URL=http://localhost:5600`?
3. Czy używasz tej samej przeglądarki co ActivityWatch?

---

## ROZWIĄZYWANIE PROBLEMÓW

| Problem | Rozwiązanie |
|---------|-------------|
| `git` / `pnpm` / `node` nie rozpoznane | Zamknij PowerShell i otwórz NOWE okno |
| ActivityWatch nie zbiera danych | Uruchom go ręcznie z menu Start |
| TimeTracker nie widzi aktywności | Sprawdź czy ActivityWatch działa (localhost:5600) |
| Strona nie otwiera po zamknięciu PowerShell | Użyj pm2 (Opcja C powyżej) |
| Port 5666 zajęty | Uruchom: `netstat -ano \| findstr :5666` |
| Błąd przy kopiowaniu pliku | Użyj: `Copy-Item .env.example -Destination apps\web\.env.local` |

---

## JAK POŁĄCZYĆ Z JIRA/TEMPO

### Token Jira

1. Wejdź: https://id.atlassian.com/manage-profile/security/api-tokens
2. Kliknij **Create API token**
3. Wpisz nazwę np. "TimeTracker"
4. Skopiuj token (wyświetli się tylko raz!)
5. Wklej do `apps\web\.env.local` w linii `JIRA_API_KEY=`

### Token Tempo

1. Otwórz Jira → Apps → Tempo
2. Ustawienia (koło zębate) → API Integration → API Tokens
3. Kliknij **New Token**
4. Nazwij np. "TimeTracker"
5. Uprawnienia: Worklogs (View, Create, Edit)
6. Skopiuj token i wklej do `TEMPO_API_TOKEN=`

---

## ADRESY

| Co | Adres |
|----|-------|
| **TimeTracker** | http://localhost:5666 |
| **ActivityWatch** | http://localhost:5600 |

---

# INSTALACJA NA macOS

```bash
# 1. Zainstaluj Homebrew (jeśli nie masz)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Zainstaluj Node.js i pnpm
brew install node
npm install -g pnpm

# 3. Zainstaluj ActivityWatch
brew install --cask activitywatch

# 4. Skonfiguruj uprawnienia
# System Preferences → Privacy & Security → Accessibility → dodaj ActivityWatch

# 5. Uruchom ActivityWatch
open -a ActivityWatch

# 6. Sklonuj i uruchom
git clone https://github.com/shopconnector/ai-timetracker.git
cd ai-timetracker
pnpm install
cp .env.example apps/web/.env.local
# Edytuj apps/web/.env.local
pnpm dev
```

Lub szybka instalacja:
```bash
curl -sSL https://raw.githubusercontent.com/shopconnector/ai-timetracker/main/install.sh | bash
```

---

## Struktura projektu

```
ai-timetracker/
├── apps/
│   └── web/                # Aplikacja Next.js
│       ├── src/app/        # Strony i API
│       ├── src/components/ # Komponenty UI
│       ├── src/lib/        # Logika (w tym activitywatch.ts!)
│       └── .env.local      # KONFIGURACJA - TUTAJ WPISZ TOKENY
├── packages/
│   ├── ai/                 # Logika AI/LLM
│   └── shared/             # Współdzielony kod
├── start-timetracker.bat   # Uruchamiacz Windows
├── install-service.bat     # Instalator usługi PM2
├── install.sh              # Instalator macOS/Linux
└── .env.example            # Szablon konfiguracji
```

---

## Licencja

MIT
