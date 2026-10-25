import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { DesktopDataStore } from '../src/desktop/dataStore.js';

const webhook = 'https://discord.com/api/webhooks/123456789012345678/synthetic_secret_for_test';
const legacy = {
  lolDrawStats: JSON.stringify({ '玩家#TW': { 上路: 2, 輔助: 0.5 } }),
  lolDiscordSync: JSON.stringify({ webhookUrl: webhook, enabled: true }),
  lolTheme: 'dark', 'lol-theme': null, lolAutoApplyRoles: 'true'
};

function encryption() {
  const key = randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString: (text) => {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    },
    decryptString: (buffer) => {
      const decipher = createDecipheriv('aes-256-gcm', key, buffer.subarray(0, 12));
      decipher.setAuthTag(buffer.subarray(12, 28));
      return Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString('utf8');
    }
  };
}

async function fixture(t, options = {}) {
  const testRoot = path.resolve('release/store-tests');
  await fs.mkdir(testRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(testRoot, 'case-'));
  t.after(async () => {
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(path.join(testRoot, 'case-'))) throw new Error('Unexpected test directory');
    await fs.rm(resolved, { recursive: true, force: true });
  });
  const crypto = encryption();
  const store = new DesktopDataStore({ directory, encryption: crypto, ...options });
  return { directory, crypto, store };
}

test('migration encrypts before writing, verifies data, and returns metadata without URLs', async (t) => {
  const { store } = await fixture(t);
  const result = await store.initialize(legacy);
  assert.equal(result.data.stats['玩家#TW'].上路, 2);
  assert.equal(result.data.preferences.theme, 'dark');
  assert.equal(result.data.preferences.autoApplyRoles, true);
  assert.equal(result.data.discord.enabled, true);
  assert.ok(result.cleanupKeys.includes('lolDiscordSync'));
  assert.doesNotMatch(JSON.stringify(result), /https:|synthetic_secret|webhookUrl/);
  const disk = await fs.readFile(store.file, 'utf8');
  assert.match(disk, /encryptedWebhook/);
  assert.doesNotMatch(disk, /synthetic_secret|https:\/\/discord|"webhookUrl"/);
});

test('restart preserves native changes and never re-imports stale legacy stats after clearing', async (t) => {
  const { directory, crypto, store } = await fixture(t);
  await store.initialize(legacy);
  await store.saveStats({});
  const next = new DesktopDataStore({ directory, encryption: crypto });
  const result = await next.initialize(legacy);
  assert.deepEqual(result.data.stats, {});
  assert.ok(result.cleanupKeys.includes('lolDiscordSync'));
  const changed = await next.initialize({ ...legacy, lolTheme: 'light' });
  assert.equal(changed.cleanupKeys.includes('lolTheme'), false);
  assert.equal(changed.data.preferences.theme, 'dark');
  assert.match(changed.notice, /不同的舊資料/);
  const partial = await next.initialize({ lolDiscordSync: legacy.lolDiscordSync });
  assert.deepEqual(partial.cleanupKeys, ['lolDiscordSync']);
});

test('concurrent settings/statistics writes are serialized without lost updates', async (t) => {
  const { store } = await fixture(t);
  await store.initialize();
  await Promise.all([
    store.savePreferences({ theme: 'dark' }),
    store.saveStats({ 'A#TW': { 上路: 4 } }),
    store.changeDiscord('configure', { label: '測試', webhookUrl: webhook })
  ]);
  const value = store.publicData();
  assert.equal(value.preferences.theme, 'dark');
  assert.equal(value.stats['A#TW'].上路, 4);
  assert.equal(value.discord.destinations.length, 1);
  assert.equal(value.revision, 4);
  assert.doesNotMatch(await fs.readFile(`${store.file}.bak`, 'utf8'), /synthetic_secret|"webhookUrl"/);
});

test('editing a label with an empty URL preserves the main-process secret; sending uses injected transport', async (t) => {
  const sent = [];
  const { store } = await fixture(t, { send: async (...args) => { sent.push(args); return 'synthetic-message-id'; } });
  await store.initialize(legacy);
  await store.changeDiscord('configure', { previousId: '123456789012345678', label: '改名', webhookUrl: '' });
  assert.equal(store.publicData().discord.destinations[0].label, '改名');
  const results = [{ name: '玩家#TW', main: '上路', secondary: '輔助' }];
  assert.equal(await store.sendDraw(results), 'synthetic-message-id');
  assert.equal(sent[0][0], webhook);
  assert.deepEqual(sent[0][1], results);
  await store.changeDiscord('remove', '123456789012345678');
  assert.equal(await store.sendDraw(results), null);
  assert.equal(sent.length, 1);
});

