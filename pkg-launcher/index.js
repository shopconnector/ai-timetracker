#!/usr/bin/env node
/**
 * AI TimeTracker Launcher
 *
 * Self-extracting launcher skompilowany z pkg.
 * Przy pierwszym uruchomieniu rozpakowuje aplikację do %LOCALAPPDATA%\AI-TimeTracker
 * Następnie uruchamia serwer Next.js i otwiera przeglądarkę.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const os = require('os');

// Konfiguracja
const APP_NAME = 'AI-TimeTracker';
const PORT = 5666;
const AW_PORT = 5600;
const BASE_PATH = '/timetracker';

// Ścieżki
const INSTALL_DIR = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), APP_NAME);
const NODE_EXE = path.join(INSTALL_DIR, 'node.exe');
const SERVER_JS = path.join(INSTALL_DIR, 'apps', 'web', 'server.js');
const ENV_FILE = path.join(INSTALL_DIR, 'apps', 'web', '.env.local');
const ENV_EXAMPLE = path.join(INSTALL_DIR, 'apps', 'web', '.env.example');
const VERSION_FILE = path.join(INSTALL_DIR, '.version');

// Asset ZIP (embedded przez pkg)
const ASSET_ZIP = path.join(__dirname, 'assets', 'app.zip');

// Kolory dla konsoli
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(msg, color = '') {
  console.log(`${color}${msg}${colors.reset}`);
}

function logStep(step, msg) {
  log(`[${step}] ${msg}`, colors.cyan);
}

function logOk(msg) {
  log(`  ✓ ${msg}`, colors.green);
}

function logWarn(msg) {
  log(`  ⚠ ${msg}`, colors.yellow);
}

function logError(msg) {
  log(`  ✗ ${msg}`, colors.red);
}

// Sprawdź czy port jest zajęty
function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, timeout: 2000 }, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

// Czekaj na port
function waitForPort(port, maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      checkPort(port).then((isOpen) => {
        if (isOpen) {
          resolve(true);
        } else if (attempts >= maxAttempts) {
          reject(new Error(`Port ${port} nie odpowiada po ${maxAttempts} próbach`));
        } else {
          setTimeout(check, 1000);
        }
      });
    };
    check();
  });
}

// Otwórz URL w domyślnej przeglądarce
function openBrowser(url) {
  const platform = process.platform;
  let cmd;

  if (platform === 'win32') {
    cmd = `start "" "${url}"`;
  } else if (platform === 'darwin') {
    cmd = `open "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }

  try {
    execSync(cmd, { stdio: 'ignore', shell: true });
    return true;
  } catch {
    return false;
  }
}

// Rozpakuj ZIP używając PowerShell (Windows) lub unzip (Linux/Mac)
function extractZip(zipPath, destPath) {
  logStep('2/5', 'Rozpakowywanie aplikacji...');

  // Utwórz folder docelowy
  if (!fs.existsSync(destPath)) {
    fs.mkdirSync(destPath, { recursive: true });
  }

  const platform = process.platform;

  try {
    if (platform === 'win32') {
      // PowerShell na Windows
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destPath}' -Force"`, {
        stdio: 'pipe'
      });
    } else {
      // unzip na Linux/Mac
      execSync(`unzip -o "${zipPath}" -d "${destPath}"`, {
        stdio: 'pipe'
      });
    }
    logOk(`Rozpakowano do: ${destPath}`);
    return true;
  } catch (err) {
    logError(`Błąd rozpakowywania: ${err.message}`);
    return false;
  }
}

// Pobierz wersję z package.json
function getPackageVersion() {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return pkg.version || '0.0.0';
    }
  } catch {}
  return '0.0.0';
}

// Sprawdź czy trzeba zaktualizować
function needsUpdate() {
  const currentVersion = getPackageVersion();

  if (!fs.existsSync(VERSION_FILE)) {
    return true;
  }

  try {
    const installedVersion = fs.readFileSync(VERSION_FILE, 'utf8').trim();
    return installedVersion !== currentVersion;
  } catch {
    return true;
  }
}

// Zapisz wersję
function saveVersion() {
  const currentVersion = getPackageVersion();
  fs.writeFileSync(VERSION_FILE, currentVersion);
}

// Główna funkcja
async function main() {
  console.log('');
  log('╔══════════════════════════════════════════╗', colors.cyan);
  log('║         AI TimeTracker Launcher          ║', colors.cyan);
  log('╚══════════════════════════════════════════╝', colors.cyan);
  console.log('');

  // Krok 1: Sprawdź czy aplikacja jest zainstalowana
  logStep('1/5', 'Sprawdzanie instalacji...');

  const isInstalled = fs.existsSync(SERVER_JS) && fs.existsSync(NODE_EXE);
  const shouldUpdate = needsUpdate();

  if (!isInstalled || shouldUpdate) {
    if (!isInstalled) {
      logWarn('Aplikacja nie jest zainstalowana');
    } else {
      logWarn('Dostępna nowa wersja');
    }

    // Sprawdź czy mamy asset ZIP
    if (!fs.existsSync(ASSET_ZIP)) {
      logError(`Nie znaleziono pliku: ${ASSET_ZIP}`);
      logError('Launcher wymaga pliku app.zip w folderze assets/');
      process.exit(1);
    }

    // Rozpakuj
    if (!extractZip(ASSET_ZIP, INSTALL_DIR)) {
      logError('Nie udało się rozpakować aplikacji');
      process.exit(1);
    }

    saveVersion();
  } else {
    logOk('Aplikacja zainstalowana');
  }

  // Krok 2: Sprawdź ActivityWatch
  logStep('3/5', 'Sprawdzanie ActivityWatch...');

  const awRunning = await checkPort(AW_PORT);
  if (awRunning) {
    logOk(`ActivityWatch działa na porcie ${AW_PORT}`);
  } else {
    logWarn('ActivityWatch NIE działa!');
    console.log('');
    log('  TimeTracker wymaga ActivityWatch do zbierania danych.', colors.yellow);
    log('  Pobierz z: https://activitywatch.net/downloads/', colors.yellow);
    console.log('');
    log('  Kontynuuję mimo to...', colors.yellow);
    console.log('');
  }

  // Krok 3: Sprawdź czy serwer już działa
  logStep('4/5', 'Uruchamianie serwera...');

  const serverRunning = await checkPort(PORT);
  if (serverRunning) {
    logOk(`Serwer już działa na porcie ${PORT}`);
  } else {
    // Sprawdź .env.local
    if (!fs.existsSync(ENV_FILE)) {
      if (fs.existsSync(ENV_EXAMPLE)) {
        fs.copyFileSync(ENV_EXAMPLE, ENV_FILE);
        logWarn('Utworzono .env.local z przykładu');
        log('  Edytuj plik konfiguracyjny:', colors.yellow);
        log(`  ${ENV_FILE}`, colors.yellow);
      }
    }

    // Uruchom serwer
    const serverProcess = spawn(NODE_EXE, [SERVER_JS], {
      cwd: path.dirname(SERVER_JS),
      env: {
        ...process.env,
        PORT: PORT.toString(),
        NODE_ENV: 'production'
      },
      detached: true,
      stdio: 'ignore'
    });

    serverProcess.unref();
    logOk(`Serwer uruchomiony (PID: ${serverProcess.pid})`);

    // Czekaj na start
    log('  Czekam na uruchomienie serwera...', colors.cyan);
    try {
      await waitForPort(PORT, 30);
      logOk('Serwer gotowy');
    } catch (err) {
      logError(err.message);
      logError('Serwer nie wystartował w czasie');
    }
  }

  // Krok 4: Otwórz przeglądarkę
  logStep('5/5', 'Otwieranie przeglądarki...');

  const url = `http://localhost:${PORT}${BASE_PATH}`;
  if (openBrowser(url)) {
    logOk(`Otwarto: ${url}`);
  } else {
    logWarn(`Nie udało się otworzyć przeglądarki`);
    log(`  Otwórz ręcznie: ${url}`, colors.yellow);
  }

  console.log('');
  log('╔══════════════════════════════════════════╗', colors.green);
  log('║       TimeTracker uruchomiony!           ║', colors.green);
  log('╚══════════════════════════════════════════╝', colors.green);
  console.log('');
  log(`  TimeTracker:   http://localhost:${PORT}${BASE_PATH}`, colors.bright);
  log(`  ActivityWatch: http://localhost:${AW_PORT}`, colors.bright);
  console.log('');
  log('  Aby zatrzymać serwer, zamknij to okno lub użyj Task Managera.', colors.cyan);
  console.log('');

  // Trzymaj proces żywy żeby okno się nie zamknęło
  process.stdin.resume();
}

// Uruchom
main().catch((err) => {
  logError(`Błąd: ${err.message}`);
  process.exit(1);
});
