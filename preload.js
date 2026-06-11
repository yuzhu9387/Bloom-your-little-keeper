const { contextBridge, ipcRenderer } = require('electron');

// Minimal, safe bridge: the renderer can only load/save the dashboard blob.
contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('store:load'),
  save: (data) => ipcRenderer.invoke('store:save', data)
});
