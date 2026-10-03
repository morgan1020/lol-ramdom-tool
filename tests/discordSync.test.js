import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiscordDrawMessage, normalizeDiscordWebhook, sendDiscordDraw } from '../src/domain/discordSync.js';
import { clearDiscordSync, DEFAULT_DISCORD_SYNC, loadDiscordSync, saveDiscordSync, STORAGE_DISCORD_SYNC } from '../src/storage/discordSync.js';
import { getActiveDiscordDestination, removeDiscordDestination, selectDiscordDestination, sendActiveDiscordDraw, upsertDiscordDestination } from '../src/domain/discordDestinations.js';

// 全部使用虛構 Webhook 與攔截的 fetch，不向 Discord 發出訊息。
const webhook = 'https://discord.com/api/webhooks/123456789012345678/test-token';
const results = [
  { name: '小明', main: '中路', secondary: '輔助' },
  { name: '阿哲', main: '上路', secondary: '打野' }
];

test('Webhook 只允許 Discord HTTPS 端點，不接受其他網站或查詢參數', () => {
  assert.equal(normalizeDiscordWebhook(` ${webhook}/ `), webhook);
  assert.equal(normalizeDiscordWebhook(webhook.replace('/api/', '/api/v10/')), webhook.replace('/api/', '/api/v10/'));
  for (const value of [
    webhook.replace('https:', 'http:'), webhook.replace('discord.com', 'discord.com.evil.test'),
    `${webhook}?thread_id=1`, `${webhook}#token`, webhook.replace('discord.com', 'user@discord.com'),
    webhook.replace('discord.com', 'discord.com:8443'), 'not-a-url'
  ]) assert.throws(() => normalizeDiscordWebhook(value), /完整 Webhook 網址/);
});

test('Discord 訊息只含分路結果，不傳送時間並禁止所有提及通知', () => {
  const payload = buildDiscordDrawMessage(results);
  assert.equal(payload.content, '### 英雄聯盟分路結果\n> **阿哲**　上路／打野\n> **小明**　中路／輔助');
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  const escaped = buildDiscordDrawMessage([{ name: '*玩家*\n@everyone <@123>', main: '上路' }]);
  assert.match(escaped.content, /\\\*玩家\\\* @everyone \\<@123\\>/);
  assert.throws(() => buildDiscordDrawMessage([]));
  assert.doesNotMatch(payload.content, /抽籤時間|<t:/);
  assert.throws(() => buildDiscordDrawMessage([{ name: 'A', main: '錯誤路線' }]));
  assert.throws(() => buildDiscordDrawMessage([{ name: 'A'.repeat(2000), main: '上路' }]), /長度限制/);
});

test('直接傳送到 Discord，等待確認、略過 cookie 與 referrer，且不使用網站後端', async () => {
  let calls = 0;
  const id = await sendDiscordDraw(webhook, results, {
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.equal(url, `${webhook}?wait=true`);
      assert.equal(options.method, 'POST');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.referrerPolicy, 'no-referrer');
      assert.equal(options.redirect, 'error');
      assert.deepEqual(JSON.parse(options.body), buildDiscordDrawMessage(results));
      return Response.json({ id: '123456789' });
    }
  });
  assert.equal(calls, 1);
  assert.equal(id, '123456789');
});

test('失效、限流與網路錯誤不自動重送，也不把 Webhook 洩漏到錯誤文案', async () => {
  for (const [status, pattern] of [[404, /已失效/], [403, /已失效/], [429, /過於頻繁/], [500, /未接受/]]) {
    let calls = 0;
    await assert.rejects(sendDiscordDraw(webhook, results, {
      fetchImpl: async () => { calls += 1; return new Response('', { status }); }
    }), pattern);
    assert.equal(calls, 1);
  }
  await assert.rejects(sendDiscordDraw(webhook, results, {
    fetchImpl: async () => { throw new TypeError(`Failed fetching ${webhook}`); }
  }), (error) => !error.message.includes(webhook) && /檢查網路/.test(error.message));
  await assert.rejects(sendDiscordDraw(webhook, results, {
    fetchImpl: async () => Response.json({})
  }), /無法確認/);
});

test('逾時會中止請求，提醒先確認頻道而不自動產生重複訊息', async () => {
  let calls = 0;
  await assert.rejects(sendDiscordDraw(webhook, results, {
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => {
      calls += 1;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    }
  }), /逾時.*請先查看 Discord/);
  assert.equal(calls, 1);
});

test('設定只寫入指定本機儲存鍵，可停用、重新載入及完全清除', () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key)
  };
  assert.deepEqual(loadDiscordSync(storage), DEFAULT_DISCORD_SYNC);
  saveDiscordSync({ webhookUrl: webhook, enabled: true }, storage);
  assert.equal(data.size, 1);
  assert.ok(data.has(STORAGE_DISCORD_SYNC));
  const saved = loadDiscordSync(storage);
  assert.equal(saved.enabled, true);
  assert.equal(getActiveDiscordDestination(saved).webhookUrl, webhook);
  assert.equal(saved.schemaVersion, 2);
  saveDiscordSync({ webhookUrl: webhook, enabled: false }, storage);
  assert.equal(loadDiscordSync(storage).enabled, false);
  assert.deepEqual(clearDiscordSync(storage), DEFAULT_DISCORD_SYNC);
  assert.equal(data.size, 0);
});

