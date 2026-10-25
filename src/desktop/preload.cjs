const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lolDesktop', {
  readLobby: () => ipcRenderer.invoke('lol:read-lobby'),
  applyRoles: (results) => ipcRenderer.invoke('lol:apply-roles', results),
  initializeData: (legacy) => ipcRenderer.invoke('data:initialize', legacy),
  saveDataStats: (stats) => ipcRenderer.invoke('data:save-stats', stats),
  saveDataPreferences: (patch) => ipcRenderer.invoke('data:save-preferences', patch),
  changeDataDiscord: (action, payload) => ipcRenderer.invoke('data:discord-change', action, payload),
  sendDataDiscord: (results) => ipcRenderer.invoke('data:discord-send', results),
  importDataStats: (text, mode) => ipcRenderer.invoke('data:import-stats', text, mode),
  exportDataStats: () => ipcRenderer.invoke('data:export-stats'),
  openDataFolder: () => ipcRenderer.invoke('data:open-folder')
});
