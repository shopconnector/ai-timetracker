// TimeTracker Electron Main Process
// Creates a desktop application wrapper for the Next.js web app

const { app, BrowserWindow, Tray, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const PORT = 5666;
const APP_URL = `http://localhost:${PORT}`;
const ICON_PATH = path.join(__dirname, 'assets', 'icon.ico');

let mainWindow = null;
let tray = null;
let serverProcess = null;
let isQuitting = false;

// Check if Next.js server is running
function checkServer() {
  return new Promise((resolve) => {
    const req = http.get(`${APP_URL}/timetracker/api/status`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Wait for server to be ready
async function waitForServer(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    if (await checkServer()) {
      return true;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

// Start Next.js server
function startServer() {
  return new Promise((resolve, reject) => {
    const isPackaged = app.isPackaged;

    if (isPackaged) {
      // In production, use the bundled Next.js server
      const serverPath = path.join(process.resourcesPath, 'server');
      serverProcess = spawn('node', ['server.js'], {
        cwd: serverPath,
        env: { ...process.env, PORT: PORT.toString() },
        stdio: 'pipe'
      });
    } else {
      // In development, use pnpm dev
      serverProcess = spawn('pnpm', ['dev'], {
        cwd: path.join(__dirname, '..'),
        shell: true,
        env: { ...process.env, PORT: PORT.toString() },
        stdio: 'pipe'
      });
    }

    serverProcess.stdout.on('data', (data) => {
      console.log(`Server: ${data}`);
      if (data.toString().includes('Ready')) {
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`Server Error: ${data}`);
    });

    serverProcess.on('error', (error) => {
      console.error('Failed to start server:', error);
      reject(error);
    });

    serverProcess.on('close', (code) => {
      console.log(`Server exited with code ${code}`);
      if (!isQuitting) {
        // Server crashed, try to restart
        setTimeout(() => startServer(), 3000);
      }
    });

    // Resolve after timeout even if no "Ready" message
    setTimeout(resolve, 10000);
  });
}

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: ICON_PATH,
    title: 'TimeTracker',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    autoHideMenuBar: true
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Load the app
  mainWindow.loadURL(APP_URL);

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Handle window close - minimize to tray instead
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create system tray
function createTray() {
  tray = new Tray(ICON_PATH);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Otworz TimeTracker',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    {
      label: 'Otworz w przegladarce',
      click: () => shell.openExternal(APP_URL)
    },
    { type: 'separator' },
    {
      label: 'Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.loadURL(APP_URL);
        }
      }
    },
    {
      label: 'Timesheet',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.loadURL(`${APP_URL}/timesheet`);
        }
      }
    },
    {
      label: 'Tasks',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.loadURL(`${APP_URL}/tasks`);
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.loadURL(`${APP_URL}/settings`);
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Zamknij',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('TimeTracker');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    } else {
      createWindow();
    }
  });
}

// IPC Handlers for preload API
ipcMain.handle('get-version', () => {
  return app.getVersion();
});

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.on('open-external', (event, url) => {
  if (url && typeof url === 'string' && url.startsWith('http')) {
    shell.openExternal(url);
  }
});

// App lifecycle
app.whenReady().then(async () => {
  // Check if server is already running
  const serverRunning = await checkServer();

  if (!serverRunning) {
    // Start server
    try {
      await startServer();
      // Wait for server to be ready
      const ready = await waitForServer();
      if (!ready) {
        dialog.showErrorBox(
          'Blad uruchomienia',
          'Nie udalo sie uruchomic serwera TimeTracker. Sprawdz czy port 5666 jest wolny.'
        );
        app.quit();
        return;
      }
    } catch (error) {
      dialog.showErrorBox('Blad', `Nie udalo sie uruchomic serwera: ${error.message}`);
      app.quit();
      return;
    }
  }

  createTray();
  createWindow();
});

app.on('window-all-closed', () => {
  // Don't quit on window close - keep running in tray
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  if (serverProcess) {
    serverProcess.kill();
  }
});

// Handle app second instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
