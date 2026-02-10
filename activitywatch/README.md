# ActivityWatch Configuration

Uniwersalna konfiguracja ActivityWatch dla TimeTracker.

## Instalacja ActivityWatch

### macOS
```bash
brew install --cask activitywatch
```

### Windows
Pobierz z: https://github.com/ActivityWatch/activitywatch/releases

### Linux
```bash
# Ubuntu/Debian
snap install activitywatch

# Arch
yay -S activitywatch-bin

# Lub pobierz AppImage
```

## Uruchomienie

Po instalacji uruchom ActivityWatch:
- **macOS**: Otwórz `ActivityWatch.app` z Applications
- **Windows**: Uruchom `aw-qt.exe`
- **Linux**: Uruchom `activitywatch`

## Weryfikacja

Sprawdź czy ActivityWatch działa:
```bash
curl http://localhost:5600/api/0/info
```

Powinno zwrócić wersję i status.

## Rozszerzenie przeglądarki

Zainstaluj rozszerzenie `aw-watcher-web` dla pełnego śledzenia:

| Przeglądarka | Link |
|--------------|------|
| Chrome/Arc/Brave | [Chrome Web Store](https://chrome.google.com/webstore/detail/activitywatch-web-watcher/nglaklhklhcoonedhgnpgddginnjdadi) |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/aw-watcher-web/) |
| Edge | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/activitywatch-web-watche/nnfnnlfepfnngnlpcmcomgmgoclfbmhk) |

## Uprawnienia (macOS)

ActivityWatch wymaga uprawnień dostępu:
1. System Preferences → Privacy & Security → Accessibility
2. Dodaj ActivityWatch do listy

## Buckety

ActivityWatch zbiera dane do "bucketów":

| Bucket | Opis |
|--------|------|
| `aw-watcher-window_{hostname}` | Aktywne okna aplikacji |
| `aw-watcher-afk_{hostname}` | Status AFK (nieaktywność) |
| `aw-watcher-web-chrome_{hostname}` | Aktywność w Chrome |
| `aw-watcher-web-firefox_{hostname}` | Aktywność w Firefox |

TimeTracker automatycznie wykrywa wszystkie dostępne buckety.

## Troubleshooting

### Watcher nie działa
```bash
# Sprawdź procesy
ps aux | grep aw-watcher

# Sprawdź buckety
curl http://localhost:5600/api/0/buckets/
```

### Restart watcherów
```bash
# macOS
pkill -f "ActivityWatch" && open -a ActivityWatch

# Linux
killall aw-qt && activitywatch &
```
