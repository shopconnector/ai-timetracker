# AI TimeTracker

**Inteligentny system logowania czasu pracy — Jira + Tempo + ActivityWatch + AI (Gemini)**

## Download (Windows 11)

**[⬇ Pobierz TimeTracker-Setup-x64.exe](releases/TimeTracker-Setup-x64.exe)** — Installer Windows (~55MB, Node.js wbudowany)

---

```
ActivityWatch ──> TimeTracker ──> Tempo/Jira
 (monitoring)      (web UI)       (worklogs)
```

**Live demo:** https://ai.beecommerce.pl/timetracker

---

## Co to robi?

AI TimeTracker automatyzuje logowanie czasu pracy do Tempo/Jira:

1. **ActivityWatch** zbiera dane o aktywnosciach (jakie okna, aplikacje, jak dlugo)
2. **TimeTracker** wyswietla je w czytelnej tabeli i **AI dopasowuje tickety Jira**
3. Jednym kliknieciem logujesz caly dzien do **Tempo**

### Kluczowe funkcje

| Funkcja                | Opis                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **AI Daily Logger**    | Wklej surowe notatki z dnia — AI parsuje na tabelke z dopasowanymi ticketami Jira. Edytuj i zaloguj jednym kliknieciem. |
| **AI Ticket Matching** | Automatyczne dopasowanie aktywnosci do ticketow Jira (Gemini / OpenRouter)                                              |
| **Timesheet**          | Tygodniowy widok worklogow z edycja, drag & drop, hurtowym przypisywaniem                                               |
| **Moje Zadania**       | Pelna lista zadan Jira z filtrami, sortowaniem, notatkami, Readiness Criteria                                           |
| **Kalendarz**          | Tygodniowy widok worklogow + Google Calendar + Jira sprint events                                                       |
| **Analityka**          | Wykresy: czas per projekt, per dzien, per typ aktywnosci, trendy                                                        |
| **Porownanie**         | Zestawienie: czas ActivityWatch vs zalogowany w Tempo (diff per dzien)                                                  |
| **KAGANIEC**           | Automatyczna blokada logowania do Stories/Epics — wymusza subtaski                                                      |
| **Readiness Criteria** | Parsowanie oceny RC z komentarzy Jira (Automation for Jira)                                                             |
| **Rules Engine**       | Reguly automatycznego dopasowywania ticketow (bez AI)                                                                   |
| **Electron**           | Desktopowa aplikacja Windows z wbudowanym Node.js                                                                       |

---

## Architektura

```
ai-timetracker/
├── apps/
│   └── web/                         # Next.js 16 (React 19, Tailwind 4)
│       ├── src/
│       │   ├── app/                  # Pages + API routes
│       │   │   ├── page.tsx          # Dashboard
│       │   │   ├── timesheet/        # Tygodniowy timesheet
│       │   │   ├── my-issues/        # Zadania Jira + Daily Logger
│       │   │   ├── calendar/         # Widok kalendarza
│       │   │   ├── analytics/        # Wykresy i statystyki
│       │   │   ├── compare/          # AW vs Tempo porownanie
│       │   │   ├── tasks/            # Zarzadzanie taskami
│       │   │   ├── connections/      # Status polaczen API
│       │   │   ├── settings/         # Konfiguracja + Rules Engine
│       │   │   └── api/
│       │   │       ├── jira/         # Proxy do Jira REST API
│       │   │       ├── tempo/        # Proxy do Tempo REST API
│       │   │       ├── llm/          # AI endpoints (Gemini/OpenRouter)
│       │   │       │   ├── parse-daily/    # Parsowanie notatek dnia
│       │   │       │   ├── suggest/        # Sugestia ticketa
│       │   │       │   └── suggest-worklog/# Sugestia workloga
│       │   │       ├── activities/   # ActivityWatch integration
│       │   │       ├── dashboard/    # Dashboard aggregation
│       │   │       ├── analytics/    # Analytics data
│       │   │       └── settings/     # Settings + API tests
│       │   ├── components/
│       │   │   ├── ui/               # shadcn/ui (21 komponentow)
│       │   │   ├── WorklogFormDialog  # Formularz workloga
│       │   │   ├── TimesheetTable     # Tabela timesheet
│       │   │   └── ...
│       │   └── lib/
│       │       ├── gemini.ts         # Natywny klient Google Gemini API
│       │       ├── openrouter.ts     # OpenRouter LLM client (fallback)
│       │       ├── ai-config.ts      # Konfiguracja AI (modele, provider)
│       │       ├── jira.ts           # Jira REST API client
│       │       ├── tempo.ts          # Tempo REST API client
│       │       ├── activitywatch.ts  # ActivityWatch API client
│       │       ├── readiness.ts      # Parser Readiness Criteria
│       │       ├── rules-engine.ts   # Silnik regul dopasowywania
│       │       ├── suggestion-service.ts  # Unified AI suggestion pipeline
│       │       └── ...
│       └── .env.local                # Konfiguracja (tokeny API)
├── packages/
│   ├── shared/                       # Wspolne typy i narzedzia
│   └── ai/                           # Pakiet AI utilities
├── electron/                         # Electron wrapper (Windows desktop)
├── scripts/windows/                  # Build scripts dla instalatora
└── turbo.json                        # Turborepo config
```

