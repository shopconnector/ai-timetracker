# TimeTracker - macOS Installation Guide

## Prerequisites

1. **Node.js 20+**

   ```bash
   brew install node@20
   ```

2. **ActivityWatch**

   ```bash
   brew install --cask activitywatch
   ```

   Or download from: https://activitywatch.net

3. **pnpm**
   ```bash
   npm install -g pnpm
   ```

---

## Installation

### Option 1: From Source

```bash
# Clone repository
git clone https://github.com/shopconnector/ai-timetracker.git
cd ai-timetracker

# Install dependencies
pnpm install

# Build
pnpm build

# Start
pnpm dev
```

### Option 2: Using install script

```bash
curl -fsSL https://raw.githubusercontent.com/shopconnector/ai-timetracker/main/install.sh | bash
```

---

## Configuration

Create `.env.local` in `apps/web/`:

```bash
cp .env.example apps/web/.env.local
nano apps/web/.env.local
```

Required settings:

```env
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_SERVICE_EMAIL=your.email@company.com
JIRA_API_KEY=your-jira-api-token
TEMPO_API_TOKEN=your-tempo-token
TEMPO_ACCOUNT_ID=your-account-id
```

---

## Running

### Start ActivityWatch

```bash
open -a ActivityWatch
```

### Start TimeTracker

```bash
cd ai-timetracker
pnpm dev
```

Open: http://localhost:5666/timetracker

---

## Autostart (Login Items)

### Using launchd

Create `~/Library/LaunchAgents/com.timetracker.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.timetracker</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-c</string>
        <string>cd ~/ai-timetracker && pnpm dev</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

Enable:

```bash
launchctl load ~/Library/LaunchAgents/com.timetracker.plist
```

Disable:

```bash
launchctl unload ~/Library/LaunchAgents/com.timetracker.plist
```

---

## Ports

| Service       | Port |
| ------------- | ---- |
| TimeTracker   | 5666 |
| ActivityWatch | 5600 |

---

## Troubleshooting

### Port already in use

```bash
lsof -i :5666
kill -9 <PID>
```

### ActivityWatch not detected

1. Check ActivityWatch is running (menu bar icon)
2. Verify: http://localhost:5600

### Permission issues

```bash
chmod +x scripts/*.sh
```

---

## Support

- GitHub: https://github.com/shopconnector/ai-timetracker
- Issues: https://github.com/shopconnector/ai-timetracker/issues
