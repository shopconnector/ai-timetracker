# AI TimeTracker

> 🌐 **English** · [Polski](./README.pl.md)

**Intelligent time tracking system — Jira + Tempo + ActivityWatch + Slack + AI (Gemini)**

## Download (Windows)

**[Download TimeTracker-Setup-x64.exe](https://github.com/shopconnector/ai-timetracker/releases/latest/download/TimeTracker-Setup-x64.exe)** — Windows Installer (~55 MB, bundled Node.js)

> The app auto-updates itself. When a new version is available, you'll see a notification in the Settings page. One click to update.

---

```
ActivityWatch + Slack ──> TimeTracker ──> Tempo/Jira
 (monitoring)   (chat)     (web UI)       (worklogs)
```

---

## What Does It Do?

AI TimeTracker automates time logging to Tempo/Jira:

1. **ActivityWatch** collects activity data (active windows, applications, durations)
2. **TimeTracker** displays activities in a clear table and **AI matches them to Jira tickets**
3. Log an entire day to **Tempo** with a single click

### Key Features

| Feature                | Description                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **AI Daily Logger**    | Paste raw daily notes — AI parses them into a structured table with matched Jira tickets. Edit and log in one click. |
| **AI Ticket Matching** | Automatic activity-to-ticket matching via Gemini / OpenRouter                                                        |
| **Timesheet**          | Weekly worklog view with editing, drag & drop, and bulk assignment                                                   |
| **My Issues**          | Full Jira issue list with filters, sorting, notes, and Readiness Criteria                                            |
| **Calendar**           | Weekly worklog view + Google Calendar + Jira sprint events                                                           |
| **Analytics**          | Charts: time per project, per day, per activity type, trends                                                         |
| **Compare**            | Side-by-side comparison: ActivityWatch time vs. logged Tempo time (daily diff)                                        |
| **Issue Type Guard**   | Automatic blocking of time logging to Stories/Epics — enforces subtasks                                              |
| **Readiness Criteria** | Parses RC scores from Jira comments (Automation for Jira)                                                            |
| **Slack Integration**  | AW + Slack correlation: huddles, DMs, channels — "AW+Slack" badge, no duplicate counting                            |
| **Rules Engine**       | Rule-based automatic ticket matching (no AI required)                                                                |
| **Electron**           | Desktop application for Windows with bundled Node.js                                                                 |

---

## Architecture

```
ai-timetracker/
├── apps/
│   └── web/                         # Next.js 16 (React 19, Tailwind 4)
│       ├── src/
│       │   ├── app/                  # Pages + API routes
│       │   │   ├── page.tsx          # Dashboard
│       │   │   ├── timesheet/        # Weekly timesheet
│       │   │   ├── my-issues/        # Jira issues + Daily Logger
│       │   │   ├── calendar/         # Calendar view
│       │   │   ├── analytics/        # Charts and statistics
│       │   │   ├── compare/          # AW vs Tempo comparison
│       │   │   ├── tasks/            # Task management
│       │   │   ├── connections/      # API connection status
│       │   │   ├── settings/         # Configuration + Rules Engine
│       │   │   └── api/
│       │   │       ├── jira/         # Jira REST API proxy
│       │   │       ├── tempo/        # Tempo REST API proxy
│       │   │       ├── llm/          # AI endpoints (Gemini/OpenRouter)
│       │   │       │   ├── parse-daily/    # Daily notes parsing
│       │   │       │   ├── suggest/        # Ticket suggestion
│       │   │       │   └── suggest-worklog/# Worklog suggestion
│       │   │       ├── activities/   # ActivityWatch integration
│       │   │       ├── dashboard/    # Dashboard aggregation
│       │   │       ├── analytics/    # Analytics data
│       │   │       └── settings/     # Settings + API tests
│       │   ├── components/
│       │   │   ├── ui/               # shadcn/ui (21 components)
│       │   │   ├── WorklogFormDialog  # Worklog form dialog
│       │   │   ├── TimesheetTable     # Timesheet table
│       │   │   └── ...
│       │   └── lib/
│       │       ├── gemini.ts         # Native Google Gemini API client
│       │       ├── openrouter.ts     # OpenRouter LLM client (fallback)
│       │       ├── ai-config.ts      # AI configuration (models, provider)
│       │       ├── jira.ts           # Jira REST API client
│       │       ├── tempo.ts          # Tempo REST API client
│       │       ├── activitywatch.ts  # ActivityWatch API client
│       │       ├── slack.ts          # Slack User Token API client
│       │       ├── mergeActivities.ts # AW + Slack correlation
│       │       ├── readiness.ts      # Readiness Criteria parser
│       │       ├── rules-engine.ts   # Rule-based matching engine
│       │       ├── suggestion-service.ts  # Unified AI suggestion pipeline
│       │       └── ...
│       └── .env.local                # Configuration (API tokens)
├── packages/
│   ├── shared/                       # Shared types and utilities
│   └── ai/                           # AI utilities package
├── electron/                         # Electron wrapper (Windows desktop)
├── scripts/windows/                  # Build scripts for the installer
└── turbo.json                        # Turborepo config
```

### Tech Stack

| Layer    | Technology                                        |
| -------- | ------------------------------------------------- |
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui   |
| Backend  | Next.js API Routes (server-side)                   |
| AI/LLM   | Google Gemini API (native), OpenRouter (fallback) |
| Monorepo | Turborepo + pnpm workspaces                       |
| Testing  | Vitest + Testing Library                           |
| Linting  | ESLint + Prettier + Husky + lint-staged            |
| Desktop  | Electron (Windows)                                 |
| Build    | Standalone output (deploy without node_modules)    |

---

## Quick Start

### Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9
- **ActivityWatch** (optional — for activity monitoring)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/shopconnector/ai-timetracker.git
cd ai-timetracker

# 2. Install dependencies
pnpm install

# 3. Start the development server
pnpm dev
```

The application will be available at: **http://localhost:5666/timetracker**

Open **Settings** in the app and enter your API keys — see [API Keys Setup](#api-keys-setup-step-by-step) below.

### Before You Start — Pre-flight Checklist

These five preconditions cause **>90% of "I get 401 / nothing works" reports**. Read them once, save yourself the debugging.

| ✓ | Requirement | Why |
|---|---|---|
| ☐ | **Atlassian Cloud only** — your Jira URL ends with `.atlassian.net` | We hit `/rest/api/3/myself` — REST v3, Cloud-only. JIRA Server / Data Center returns 404. |
| ☐ | **Jira Email = Atlassian ID email** (the one on https://id.atlassian.com) | The token is bound to that account. SSO/internal aliases give 401 even with a "valid" token. |
| ☐ | **No trailing slash** in `JIRA_BASE_URL` (use `https://x.atlassian.net`, not `…/`) | Some Atlassian edges accept `//rest/...`, some don't. We strip it server-side, but be safe. |
| ☐ | **Two separate tokens**: Jira token (atlassian.com) ≠ Tempo token (Tempo Settings inside Jira) | They look similar. Pasting one in the other's field always 401s. |
| ☐ | **Tempo token scope must include `Worklogs: View`** | Even just to *test* the connection. Tokens with only `Create` give 403. |

After saving credentials in Settings, click **Test connection**. The error messages now point you to the exact fix — read them.

### API Keys Setup (step by step)

After installing the app, open **Settings** (gear icon in the sidebar). You'll see fields for each API key. Fill them in one by one.

> **Tip:** every field in the app has an inline **"How to get this?"** help guide next to it. The steps below mirror those guides — use whichever is more convenient.

#### 1. Jira API Key (required)

You need this for TimeTracker to access your Jira issues.

1. Open this link in your browser: **https://id.atlassian.com/manage-profile/security/api-tokens**
2. Log in with your Atlassian account (the same one you use for Jira)
3. Click the blue **"Create API token"** button
4. In the popup, type a label like `TimeTracker` and click **Create**
5. **Copy the token** (click the copy icon — you won't be able to see it again!)
6. Go back to TimeTracker **Settings** and paste it into the **Jira API Key** field
7. Also fill in:
   - **Jira Base URL** — your company's Jira address, e.g. `https://yourcompany.atlassian.net`
   - **Jira Email** — the email you use to log into Jira

#### 2. Tempo API Token + Account ID (required)

You need these for TimeTracker to read and create worklogs.

**Tempo API Token:**

1. Open **Jira** in your browser
2. Click **Apps** in the top menu bar → click **Tempo** → click **Settings** (bottom-left gear icon)
3. In the left sidebar, click **API Integration**
4. Click **"New Token"**
5. Give it a name like `TimeTracker`
6. Select these permissions: **Worklogs: View, Create, Edit**
7. Click **Create** and **copy the token**
8. Go back to TimeTracker **Settings** and paste it into the **Tempo API Token** field

**Tempo Account ID** (= your Atlassian Account ID):

The Tempo API needs to know who is creating the worklog. TimeTracker will **auto-fetch** this from Jira on the first save if you leave the field empty — but filling it in avoids one extra API call. Two ways to find it:

- **From Jira profile URL** — in Jira, click your avatar (top-right) → **Profile**. The accountId appears at the end of the page URL, e.g. `https://yourcompany.atlassian.net/jira/people/712020:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`. Copy the part after `/people/`.
- **From the Jira REST API** — after you have the Jira token + email (step 1), run:
  ```bash
  curl -u YOUR_EMAIL:YOUR_JIRA_TOKEN https://yourcompany.atlassian.net/rest/api/3/myself
  ```
  Copy the value of the `accountId` field from the JSON response.

Paste it into the **Account ID** field in Settings (placeholder shows the expected format).

#### 3. Gemini API Key (recommended — it's free!)

This powers AI features: automatic ticket matching, daily notes parsing, and smart suggestions.

1. Open: **https://aistudio.google.com/apikey**
2. Sign in with any Google account
3. Click **"Create API key"**
4. Select any Google Cloud project (or create one — it's free)
5. **Copy the key**
6. Go back to TimeTracker **Settings** and paste it into the **Gemini API Key** field

> **No credit card needed.** Gemini 2.5 Flash is free and fast enough. Without this key, AI features won't work, but everything else (timesheet, calendar, worklogs) works fine with regex fallback.

#### 4. OpenRouter API Key (optional — AI fallback)

Only needed if Gemini doesn't work or you prefer other models (Claude, GPT-4, etc.)

1. Open: **https://openrouter.ai/keys**
2. Sign up or log in
3. Create a key and **copy it**
4. Paste into the **OpenRouter API Key** field in Settings

#### 5. Slack Integration (optional)

Slack gives TimeTracker two separate capabilities, each needing its own token:

- **User Token (`xoxp-`)** — reads your Slack activity (DMs, channels, huddles) to correlate with desktop activity.
- **Bot Token (`xoxb-`)** — sends notifications (worklog suggestions, real-time prompts) as a DM from the bot.
- **Slack User ID** — tells the bot *who* to DM with those notifications.

**Create the Slack app + add scopes:**

1. Open: **https://api.slack.com/apps** → click **"Create New App"** → choose **"From scratch"**
2. Give it a name like `TimeTracker` and select your workspace
3. In the left sidebar, click **"OAuth & Permissions"**
4. Scroll to **"User Token Scopes"** and add these scopes (click "Add an OAuth Scope" for each):
   - `channels:history`, `channels:read`
   - `groups:history`, `groups:read`
   - `im:history`, `im:read`
   - `mpim:history`, `mpim:read`
   - `users:read`
5. Scroll to **"Bot Token Scopes"** and add:
   - `chat:write`, `im:write`, `users:read`
6. Scroll back up and click **"Install to Workspace"** → click **Allow**
7. Copy both tokens from the OAuth page:
   - **User OAuth Token** (starts with `xoxp-...`) → paste into **Slack User Token** field in Settings
   - **Bot User OAuth Token** (starts with `xoxb-...`) → see note below for the Bot Token

**Get your Slack User ID (for DM notifications):**

1. Open Slack (desktop or web)
2. Click your avatar → **Profile**
3. Click the `⋯` (More) button next to your name → **Copy member ID**
4. The ID looks like `U0123456789` (starts with `U`)

> **Known limitation:** the **Bot Token** and **Slack User ID** fields are visible in the Settings UI but are not currently persisted by the settings API (the FIELD_TO_ENV map in `apps/web/src/app/api/settings/route.ts` omits them). Until that is fixed, set them directly in `.env.local`:
> ```env
> SLACK_BOT_TOKEN=xoxb-...
> SLACK_NOTIFY_USER_ID=U0123456789
> ```
> The User Token (`SLACK_USER_TOKEN`) does save correctly via the UI.

---

## Configuration (.env.local)

```env
# Tempo API (required)
TEMPO_API_TOKEN=your_token
TEMPO_ACCOUNT_ID=712020:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  # leave blank to auto-fetch from Jira

# Jira API (required)
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_SERVICE_EMAIL=your.email@company.com
JIRA_API_KEY=your_token

# Gemini API (recommended — free tier available)
GEMINI_API_KEY=your_gemini_key
# LLM_MODEL=gemini-2.5-flash  # optional: gemini-2.5-flash | gemini-2.5-pro | gemini-2.0-flash

# ActivityWatch (optional)
ACTIVITYWATCH_URL=http://localhost:5600

# OpenRouter (optional — fallback AI provider)
OPENROUTER_API_KEY=

# Slack (optional)
SLACK_USER_TOKEN=xoxp-...       # read activity (saves via Settings UI)
SLACK_BOT_TOKEN=xoxb-...        # send notifications (UI does not persist — set here)
SLACK_NOTIFY_USER_ID=U0123456789  # DM recipient (UI does not persist — set here)
```

---

## AI Daily Logger

Log an entire workday to Tempo in under a minute — no manual entry required.

Instead of creating worklogs one by one, simply paste your rough notes from the day. The AI does the rest.

### How it works

**1. Paste your raw notes** — any format, any language:

```
09:30-10:30 research n8n workflow automation with Mike
11:00-11:30 call with Natalia — Claude AI setup
11:30-12:30 sync with Peter — Headlamp K8s dashboard
13:00-14:00 EU grant proposal review
14:00-15:00 LinkedIn content strategy session
```

**2. AI generates a structured timesheet:**

| Time          | Description                      | Jira Ticket | Category | Duration |
| ------------- | -------------------------------- | ----------- | -------- | -------- |
| 09:30 – 10:30 | n8n workflow automation research | BCI-235     | research | 1h       |
| 11:00 – 11:30 | Claude AI onboarding call        | BCI-326     | meeting  | 30m      |
| ...           | ...                              | ...         | ...      | ...      |

Every field is editable — change tickets, adjust times, fix descriptions.

**3. One click to log** — all selected entries are sent to Tempo as worklogs.

### Without AI

If no Gemini/OpenRouter key is configured, a built-in regex parser handles the basics:

- Parses `HH:MM-HH:MM` time ranges
- Matches tickets by keyword similarity
- Detects categories (meeting / dev / research)

---

## AI Pipeline

Each AI invocation attempts providers in the following order:

```
1. Gemini API (GEMINI_API_KEY) — native Google AI, free tier
   ↓ on error
2. OpenRouter (OPENROUTER_API_KEY) — Claude, GPT-4, Llama, etc.
   ↓ on error
3. Regex / keyword fallback — no AI required
```

### Available Gemini Models

| Model              | Price           | Speed  | Quality              |
| ------------------ | --------------- | ------ | -------------------- |
| `gemini-2.5-flash` | Free            | Fast   | High (default)       |
| `gemini-2.5-pro`   | $1.25/1k tokens | Medium | Highest              |
| `gemini-2.0-flash` | Free            | Fast   | High                 |

To change the model: Settings > AI/LLM > Gemini Model

---

## Readiness Criteria

Automatic parsing of "Readiness Criteria" scores from Jira comments (added via Automation for Jira):

- **4 colored dots** in the issues table (Completeness, Clarity, Auditability, Estimated)
- **Full detail card** in the expanded row with improvement suggestions
- **Stat card** — showing how many issues have full RC (4/4 green)

Recognized format in comments:

```
Completeness 🟢
Clarity 🟡
Auditability 🔴
Estimated 🟢
```

---

## Issue Type Guard

Automatic blocking of time logging to inappropriate issue types:

- **Story** — blocked (log to subtasks instead)
- **Epic** — blocked
- **Task with subtasks** — blocked (log to a subtask instead)

When attempting to log time to a blocked ticket, an error message is displayed along with a list of available subtasks.

---

## Pages

| Page        | URL               | Description                                                |
| ----------- | ----------------- | ---------------------------------------------------------- |
| Dashboard   | `/`               | Daily summary: hours, activities, worklogs                 |
| Timesheet   | `/timesheet`      | Weekly timesheet with ActivityWatch + Tempo                |
| My Issues   | `/my-issues`      | Jira issues + Daily Logger + Readiness Criteria            |
| Calendar    | `/calendar`       | Weekly view: worklogs + Google Calendar + sprints          |
| Analytics   | `/analytics`      | Charts: time per project, trends, categories               |
| Compare     | `/compare`        | ActivityWatch vs. Tempo (unlogged time delta)              |
| Tasks       | `/tasks`          | Quick task management from history                         |
| Connections | `/connections`    | API status: Jira, Tempo, ActivityWatch, AI                 |
| Settings    | `/settings`       | Tokens, AI models, time goals, mappings                    |
| Rules       | `/settings/rules` | Rules Engine — rule-based matching without AI              |

---

## API Endpoints

| Endpoint                       | Method       | Description                          |
| ------------------------------ | ------------ | ------------------------------------ |
| `/api/jira/my-issues`          | GET          | Retrieve assigned Jira issues        |
| `/api/jira/issues`             | GET          | Search for issues                    |
| `/api/jira/projects`           | GET          | List Jira projects                   |
| `/api/tempo/worklogs`          | GET/POST     | Retrieve or create worklogs          |
| `/api/tempo/worklogs/[id]`     | PUT/DELETE   | Update or delete a worklog           |
| `/api/tempo/worklogs-by-issue` | GET          | Worklogs grouped by issue            |
| `/api/tempo/check-overlap`     | POST         | Check for worklog overlaps           |
| `/api/tempo/attributes`        | GET          | Tempo attributes (action types)      |
| `/api/llm/parse-daily`         | POST         | AI parsing of daily notes            |
| `/api/llm/suggest`             | POST         | AI ticket suggestion                 |
| `/api/llm/suggest-worklog`     | POST         | AI worklog suggestion                |
| `/api/activities`              | GET          | Activities from ActivityWatch        |
| `/api/activities/merged`       | GET          | AW + Slack (correlated)              |
| `/api/slack/activities`        | GET          | Activities from Slack API            |
| `/api/dashboard`               | GET          | Dashboard data                       |
| `/api/analytics`               | GET          | Analytics data                       |
| `/api/status`                  | GET          | API connection status                |
| `/api/settings`                | GET/PUT/POST | Configuration + connection tests     |

---

## Commands

```bash
# Development
pnpm dev              # Start dev server (port 5666)
pnpm build            # Production build
pnpm start            # Start in production mode

# Quality
pnpm lint             # Run ESLint checks
pnpm lint:fix         # Auto-fix lint issues
pnpm format           # Format with Prettier
pnpm type-check       # Run TypeScript type checking
pnpm test             # Run Vitest tests
pnpm test:coverage    # Run tests with coverage report

# Maintenance
pnpm clean            # Clean build artifacts and node_modules

# Windows
pnpm build:electron   # Build Electron app
```

---

## Platform-Specific Installation

<details>
<summary><strong>Windows (EXE Installer)</strong></summary>

1. Install [ActivityWatch](https://github.com/ActivityWatch/activitywatch/releases) (for desktop activity tracking)
2. Download [TimeTracker-Setup-x64.exe](https://github.com/shopconnector/ai-timetracker/releases/latest/download/TimeTracker-Setup-x64.exe)
3. Run the installer — Node.js is bundled, no extra software needed
4. Launch **"AI TimeTracker"** from the Start menu
5. Open **Settings** and enter your API keys (see [API Keys Setup](#api-keys-setup-step-by-step) above)

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
# Fill in API tokens
pnpm install && pnpm dev
```

**Permissions:** System Settings > Privacy > Accessibility — add ActivityWatch.

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
# Fill in API tokens
pnpm install && pnpm dev
```

</details>

<details>
<summary><strong>Docker</strong></summary>

```bash
git clone https://github.com/shopconnector/ai-timetracker.git
cd ai-timetracker
cp .env.example apps/web/.env.local
# Fill in API tokens
docker build -t timetracker .
docker run -d -p 5666:5666 --env-file apps/web/.env.local timetracker
```

</details>

---

## Addresses

| Service       | URL                               |
| ------------- | --------------------------------- |
| TimeTracker   | http://localhost:5666/timetracker |
| ActivityWatch | http://localhost:5600             |

---

## Troubleshooting

### Jira / Tempo connection (`Test` button)

| Symptom in `Test` | Most likely cause | Fix |
|---|---|---|
| **Jira 401** | Email ≠ token owner | Open https://id.atlassian.com and copy the exact email shown there into `Jira Email`. |
| **Jira 401** *after rotating tokens* | New token saved, but old one is still loaded by the launcher (different .env file paths) | Save in Settings → **fully restart** the app (close window AND tray icon) → Test again. If still 401, see [Tokens "disappear" after restart](#tokens-disappear-after-restart). |
| **Jira 403** | Token belongs to user with no project access | Check user permissions in Jira admin. |
| **Jira 404** | URL points to JIRA Server / Data Center | Not supported. Only Atlassian Cloud (`*.atlassian.net`). |
| **Jira "network error"** | Trailing slash, typo, or proxy blocks `*.atlassian.net` | Remove trailing `/` from URL. Check corp VPN/proxy. |
| **Tempo 401** | Token from a different workspace, or revoked | Generate fresh token in *that* Jira's Tempo → Settings → API Integration. |
| **Tempo 403** | Token missing scope `Worklogs: View` | Recreate token with **View + Create + Edit** scopes. |
| **Tempo 404** | Wrong Tempo URL (Server, not Cloud) | We support Tempo Cloud only (`api.tempo.io`). |

### Tokens "disappear" after restart

If you save tokens, they work, you restart, and you get 401 again — the launcher is reading from a different `.env.local` file than the Settings UI writes to.

**Fix is in v0.10.6+** — `start-server.js` now sets `TIMETRACKER_DATA_DIR` so both reads and writes use the same file. If you're on an older build:

- **macOS bundle**: tokens live at `~/.timetracker/.env.local`. Edit there directly, then restart.
- **Windows bundle**: tokens live at `<install dir>/data/.env.local`. Edit there directly, then restart.

To confirm where Settings is writing now, open `/api/settings` directly in your browser — the `envFilePath` field shows the path.

### Auto-update doesn't pick up the new version

| Symptom | Cause | Fix |
|---|---|---|
| Settings shows "Aktualna wersja: 0.0.0" | `NEXT_PUBLIC_APP_VERSION` not injected at build time | Reinstall from latest installer, or rebuild from source. |
| "Sprawdz aktualizacje" shows the same version after a release | 6h client cache + 1h Next.js fetch cache | Click **Force refresh** (added in v0.10.6+). On older builds, restart the app. |
| "Pobieranie..." spins forever | Anti-virus / Defender blocks write to `%TEMP%` | Whitelist TimeTracker.exe in Defender, or download manually from the [release page](https://github.com/shopconnector/ai-timetracker/releases/latest). |
| "Zainstaluj aktualizacje" → silent fail | Installer needs to close `node.exe`, lock prevents overwrite | Quit the app fully (incl. tray icon), run the downloaded `TimeTracker-Setup-*.exe` manually from `%TEMP%`. |
| **Nothing happens at all** | Open `/api/version?debug=1` in browser — it shows `current`, `latest`, `assetNames`, `lastError` | If `current=0.0.0` and `latest=0.10.5`, update IS offered but UI cache may be stale; if `lastError` is set, GitHub API is unreachable (proxy/firewall). |

### Windows SmartScreen / "Unknown publisher" warning

Releases since v0.10.5 are **digitally signed** with Azure Trusted Signing as `ShopConnector`. If you see "Windows protected your PC":

1. Click **More info**
2. Click **Run anyway**
3. The signature is real — Windows just hasn't built reputation for the new cert yet (typical for first weeks after a cert is issued).

If your build shows "Unknown publisher" instead of "ShopConnector", you have an unsigned dev build — that's fine for local dev, but production users should use the signed installer from GitHub Releases.

### GitHub activity (`/activity` page) is empty

The `/activity` page reads **local `.git/` directories on your disk** — it does NOT call github.com.

| Symptom | Fix |
|---|---|
| "PROJECTS_ROOT nie jest ustawiony" | Open Settings → **Git / Activity** → set the path to your projects root (e.g. `/Users/YOU/projects`). |
| "Katalog X nie istnieje" | Path is wrong — typo, or you don't have local clones. |
| "Brak repozytoriów git pod X" | Path exists but no `.git` subfolders. Either wrong path, or your repos are nested deeper (the scanner only looks 1 level deep). |
| Path is set, repos exist, but commits are empty | The default git author filter is your `git config user.email` — if your repos use a different commit author email, set it explicitly in Settings → Git author. |

### Other

| Problem                              | Solution                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| AI does not suggest tickets          | Verify `GEMINI_API_KEY` in `.env.local`. Without a key, regex fallback is used.     |
| ActivityWatch shows no data          | macOS: System Settings > Privacy > Accessibility. Windows: run as administrator.    |
| Port 5666 is in use                  | `lsof -i :5666` (macOS/Linux) or `netstat -ano \| findstr :5666` (Windows)          |
| Issue Type Guard blocks logging      | Log time to subtasks instead of Stories/Epics.                                      |
| Gemini quota exceeded                | Free tier has rate limits. Switch to `gemini-2.5-pro` or use OpenRouter.            |
| Build fails                          | `pnpm clean && pnpm install && pnpm build`                                          |
| `/yesterday` shows wrong date | Default is now **previous workday** (Mon shows Fri, not Sun). Use the date input or quick buttons (Pn / Pt / Wczoraj / Tydzień temu) to jump anywhere. |

---

## License

BSL 1.1 (Business Source License) — see [LICENSE](LICENSE) for details.

The source code will convert to the MIT license after 4 years from each release date.

---

<p align="center">
  <strong>Powered by <a href="https://beecommerce.pl">beecommerce.pl</a></strong>
</p>