test('unavailable encryption blocks migration and saving secrets without plaintext fallback', async (t) => {
  const { store, crypto } = await fixture(t);
  crypto.isEncryptionAvailable = () => false;
  await assert.rejects(store.initialize(legacy), /加密/);
  await assert.rejects(fs.readFile(store.file), { code: 'ENOENT' });
  await store.initialize();
  const original = await fs.readFile(store.file, 'utf8');
  await assert.rejects(store.changeDiscord('configure', { label: '測試', webhookUrl: webhook }), /加密/);
  assert.equal(await fs.readFile(store.file, 'utf8'), original);
});

test('wrong encryption key and corrupt files are preserved without silent reset', async (t) => {
  const { store, directory } = await fixture(t);
  await store.initialize(legacy);
  const original = await fs.readFile(store.file, 'utf8');
  const other = new DesktopDataStore({ directory, encryption: encryption() });
  await assert.rejects(other.initialize(), /無法解密/);
  assert.equal(await fs.readFile(store.file, 'utf8'), original);
  await fs.writeFile(store.file, 'broken-json');
  const corrupt = new DesktopDataStore({ directory, encryption: encryption() });
  await assert.rejects(corrupt.initialize(), /損壞/);
  assert.equal(await fs.readFile(store.file, 'utf8'), 'broken-json');
});

test('failed replacement leaves the previous file intact and releases the write queue', async (t) => {
  const { store, directory, crypto } = await fixture(t);
  await store.initialize(legacy);
  const original = await fs.readFile(store.file, 'utf8');
  const blocked = new DesktopDataStore({ directory, encryption: crypto, io: { ...fs, rename: async () => { throw Object.assign(new Error('synthetic denied'), { code: 'EACCES' }); } } });
  await blocked.initialize();
  await assert.rejects(blocked.saveStats({}), /無法寫入/);
  assert.equal(await fs.readFile(store.file, 'utf8'), original);
  assert.equal(blocked.publicData().stats['玩家#TW'].上路, 2);
  assert.equal((await fs.readdir(directory)).some((name) => name.endsWith('.tmp')), false);
});

test('read-back failure does not authorize legacy cleanup or further writes', async (t) => {
  const { directory, crypto } = await fixture(t);
  let replaced = false;
  const store = new DesktopDataStore({ directory, encryption: crypto, io: {
    ...fs, rename: async (...args) => { await fs.rename(...args); replaced = true; },
    readFile: async (...args) => replaced ? 'mismatch' : fs.readFile(...args)
  } });
  await assert.rejects(store.initialize(legacy), /無法確認/);
  await assert.rejects(store.saveStats({}), /重新開啟/);
  assert.equal(legacy.lolDiscordSync.includes('synthetic_secret'), true);
});

test('imports and exports contain statistics only; invalid import leaves existing native state untouched', async (t) => {
  const { store } = await fixture(t);
  await store.initialize(legacy);
  await store.importStats('{"新玩家#TW":{"打野":2}}', 'merge');
  assert.equal(Object.keys(store.publicData().stats).length, 2);
  const before = await fs.readFile(store.file, 'utf8');
  assert.throws(() => store.importStats('{"玩家#TW":{"上路":-2}}', 'replace'));
  assert.equal(await fs.readFile(store.file, 'utf8'), before);
  const exported = store.exportStats();
  assert.doesNotMatch(exported, /webhook|discord|theme|synthetic_secret/i);
  await store.importStats(exported, 'replace');
  assert.equal(store.publicData().discord.destinations.length, 1);
});

test('a missing primary file with an existing backup never silently creates empty data', async (t) => {
  const { store, directory, crypto } = await fixture(t);
  await store.initialize(legacy);
  await store.savePreferences({ theme: 'light' });
  const backup = await fs.readFile(`${store.file}.bak`, 'utf8');
  await fs.unlink(store.file);
  const fresh = new DesktopDataStore({ directory, encryption: crypto });
  await assert.rejects(fresh.initialize(), /備份仍存在/);
  assert.equal(await fs.readFile(`${store.file}.bak`, 'utf8'), backup);
});
