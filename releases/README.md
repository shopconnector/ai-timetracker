# Windows Releases

This folder contains the pre-built Windows installer that is automatically generated on every push to `main`.

## Files

| File | Description |
|------|-------------|
| `TimeTracker-Setup-x64.exe` | Windows installer (recommended) |

> **Note:** Portable ZIP is available in [GitHub Releases](../../releases) (too large for repo storage)

## Installation

1. Download `TimeTracker-Setup-x64.exe`
2. Run the installer
3. Launch "AI TimeTracker" from Start Menu

## Requirements

- **ActivityWatch** - Required for tracking activities
  - Download from: https://activitywatch.net/downloads/
- **Jira/Tempo API tokens** - Configure in Settings after first launch

## Portable Version

The portable version (`TimeTracker-*-portable.zip`) is available:
- [GitHub Releases](../../releases) - Official versioned releases
- [Build Artifacts](../../actions) - Latest build artifacts (30-day retention)

## Auto-Build

The installer is automatically updated by GitHub Actions whenever code is pushed to the `main` branch.

- Build workflow: `.github/workflows/build-windows.yml`
- Build status: Check the [Actions](../../actions) tab