### Stack technologiczny

| Warstwa  | Technologia                                        |
| -------- | -------------------------------------------------- |
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui    |
| Backend  | Next.js API Routes (server-side)                   |
| AI/LLM   | Google Gemini API (natywny), OpenRouter (fallback) |
| Monorepo | Turborepo + pnpm workspaces                        |
| Testy    | Vitest + Testing Library                           |
| Linting  | ESLint + Prettier + Husky + lint-staged            |
| Desktop  | Electron (Windows)                                 |
| Build    | Standalone output (deploy bez node_modules)        |

---

## Szybki start

### Wymagania

- **Node.js** >= 20
- **pnpm** >= 9
- **ActivityWatch** (opcjonalne — do monitorowania aktywnosci)

### Instalacja

```bash
# 1. Klonuj repo
git clone https://github.com/shopconnector/ai-timetracker.git
cd ai-timetracker

# 2. Skopiuj konfiguracje
cp .env.example apps/web/.env.local

# 3. Uzupelnij tokeny w apps/web/.env.local (instrukcje nizej)

# 4. Zainstaluj zaleznosi
pnpm install

# 5. Uruchom
pnpm dev
```

Aplikacja bedzie dostepna na: **http://localhost:5666/timetracker**

### Tokeny API

#### Jira API (wymagane)

1. Wejdz: https://id.atlassian.com/manage-profile/security/api-tokens
2. **Create API token** > nazwij "TimeTracker"
3. Skopiuj do `JIRA_API_KEY=` w `.env.local`

#### Tempo API (wymagane)

1. Jira > Apps > Tempo > Settings > API Integration
2. **New Token** > uprawnienia: Worklogs (View, Create, Edit)
3. Skopiuj do `TEMPO_API_TOKEN=` w `.env.local`

#### Gemini API (zalecane — darmowe)

1. Wejdz: https://aistudio.google.com/apikey
2. **Create API key**
3. Skopiuj do `GEMINI_API_KEY=` w `.env.local`

> Gemini 2.5 Flash jest darmowy i wystarczajaco szybki. Bez klucza AI sugestie nie beda dzialac, ale reszta aplikacji tak (regex fallback).

#### OpenRouter (opcjonalne — fallback)

1. Wejdz: https://openrouter.ai/keys
2. Skopiuj do `OPENROUTER_API_KEY=` w `.env.local`

---

## Konfiguracja (.env.local)

```env
# Tempo API (wymagane)
TEMPO_API_TOKEN=twoj_token

# Jira API (wymagane)
JIRA_BASE_URL=https://twoja-firma.atlassian.net
JIRA_SERVICE_EMAIL=twoj.email@firma.com
JIRA_API_KEY=twoj_token

# Gemini API (zalecane — darmowe)
GEMINI_API_KEY=twoj_klucz_gemini
# GEMINI_MODEL=gemini-2.5-flash  # opcjonalnie

# ActivityWatch (opcjonalne)
ACTIVITYWATCH_URL=http://localhost:5600

# OpenRouter (opcjonalne — fallback)
OPENROUTER_API_KEY=
```

---

## AI Daily Logger

Glowna nowa funkcja — zamiast recznego logowania kazdego workloga osobno:

1. **Wklej surowe notatki** z dnia pracy:

   ```
   09:30-10:30 research Mike n8n workflow
   11:00-11:30 call Natalia claude setup
   11:30-12:30 call z Piotkiem headlamp k8s
   13:00-14:00 dofinansowanie unijne
   14:00-15:00 Mike prompty linkedin
   ```

