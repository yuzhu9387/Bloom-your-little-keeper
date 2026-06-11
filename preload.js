const { contextBridge, ipcRenderer } = require('electron');

// Minimal, safe bridge: the renderer can only load/save the dashboard blob.
contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('store:load'),
  save: (data) => ipcRenderer.invoke('store:save', data),
  // Synchronous save used to flush state before the window unloads / app quits.
  saveSync: (data) => ipcRenderer.sendSync('store:save-sync', data)
});
