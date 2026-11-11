// Real loopback WebSocket + desktop IPC. LoL identity is synthetic; no game writes or Discord sends.
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createSyncRoomServer } from '../server/syncRoomServer.js';
import { SyncRoomClient } from '../src/desktop/syncRoomClient.js';
import { appUrl } from '../src/desktop/appProtocol.js';
import '../src/desktop/main.js';

const output = path.resolve('release/sync-room-ui-smoke');
app.setPath('userData', path.join(output, `profile-${Date.now()}`));
app.disableHardwareAcceleration();
const sleep = (ms = 35) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, message) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (await check()) return;
    await sleep();
  }
  throw new Error(message);
}

app.whenReady().then(async () => {
  const deadline = setTimeout(() => { console.error('Room UI check timed out'); app.exit(1); }, 90000);
  let server;
  let guest;
  let web;
  try {
    await mkdir(output, { recursive: true });
    if (!BrowserWindow.getAllWindows().length) await once(app, 'browser-window-created');
    const window = BrowserWindow.getAllWindows()[0];
    let gameWrites = 0;
    let discordSends = 0;
    ipcMain.removeHandler('lol:read-lobby');
    ipcMain.handle('lol:read-lobby', () => ({ ok: true, lobby: {
      players: [{ id: 'fixture-host', name: '房主#TW1' }, { id: 'fixture-guest', name: '隊友#TW2' }],
      localPlayerId: 'fixture-host', fetchedAt: new Date().toISOString()
    } }));
    ipcMain.removeHandler('lol:apply-roles');
    ipcMain.handle('lol:apply-roles', () => { gameWrites += 1; return { ok: false, message: '測試禁止客戶端寫入' }; });
    ipcMain.removeHandler('data:discord-send');
    ipcMain.handle('data:discord-send', () => { discordSends += 1; return { ok: false, message: '測試禁止 Discord 傳送' }; });
    const consoleErrors = [];
    window.webContents.on('console-message', (event) => { if (event.level === 'error') consoleErrors.push(event.message); });
    if (window.webContents.isLoading()) await once(window.webContents, 'did-finish-load');
    server = await createSyncRoomServer({ port: 0 });
    guest = new SyncRoomClient();
    const helpers = `
      const sleep = (ms = 35) => new Promise(resolve => setTimeout(resolve, ms));
      const wait = async (check) => { for (let i = 0; i < 180; i++) { if (await check()) return; await sleep(); } throw Error('UI did not settle: ' + check.toString()); };
      const click = (label) => { const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label); if (!button || button.disabled) throw Error('Unavailable button: ' + label); button.click(); };
      const field = async (selector, value) => { const input = document.querySelector(selector); if (!input) throw Error('Missing field: ' + selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); await sleep(); };
      const settled = () => document.querySelector('.sync-room-panel')?.getAttribute('aria-busy') === 'false';
    `;
    const run = (code) => window.webContents.executeJavaScript(`(async () => { ${helpers} ${code} })()`);
    const capture = async (name) => {
      window.show(); window.focus(); window.webContents.invalidate();
      await sleep(150);
      await writeFile(path.join(output, name), (await window.webContents.capturePage()).toPNG());
    };
    await run(`await wait(() => [...document.querySelectorAll('[role="tab"]')].some(el => el.textContent === '多人房間' && !el.disabled)); click('多人房間'); await wait(settled); click('從 LoL 讀取'); await wait(() => settled() && document.querySelector('#sync-player-name').value === '房主#TW1');`);
    const statsBefore = await run(`return JSON.stringify((await window.lolDesktop.initializeData({})).value.data.stats);`);
    await run(`await field('#sync-server-url', ${JSON.stringify(server.url)}); document.querySelector('.sync-connect-form').requestSubmit(); await wait(() => document.querySelector('.sync-room-code')); await wait(settled);`);
    const hostState = await run(`return (await window.lolDesktop.syncRoom.getState()).state;`);
    await guest.connect({ url: server.url, action: 'join', roomId: hostState.room.roomId, name: '隊友#TW2' });
    await run(`await wait(() => document.querySelectorAll('.sync-member-list > li').length === 2); if (![...document.querySelectorAll('button')].find(el => el.textContent === '開始抽籤').disabled) throw Error('Draw enabled before approval');`);
    await capture('pending-approval.png');
    await run(`click('核准'); await wait(settled); await wait(() => !document.querySelector('[aria-label="核准 隊友#TW2"]'));`);
    await until(() => guest.getState().room?.members.find((member) => member.name === '隊友#TW2')?.approved, 'Guest did not receive approval');
    await guest.command({ type: 'ready', ready: true });
    await run(`click('我準備好了'); await wait(settled); await wait(() => ![...document.querySelectorAll('button')].find(el => el.textContent === '開始抽籤').disabled); click('開始抽籤'); await wait(() => document.querySelectorAll('.sync-result-list > li').length === 2); await wait(settled);`);
    await until(() => guest.getState().room?.result, 'Guest did not receive result');
    const result = await run(`return (await window.lolDesktop.syncRoom.getState()).state.room.result;`);
    assert.deepEqual(guest.getState().room.result, result);
    await capture('shared-result-light.png');
    await run(`click('抽英雄'); await wait(() => !document.querySelector('.sync-room-panel')); click('多人房間'); await wait(() => document.querySelectorAll('.sync-result-list > li').length === 2);`);
    const afterTab = await run(`return (await window.lolDesktop.syncRoom.getState()).state.room.result;`);
    assert.deepEqual(afterTab, result);
    await run(`document.querySelector('[aria-label="切換深淺色模式"]').click(); await wait(() => document.documentElement.dataset.theme === 'dark');`);
    await capture('shared-result-dark.png');
    window.setContentSize(800, 640);
    await sleep(150);
    const layout = await run(`
      const panel = document.querySelector('.sync-room-panel');
      if (document.documentElement.scrollWidth > innerWidth || panel.scrollWidth > panel.clientWidth + 1) throw Error('Room layout overflows horizontally');
      if (panel.getBoundingClientRect().bottom > innerHeight) throw Error('Room panel exceeds window');
      panel.scrollTop = panel.scrollHeight;
      return { width: innerWidth, height: innerHeight, independentlyScrollable: panel.scrollHeight > panel.clientHeight };
    `);
    await capture('compact-scroll.png');
    guest.socket.close();
    await until(() => guest.getState().connection === 'reconnecting', 'Guest did not enter reconnecting state');
    await until(() => guest.getState().connection === 'connected', 'Guest did not reconnect');
    await run(`await wait(() => !document.querySelector('.sync-result-list')); await wait(() => [...document.querySelectorAll('.sync-member-state')].every(el => el.textContent.includes('尚未準備')));`);
    const guestAfterReconnect = guest.getState();
    assert.equal(guestAfterReconnect.room.members.length, 2);
    assert.equal(guestAfterReconnect.room.result, null);
    await run(`click('移除'); await wait(() => document.querySelectorAll('.sync-member-list > li').length === 1); await wait(settled);`);
    await until(() => guest.getState().connection === 'disconnected', 'Removed guest remained connected');
    await guest.connect({ url: server.url, action: 'join', roomId: hostState.room.roomId, name: '隊友#TW2' });
    await run(`await wait(() => document.querySelectorAll('.sync-member-list > li').length === 2);`);
    await run(`click('關閉房間'); await wait(() => document.querySelector('.sync-connect-form'));`);
    await until(() => guest.getState().connection === 'disconnected' && guest.getState().error === '主持人已關閉房間', 'Host close did not close guest room');
    await run(`
      click('抽分路'); await wait(() => document.querySelector('.role-setup'));
      if (!document.querySelector('.finish-setup')) throw Error('Desktop role setup unavailable after room');
      click('抽英雄'); await wait(() => document.querySelector('.champion-flow'));
      click('中路'); await wait(() => document.querySelector('.champion-position[aria-pressed="true"]')?.textContent.trim() === '中路');
      if (!document.querySelector('.champion-data-meta').textContent.includes('中路英雄池')) throw Error('Desktop champion pool did not follow selection');
    `);
    web = new BrowserWindow({ show: false, width: 960, height: 760, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
    web.webContents.on('console-message', (event) => { if (event.level === 'error') consoleErrors.push(event.message); });
    await web.loadURL(appUrl);
    const webRun = (code) => web.webContents.executeJavaScript(`(async () => { ${helpers} ${code} })()`);
    await webRun(`
      await wait(() => document.querySelector('.role-setup'));
      if (window.lolDesktop || document.querySelector('#tool-tab-room,.sync-room-panel') || [...document.querySelectorAll('[role="tab"]')].some(el => el.textContent === '多人房間')) throw Error('Native room leaked into website');
      click('抽英雄'); await wait(() => document.querySelector('.champion-flow'));
      click('中路'); await wait(() => document.querySelector('.champion-position[aria-pressed="true"]')?.textContent.trim() === '中路');
      if (!document.querySelector('.champion-data-meta').textContent.includes('中路英雄池')) throw Error('Web champion pool did not follow selection');
      click('抽分路'); await wait(() => document.querySelector('.manual-add-form'));
    `);
    web.destroy(); web = null;
    const statsAfter = await run(`return JSON.stringify((await window.lolDesktop.initializeData({})).value.data.stats);`);
    assert.equal(statsAfter, statsBefore);
    assert.equal(gameWrites, 0);
    assert.equal(discordSends, 0);
    assert.deepEqual(consoleErrors, []);
    const report = { realLoopbackWebSocket: true, realDesktopIpc: true, syntheticLobby: true, approval: true,
      identicalResults: true, tabReturnPreservesRoom: true, reconnectInvalidatesReadyAndResult: true,
      removeMember: true, closeRoom: true, layout, unchangedStats: true, desktopOriginalModes: true,
      websiteOriginalModes: true, websiteHasNoNativeRoom: true, gameWrites, discordSends };
    await writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    guest.destroy(); await server.close(); clearTimeout(deadline); app.exit(0);
  } catch (error) {
    console.error(error.stack);
    console.error('Synthetic guest state:', JSON.stringify(guest?.getState()));
    web?.destroy();
    guest?.destroy(); await server?.close(); clearTimeout(deadline); app.exit(1);
  }
});
