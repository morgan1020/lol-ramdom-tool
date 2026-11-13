// Real loopback WebSocket + desktop IPC. LoL identity is synthetic; no game writes or Discord sends.
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createSyncRoomServer } from '../server/syncRoomServer.js';
import { SyncRoomClient } from '../src/desktop/syncRoomClient.js';
import { appUrl } from '../src/desktop/appProtocol.js';
import { parseRoomInvitation } from '../src/domain/roomInvitation.js';
import { formatCopyText } from '../src/domain/copyFormat.js';
import '../src/desktop/main.js';

const cloud = process.argv.includes('--cloud');
const output = path.resolve(cloud ? 'release/sync-room-cloud-ui-smoke' : 'release/sync-room-ui-smoke');
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

async function createTestServer() {
  if (!cloud) return createSyncRoomServer({ port: 0 });
  const { Miniflare, Log, LogLevel, convertV4MiniflareOptions } = await import('miniflare');
  const root = path.resolve('.');
  const mf = new Miniflare(convertV4MiniflareOptions({
    name: 'sync-room-ui-test',
    modules: ['server/cloudflare/worker.js', 'src/domain/syncRoom.js', 'src/domain/draw.js', 'src/domain/roomDiscovery.js']
      .map(file => ({ type: 'ESModule', path: path.join(root, file) })),
    modulesRoot: root, compatibilityDate: '2026-11-11', host: '127.0.0.1', port: 0,
    durableObjects: {
      SYNC_ROOMS: { className: 'SyncRoomDurableObject', useSQLite: true },
      TEAM_INDEX: { className: 'TeamIndexDurableObject', useSQLite: true }
    },
    resourcePersistencePath: path.join(output, `runtime-${Date.now()}`),
    ratelimits: { ROOM_CONNECTION_LIMITER: { namespace_id: '2026111101', simple: { limit: 60, period: 60 } } },
    log: new Log(LogLevel.ERROR)
  }));
  try {
    const url = new URL(await mf.ready);
    return { url: `${url.origin.replace(/^http/u, 'ws')}/rooms`, close: () => mf.dispose() };
  } catch (error) { await mf.dispose(); throw error; }
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
    const applyCalls = [];
    const discordSends = [];
    let finishDiscord;
    let players = [{ id: 'fixture-host', name: '房主#TW1' }, { id: 'fixture-guest', name: '隊友#TW2' },
      ...[1, 2, 3].map(index => ({ id: `fixture-${index}`, name: `隊友${index}#TW3` }))];
    ipcMain.removeHandler('lol:read-lobby');
    ipcMain.handle('lol:read-lobby', () => ({ ok: true, lobby: {
      players,
      localPlayerId: 'fixture-host', fetchedAt: new Date().toISOString()
    } }));
    ipcMain.removeHandler('lol:apply-roles');
    ipcMain.handle('lol:apply-roles', (_event, results, expectedName) => {
      applyCalls.push({ results, expectedName });
      return { ok: false, message: '測試禁止客戶端寫入' };
    });
    ipcMain.removeHandler('data:discord-send');
    ipcMain.handle('data:discord-send', (_event, results) => {
      discordSends.push(results);
      if (discordSends.length !== 2) return { ok: true, value: '12345' };
      return new Promise(resolve => { finishDiscord = () => resolve({ ok: false, message: '模擬傳送逾時' }); });
    });
    const consoleErrors = [];
    window.webContents.on('console-message', (event) => { if (event.level === 'error') consoleErrors.push(event.message); });
    if (window.webContents.isLoading()) await once(window.webContents, 'did-finish-load');
    server = await createTestServer();
    guest = new SyncRoomClient();
    const helpers = `
      const sleep = (ms = 35) => new Promise(resolve => setTimeout(resolve, ms));
      const wait = async (check) => { for (let i = 0; i < 180; i++) { if (await check()) return; await sleep(); } throw Error('UI did not settle: ' + check.toString()); };
      const click = (label) => { const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label); if (!button || button.disabled) throw Error('Unavailable button: ' + label); button.click(); };
      const field = async (selector, value) => { const input = document.querySelector(selector); if (!input) throw Error('Missing field: ' + selector); Object.getOwnPropertyDescriptor(input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); await sleep(); };
      const settled = () => document.querySelector('.sync-room-panel')?.getAttribute('aria-busy') === 'false';
      const enterDraw = async () => { click('進入抽籤'); await wait(() => document.querySelector('.sync-room-panel .draw-workspace')); };
      const returnToSetup = async () => { click('返回設定'); await wait(() => document.querySelector('.sync-room-preparation')); };
    `;
    const run = (code) => window.webContents.executeJavaScript(`(async () => { ${helpers} ${code} })()`);
    const capture = async (name) => {
      window.show(); window.focus(); window.webContents.invalidate();
      await sleep(150);
      await writeFile(path.join(output, name), (await window.webContents.capturePage()).toPNG());
    };
    await run(`await wait(() => document.querySelector('.role-setup-heading #open-sync-room:not(:disabled)')); click('多人房間'); await wait(settled);
      if (document.querySelector('#open-sync-room,.role-session-switch')) throw Error('Room navigation should only appear at the role setup entry');
      click('返回抽分路'); await wait(() => document.querySelector('#open-sync-room:not(:disabled)')); click('多人房間'); await wait(settled);`);
    await run(`
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.__roomCopiedText = text; } } });
      await field('#sync-server-url', ${JSON.stringify(server.url)});
      click('加入房間'); await wait(() => document.querySelector('#sync-invitation'));
      click('加入目前隊伍');
      await wait(() => settled() && document.querySelector('.sync-room-notice')?.textContent.includes('找不到目前隊伍'));
      if (!document.querySelector('#sync-invitation')) throw Error('Missing match must leave invitation available');
      click('建立房間');
    `);
    const statsBefore = await run(`return JSON.stringify((await window.lolDesktop.initializeData({})).value.data.stats);`);
    await run(`await field('#sync-server-url', ${JSON.stringify(server.url)}); document.querySelector('.sync-connect-form').requestSubmit(); await wait(() => document.querySelector('.sync-room-code')); await wait(settled);`);
    const hostState = await run(`return (await window.lolDesktop.syncRoom.getState()).state;`);
    assert.equal(hostState.room.lobbySynced, true);
    assert.deepEqual(hostState.room.members.map(member => member.name), players.map(player => player.name));
    const copiedInvitation = await run(`click('複製邀請'); await wait(() => Boolean(window.__roomCopiedText)); return window.__roomCopiedText;`);
    assert.deepEqual(parseRoomInvitation(copiedInvitation), { url: server.url, roomId: hostState.room.roomId });
    await guest.connect({ url: server.url, action: 'join', roomId: hostState.room.roomId, name: '隊友#TW2' });
    await run(`await wait(() => document.querySelector('[aria-label="核准 隊友#TW2"]')); if (!document.querySelector('.finish-setup').disabled) throw Error('Draw enabled before approval');`);
    await run(`if (document.querySelectorAll('.sync-room-panel .sync-preparation-member').length !== 5 || !document.querySelector('.sync-room-panel .preparation-actions').textContent.includes('5 / 5')) throw Error('Room must show one card per player and the team capacity');`);
    await capture('pending-approval.png');
    await run(`
      const cards = [...document.querySelectorAll('.sync-room-panel .sync-preparation-member')];
      if (cards.length !== 5) throw Error('Expected five preparation rows');
      const approve = document.querySelector('.sync-member-actions .btn-primary');
      if (!approve || approve.getBoundingClientRect().top < approve.closest('.sync-preparation-member').querySelector('.preparation-player-row').getBoundingClientRect().bottom) throw Error('Approve action must sit below the card');
      if (document.querySelector('#tool-tab-roles').getAttribute('aria-selected') !== 'true') throw Error('Room should be within role draw');
    `);
    await run(`click('核准'); await wait(settled); await wait(() => !document.querySelector('[aria-label="核准 隊友#TW2"]'));`);
    await until(() => guest.getState().room?.members.find((member) => member.name === '隊友#TW2')?.approved, 'Guest did not receive approval');
    assert.equal(guest.getState().room.members.filter(member => member.manual).length, 3);
    await guest.command({ type: 'ready', ready: true });
    await run(`
      if ([...document.querySelectorAll('button')].some(el => el.textContent === '我準備好了')) throw Error('Host must not need to ready');
      await wait(() => document.querySelector('.finish-setup:not(:disabled)'));
      const center = element => { const { left, right } = element.getBoundingClientRect(); return (left + right) / 2; };
      if (Math.abs(center(document.querySelector('.finish-setup')) - center(document.querySelector('.preparation-actions'))) > 1) throw Error('Room preparation primary action is off-center');
      await enterDraw();
      if (Math.abs(center(document.querySelector('.primary-draw')) - center(document.querySelector('.draw-screen-actions'))) > 1) throw Error('Room draw primary action is off-center');
      if (document.querySelector('.sync-room-preparation,.has-result')) throw Error('Entering draw must show a separate screen without drawing');
      click('開始抽籤');
      await wait(() => settled() && document.querySelectorAll('.sync-room-panel .roster-player-card.has-result').length === 5);
      if (document.querySelectorAll('.is-revealing').length !== 5 || document.querySelectorAll('.is-own-result .own-result-glow').length !== 1) throw Error('Room draw reveal or own highlight missing');
      document.querySelector('.copy-results').click();
      await wait(() => document.querySelector('.sync-room-notice')?.textContent.includes('已複製分路結果'));
      if (document.querySelector('.sync-room-feedback').textContent.includes('Discord')) throw Error('Unconfigured Discord must not show a delivery status');
    `);
    await until(() => guest.getState().room?.result, 'Guest did not receive result');
    let result = await run(`return (await window.lolDesktop.syncRoom.getState()).state.room.result;`);
    const cardRoles = await run(`return [...document.querySelectorAll('.sync-room-panel .table-role')].map(role => role.textContent);`);
    assert.deepEqual(cardRoles, ['上路', '打野', '中路', '下路', '輔助']);
    assert.deepEqual(guest.getState().room.result, result);
    assert.deepEqual(applyCalls, [{ results: result.results, expectedName: '房主#TW1' }]);
    assert.equal(await run(`return window.__roomCopiedText;`), formatCopyText(result.results));
    assert.deepEqual(discordSends, []);
    await run(`
      await returnToSetup();
      await wait(() => document.querySelector('.sync-room-panel .discord-preparation button[aria-label="設定 Discord"]:not(:disabled)'));
      document.querySelector('.sync-room-panel .discord-preparation button[aria-label="設定 Discord"]').click();
      await wait(() => document.querySelector('#discord-label'));
      await field('#discord-label', '測試頻道');
      await field('#discord-webhook', 'https://discord.com/api/webhooks/123456789012345678/synthetic_test_only');
      document.querySelector('.discord-settings-content form').requestSubmit();
      await wait(() => document.querySelector('.discord-destination-list')?.textContent.includes('測試頻道'));
      document.querySelector('[aria-label="關閉設定"]').click();
      const syncToggle = '.sync-room-panel .discord-preparation button[aria-label="Discord 自動同步"]';
      await wait(() => document.querySelector(syncToggle + '[aria-checked="false"]:not(:disabled)'));
      await wait(() => document.querySelector('.finish-setup:not(:disabled)'));
      await enterDraw();
      if (document.querySelector('.is-revealing') || !document.querySelector('.is-own-result')) throw Error('Reopening room result replayed reveal or lost own highlight');
      click('重新抽籤');
      await wait(() => settled() && document.querySelector('.sync-room-summary').textContent.includes('第 2 次'));
      if (document.querySelectorAll('.is-revealing').length !== 5) throw Error('Room redraw did not restart reveal');
      if (document.querySelector('.sync-room-feedback').textContent.includes('Discord')) throw Error('Disabled Discord must not show a delivery status');
    `);
    assert.deepEqual(discordSends, []);
    result = await run(`return (await window.lolDesktop.syncRoom.getState()).state.room.result;`);
    assert.deepEqual(applyCalls[1], { results: result.results, expectedName: '房主#TW1' });
    await capture('shared-result-light.png');
    await run(`click('抽英雄'); await wait(() => !document.querySelector('.sync-room-panel')); click('抽分路'); await wait(() => document.querySelector('#open-sync-room:not(:disabled)')); click('多人房間'); await wait(() => document.querySelectorAll('.sync-room-panel .roster-player-card.has-result').length === 5);`);
    const afterTab = await run(`return (await window.lolDesktop.syncRoom.getState()).state.room.result;`);
    assert.deepEqual(afterTab, result);
    await run(`document.querySelector('[aria-label="切換深淺色模式"]').click(); await wait(() => document.documentElement.dataset.theme === 'dark');`);
    await capture('shared-result-dark.png');
    await run(`
      await returnToSetup();
      document.querySelector('.discord-preparation [aria-label="Discord 自動同步"]').click();
      await wait(() => document.querySelector('.discord-preparation [aria-label="Discord 自動同步"][aria-checked="true"]'));
      document.querySelector('#draw-mode [data-value="custom"]').click();
      await wait(() => settled() && document.querySelector('#draw-mode').dataset.value === 'custom');
      document.querySelector('[role="combobox"][aria-label^="隊友1 的主位偏好"]').click();
      await wait(() => document.querySelector('[role="option"][data-value="輔助"]'));
      document.querySelector('[role="option"][data-value="輔助"]').click();
      await wait(() => settled() && document.querySelector('[role="combobox"][aria-label^="隊友1 的主位偏好"]').textContent.includes('輔助'));
    `);
    await until(() => guest.getState().room?.preferences?.['隊友1#TW3'] === '輔助', 'Guest did not receive custom role');
    await guest.command({ type: 'ready', ready: true });
    await run(`await wait(() => document.querySelector('.finish-setup:not(:disabled)')); await enterDraw(); click('重新抽籤'); await wait(() => settled() && document.querySelector('#draw-result-title')?.textContent === '本次抽籤結果' && document.querySelector('.assignment-marker'));`);
    await until(() => guest.getState().room?.result?.version === 3, 'Guest did not receive custom result');
    assert.equal(guest.getState().room.result.results.find(row => row.name === '隊友1#TW3').main, '輔助');
    await run(`await wait(() => document.querySelector('.sync-room-feedback').textContent.includes('已傳送整隊結果到 Discord'));`);
    assert.deepEqual(discordSends, [guest.getState().room.result.results]);
    players = players.map(player => player.id === 'fixture-host' ? { ...player, firstPosition: 'TOP' } : player);
    await run(`await returnToSetup(); document.querySelector('#draw-mode [data-value="client"]').click(); await wait(() => settled() && document.querySelector('#draw-mode').dataset.value === 'client');`);
    await until(() => guest.getState().room?.preferences?.['房主#TW1'] === '上路', 'Guest did not receive LoL preference');
    await guest.command({ type: 'ready', ready: true });
    await run(`await wait(() => document.querySelector('.finish-setup:not(:disabled)')); await enterDraw(); click('重新抽籤'); await wait(() => settled() && document.querySelector('#draw-result-title')?.textContent === '本次抽籤結果' && document.querySelector('.assignment-marker'));`);
    await until(() => guest.getState().room?.result?.version === 4, 'Guest did not receive LoL preference result');
    assert.equal(guest.getState().room.result.results.find(row => row.name === '房主#TW1').main, '上路');
    await until(() => finishDiscord, 'Expected simulated Discord request');
    await run(`
      await wait(() => settled() && document.querySelector('.sync-room-feedback').textContent.includes('正在傳送到 Discord'));
      if (!document.querySelector('.primary-draw:not(:disabled)') || !document.querySelector('.copy-results:not(:disabled)')) throw Error('Discord delivery blocked draw or copy');
    `);
    const delayedResult = guest.getState().room.result.results;
    finishDiscord();
    await run(`await wait(() => document.querySelector('.sync-room-feedback').textContent.includes('Discord 傳送未完成'));`);
    assert.deepEqual(discordSends[1], delayedResult);
    players = players.map(player => player.id === 'fixture-host' ? { ...player, firstPosition: 'MIDDLE' } : player);
    await run(`click('重新抽籤'); await wait(() => settled() && document.querySelector('.sync-room-notice')?.textContent.includes('第一偏好已更新'));`);
    assert.equal(guest.getState().room.result.version, 4);
    await guest.command({ type: 'ready', ready: true });
    await run(`await wait(() => document.querySelector('.finish-setup:not(:disabled)')); `);
    window.setContentSize(800, 640);
    await sleep(150);
    const layout = await run(`
      const panel = document.querySelector('.sync-room-panel');
      if (document.documentElement.scrollWidth > innerWidth || panel.scrollWidth > panel.clientWidth + 1) throw Error('Room layout overflows horizontally');
      if (panel.getBoundingClientRect().bottom > innerHeight) throw Error('Room panel exceeds window');
      const scroll = panel.querySelector('.workspace-scroll'); scroll.scrollTop = scroll.scrollHeight;
      return { width: innerWidth, height: innerHeight, independentlyScrollable: scroll.scrollHeight > scroll.clientHeight };
    `);
    await capture('compact-scroll.png');
    players = players.map(player => player.id === 'fixture-3' ? { ...player, name: '替補#TW3' } : player);
    await run(`await enterDraw(); click('重新抽籤'); await wait(() => settled() && document.querySelector('.sync-room-notice')?.textContent.includes('名單已更新'));`);
    assert.equal(discordSends.length, 2);
    assert.equal(applyCalls.length, 4);
    await until(() => guest.getState().room?.members.some(member => member.name === '替補#TW3'), 'Guest did not receive refreshed lobby');
    assert.equal(guest.getState().room.result.archived, true);
    await guest.command({ type: 'ready', ready: true });
    guest.socket.close();
    await until(() => guest.getState().connection === 'reconnecting', 'Guest did not enter reconnecting state');
    await until(() => guest.getState().connection === 'connected', 'Guest did not reconnect');
    await run(`await wait(() => document.querySelector('#sync-room-title')?.textContent === '準備抽籤'); await wait(() => [...document.querySelectorAll('.sync-member-state')].every(el => el.textContent.includes('主持人') || el.textContent.includes('尚未準備')));`);
    const guestAfterReconnect = guest.getState();
    assert.equal(guestAfterReconnect.room.members.length, 5);
    assert.equal(guestAfterReconnect.room.result.archived, true);
    await run(`document.querySelector('[aria-label="移除 隊友#TW2"]').click(); await wait(() => settled() && [...document.querySelectorAll('.sync-member-state')].length === 1);`);
    await until(() => guest.getState().connection === 'disconnected', 'Removed guest remained connected');
    await guest.connect({ url: server.url, action: 'join', roomId: hostState.room.roomId, name: '隊友#TW2' });
    await run(`await wait(() => document.querySelector('[aria-label="核准 隊友#TW2"]') && settled());`);
    await run(`click('查看上次結果'); await wait(() => document.querySelector('#draw-result-title')?.textContent === '上次抽籤結果'); if (!document.querySelector('.copy-results:not(:disabled)')) throw Error('Archived result must remain copyable'); await returnToSetup(); click('關閉房間'); await wait(() => document.querySelector('.sync-connect-form'));`);
    await until(() => guest.getState().connection === 'disconnected' && guest.getState().error === '主持人已關閉房間', 'Host close did not close guest room');
    await guest.connect({ url: server.url, action: 'create', name: '隊友#TW2' });
    await guest.command({ type: 'sync-lobby', names: players.map(player => player.name) });
    const newRoomId = guest.getState().room.roomId;
    const otherHost = new SyncRoomClient();
    try {
      await otherHost.connect({ url: server.url, action: 'create', name: '隊友1#TW3' });
      await otherHost.command({ type: 'sync-lobby', names: players.map(player => player.name) });
      await run(`
        click('加入房間'); await wait(() => document.querySelector('#sync-invitation'));
        click('加入目前隊伍');
        await wait(() => settled() && document.querySelector('.sync-room-notice')?.textContent.includes('多個房間'));
        if (!document.querySelector('#sync-invitation')) throw Error('Ambiguous match must leave invitation available');
      `);
      await otherHost.command({ type: 'close' });
    } finally { otherHost.destroy(); }
    await run(`
      click('加入目前隊伍');
      await wait(() => settled() && document.querySelector('.sync-guest-status')?.textContent.includes('等待主持人核准加入'));
    `);
    const discoveredGuest = guest.getState().room.members.find(member => member.name === '房主#TW1');
    assert.equal(discoveredGuest.approved, false);
    await guest.command({ type: 'approve', memberId: discoveredGuest.id });
    await run(`await wait(() => document.querySelector('.sync-guest-ready:not(:disabled)')); click('我準備好了');`);
    await until(() => guest.getState().room.members.find(member => member.id === discoveredGuest.id).ready, 'Discovered guest could not ready');
    const discoveredDraw = await guest.command({ type: 'draw', revision: guest.getState().room.revision });
    await run(`await wait(() => settled() && document.querySelectorAll('.sync-room-panel .roster-player-card.has-result').length === 5);`);
    await run(`if (document.querySelectorAll('.is-revealing').length !== 5 || document.querySelector('.is-own-result')?.dataset.playerId !== '房主#TW1') throw Error('Guest result must reveal and highlight the local player');`);
    assert.deepEqual(applyCalls.at(-1), { results: discoveredDraw.result.results, expectedName: '房主#TW1' });
    await run(`
      await returnToSetup();
      click('離開房間');
      await wait(() => settled() && document.querySelector('#sync-invitation'));
    `);
    await run(`
      await field('#sync-server-url', 'ws://127.0.0.1:1/sync');
      await field('#sync-invitation', '不完整的邀請');
      click('申請加入');
      await wait(() => document.querySelector('.sync-room-error')?.textContent.includes('請貼上完整邀請'));
      await field('#sync-invitation', ${JSON.stringify(copiedInvitation.replace(hostState.room.roomId, newRoomId))});
      if ((await window.lolDesktop.syncRoom.getState()).state.connection !== 'disconnected') throw Error('Invitation connected without explicit join');
      click('申請加入');
      await wait(() => document.querySelector('.sync-guest-status')?.textContent.includes('等待主持人核准加入'));
      if (document.querySelector('.sync-guest-ready')) throw Error('Ready offered before approval');
    `);
    const joiningMember = guest.getState().room.members.find(member => member.name === '房主#TW1');
    await guest.command({ type: 'approve', memberId: joiningMember.id });
    await run(`await wait(() => document.querySelector('.sync-guest-ready:not(:disabled)'));
      const cardTitle = document.querySelector('.sync-guest-preparation .preparation-panel-title');
      if (!cardTitle.textContent.includes('5 / 5') || !cardTitle.querySelector('.sync-guest-mode')?.textContent.includes('隨機') ||
          document.querySelector('.sync-guest-preparation .preparation-settings, .sync-guest-preparation .sync-room-footer-info')) throw Error('Guest roster must show team size and mode in a single card');`);
    const minimumSize = window.getMinimumSize();
    window.setMinimumSize(600, 480);
    const guestAlignment = [];
    for (const ready of [false, true]) {
      for (const [width, height, overflow] of [[1040, 900, false], [1040, 540, true], [680, 900, false], [680, 540, true]]) {
        window.setContentSize(width, height);
        guestAlignment.push(...await run(`
          await wait(() => innerWidth === ${width} && innerHeight === ${height});
          const scroll = document.querySelector('.sync-room-preparation .workspace-scroll');
          const action = document.querySelector('.sync-guest-header .sync-toolbar-actions');
          const frame = document.querySelector('.sync-guest-header');
          const button = action.querySelector('.sync-guest-ready');
          const leave = document.querySelector('.sync-room-toolbar .btn-return').getBoundingClientRect();
          const title = document.querySelector('#sync-room-title').getBoundingClientRect();
          const card = document.querySelector('.sync-room-preparation .preparation-grid').getBoundingClientRect();
          const contentStyle = getComputedStyle(scroll);
          const frameStyle = getComputedStyle(frame);
          if (button.textContent.trim() !== ${JSON.stringify(ready ? '取消準備' : '我準備好了')}) throw Error('Unexpected guest readiness');
          if ((scroll.scrollHeight > scroll.clientHeight) !== ${overflow}) throw Error('Unexpected roster overflow at ' + innerWidth + '×' + innerHeight);
          if (scroll.contains(button)) throw Error('Ready action must stay outside the scrolling roster');
          const measurements = [];
          for (const offset of ${overflow ? '[0, scroll.scrollHeight]' : '[0]'}) {
            scroll.scrollTop = offset;
            const rect = button.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            if ((offset !== 0 && scroll.scrollTop === 0) || rect.top < 0 || rect.bottom > innerHeight || !hit?.closest('.sync-guest-ready')) throw Error('Guest ready action is not reachable: ' + JSON.stringify({ width: innerWidth, height: innerHeight, rect, offset, scrollTop: scroll.scrollTop, hit: hit?.className }));
            measurements.push({
              width: innerWidth, height: innerHeight, ready: ${ready}, scrollTop: scroll.scrollTop,
              gutter: scroll.offsetWidth - scroll.clientWidth, padding: contentStyle.paddingRight,
              actionGutter: frame.offsetWidth - frame.clientWidth, actionPadding: frameStyle.paddingRight,
              widthOffset: rect.width - leave.width, heightOffset: rect.height - leave.height,
              topOffset: rect.top - leave.top, cardOffset: card.right - rect.right,
              actionOffset: action.getBoundingClientRect().right - card.right,
              titleOffset: title.left - card.left, statusOffset: frame.querySelector('.sync-guest-status').getBoundingClientRect().left - card.left
            });
          }
          return measurements;
        `));
        if (width === 1040 && height === 900) await capture(ready ? 'guest-ready-dark.png' : 'guest-unready-dark.png');
      }
      if (!ready) await run(`click('我準備好了'); await wait(() => settled() && document.querySelector('.sync-guest-status')?.textContent.includes('已準備'));`);
    }
    window.setContentSize(1040, 850);
    await run(`document.querySelector('[aria-label="切換深淺色模式"]').click(); await wait(() => innerWidth === 1040 && innerHeight === 850 && document.documentElement.dataset.theme === 'light');`);
    await capture('guest-ready-light.png');
    await run(`click('取消準備'); await wait(() => settled() && document.querySelector('.sync-guest-ready')?.textContent === '我準備好了');`);
    await capture('guest-unready-light.png');
    assert.equal(guest.getState().room.members.find(member => member.id === joiningMember.id).ready, false);
    await run(`click('我準備好了'); await wait(() => settled() && document.querySelector('.sync-guest-status')?.textContent.includes('已準備'));`);
    window.setMinimumSize(...minimumSize);
    window.setContentSize(800, 640);
    assert.ok(guestAlignment.every(sample => ['widthOffset', 'heightOffset', 'topOffset', 'cardOffset', 'actionOffset', 'titleOffset', 'statusOffset']
      .every(edge => Math.abs(sample[edge]) <= 1)), JSON.stringify(guestAlignment));
    assert.equal(guest.getState().room.members.find(member => member.id === joiningMember.id).ready, true);
    await run(`click('離開房間'); await wait(() => document.querySelector('.sync-connect-form')); await wait(settled);`);
    await run(`
      await field('#sync-invitation', ${JSON.stringify(newRoomId.toLowerCase())});
      click('申請加入');
      await wait(() => document.querySelector('.sync-guest-status')?.textContent.includes('等待主持人核准加入'));
      click('離開房間');
      await wait(() => document.querySelector('.sync-connect-form'));
    `);
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
      if (window.lolDesktop || document.querySelector('#open-sync-room,.sync-room-panel') || [...document.querySelectorAll('[role="tab"]')].some(el => el.textContent === '多人房間')) throw Error('Native room leaked into website');
      click('抽英雄'); await wait(() => document.querySelector('.champion-flow'));
      click('中路'); await wait(() => document.querySelector('.champion-position[aria-pressed="true"]')?.textContent.trim() === '中路');
      if (!document.querySelector('.champion-data-meta').textContent.includes('中路英雄池')) throw Error('Web champion pool did not follow selection');
      click('抽分路'); await wait(() => document.querySelector('.manual-add-form'));
    `);
    web.destroy(); web = null;
    const statsAfter = await run(`return JSON.stringify((await window.lolDesktop.initializeData({})).value.data.stats);`);
    assert.equal(Object.values(JSON.parse(statsAfter)).flatMap(Object.values).reduce((sum, count) => sum + count, 0) - Object.values(JSON.parse(statsBefore)).flatMap(Object.values).reduce((sum, count) => sum + count, 0), 20);
    assert.equal(applyCalls.length, 5);
    assert.equal(discordSends.length, 2);
    assert.deepEqual(consoleErrors, []);
    const report = { realLoopbackWebSocket: true, cloudflareLocalRuntime: cloud, realDesktopIpc: true, syntheticLobby: true, approval: true,
      invitationCopiesServiceAndRoom: true, invitationRequiresExplicitJoin: true, roomCodeJoin: true, guestReadyWithoutScrolling: true, systemClipboardUntouched: true,
      autoDiscovery: true, missingMatchFallsBackToInvitation: true, ambiguousMatchFallsBackToInvitation: true,
      discordOptional: true, copyWithoutDiscord: true, drawAndCopyAvailableDuringDiscordDelivery: true, guestAlignment,
      identicalResults: true, tabReturnPreservesRoom: true, reconnectResetsReadyAndPreservesResult: true,
      removeMember: true, closeRoom: true, layout, roomHistoryRecorded: true, desktopOriginalModes: true,
      websiteOriginalModes: true, websiteHasNoNativeRoom: true, importedLobby: true, syntheticApplyCalls: applyCalls.length, syntheticDiscordSends: discordSends.length };
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