test('損壞或遭封鎖的本機儲存不會啟用同步；無法儲存時明確回報', () => {
  const blocked = { getItem() { throw new Error(); }, setItem() { throw new Error(); }, removeItem() { throw new Error(); } };
  for (const storage of [blocked, { getItem: () => '{bad-json' }, { getItem: () => JSON.stringify({ webhookUrl: 'https://evil.test', enabled: true }) }]) {
    assert.deepEqual(loadDiscordSync(storage), DEFAULT_DISCORD_SYNC);
  }
  assert.throws(() => saveDiscordSync({ webhookUrl: webhook, enabled: true }, blocked), /無法儲存設定/);
  assert.throws(() => clearDiscordSync(blocked), /無法清除設定/);
});

const webhookId = '123456789012345678';
const info = { webhookId, webhookName: '測試群', guildId: '234567890123456789', channelId: '345678901234567890' };

test('新增與切換多組目的地，每次只傳送到一組；停用時完全不發出請求', async () => {
  const otherWebhook = webhook.replace(webhookId, '456789012345678901');
  const otherInfo = { ...info, webhookId: '456789012345678901', guildId: '567890123456789012', channelId: '678901234567890123' };
  let settings = upsertDiscordDestination(DEFAULT_DISCORD_SYNC, { webhookUrl: webhook, label: '朋友群', info });
  settings = upsertDiscordDestination(settings, { webhookUrl: otherWebhook, label: '另一個群', info: otherInfo });
  assert.equal(settings.destinations.length, 2);
  assert.equal(getActiveDiscordDestination(settings).label, '朋友群');
  assert.equal(settings.enabled, false);
  settings = { ...selectDiscordDestination(settings, '456789012345678901'), enabled: true };
  const urls = [];
  const options = { fetchImpl: async (url) => { urls.push(url); return Response.json({ id: '987654321' }); } };
  await sendActiveDiscordDraw(settings, results, options);
  assert.deepEqual(urls, [`${otherWebhook}?wait=true`]);
  settings = selectDiscordDestination(settings, webhookId);
  await sendActiveDiscordDraw(settings, results, options);
  assert.deepEqual(urls, [`${otherWebhook}?wait=true`, `${webhook}?wait=true`]);
  await sendActiveDiscordDraw({ ...settings, enabled: false }, results, options);
  assert.equal(urls.length, 2);
  const updated = upsertDiscordDestination(settings, { webhookUrl: webhook, label: '朋友群改名', info });
  assert.equal(updated.destinations.length, 2);
  assert.equal(getActiveDiscordDestination(updated).label, '朋友群改名');
  const removed = removeDiscordDestination(updated, webhookId);
  assert.equal(removed.destinations.length, 1);
  assert.equal(removed.enabled, false);
  assert.throws(() => selectDiscordDestination(removed, 'missing'));
});

test('既有單一 Webhook 設定保留網址與啟用狀態，並可儲存為多組格式', () => {
  let stored = JSON.stringify({ webhookUrl: webhook, enabled: true });
  const storage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  const migrated = loadDiscordSync(storage);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.destinations.length, 1);
  assert.equal(getActiveDiscordDestination(migrated).webhookUrl, webhook);
  assert.equal(migrated.enabled, true);
  const added = upsertDiscordDestination(migrated, { webhookUrl: webhook, label: '原本的群', info });
  saveDiscordSync(added, storage);
  assert.deepEqual(loadDiscordSync(storage), added);
});



test('新增與編輯只保存本機設定，不自動開啟同步或切換其他目的地', () => {
  let settings = upsertDiscordDestination(DEFAULT_DISCORD_SYNC, { webhookUrl: webhook, label: '原本的群' });
  assert.equal(settings.enabled, false);
  const otherWebhook = webhook.replace(webhookId, '456789012345678901');
  settings = { ...settings, enabled: true };
  settings = upsertDiscordDestination(settings, { webhookUrl: otherWebhook, label: '第二組' });
  assert.equal(settings.activeDestinationId, webhookId);
  assert.equal(settings.enabled, true);
  const replacement = webhook.replace(webhookId, '567890123456789012');
  settings = upsertDiscordDestination(settings, { previousId: '456789012345678901', webhookUrl: replacement, label: '換網址' });
  assert.equal(settings.destinations.length, 2);
  assert.equal(settings.activeDestinationId, webhookId);
  assert.equal(settings.destinations[1].webhookUrl, replacement);
  assert.throws(() => upsertDiscordDestination(settings, { previousId: '567890123456789012', webhookUrl: webhook, label: '重複' }), /已存在/);
  assert.throws(() => upsertDiscordDestination(settings, { webhookUrl: webhook, label: ' ' }), /自訂名稱/);
});

test('舊查詢格式轉成自訂名稱，保存網址而移除不再使用的查詢資訊', () => {
  const oldSettings = { schemaVersion: 2, enabled: true, activeDestinationId: webhookId, destinations: [{ id: webhookId, webhookUrl: webhook, label: '', info }] };
  const loaded = loadDiscordSync({ getItem: () => JSON.stringify(oldSettings) });
  assert.equal(loaded.enabled, true);
  assert.equal(loaded.destinations[0].label, '測試群');
  assert.equal(loaded.destinations[0].webhookUrl, webhook);
  assert.equal('info' in loaded.destinations[0], false);
});