2. **AI parsuje** na strukturalna tabelke:
   - Czas (edytowalny)
   - Opis (edytowalny)
   - Ticket Jira (dropdown z wszystkich zadan)
   - Kategoria (meeting/dev/research/comm/infra)
   - Czas trwania (edytowalny)

3. **Edytuj** co trzeba — zmien ticket, skoryguj czas

4. **Zaloguj jednym kliknieciem** — wszystkie zaznaczone wpisy do Tempo

### Fallback bez AI

Bez klucza Gemini/OpenRouter dziala **regex parser**:

- Rozpoznaje wzorce `HH:MM-HH:MM`
- Dopasowuje tickety po slowach kluczowych
- Wykrywa kategorie (meeting/dev/research)

---

## AI Pipeline

Kazde wywolanie AI probuje providerow w kolejnosci:

```
1. Gemini API (GEMINI_API_KEY) — natywne Google AI, darmowy tier
   ↓ jesli blad
2. OpenRouter (OPENROUTER_API_KEY) — Claude, GPT-4, Llama, etc.
   ↓ jesli blad
3. Regex / keyword fallback — bez AI
```

### Dostepne modele Gemini

| Model              | Cena            | Szybkosc | Jakosc            |
| ------------------ | --------------- | -------- | ----------------- |
| `gemini-2.5-flash` | Darmowy         | Szybki   | Wysoka (domyslny) |
| `gemini-2.5-pro`   | $1.25/1k tokens | Sredni   | Najwyzsza         |
| `gemini-2.0-flash` | Darmowy         | Szybki   | Wysoka            |

Zmiana modelu: Settings > AI/LLM > Model Gemini

---

## Readiness Criteria

Automatyczne parsowanie oceny "Readiness Criteria" z komentarzy Jira (dodawane przez Automation for Jira):

- **4 kolorowe kropki** w tabeli zadan (Completeness, Clarity, Auditability, Estimated)
- **Pelna karta** w rozwinietym wierszu z sugestiami
- **Stat card** — ile zadan ma pelne RC (4/4 zielone)

Format rozpoznawany w komentarzach:

```
Completeness 🟢
Clarity 🟡
Auditability 🔴
Estimated 🟢
```

---

## KAGANIEC

Automatyczna blokada logowania czasu do nieodpowiednich typow zadan:

- **Story** — zablokowane (loguj do subtaskow)
- **Epic** — zablokowane
- **Task z subtaskami** — zablokowane (loguj do subtaska)

Przy probie zalogowania do zablokowanego ticketa: komunikat bledu z lista dostepnych subtaskow.

---

## Strony aplikacji

| Strona       | URL               | Opis                                                   |
| ------------ | ----------------- | ------------------------------------------------------ |
| Dashboard    | `/`               | Podsumowanie dnia: godziny, aktywnosci, worklogi       |
| Timesheet    | `/timesheet`      | Tygodniowy timesheet z ActivityWatch + Tempo           |
| Moje Zadania | `/my-issues`      | Lista Jira + Daily Logger + Readiness Criteria         |
| Kalendarz    | `/calendar`       | Tygodniowy widok: worklogi + Google Calendar + sprinty |
| Analityka    | `/analytics`      | Wykresy: czas per projekt, trendy, kategorie           |
| Porownanie   | `/compare`        | ActivityWatch vs Tempo (ile brakuje do zalogowania)    |
| Taski        | `/tasks`          | Szybkie zarzadzanie taskami z historii                 |
| Polaczenia   | `/connections`    | Status API: Jira, Tempo, ActivityWatch, AI             |
| Ustawienia   | `/settings`       | Tokeny, modele AI, cele czasowe, mapowania             |
| Reguly       | `/settings/rules` | Rules Engine — reguly dopasowywania bez AI             |

---

## API Endpoints

