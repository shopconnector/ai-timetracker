# AI TimeTracker

**Intelligent time tracking system — Jira + Tempo + ActivityWatch + Slack + AI (Gemini)**

## Download (Windows 11)

**[Download TimeTracker-Setup-x64.exe](releases/TimeTracker-Setup-x64.exe)** — Windows Installer (~55 MB, bundled Node.js)

---

```
ActivityWatch + Slack ──> TimeTracker ──> Tempo/Jira
 (monitoring)   (chat)     (web UI)       (worklogs)
```

**Live demo:** https://ai.beecommerce.pl/timetracker

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

# 2. Copy the configuration template
cp .env.example apps/web/.env.local

# 3. Fill in API tokens in apps/web/.env.local (see instructions below)

# 4. Install dependencies
pnpm install

# 5. Start the development server
pnpm dev
```

The application will be available at: **http://localhost:5666/timetracker**

### API Tokens

#### Jira API (required)

1. Go to: https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **Create API token** and name it "TimeTracker"
3. Copy the token to `JIRA_API_KEY=` in `.env.local`

#### Tempo API (required)

1. In Jira, navigate to Apps > Tempo > Settings > API Integration
2. Click **New Token** with permissions: Worklogs (View, Create, Edit)
3. Copy the token to `TEMPO_API_TOKEN=` in `.env.local`

#### Gemini API (recommended — free tier available)

1. Go to: https://aistudio.google.com/apikey
2. Click **Create API key**
3. Copy the key to `GEMINI_API_KEY=` in `.env.local`

> Gemini 2.5 Flash is free and sufficiently fast. Without a key, AI suggestions will not work, but the rest of the application will function normally (regex fallback).

#### OpenRouter (optional — fallback)

1. Go to: https://openrouter.ai/keys
2. Copy the key to `OPENROUTER_API_KEY=` in `.env.local`

#### Slack Integration (optional)

1. Create a Slack App: https://api.slack.com/apps > **Create New App** > From scratch
2. Under **OAuth & Permissions**, add User Token Scopes: `channels:history`, `channels:read`, `groups:history`, `groups:read`, `im:history`, `im:read`, `mpim:history`, `mpim:read`, `users:read`
3. Click **Install to Workspace** and copy the **User OAuth Token** (`xoxp-...`)
4. Paste it into `SLACK_USER_TOKEN=` in `.env.local`

> The Slack integration correlates ActivityWatch activities (Slack window events) with Slack API data (channels, huddles). This eliminates duplicate time counting.

---

## Configuration (.env.local)

```env
# Tempo API (required)
TEMPO_API_TOKEN=your_token

# Jira API (required)
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_SERVICE_EMAIL=your.email@company.com
JIRA_API_KEY=your_token

# Gemini API (recommended — free tier available)
GEMINI_API_KEY=your_gemini_key
# GEMINI_MODEL=gemini-2.5-flash  # optional

# ActivityWatch (optional)
ACTIVITYWATCH_URL=http://localhost:5600

# OpenRouter (optional — fallback)
OPENROUTER_API_KEY=

# Slack (optional — ActivityWatch correlation)
SLACK_USER_TOKEN=xoxp-...
```

---

## AI Daily Logger

The primary productivity feature — instead of manually logging each worklog individually:

1. **Paste raw notes** from your workday:

   ```
   09:30-10:30 research Mike n8n workflow
   11:00-11:30 call Natalia claude setup
   11:30-12:30 call z Piotkiem headlamp k8s
   13:00-14:00 dofinansowanie unijne
   14:00-15:00 Mike prompty linkedin
   ```

2. **AI parses** the input into a structured table:
   - Time (editable)
   - Description (editable)
   - Jira ticket (dropdown from all assigned issues)
   - Category (meeting / dev / research / comm / infra)
   - Duration (editable)

3. **Edit** as needed — change tickets, adjust times

4. **Log with a single click** — all selected entries are sent to Tempo

### Fallback Without AI

Without a Gemini/OpenRouter key, the **regex parser** is used:

- Recognizes `HH:MM-HH:MM` patterns
- Matches tickets by keywords
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

1. Install [ActivityWatch](https://github.com/ActivityWatch/activitywatch/releases)
2. Download [TimeTracker-Setup-x64.exe](https://github.com/shopconnector/ai-timetracker/releases/latest)
3. Run the installer — Node.js is bundled
4. Launch "AI TimeTracker" from the Start menu

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

| Problem                              | Solution                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| AI does not suggest tickets          | Verify `GEMINI_API_KEY` in `.env.local`. Without a key, regex fallback is used.     |
| ActivityWatch shows no data          | macOS: System Settings > Privacy > Accessibility. Windows: run as administrator.    |
| Port 5666 is in use                  | `lsof -i :5666` (macOS/Linux) or `netstat -ano \| findstr :5666` (Windows)          |
| Issue Type Guard blocks logging      | Log time to subtasks instead of Stories/Epics.                                      |
| Gemini quota exceeded                | Free tier has rate limits. Switch to `gemini-2.5-pro` or use OpenRouter.            |
| Build fails                          | `pnpm clean && pnpm install && pnpm build`                                          |

---

## License

BSL 1.1 (Business Source License) — see [LICENSE](LICENSE) for details.

The source code will convert to the MIT license after 4 years from each release date.

---

<p align="center">
  <strong>Powered by <a href="https://beecommerce.pl">beecommerce.pl</a></strong>
</p>
