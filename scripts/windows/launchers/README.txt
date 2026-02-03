============================================
   AI TimeTracker Complete v0.3.0
   Instrukcja / Instructions
============================================

WHAT'S INCLUDED / CO ZAWIERA:
- TimeTracker (time logging to Jira/Tempo)
- ActivityWatch (auto-downloaded on first run)

============================================
   QUICK START (Windows)
============================================

1. Extract this folder anywhere (e.g., C:\TimeTracker)

2. Double-click: TimeTracker-Start.bat
   - First run will download ActivityWatch (~100MB)
   - Then both apps will start automatically

3. Browser opens: http://localhost:5666/timetracker

4. Configure connections:
   http://localhost:5666/timetracker/connections
   - Jira URL and API key
   - Tempo API token
   - (Optional) OpenRouter API key for AI suggestions

============================================
   AUTOSTART (Run at Windows startup)
============================================

To enable:  Run Install-Autostart.bat
To disable: Run Uninstall-Autostart.bat

============================================
   INCLUDED SCRIPTS
============================================

TimeTracker-Start.bat   - Start everything
Install-Autostart.bat   - Enable Windows autostart
Uninstall-Autostart.bat - Disable Windows autostart
Stop-All.bat            - Stop all services

============================================
   PORTS USED
============================================

TimeTracker:   http://localhost:5666
ActivityWatch: http://localhost:5600

Make sure these ports are not blocked by firewall.

============================================
   CONFIGURATION
============================================

Configuration file: TimeTracker\data\.env.local

Required settings:
- JIRA_BASE_URL=https://your-company.atlassian.net
- JIRA_SERVICE_EMAIL=your.email@company.com
- JIRA_API_KEY=your-jira-api-token
- TEMPO_API_TOKEN=your-tempo-token
- TEMPO_ACCOUNT_ID=your-account-id

Optional:
- OPENROUTER_API_KEY=your-openrouter-key (for AI)

============================================
   TROUBLESHOOTING
============================================

Problem: TimeTracker doesn't start
Solution:
1. Check if port 5666 is free (netstat -an | find "5666")
2. Try running as Administrator
3. Check Windows Firewall settings

Problem: ActivityWatch download fails
Solution:
1. Check internet connection
2. Download manually from: https://activitywatch.net
3. Extract to ActivityWatch\ folder

Problem: No activities showing
Solution:
1. Make sure ActivityWatch is running (check system tray)
2. Wait a few minutes for data collection
3. Check http://localhost:5600 for ActivityWatch UI

============================================
   SYSTEM REQUIREMENTS
============================================

- Windows 10/11 (64-bit)
- 500 MB free disk space
- Internet connection (for Jira/Tempo sync)
- curl.exe (included in Windows 10+)

============================================
   SUPPORT
============================================

GitHub: https://github.com/shopconnector/ai-timetracker
Issues: https://github.com/shopconnector/ai-timetracker/issues

============================================
   macOS / Linux
============================================

See documentation:
- docs/INSTALL-MACOS.md
- docs/INSTALL-LINUX.md

Or visit: https://github.com/shopconnector/ai-timetracker

============================================
