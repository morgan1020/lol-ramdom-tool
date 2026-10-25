// Isolated desktop smoke check. Never loads the user's saved Discord settings.
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { once } from 'node:events';
import '../src/desktop/main.js';
import { discoverConnection, preferenceEndpoint, requestClient } from '../src/desktop/lcu.js';

const output = path.resolve('release/smoke');
mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, `profile-${Date.now()}`));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
const deadline = setTimeout(async () => {
  console.error('Desktop smoke timed out');
  try { await restorePreferences(); } catch (error) { console.error(error.message); }
  app.exit(1);
}, 90000);
const liveApply = process.argv.includes('--apply-roles');
let baseline;
let writtenPreferences;

async function restorePreferences() {
  if (!baseline) return;
  const lobby = await requestClient(baseline.connection, '/lol-lobby/v2/lobby');
  const current = lobby.localMember;
  if (current?.puuid !== baseline.id || lobby.gameConfig?.queueId !== baseline.queueId || await requestClient(baseline.connection, '/lol-gameflow/v1/gameflow-phase') !== 'Lobby') {
    throw new Error('Cannot restore preferences: account, queue or phase changed; inspect client manually');
  }
  const actual = { firstPreference: current.firstPositionPreference, secondPreference: current.secondPositionPreference };
  if (JSON.stringify(actual) === JSON.stringify(baseline.preferences)) return;
  if (!writtenPreferences || JSON.stringify(actual) !== JSON.stringify(writtenPreferences)) throw new Error('Preferences changed independently; refusing to overwrite them');
  await requestClient(baseline.connection, preferenceEndpoint, { method: 'PUT', body: baseline.preferences });
  const restored = await requestClient(baseline.connection, '/lol-lobby/v2/lobby');
  if (restored.localMember.firstPositionPreference !== baseline.preferences.firstPreference || restored.localMember.secondPositionPreference !== baseline.preferences.secondPreference) throw new Error('Preference restore verification failed');
  console.log('Original client preferences restored and verified');
}

