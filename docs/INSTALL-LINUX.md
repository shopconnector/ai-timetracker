# TimeTracker - Linux Installation Guide

## Prerequisites

1. **Node.js 20+**

   ```bash
   # Ubuntu/Debian
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # Fedora
   sudo dnf install nodejs

   # Arch
   sudo pacman -S nodejs npm
   ```

2. **ActivityWatch**
   Download from: https://activitywatch.net

   ```bash
   # Extract and run
   tar -xzf activitywatch-*.tar.gz
   cd activitywatch
   ./aw-qt
   ```

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
./activitywatch/aw-qt &
```

### Start TimeTracker

```bash
cd ai-timetracker
pnpm dev
```

Open: http://localhost:5666/timetracker

---

## Autostart (systemd)

### Create service file

```bash
sudo nano /etc/systemd/system/timetracker.service
```

```ini
[Unit]
Description=AI TimeTracker
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/ai-timetracker
ExecStart=/usr/bin/pnpm dev
Restart=on-failure
RestartSec=10
Environment=PORT=5666

[Install]
WantedBy=multi-user.target
```

### Enable service

```bash
sudo systemctl daemon-reload
sudo systemctl enable timetracker
sudo systemctl start timetracker
```

### Check status

```bash
sudo systemctl status timetracker
```

### View logs

```bash
journalctl -u timetracker -f
```

---

## Desktop Entry

Create `~/.local/share/applications/timetracker.desktop`:

```ini
[Desktop Entry]
Name=AI TimeTracker
Comment=Time tracking with AI
Exec=xdg-open http://localhost:5666/timetracker
Icon=clock
Terminal=false
Type=Application
Categories=Office;Utility;
```

---

## Ports

| Service       | Port |
| ------------- | ---- |
| TimeTracker   | 5666 |
| ActivityWatch | 5600 |

### Firewall (ufw)

```bash
sudo ufw allow 5666/tcp
sudo ufw allow 5600/tcp
```

### Firewall (firewalld)

```bash
sudo firewall-cmd --permanent --add-port=5666/tcp
sudo firewall-cmd --permanent --add-port=5600/tcp
sudo firewall-cmd --reload
```

---

## Troubleshooting

### Port already in use

```bash
sudo lsof -i :5666
sudo kill -9 <PID>
```

### ActivityWatch not detected

1. Check ActivityWatch is running
2. Verify: http://localhost:5600
3. Check permissions

### Node.js version issues

```bash
node --version  # Should be 20+
nvm use 20      # If using nvm
```

---

## Docker (Alternative)

```bash
# Coming soon
docker run -p 5666:5666 shopconnector/ai-timetracker
```

---

## Support

- GitHub: https://github.com/shopconnector/ai-timetracker
- Issues: https://github.com/shopconnector/ai-timetracker/issues
