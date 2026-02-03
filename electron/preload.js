// TimeTracker Electron Preload Script
// Exposes limited APIs to the renderer process

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,
  isElectron: true,

  // App info
  getVersion: () => ipcRenderer.invoke('get-version'),

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Notifications
  showNotification: (title, body) => {
    new Notification(title, { body });
  },

  // Open external links
  openExternal: (url) => ipcRenderer.send('open-external', url),
});

// Log that we're running in Electron
console.log('TimeTracker running in Electron');
