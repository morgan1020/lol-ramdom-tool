const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lolDesktop', {
  syncRoom: {
    connect: (options) => ipcRenderer.invoke('sync-room:connect', options),
    command: (command) => ipcRenderer.invoke('sync-room:command', command),
    disconnect: () => ipcRenderer.invoke('sync-room:disconnect'),
    getState: () => ipcRenderer.invoke('sync-room:get-state'),
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('sync-room:state', listener);
      return () => ipcRenderer.removeListener('sync-room:state', listener);
    }
  },
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
