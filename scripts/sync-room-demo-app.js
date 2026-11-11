// Two isolated production windows with synthetic local-client data only.
import { app, ipcMain } from 'electron';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSyncRoomUrl } from '../src/desktop/syncRoomClient.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const role = process.env.SYNC_ROOM_DEMO_ROLE;
const profile = path.resolve(process.env.SYNC_ROOM_DEMO_PROFILE || '');
const output = path.join(root, 'release', 'sync-room-demo');
const relative = path.relative(output, profile);
const url = new URL(validateSyncRoomUrl(process.env.SYNC_ROOM_DEMO_URL));
if (!['host', 'guest'].includes(role) || !relative || relative.startsWith('..') || path.isAbsolute(relative) ||
  !['/sync', '/rooms'].includes(url.pathname.replace(/\/$/, ''))) {
  throw new Error('請透過 npm run room:demo 啟動隔離測試 App');
}
mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
app.disableHardwareAcceleration();
console.log(`啟動隔離視窗 ${role}`);

const names = ['測試主持人#DEMO', '測試朋友#DEMO'];
const ownIndex = role === 'host' ? 0 : 1;
const register = ipcMain.handle.bind(ipcMain);
// Intercept before importing main.js so even the initial React lobby query is synthetic.
ipcMain.handle = (channel, handler) => {
  if (channel === 'lol:read-lobby') return register(channel, () => ({ ok: true, lobby: {
    players: names.map((name, index) => ({ name, id: `demo-${index}`, isLeader: index === 0, firstPosition: 'UNSELECTED', secondPosition: 'UNSELECTED' })),
    localPlayerId: `demo-${ownIndex}`, queueId: 420, isCustom: false, fetchedAt: new Date().toISOString()
  } }));
  if (channel === 'lol:apply-roles') return register(channel, () => ({ ok: false, message: '本機雙 App 測試禁止寫入真實 LoL 分路' }));
  if (channel === 'data:discord-send') return register(channel, () => ({ ok: false, message: '本機雙 App 測試禁止傳送 Discord 訊息' }));
  return register(channel, handler);
};
process.on('message', (message) => { if (message?.type === 'shutdown') app.quit(); });
process.on('disconnect', () => { console.log(`測試視窗 ${role} 與啟動器連線結束`); app.quit(); });

const windowReady = new Promise((resolve) => app.once('browser-window-created', (_event, window) => resolve(window)));
await import('../src/desktop/main.js');
// Do not top-level-await BrowserWindow creation: Electron waits for ESM entry
// evaluation before emitting ready, while main.js creates the window on ready.
void (async () => {
try {
  const window = await windowReady;
  window.setTitle(`多人房間測試 — ${role === 'host' ? '主持人' : '加入者'}`);
  window.webContents.on('page-title-updated', (event) => event.preventDefault());
  await new Promise((resolve, reject) => {
    window.webContents.once('did-finish-load', resolve);
    window.webContents.once('did-fail-load', (_event, code) => reject(new Error(`介面載入失敗 (${code})`)));
  });
  await window.webContents.executeJavaScript(`(async () => {
    const pause = () => new Promise(resolve => setTimeout(resolve, 50));
    for (let i = 0; i < 200; i += 1) {
      const tab = document.querySelector('#tool-tab-room') || [...document.querySelectorAll('[role="tab"]')].find(item => item.textContent.trim() === '多人房間');
      if (tab && !tab.disabled) { tab.click(); break; }
      await pause();
    }
    for (let i = 0; i < 200 && !document.querySelector('#sync-player-name'); i += 1) await pause();
    const setField = (selector, value) => {
      const input = document.querySelector(selector);
      if (!input) throw new Error('找不到多人房間欄位：' + selector);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setField('#sync-player-name', ${JSON.stringify(names[ownIndex])});
    setField('#sync-server-url', ${JSON.stringify(url.href)});
    if (${JSON.stringify(role)} === 'guest') {
      const join = [...document.querySelectorAll('.sync-connect-form button')].find(item => item.textContent.trim() === '加入房間');
      if (!join) throw new Error('找不到加入房間按鈕');
      join.click();
    }
    await pause();
    if (document.querySelector('#sync-player-name')?.value !== ${JSON.stringify(names[ownIndex])} || document.querySelector('#sync-server-url')?.value !== ${JSON.stringify(url.href)}) throw new Error('測試欄位預填失敗');
  })()`);
  process.send?.({ type: 'ready' });
} catch (error) {
  process.send?.({ type: 'failed', message: error.message });
  console.error(error.message);
  app.exit(1);
}
})();
