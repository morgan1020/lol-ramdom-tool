// UI integration checks use synthetic IPC replies and an isolated profile. No client writes or Discord requests.
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import '../src/desktop/main.js';

const output = path.resolve('release/ui-smoke');
mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, `profile-${Date.now()}`));
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const deadline = setTimeout(() => { console.error('UI check timed out'); app.exit(1); }, 60000);
  if (!BrowserWindow.getAllWindows().length) await once(app, 'browser-window-created');
  const fixtureNames = ['八方肉包#1020', '小明#TW1', '小明#TW2', '隊友 A#TW', '隊友 B#TW'];
  const fixtureRoles = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
  let reads = 0;
  let readFailure = false;
  const writes = [];
  ipcMain.removeHandler('lol:read-lobby');
  ipcMain.handle('lol:read-lobby', () => {
    reads++;
    return readFailure ? { ok: false, message: '測試：客戶端已離線' } : { ok: true, lobby: {
      players: fixtureNames.map((name, i) => ({ name, id: `fixture-${i}`, isLeader: i === 0, firstPosition: fixtureRoles[i], secondPosition: 'UNSELECTED' })),
      localPlayerId: 'fixture-0', fetchedAt: new Date().toISOString()
    } };
  });
  ipcMain.removeHandler('lol:apply-roles');
  ipcMain.handle('lol:apply-roles', (_event, results) => {
    writes.push(results);
    return { ok: false, message: '測試：客戶端拒絕套用' };
  });
  try {
    const window = BrowserWindow.getAllWindows()[0];
    const errors = [];
    window.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message); });
    if (window.webContents.isLoading()) await once(window.webContents, 'did-finish-load');
    const run = (fn) => window.webContents.executeJavaScript(`(${fn.toString()})()`);
    const capture = async (name) => {
      window.show(); window.focus(); window.webContents.invalidate();
      await new Promise((resolve) => setTimeout(resolve, 250));
      await writeFile(path.join(output, name), (await window.webContents.capturePage()).toPNG());
    };
    const initial = await run(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      for (let i = 0; i < 100; i++) {
        if (document.querySelector('.role-workspace')?.getAttribute('aria-busy') === 'false' && document.querySelectorAll('.player-label').length === 5) break;
        await sleep(50);
      }
      const labels = [...document.querySelectorAll('.player-label')].map((item) => item.textContent);
      if (labels.length !== 5 || labels.some((label) => label.includes('#'))) throw new Error('Names missing or Riot tags visible');
      if (!labels.includes('小明 · 1') || !labels.includes('小明 · 2')) throw new Error('Same-name accounts not distinguished');
      if (document.querySelector('.stepper')) throw new Error('Old wizard still visible');
      if (document.querySelectorAll('.primary-draw').length !== 1) throw new Error('Competing primary draw buttons');
      if (document.querySelector('[aria-label="抽完更新我的 LoL 分路"]').checked) throw new Error('Auto-apply unexpectedly enabled');
      document.querySelector('.primary-draw').click();
      for (let i = 0; i < 100 && document.querySelector('.primary-draw').textContent !== '重新抽籤'; i++) await sleep(50);
      if (document.querySelectorAll('.table-role').length !== 5) throw new Error('Five-person draw must show only five primary roles');
      if (document.querySelector('.primary-draw').getBoundingClientRect().bottom > innerHeight) throw new Error('Primary action below the fold');
      return { labels, selfBadge: Boolean(document.querySelector('.self-badge')), rows: document.querySelectorAll('.roster-player-card').length, clientDraw: true };
    });
    await run(async () => {
      if (document.documentElement.dataset.theme !== 'light') document.querySelector('[aria-label="切換深淺色模式"]').click();
      for (let i = 0; i < 100 && document.documentElement.dataset.theme !== 'light'; i++) await new Promise((resolve) => setTimeout(resolve, 30));
    });
    await capture('desktop-light.png');
    await run(async () => {
      document.querySelector('[aria-label="切換深淺色模式"]').click();
      for (let i = 0; i < 100 && document.documentElement.dataset.theme !== 'dark'; i++) await new Promise((resolve) => setTimeout(resolve, 30));
      if (document.documentElement.dataset.theme !== 'dark') throw new Error('Dark theme did not activate');
      const stored = await window.lolDesktop.initializeData({});
      if (!stored.ok || stored.value.data.preferences.theme !== 'dark' || localStorage.getItem('lolTheme') !== null) throw new Error('Native theme did not persist exclusively in AppData');
    });
    await capture('desktop-dark.png');
    await run(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const mode = document.querySelector('#draw-mode');
      mode.value = 'client'; mode.dispatchEvent(new Event('change', { bubbles: true })); await sleep(30);
      document.querySelector('.primary-draw').click();
      for (let i = 0; i < 100 && document.querySelector('.primary-draw').textContent !== '重新抽籤'; i++) await sleep(50);
      const roles = [...document.querySelectorAll('.table-role')].map((item) => item.textContent);
      if (roles.join(',') !== '上路,打野,中路,下路,輔助') throw new Error('Client preferences not honored');
      mode.value = 'custom'; mode.dispatchEvent(new Event('change', { bubbles: true })); await sleep(30);
      const selects = [...document.querySelectorAll('.inline-preference')];
      if (selects.length !== 5) throw new Error('Custom preferences missing');
      selects[2].value = ''; selects[2].dispatchEvent(new Event('change', { bubbles: true })); await sleep(30);
      selects[0].value = '中路'; selects[0].dispatchEvent(new Event('change', { bubbles: true })); await sleep(30);
      document.querySelector('.primary-draw').click();
      for (let i = 0; i < 100 && document.querySelector('.primary-draw').textContent !== '重新抽籤'; i++) await sleep(50);
      if (document.querySelector('.table-role').textContent !== '中路') throw new Error('Custom primary preference lost');
      document.querySelector('[aria-label="抽完更新我的 LoL 分路"]').click(); await sleep(30);
      document.querySelector('.primary-draw').click();
      for (let i = 0; i < 100 && !document.querySelector('.inline-status.is-error'); i++) await sleep(50);
      if (!document.querySelector('.inline-status.is-error')?.textContent.includes('抽籤結果已保留')) throw new Error('Apply error missing');
      if (document.querySelectorAll('.table-role').length !== 5) throw new Error('Apply failure erased results');
      document.querySelector('[aria-label="抽完更新我的 LoL 分路"]').click();
      for (let i = 0; i < 100 && document.querySelector('.role-workspace').getAttribute('aria-busy') !== 'false'; i++) await sleep(30);
    });
    if (writes.length !== 1 || writes[0].some((result, i) => result.name !== fixtureNames[i])) throw new Error('Native apply payload lost full Riot IDs');
    if (reads < 5) throw new Error('Client was not refreshed on each draw');
    await run(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      document.querySelector('[aria-label="設定"]').click(); await sleep(30);
      const dialog = document.querySelector('.settings-dialog');
      if (!dialog.open) throw new Error('Settings dialog missing');
      [...dialog.querySelectorAll('.settings-nav button')].find((button) => button.textContent === 'Discord').click(); await sleep(30);
      dialog.querySelector('.webhook-manager summary').click(); await sleep(30);
      const field = (selector, value) => {
        const input = dialog.querySelector(selector);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      field('#discord-label', '測試頻道'); field('#discord-webhook', 'https://discord.com/api/webhooks/123456789012345678/synthetic_test_only'); await sleep(30);
      dialog.querySelector('form').requestSubmit();
      for (let i = 0; i < 100 && !dialog.querySelector('.discord-destination-list')?.textContent.includes('測試頻道'); i++) await sleep(30);
      if (!dialog.querySelector('.discord-destination-list')?.textContent.includes('測試頻道')) throw new Error('Webhook save failed');
      if (dialog.querySelector('[aria-label="Discord 自動同步"]').getAttribute('aria-checked') !== 'false') throw new Error('Saving settings enabled Discord');
      dialog.querySelector('[aria-label="刪除 測試頻道"]').click();
      for (let i = 0; i < 100 && dialog.querySelector('.discord-destination-list')?.textContent.includes('測試頻道'); i++) await sleep(30);
      dialog.dispatchEvent(new Event('cancel', { cancelable: true })); await sleep(30);
      if (dialog.open) throw new Error('Settings cancel failed');
      document.querySelector('[aria-label="切換深淺色模式"]').click();
      for (let i = 0; i < 100 && document.querySelector('.role-workspace').getAttribute('aria-busy') !== 'false'; i++) await sleep(30);
      document.querySelector('[aria-label="設定"]').click();
    });
    await capture('settings-light.png');
    await run(async () => {
      document.querySelector('.settings-dialog [aria-label="關閉設定"]').click();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    await run(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const previousStats = localStorage.getItem('lolDrawStats');
      [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === '抽英雄').click();
      await sleep(30);
      [...document.querySelectorAll('.champion-position')].find((button) => button.textContent === '中路').click();
      for (let i = 0; i < 200 && document.querySelector('.champion-actions button').disabled; i++) await sleep(50);
      document.querySelector('.champion-actions button').click();
      await sleep(50);
      if (!document.querySelector('.champion-result h3')?.textContent) throw new Error('Champion draw failed');
      if (localStorage.getItem('lolDrawStats') !== previousStats) throw new Error('Champion draw changed role statistics');
      [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === '抽分路').click();
      await sleep(30);
    });
    readFailure = true;
    await run(async () => {
      document.querySelector('[aria-label="重新讀取隊伍"]').click();
      for (let i = 0; i < 100; i++) {
        if (document.querySelector('.role-workspace').getAttribute('aria-busy') === 'false' && document.querySelector('.inline-status.is-error')?.textContent.includes('離線')) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (document.querySelectorAll('.table-role').length) throw new Error('Stale roles survived a disconnected client');
      [...document.querySelectorAll('.source-switch button')].find((button) => button.textContent === '手動名單').click();
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (document.querySelector('.inline-status.is-error')) throw new Error('Client error leaked into manual source');
    });
    // No preload means this window has the same capabilities as the static website.
    const web = new BrowserWindow({ show: false, width: 1040, height: 760, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await web.loadURL('lol-draw://app/');
    const website = await web.webContents.executeJavaScript(`(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      for (let i = 0; i < 100 && !document.querySelector('#player-name'); i++) await sleep(30);
      if (window.lolDesktop || document.querySelector('.source-switch') || document.querySelector('.auto-apply-control')) throw new Error('Desktop controls leaked into website');
      const add = async (name) => {
        const input = document.querySelector('#player-name');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, name);
        input.dispatchEvent(new Event('input', { bubbles: true })); await sleep(20);
        document.querySelector('.manual-add-form').requestSubmit(); await sleep(20);
      };
      await add('網站玩家#TW'); await add('網站玩家#OTHER'); await add('朋友#TW');
      const mode = document.querySelector('#draw-mode'); mode.value = 'custom'; mode.dispatchEvent(new Event('change', { bubbles: true })); await sleep(20);
      const first = document.querySelector('.inline-preference'); first.value = '上路'; first.dispatchEvent(new Event('change', { bubbles: true })); await sleep(20);
      document.querySelector('.primary-draw').click();
      for (let i = 0; i < 100 && document.querySelector('.primary-draw').textContent !== '重新抽籤'; i++) await sleep(30);
      if (document.querySelectorAll('.table-role').length !== 6 || document.querySelector('.table-role').textContent !== '上路') throw new Error('Website primary/secondary draw failed');
      if ([...document.querySelectorAll('.player-label')].some((item) => item.textContent.includes('#'))) throw new Error('Website names still show tags');
      const identities = [...document.querySelectorAll('[data-player-id]')].map((item) => item.dataset.playerId);
      if (identities[0] !== '網站玩家#TW' || identities[1] !== '網站玩家#OTHER') throw new Error('Website identities merged');
      return { manualDraw: true, customPreferences: true, hiddenTags: true, separateIdentities: true };
    })()`);
    web.setContentSize(390, 780);
    const mobile = await web.webContents.executeJavaScript(`({ overflow: document.documentElement.scrollWidth > innerWidth, primaryVisible: !!document.querySelector('.primary-draw') })`);
    if (mobile.overflow) throw new Error('Mobile horizontal overflow');
    web.show(); web.focus(); web.webContents.invalidate();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await writeFile(path.join(output, 'website-mobile.png'), (await web.webContents.capturePage()).toPNG());
    web.destroy();
    if (errors.length) throw new Error(errors.join('\n'));
    const check = { initial, clientPreferences: true, customPreferences: true, applyFailurePreservesResult: true, completeIdsInNativePayload: true, settingsCrud: true, championDraw: true, themes: true, website, mobile };
    await writeFile(path.join(output, 'result.json'), JSON.stringify(check, null, 2));
    console.log(JSON.stringify(check));
    clearTimeout(deadline); app.exit(0);
  } catch (error) {
    console.error(error.stack || error.message);
    clearTimeout(deadline); app.exit(1);
  }
});
