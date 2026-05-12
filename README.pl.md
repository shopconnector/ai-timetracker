# AI TimeTracker

> 🌐 [English](./README.md) · **Polski**

**Inteligentny system śledzenia czasu — Jira + Tempo + ActivityWatch + Slack + AI (Gemini)**

## Pobierz (Windows)

**[Pobierz TimeTracker-Setup-x64.exe](https://github.com/shopconnector/ai-timetracker/releases/latest/download/TimeTracker-Setup-x64.exe)** — instalator Windows (~55 MB, dołączony Node.js)

> Aplikacja sama się aktualizuje. Gdy pojawi się nowa wersja, zobaczysz powiadomienie w Ustawieniach. Jedno kliknięcie i gotowe.

---

```
ActivityWatch + Slack ──> TimeTracker ──> Tempo/Jira
 (monitoring)   (chat)     (web UI)       (worklogi)
```

---

## Co to robi?

AI TimeTracker automatyzuje logowanie czasu do Tempo/Jira:

1. **ActivityWatch** zbiera dane o aktywności (aktywne okna, aplikacje, czas)
2. **TimeTracker** wyświetla aktywności w czytelnej tabeli, a **AI dopasowuje je do ticketów Jira**
3. Loguj cały dzień do **Tempo** jednym kliknięciem

### Najważniejsze funkcje

| Funkcja | Opis |
|---------|------|
| 🌅 **Yesterday** | Streszczenie wczorajszego dnia: commity, AW, Tempo, plany Claude per projekt + AI summary (Gemini) |
| 📅 **Kalendarz tygodniowy** | Widok 7-dniowy: aktywności + worklogi + Slack per dzień |
| 📊 **Analityka** | KPI, trendy, capture rate, top aplikacje, heatmapa, gap analysis |
| 🃏 **Karta czasu** | Loguj 1-klik do Tempo z AI-podpowiedzią ticketu |
| 🧠 **AI matching** | Gemini analizuje aktywność i sugeruje ticket Jira + opis |
| 🌐 **Wielojęzyczność** | Polski / English z przełącznikiem w pasku górnym (LangSwitcher) |
| 🔄 **Auto-update** | Aplikacja aktualizuje się sama (Windows) lub via `git pull` (Linux/macOS) |

---

## Szybki start

### Wymagania

- Node.js 18+ (zalecane 20+)
- pnpm 9+
- Linux/macOS lub Windows
- Konto Atlassian z dostępem do Jira/Tempo (do logowania czasu)
- (Opcjonalnie) ActivityWatch zainstalowany lokalnie — [activitywatch.net](https://activitywatch.net/)

### Instalacja (development)

```bash
# 1. Sklonuj repo
git clone https://github.com/shopconnector/ai-timetracker.git
cd ai-timetracker

# 2. Zainstaluj zależności
pnpm install

# 3. Skopiuj plik .env.local i wypełnij kluczami API
cp apps/web/.env.local.example apps/web/.env.local
# edytuj apps/web/.env.local

# 4. Uruchom dev server (port 5666)
pnpm dev
```

Otwórz [http://localhost:5666/timetracker](http://localhost:5666/timetracker) w przeglądarce.

### Klucze API — gdzie je wziąć

Pełna instrukcja krok-po-kroku znajduje się w angielskim [README.md → API Keys Setup](./README.md#api-keys-setup-step-by-step). W skrócie:

1. **Jira API Key** (wymagane) — [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. **Tempo API Token + Account ID** (wymagane) — Tempo Settings → API Integration
3. **Gemini API Key** (zalecane, darmowe) — [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. **OpenRouter API Key** (opcjonalne, fallback AI) — [openrouter.ai/keys](https://openrouter.ai/keys)
5. **Slack** (opcjonalne) — Slack App z `users:read`, `channels:history`, `im:history`, `groups:history`

---

## Strony aplikacji

| Ścieżka | Co tam jest |
|---------|-------------|
| `/` (Dashboard) | Szybkie logowanie, KPI dziś, wykresy godzinowe, top aplikacje, status API |
| `/yesterday` | Pełny widok wczorajszego dnia — wybór daty, AI summary, skróty (Pn/Pt/Tydzień temu) |
| `/timesheet` | Karta czasu z aktywnościami ActivityWatch + Slack, AI matching, batch logging |
| `/my-issues` | Zadania Jira przypisane do mnie + wszystkie z projektów, readiness, eksport CSV |
| `/calendar` | Widok tygodniowy 7-dni: aktywności + worklogi + Slack per dzień |
| `/analytics` | KPI, daily comparison, hourly distribution, heatmapa, top apps, gap analysis |
| `/activity` | Lista commitów GitHub grupowana po dacie i repo |
| `/settings` | Konfiguracja integracji (Tempo, Jira, GitHub, Slack, AI, ActivityWatch) |
| `/connections` | Status połączeń ze wszystkimi zewnętrznymi serwisami |

---

## Komendy

```bash
# Development
pnpm dev               # uruchom dev server (port 5666)
pnpm build             # production build
pnpm start             # start production server

# Jakość
pnpm --filter @timetracker/web type-check
pnpm --filter @timetracker/web lint
pnpm --filter @timetracker/web test

# Utrzymanie
pnpm clean             # usuń .next, dist, node_modules cache
```

---

## Co pozostaje w README.md (EN)

Pełne, techniczne sekcje znajdują się w [angielskim README](./README.md):

- **Architecture** — diagram pełnej architektury, tech stack, struktura monorepo
- **AI Daily Logger** — szczegóły AI pipeline, dostępne modele Gemini, fallback OpenRouter
- **Readiness Criteria** — co AI sprawdza przed sugestią logowania
- **Issue Type Guard** — zabezpieczenia przed logowaniem na złe typy zadań
- **API Endpoints** — pełna lista endpointów `/api/*`
- **Auto-update mechanism** — jak działa self-update (Windows + Linux/macOS)
- **Release process** — patrz [RELEASING.md](./RELEASING.md)
- **Code signing** — patrz [docs/SIGNING_SETUP.md](./docs/SIGNING_SETUP.md)

---

## Licencja

BUSL-1.1 — patrz [LICENSE](./LICENSE)
