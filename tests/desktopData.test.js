import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const data = { revision: 1, stats: { '玩家#TW': { 上路: 1 } }, preferences: { theme: 'dark', autoApplyRoles: false, drawMode: 'random' }, discord: { schemaVersion: 2, destinations: [], enabled: false, activeDestinationId: '' }, info: {} };

function useWindow(t, bridge, values, failCleanup = false) {
  const previous = globalThis.window;
  const map = new Map(Object.entries(values));
  globalThis.window = { lolDesktop: bridge, localStorage: {
    getItem: (key) => map.get(key) ?? null,
    removeItem: (key) => { if (failCleanup && key === 'lolDiscordSync') throw new Error('synthetic blocked'); map.delete(key); }
  } };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  return map;
}

async function fresh() { return import(`../src/storage/desktopData.js?case=${randomUUID()}`); }

test('renderer removes only verified, unchanged legacy keys and preserves unrelated localStorage', async (t) => {
  const module = await fresh();
  const map = useWindow(t, { initializeData: async () => ({ ok: true, value: { data, cleanupKeys: ['lolDrawStats', 'lolDiscordSync'], notice: '已移轉' } }) }, { lolDrawStats: '{}', lolDiscordSync: 'synthetic-legacy-secret', otherApp: 'keep' });
  await module.initializeDesktopData();
  assert.equal(map.has('lolDiscordSync'), false);
  assert.equal(map.get('otherApp'), 'keep');
  assert.equal(module.getDesktopData().preferences.theme, 'dark');
});

test('failed native migration keeps every legacy key; no browser fallback is selected', async (t) => {
  const module = await fresh();
  const map = useWindow(t, { initializeData: async () => ({ ok: false, message: '加密不可用' }) }, { lolDrawStats: '{}', lolDiscordSync: 'synthetic-legacy-secret' });
  await assert.rejects(module.initializeDesktopData(), /加密不可用/);
  assert.equal(map.size, 2);
  assert.throws(() => module.getDesktopData(), /尚未載入/);
});

test('partial cleanup failure preserves the secret and reports a retry notice', async (t) => {
  const module = await fresh();
  const map = useWindow(t, { initializeData: async () => ({ ok: true, value: { data, cleanupKeys: ['lolDrawStats', 'lolDiscordSync'], notice: '' } }) }, { lolDrawStats: '{}', lolDiscordSync: 'synthetic-legacy-secret' }, true);
  const value = await module.initializeDesktopData();
  assert.equal(map.has('lolDrawStats'), false);
  assert.equal(map.get('lolDiscordSync'), 'synthetic-legacy-secret');
  assert.match(value.notice, /尚未清除/);
});
