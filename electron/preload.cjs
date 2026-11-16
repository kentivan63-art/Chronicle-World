const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chronicleDesktop', {
  isElectron: true,
  platform: process.platform,
  saveWorldDialog: (jsonString, defaultName) =>
    ipcRenderer.invoke('chronicle:save-file', jsonString, defaultName),
  openWorldDialog: () => ipcRenderer.invoke('chronicle:open-file'),
});