| Endpoint                       | Metoda       | Opis                              |
| ------------------------------ | ------------ | --------------------------------- |
| `/api/jira/my-issues`          | GET          | Pobierz przypisane zadania z Jira |
| `/api/jira/issues`             | GET          | Wyszukaj zadania                  |
| `/api/jira/projects`           | GET          | Lista projektow Jira              |
| `/api/tempo/worklogs`          | GET/POST     | Pobierz/utworz worklogi           |
| `/api/tempo/worklogs/[id]`     | PUT/DELETE   | Edytuj/usun worklog               |
| `/api/tempo/worklogs-by-issue` | GET          | Worklogi pogrupowane per issue    |
| `/api/tempo/check-overlap`     | POST         | Sprawdz overlap worklogow         |
| `/api/tempo/attributes`        | GET          | Atrybuty Tempo (action types)     |
| `/api/llm/parse-daily`         | POST         | AI parsowanie notatek dnia        |
| `/api/llm/suggest`             | POST         | AI sugestia ticketa               |
| `/api/llm/suggest-worklog`     | POST         | AI sugestia workloga              |
| `/api/activities`              | GET          | Aktywnosci z ActivityWatch        |
| `/api/dashboard`               | GET          | Dane dashboardu                   |
| `/api/analytics`               | GET          | Dane analityczne                  |
| `/api/status`                  | GET          | Status polaczen API               |
| `/api/settings`                | GET/PUT/POST | Konfiguracja + testy polaczen     |

---

## Komendy

```bash
# Development
pnpm dev              # Uruchom dev server (port 5666)
pnpm build            # Build produkcyjny
pnpm start            # Uruchom produkcyjnie

# Quality
pnpm lint             # Sprawdz ESLint
pnpm lint:fix         # Napraw automatycznie
pnpm format           # Formatuj Prettier
pnpm type-check       # Sprawdz typy TypeScript
pnpm test             # Uruchom testy Vitest
pnpm test:coverage    # Testy z pokryciem

# Maintenance
pnpm clean            # Wyczysc build artifacts i node_modules

# Windows
pnpm build:electron   # Build Electron app
```

---

## Instalacja per system

<details>
<summary><strong>Windows (instalator EXE)</strong></summary>

1. Zainstaluj [ActivityWatch](https://github.com/ActivityWatch/activitywatch/releases)
2. Pobierz [TimeTracker-Setup-x64.exe](https://github.com/shopconnector/ai-timetracker/releases/latest)
3. Uruchom instalator — Node.js jest wbudowany
4. Kliknij "AI TimeTracker" w menu Start

</details>

<details>
<summary><strong>macOS</strong></summary>

```bash
brew install node
npm install -g pnpm
brew install --cask activitywatch

git clone https://github.com/shopconnector/ai-timetracker.git
cd ai-timetracker
cp .env.example apps/web/.env.local
# Uzupelnij tokeny
pnpm install && pnpm dev
```

**Uprawnienia:** System Settings > Privacy > Accessibility — dodaj ActivityWatch.

</details>

<details>
<summary><strong>Linux (Ubuntu/Debian)</strong></summary>

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
npm install -g pnpm
sudo snap install activitywatch

git clone https://github.com/shopconnector/ai-timetracker.git
cd ai-timetracker
cp .env.example apps/web/.env.local
# Uzupelnij tokeny
pnpm install && pnpm dev
```

</details>

<details>
<summary><strong>Docker</strong></summary>

```bash
git clone https://github.com/shopconnector/ai-timetracker.git
cd ai-timetracker
cp .env.example apps/web/.env.local
# Uzupelnij tokeny
docker build -t timetracker .
docker run -d -p 5666:5666 --env-file apps/web/.env.local timetracker
```

</details>

---

## Adresy

| Usluga        | URL                               |
| ------------- | --------------------------------- |
| TimeTracker   | http://localhost:5666/timetracker |
| ActivityWatch | http://localhost:5600             |

---

## Troubleshooting

| Problem                    | Rozwiazanie                                                                    |
| -------------------------- | ------------------------------------------------------------------------------ |
| AI nie sugeruje ticketow   | Sprawdz `GEMINI_API_KEY` w `.env.local`. Bez klucza dziala regex fallback.     |
| ActivityWatch brak danych  | macOS: System Settings > Privacy > Accessibility. Windows: uruchom jako admin. |
| Port 5666 zajety           | `lsof -i :5666` (mac/linux) lub `netstat -ano \| findstr :5666` (windows)      |
| KAGANIEC blokuje logowanie | Loguj do subtaskow zamiast do Story/Epic.                                      |
| Gemini quota exceeded      | Darmowy tier ma limit. Zmien model na `gemini-2.5-pro` lub uzyj OpenRouter.    |
| Build sie nie buduje       | `pnpm clean && pnpm install && pnpm build`                                     |

---

## Licencja

MIT

---

<p align="center">
  <strong>Powered by <a href="https://beecommerce.pl">beecommerce.pl</a></strong>
</p>
