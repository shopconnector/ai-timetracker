# TimeTracker - Windows Installation Guide

## Quick Start

### Option 1: Portable Bundle (Recommended)

1. **Download** the latest release:

   ```
   https://github.com/shopconnector/ai-timetracker/releases
   ```

   Download: `TimeTracker-X.Y.Z-portable-x64.zip`

2. **Extract** to any folder (e.g., `C:\TimeTracker`)

3. **Run** `TimeTracker-Start.bat`
   - First run downloads ActivityWatch automatically (~100MB)
   - Browser opens to http://localhost:5666/timetracker

4. **Configure** connections at:
   http://localhost:5666/timetracker/connections

### Option 2: Windows Installer

1. Download `TimeTracker-Setup-x64.exe`
2. Run installer and follow prompts
3. Optional: Enable "Start with Windows"
4. Launch from Start Menu or Desktop shortcut

---

## Autostart Configuration

### Enable Autostart

```batch
Install-Autostart.bat
```

This adds TimeTracker to Windows startup (Registry: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`)

### Disable Autostart

```batch
Uninstall-Autostart.bat
```

### Manual Registry Entry

If you prefer, add manually:

```
Key: HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run
Name: TimeTracker
Value: "C:\TimeTracker\TimeTracker-Start.bat"
```

---

## Configuration

### Environment Variables

Edit `TimeTracker\data\.env.local`:

```env
# Required - Jira Integration
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_SERVICE_EMAIL=your.email@company.com
JIRA_API_KEY=your-jira-api-token

# Required - Tempo Integration
TEMPO_API_TOKEN=your-tempo-token
TEMPO_ACCOUNT_ID=your-account-id

# Optional - AI Suggestions
OPENROUTER_API_KEY=your-openrouter-key

# Optional - ActivityWatch URL (default: localhost:5600)
ACTIVITYWATCH_URL=http://localhost:5600
```

### Getting API Keys

#### Jira API Token

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Copy the token

#### Tempo API Token

1. Go to Tempo Settings → API Integration
2. Create new token with "Manage worklogs" permission
3. Copy the token

#### OpenRouter API Key (Optional)

1. Go to https://openrouter.ai
2. Create account and get API key
3. Add credits for AI usage

---

## Ports Used

| Service       | Port | URL                               |
| ------------- | ---- | --------------------------------- |
| TimeTracker   | 5666 | http://localhost:5666/timetracker |
| ActivityWatch | 5600 | http://localhost:5600             |

### Firewall Configuration

If needed, allow these ports in Windows Firewall:

```powershell
netsh advfirewall firewall add rule name="TimeTracker" dir=in action=allow protocol=TCP localport=5666
netsh advfirewall firewall add rule name="ActivityWatch" dir=in action=allow protocol=TCP localport=5600
```

---

## Troubleshooting

### TimeTracker won't start

1. Check if port 5666 is in use:
   ```batch
   netstat -an | find "5666"
   ```
2. Kill existing process:
   ```batch
   Stop-All.bat
   ```
3. Try running as Administrator

### ActivityWatch download fails

1. Check internet connection
2. Download manually from https://activitywatch.net
3. Extract to `ActivityWatch\` folder in TimeTracker directory

### No activities showing

1. Check ActivityWatch is running (system tray icon)
2. Wait 5-10 minutes for initial data collection
3. Visit http://localhost:5600 to verify ActivityWatch is working

### Configuration not saving

1. Check write permissions to `TimeTracker\data\` folder
2. Try running as Administrator once
3. Check `.env.local` file exists and is valid

---

## System Requirements

- Windows 10/11 (64-bit)
- 500 MB free disk space
- Internet connection for Jira/Tempo sync
- curl.exe (included in Windows 10 1803+)

---

## Folder Structure

```
TimeTracker-Complete/
├── TimeTracker/
│   ├── node/           # Node.js runtime
│   ├── app/            # Application files
│   └── data/           # Configuration & data
│       └── .env.local  # Your settings
├── ActivityWatch/      # Auto-downloaded
│   ├── aw-qt.exe
│   └── ...
├── TimeTracker-Start.bat
├── Install-Autostart.bat
├── Uninstall-Autostart.bat
├── Stop-All.bat
└── README.txt
```

---

## Updates

To update TimeTracker:

1. Stop all services: `Stop-All.bat`
2. Download new version
3. Replace TimeTracker folder (keep `data\` folder!)
4. Start again: `TimeTracker-Start.bat`

ActivityWatch updates automatically or can be updated by deleting the `ActivityWatch\` folder (will re-download on next start).

---

## Support

- GitHub: https://github.com/shopconnector/ai-timetracker
- Issues: https://github.com/shopconnector/ai-timetracker/issues
