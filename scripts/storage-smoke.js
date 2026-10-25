// Isolated end-to-end persistence check using real Windows encryption and synthetic data.
// All Discord sends and native file dialogs are replaced with local test implementations.
import { app, BrowserWindow, ipcMain, net, protocol, safeStorage, session } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { appUrl, resolveAsset } from '../src/desktop/appProtocol.js';
import { DesktopDataStore } from '../src/desktop/dataStore.js';
import { registerDataIpc } from '../src/desktop/dataIpc.js';
import { createSystemEncryption } from '../src/desktop/encryption.js';

const output = path.resolve('release/storage-smoke');
const profile = path.join(output, `profile-${Date.now()}`);
mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([{ scheme: 'lol-draw', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const timer = setTimeout(() => { console.error('Storage check timed out'); app.exit(1); }, 60000);
  let window;
  try {
    protocol.handle('lol-draw', async (request) => {
      const asset = resolveAsset(path.resolve('dist'), request.url);
      if (!asset) return new Response('Not found', { status: 404 });
      const response = await net.fetch(pathToFileURL(asset).href);
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://ddragon.leagueoflegends.com; connect-src 'self' https://ddragon.leagueoflegends.com");
      return new Response(response.body, { headers });
    });
    const webhook = 'https://discord.com/api/webhooks/123456789012345678/synthetic_storage_smoke_secret';
    const legacy = { lolDrawStats: JSON.stringify({ '舊玩家#TW': { 上路: 5 }, '保留玩家#TW': { 輔助: 0.5 } }), lolDiscordSync: JSON.stringify({ webhookUrl: webhook, enabled: false }), lolTheme: 'dark', lolAutoApplyRoles: 'false' };
    const seed = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await seed.loadURL(appUrl);
    await seed.webContents.executeJavaScript(`for (const [key, value] of Object.entries(${JSON.stringify(legacy)})) localStorage.setItem(key, value); true;`);
    const encryption = await createSystemEncryption(safeStorage);
    if (!encryption.isEncryptionAvailable()) throw new Error('System encryption unavailable in this test environment');
    const sent = [];
    const store = new DesktopDataStore({ directory: path.join(profile, 'data'), encryption, send: async (url, results) => { sent.push({ url, results }); return 'synthetic-message-id'; } });
    const createWindow = () => new BrowserWindow({ show: false, width: 1040, height: 760, webPreferences: { preload: path.resolve('src/desktop/preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
    window = createWindow();
    const allowed = (event) => event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === appUrl;
    registerDataIpc({ ipcMain, store, isSender: allowed, getWindow: () => window, dialog: { showSaveDialog: async () => ({ canceled: false, filePath: path.join(output, 'exported-stats.json') }) }, shell: { openPath: async () => '' } });
    ipcMain.handle('lol:read-lobby', () => ({ ok: false, message: '測試環境未連線客戶端' }));
    ipcMain.handle('lol:apply-roles', () => ({ ok: false, message: '測試環境不修改客戶端' }));
    await window.loadURL(appUrl); seed.destroy();
    const run = (fn) => window.webContents.executeJavaScript(`(${fn.toString()})()`);
    await run(async () => {
      for (let i = 0; i < 100 && !document.querySelector('.compact-app'); i++) await new Promise((resolve) => setTimeout(resolve, 40));
      if (!document.querySelector('.compact-app')) throw new Error(document.querySelector('.data-startup')?.textContent || 'App failed to initialize');
      for (const key of ['lolDrawStats', 'lolDiscordSync', 'lolTheme', 'lolAutoApplyRoles']) if (localStorage.getItem(key) !== null) throw new Error('Legacy key not removed: ' + key);
      const value = await window.lolDesktop.initializeData({});
      if (!value.ok || value.value.data.stats['舊玩家#TW'].上路 !== 5) throw new Error('Legacy statistics not migrated');
      if (JSON.stringify(value).includes('webhookUrl') || JSON.stringify(value).includes('synthetic_storage_smoke_secret')) throw new Error('Secret returned to renderer');
      if (document.documentElement.dataset.theme !== 'dark') throw new Error('Legacy theme lost');
    });
    const encrypted = await readFile(store.file, 'utf8');
    if (encrypted.includes(webhook) || encrypted.includes('synthetic_storage_smoke_secret') || encrypted.includes('webhookUrl')) throw new Error('Plaintext secret found on disk');
    await run(async () => {
      const edited = await window.lolDesktop.changeDataDiscord('configure', { previousId: '123456789012345678', label: '測試改名', webhookUrl: '' });
      if (!edited.ok || edited.value.discord.destinations[0].label !== '測試改名' || edited.value.discord.destinations[0].webhookUrl) throw new Error('Secret-preserving edit failed');
      await window.lolDesktop.changeDataDiscord('toggle');
      const sent = await window.lolDesktop.sendDataDiscord([{ name: '舊玩家#TW', main: '上路', secondary: '輔助' }]);
      if (!sent.ok || sent.value !== 'synthetic-message-id') throw new Error('Main-process send failed');
      await window.lolDesktop.changeDataDiscord('toggle');
      const exported = await window.lolDesktop.exportDataStats();
      if (!exported.ok || exported.value.canceled) throw new Error('Native export failed');
    });
    if (sent.length !== 1 || sent[0].url !== webhook) throw new Error('Main-process send lost the encrypted secret');
    const exported = await readFile(path.join(output, 'exported-stats.json'), 'utf8');
    if (/webhook|discord|synthetic_storage_smoke_secret/i.test(exported)) throw new Error('Backup includes private settings');
    const imports = await run(async () => {
      const sleep = () => new Promise((resolve) => setTimeout(resolve, 40));
      document.querySelector('[aria-label="設定"]').click(); await sleep();
      [...document.querySelectorAll('.settings-nav button')].find((button) => button.textContent === '資料與備份').click(); await sleep();
      const selectFile = (text) => {
        const input = document.querySelector('[aria-label="選擇統計 JSON 檔"]');
        const transfer = new DataTransfer(); transfer.items.add(new File([text], 'stats.json', { type: 'application/json' }));
        input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const text = JSON.stringify({ '舊玩家#TW': { 上路: 2 }, '新玩家#TW': { 打野: 3 } });
      for (let attempt = 0; attempt < 2; attempt++) {
        selectFile(text);
        for (let i = 0; i < 100 && !document.querySelector('.stats-import-preview'); i++) await sleep();
        const before = await window.lolDesktop.initializeData({});
        if (attempt === 0 && before.value.data.stats['舊玩家#TW'].上路 !== 5) throw new Error('Preview changed statistics');
        [...document.querySelectorAll('.stats-import-preview button')].find((button) => button.textContent === '確認合併匯入').click();
        for (let i = 0; i < 100 && document.querySelector('.stats-import-preview'); i++) await sleep();
      }
      let value = (await window.lolDesktop.initializeData({})).value.data;
      if (value.stats['舊玩家#TW'].上路 !== 2 || value.stats['新玩家#TW'].打野 !== 3 || !value.stats['保留玩家#TW']) throw new Error('Merge or repeat-import behavior incorrect');
      const revision = value.revision;
      selectFile('not-json');
      for (let i = 0; i < 100 && !document.querySelector('.toast.is-error'); i++) await sleep();
      if (!document.querySelector('.toast.is-error')) throw new Error('Malformed import did not show error');
      value = (await window.lolDesktop.initializeData({})).value.data;
      if (value.revision !== revision) throw new Error('Invalid import changed data');
      selectFile(JSON.stringify({ '取代玩家#TW': { 中路: 4 } }));
      for (let i = 0; i < 100 && !document.querySelector('.stats-import-preview'); i++) await sleep();
      const mode = document.querySelector('#stats-import-mode'); mode.click(); await sleep(); document.getElementById(mode.getAttribute('aria-controls')).querySelector('[data-value="replace"]').click(); await sleep();
      if (!document.querySelector('.data-replace-warning')) throw new Error('Replace warning missing');
      [...document.querySelectorAll('.stats-import-preview button')].find((button) => button.textContent === '確認取代全部紀錄').click();
      for (let i = 0; i < 100 && document.querySelector('.stats-import-preview'); i++) await sleep();
      value = (await window.lolDesktop.initializeData({})).value.data;
      if (Object.keys(value.stats).join(',') !== '取代玩家#TW' || value.discord.destinations.length !== 1) throw new Error('Replace import changed private settings or kept stale players');
      return { preview: true, merge: true, repeatImportIdempotent: true, invalidFilePreservesData: true, replace: true };
    });
    const other = createWindow(); await other.loadURL(appUrl);
    const denied = await other.webContents.executeJavaScript('window.lolDesktop.saveDataStats({})');
    if (denied.ok) throw new Error('Untrusted window could modify data');
    other.destroy();
    const reloaded = new DesktopDataStore({ directory: store.directory, encryption });
    const result = await reloaded.initialize({});
    if (result.data.stats['取代玩家#TW'].中路 !== 4 || result.data.discord.destinations[0].label !== '測試改名') throw new Error('Restart lost data or encrypted webhook');
    const beforeWebsite = await readFile(store.file, 'utf8');
    const website = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await website.loadURL(appUrl);
    await website.webContents.executeJavaScript(`(async () => {
      const sleep = () => new Promise((resolve) => setTimeout(resolve, 30));
      for (let i = 0; i < 100 && !document.querySelector('.compact-app'); i++) await sleep();
      if (window.lolDesktop) throw new Error('Website unexpectedly has native capabilities');
      document.querySelector('[aria-label="設定"]').click(); await sleep();
      [...document.querySelectorAll('.settings-nav button')].find((button) => button.textContent === '資料與備份').click(); await sleep();
      const input = document.querySelector('[aria-label="選擇統計 JSON 檔"]');
      const transfer = new DataTransfer(); transfer.items.add(new File([JSON.stringify({ '網站玩家#TW': { 上路: 3 } })], 'web-stats.json', { type: 'application/json' }));
      input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
      for (let i = 0; i < 100 && !document.querySelector('.stats-import-preview'); i++) await sleep();
      [...document.querySelectorAll('.stats-import-preview button')].find((button) => button.textContent === '確認合併匯入').click();
      for (let i = 0; i < 100 && document.querySelector('.stats-import-preview'); i++) await sleep();
      if (JSON.parse(localStorage.getItem('lolDrawStats'))['網站玩家#TW'].上路 !== 3) throw new Error('Website import did not use localStorage');
    })()`);
    const downloaded = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Website export did not download')), 5000);
      session.defaultSession.once('will-download', (_event, item) => {
        item.setSavePath(path.join(output, 'website-export.json'));
        item.once('done', (_event, state) => { clearTimeout(timeout); state === 'completed' ? resolve() : reject(new Error('Website download failed')); });
      });
    });
    await website.webContents.executeJavaScript(`[...document.querySelectorAll('.data-actions button')].find(button => button.textContent === '匯出統計').click(); true;`);
    await downloaded;
    const websiteBackup = JSON.parse(await readFile(path.join(output, 'website-export.json'), 'utf8'));
    if (websiteBackup.stats['網站玩家#TW'].上路 !== 3) throw new Error('Website backup invalid');
    if (await readFile(store.file, 'utf8') !== beforeWebsite) throw new Error('Website touched native data');
    website.destroy();
    window.show(); window.focus(); window.webContents.invalidate();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await writeFile(path.join(output, 'data-settings.png'), (await window.webContents.capturePage()).toPNG());
    const check = { realSystemEncryption: true, migratedAndCleaned: true, rendererHasNoSavedSecret: true, ciphertextOnlyOnDisk: true, mainProcessSend: true, exportStatsOnly: true, imports, websiteImportExport: true, websiteNativeIsolation: true, senderValidation: true, restart: true, externalDiscordRequests: 0 };
    await writeFile(path.join(output, 'result.json'), JSON.stringify(check, null, 2));
    console.log(JSON.stringify(check)); clearTimeout(timer); app.exit(0);
  } catch (error) { console.error(error.stack || error.message); clearTimeout(timer); app.exit(1); }
});
