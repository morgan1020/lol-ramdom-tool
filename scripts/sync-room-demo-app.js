// Two isolated production windows with synthetic local-client data only.
import { app, ipcMain, screen } from 'electron';
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

const names = ['測試主持人#DEMO', '測試朋友#DEMO', '測試隊友#DEMO1', '測試隊友#DEMO2', '測試隊友丙#DEMO'];
const firstPositions = ['TOP', 'JUNGLE', 'MIDDLE', 'FILL', 'UNSELECTED'];
const ownIndex = role === 'host' ? 0 : 1;
const register = ipcMain.handle.bind(ipcMain);
// Intercept before importing main.js so even the initial React lobby query is synthetic.
ipcMain.handle = (channel, handler) => {
  if (channel === 'lol:read-lobby') return register(channel, () => ({ ok: true, lobby: {
    players: names.map((name, index) => ({ name, id: `demo-${index}`, isLeader: index === 0, firstPosition: firstPositions[index], secondPosition: 'UNSELECTED' })),
    localPlayerId: `demo-${ownIndex}`, queueId: 420, isCustom: false, fetchedAt: new Date().toISOString()
  } }));
  if (channel === 'lol:apply-roles') return register(channel, (_event, results, expectedName, resultId) => {
    if (!resultId || expectedName !== names[ownIndex] || !results.some(result => result.name === expectedName)) {
      return { ok: false, message: '模擬大廳帳號或結果不符' };
    }
    console.log(`[${role}] 模擬套用分路 ${resultId}`);
    return { ok: true, simulated: true };
  });
  if (channel === 'data:discord-send') return register(channel, (_event, results) => {
    if (role !== 'host') return { ok: false, message: '只有主持人傳送結果' };
    console.log(`[${role}] 模擬 Discord 傳送 ${results.length} 位玩家的分路`);
    return { ok: true, value: '12345' };
  });
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
  const title = `多人房間測試 — ${role === 'host' ? '主持人' : '加入者'}`;
  window.on('page-title-updated', (event) => event.preventDefault());
  window.setTitle(title);
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  const windowWidth = Math.min(1040, Math.max(760, Math.floor(width / 2)));
  window.setBounds({
    x: role === 'host' ? x : x + Math.max(0, width - windowWidth),
    y,
    width: windowWidth,
    height: Math.min(760, height)
  });
  await new Promise((resolve, reject) => {
    window.webContents.once('did-finish-load', resolve);
    window.webContents.once('did-fail-load', (_event, code) => reject(new Error(`介面載入失敗 (${code})`)));
  });
  await window.webContents.executeJavaScript(`(async () => {
    const pause = () => new Promise(resolve => setTimeout(resolve, 50));
    for (let i = 0; i < 200; i += 1) {
      const roomEntry = document.querySelector('#open-sync-room');
      if (roomEntry && !roomEntry.disabled) { roomEntry.click(); break; }
      await pause();
    }
    const optionSelector = 'dialog[open] .sync-dialog-actions button:not(:disabled)';
    for (let i = 0; i < 200 && !document.querySelector(optionSelector); i += 1) await pause();
    const roomOption = [...document.querySelectorAll(optionSelector)].find(item => item.textContent.trim() === (${JSON.stringify(role)} === 'guest' ? '加入房間' : '建立房間'));
    if (!roomOption) throw new Error('找不到多人房間選項');
    roomOption.click();
    for (let i = 0; i < 200 && !document.querySelector('#sync-server-url'); i += 1) await pause();
    const setField = (selector, value) => {
      const input = document.querySelector(selector);
      if (!input) throw new Error('找不到多人房間欄位：' + selector);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setField('#sync-server-url', ${JSON.stringify(url.href)});
    if (${JSON.stringify(role)} !== 'guest') {
      const waitFor = async (check) => {
        for (let i = 0; i < 200; i += 1) { if (check()) return; await pause(); }
        throw new Error('測試 Discord 設定未就緒');
      };
      document.querySelector('[aria-label="設定"]').click();
      await waitFor(() => document.querySelector('.settings-nav'));
      [...document.querySelectorAll('.settings-nav button')].find(button => button.textContent === 'Discord').click();
      await waitFor(() => document.querySelector('#discord-webhook'));
      setField('#discord-label', '本機模擬頻道');
      setField('#discord-webhook', 'https://discord.com/api/webhooks/123456789012345678/synthetic_test_only');
      await pause();
      document.querySelector('.discord-settings-content form').requestSubmit();
      await waitFor(() => document.querySelector('.discord-destination-list')?.textContent.includes('本機模擬頻道'));
      document.querySelector('[aria-label="關閉設定"]').click();
    }
    await pause();
    if (document.querySelector('#sync-server-url')?.value !== ${JSON.stringify(url.href)}) throw new Error('測試欄位預填失敗');
  })()`);
  window.show();
  process.send?.({ type: 'ready' });
} catch (error) {
  process.send?.({ type: 'failed', message: error.message });
  console.error(error.message);
  app.exit(1);
}
})();
