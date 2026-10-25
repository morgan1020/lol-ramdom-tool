import { app, BrowserWindow, ipcMain, net, protocol, session, shell, safeStorage, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readLobby, ClientError } from './lcu.js';
import { appUrl, resolveAsset } from './appProtocol.js';
import { applyCurrentPlayerRoles } from './applyRoles.js';
import { DesktopDataStore } from './dataStore.js';
import { registerDataIpc } from './dataIpc.js';
import { createSystemEncryption } from './encryption.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.resolve(directory, '../../dist');
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://ddragon.leagueoflegends.com; connect-src 'self' https://ddragon.leagueoflegends.com; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'";
let mainWindow;
let lobbyRead;
let applyingRoles = false;

function isAppSender(event) {
  return mainWindow && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame && event.senderFrame.url === appUrl;
}

protocol.registerSchemesAsPrivileged([{ scheme: 'lol-draw', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

function createWindow() {
  mainWindow = new BrowserWindow({
    title: '英雄聯盟抽籤工具', width: 1040, height: 760, minWidth: 760, minHeight: 640,
    autoHideMenuBar: true, backgroundColor: '#0e1420',
    icon: path.join(assetRoot, 'favicon-dice.png'),
    webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && ['developer.riotgames.com', 'www.communitydragon.org', 'support.discord.com'].includes(parsed.hostname)) {
        void shell.openExternal(url);
      }
    } catch { /* Ignore invalid external URLs. */ }
    return { action: 'deny' };
  });
  void mainWindow.loadURL(appUrl);
  mainWindow.on('closed', () => { mainWindow = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  app.whenReady().then(async () => {
    const encryption = await createSystemEncryption(safeStorage);
    const store = new DesktopDataStore({ directory: path.join(app.getPath('userData'), 'data'), encryption });
    registerDataIpc({ ipcMain, store, isSender: isAppSender, getWindow: () => mainWindow, dialog, shell });
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(permission === 'clipboard-sanitized-write'));
    session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'clipboard-sanitized-write');
    protocol.handle('lol-draw', async (request) => {
      try {
        const asset = resolveAsset(assetRoot, request.url);
        if (!asset || request.method !== 'GET') return new Response('Not found', { status: 404 });
        const response = await net.fetch(pathToFileURL(asset).href);
        const headers = new Headers(response.headers);
        headers.set('Content-Security-Policy', csp);
        return new Response(response.body, { status: response.status, headers });
      } catch { return new Response('Not found', { status: 404 }); }
    });
    ipcMain.handle('lol:read-lobby', async (event) => {
      if (!isAppSender(event)) {
        return { ok: false, message: '不允許的客戶端查詢來源' };
      }
      if (applyingRoles) return { ok: false, message: '正在套用分路，請稍候再讀取' };
      // Coalesce requests and do not pass credentials or native errors across IPC.
      lobbyRead ??= readLobby().then((lobby) => ({ ok: true, lobby })).catch((error) => ({
        ok: false, message: error instanceof ClientError ? error.message : '讀取客戶端失敗，請稍候再試'
      })).finally(() => { lobbyRead = null; });
      return lobbyRead;
    });
    ipcMain.handle('lol:apply-roles', async (event, results) => {
      if (!isAppSender(event)) return { ok: false, message: '不允許的客戶端操作來源' };
      if (applyingRoles || lobbyRead) return { ok: false, message: '正在處理客戶端操作，請稍候再試' };
      applyingRoles = true;
      try { return { ok: true, applied: await applyCurrentPlayerRoles(results) }; }
      catch (error) { return { ok: false, message: error instanceof ClientError ? error.message : '套用分路失敗，請查看客戶端；不會自動重送' }; }
      finally { applyingRoles = false; }
    });
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