try {
  if (!BrowserWindow.getAllWindows().length) await once(app, 'browser-window-created');
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) throw new Error('Desktop window missing');
  const errors = [];
  window.webContents.on('console-message', (event) => {
    if (event.level === 'error') errors.push(event.message);
  });
  if (window.webContents.isLoading()) await once(window.webContents, 'did-finish-load');
  if (liveApply) {
    const connection = await discoverConnection();
    const lobby = await requestClient(connection, '/lol-lobby/v2/lobby');
    const own = await requestClient(connection, '/lol-summoner/v1/current-summoner');
    baseline = { connection, id: lobby.localMember.puuid, name: own.gameName + '#' + own.tagLine, queueId: lobby.gameConfig.queueId, preferences: { firstPreference: lobby.localMember.firstPositionPreference, secondPreference: lobby.localMember.secondPositionPreference } };
    await writeFile(path.join(output, 'original-preferences.json'), JSON.stringify({ firstPreference: baseline.preferences.firstPreference, secondPreference: baseline.preferences.secondPreference }, null, 2));
  }
  const check = await window.webContents.executeJavaScript(`(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let i = 0; i < 200; i++) {
      const candidate = document.querySelector('.role-setup, .draw-workspace');
      if (candidate?.getAttribute('aria-busy') === 'false' && candidate.querySelector('.player-label, [role="alert"]')) break;
      await sleep(100);
    }
    let panel = document.querySelector('.role-setup, .draw-workspace');
    if (!panel || typeof window.lolDesktop?.readLobby !== 'function') throw new Error('Desktop bridge or panel missing');
    const players = [...panel.querySelectorAll('.player-label')].map((item) => item.textContent);
    const error = panel.querySelector('[role="alert"]')?.textContent || '';
    if (!players.length && !error) throw new Error('Client read did not settle');
    let drawn = false;
    let appliedMessage = '';
    let applySucceeded = false;
    let ownDraw = [];
    if (players.length) {
      const applyToggle = panel.querySelector('[aria-label="抽完更新我的 LoL 分路"]');
      if (!applyToggle || applyToggle.checked) throw new Error('Auto-apply must default to off in a fresh profile');
      if (${liveApply}) { applyToggle.click(); await sleep(50); }
      panel.querySelector('.finish-setup').click();
      for (let i = 0; i < 100 && !document.querySelector('.draw-workspace'); i++) await sleep(50);
      panel = document.querySelector('.draw-workspace');
      panel.querySelector('.primary-draw').click();
      for (let i = 0; i < 250 && panel.querySelector('.primary-draw').textContent !== '重新抽籤'; i++) await sleep(100);
      drawn = panel.querySelector('.primary-draw').textContent === '重新抽籤';
      if (!drawn) throw new Error(panel.querySelector('[role="alert"]')?.textContent || 'Draw did not complete');
      if (document.querySelectorAll('.roster-card-grid [data-player-id]').length !== players.length) throw new Error('Result count mismatch');
      if (${liveApply}) {
        for (let i = 0; i < 250 && panel.getAttribute('aria-busy') !== 'false'; i++) await sleep(100);
        appliedMessage = panel.querySelector('.inline-status')?.textContent || '';
        applySucceeded = Boolean(panel.querySelector('.inline-status.is-success'));
        const ownCard = [...document.querySelectorAll('.roster-card-grid [data-player-id]')].find((card) => card.dataset.playerId === ${JSON.stringify(baseline?.name || '')});
        ownDraw = [...(ownCard?.querySelectorAll('.table-role > span:last-child') || [])].map((role) => role.textContent);
      }
    }
    return { bridge: true, players, error, drawn, appliedMessage, applySucceeded, ownDraw, nodeExposed: typeof window.require !== 'undefined' };
  })()`);
  if (liveApply && check.drawn) {
    const roles = { 上路: 'TOP', 打野: 'JUNGLE', 中路: 'MIDDLE', 下路: 'BOTTOM', 輔助: 'UTILITY' };
    writtenPreferences = { firstPreference: roles[check.ownDraw[0]], secondPreference: roles[check.ownDraw[1]] || baseline.preferences.secondPreference };
    const actual = await requestClient(baseline.connection, '/lol-lobby/v2/lobby');
    check.appliedPreferences = writtenPreferences;
    if (!check.applySucceeded) throw new Error(check.appliedMessage || 'Auto-apply did not succeed');
    if (actual.localMember.firstPositionPreference !== writtenPreferences.firstPreference || actual.localMember.secondPositionPreference !== writtenPreferences.secondPreference) throw new Error('Client preferences do not match the drawn roles');
  }
  if (check.nodeExposed) throw new Error('Node unexpectedly exposed to renderer');
  if (errors.length) throw new Error(errors.join('\n'));
  // The same production assets also work with no desktop bridge (the website runtime).
  const webWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await webWindow.loadURL('lol-draw://app/');
  const website = await webWindow.webContents.executeJavaScript(`(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let i = 0; i < 50 && !document.querySelector('#player-name'); i++) await sleep(100);
    if (window.lolDesktop || document.querySelector('.source-switch') || document.querySelector('.auto-apply-control')) throw new Error('Desktop controls leaked into website');
    const input = document.querySelector('#player-name');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '網站測試玩家');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(50);
    [...document.querySelectorAll('button')].find((button) => button.textContent === '加入').click();
    await sleep(50);
    document.querySelector('.finish-setup').click();
    await sleep(50);
    document.querySelector('.primary-draw').click();
    for (let i = 0; i < 50 && document.querySelector('.primary-draw').textContent !== '重新抽籤'; i++) await sleep(100);
    if (document.querySelectorAll('.table-role').length !== 2) throw new Error('Website manual draw failed');
    return { desktopControls: false, manualDraw: true };
  })()`);
  check.website = website;
  webWindow.destroy();
  console.log(JSON.stringify(check));
  await writeFile(path.join(output, 'result.json'), JSON.stringify(check, null, 2));
  window.show();
  window.focus();
  window.webContents.invalidate();
  await new Promise((resolve) => setTimeout(resolve, 500));
  const screenshot = await window.webContents.capturePage();
  await writeFile(path.join(output, 'desktop.png'), screenshot.toPNG());
  await restorePreferences();
  clearTimeout(deadline);
  app.exit(0);
} catch (error) {
  try { await restorePreferences(); }
  catch (restoreError) { console.error(restoreError.message); }
  console.error(error.stack || error.message);
  clearTimeout(deadline);
  app.exit(1);
}
});
