import test from 'node:test';
import assert from 'node:assert/strict';
import { clearStats, loadStats, saveStats, STORAGE_STATS } from '../src/storage/localStats.js';
import { LEGACY_THEME_KEY, loadTheme, saveTheme, STORAGE_THEME } from '../src/storage/theme.js';

function createStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    dump() {
      return Object.fromEntries(data.entries());
    }
  };
}

test('loadStats 讀取 lolDrawStats 並補齊舊資料缺少的位置欄位', () => {
  const storage = createStorage({
    [STORAGE_STATS]: JSON.stringify({ A: { 上路: 1 } })
  });

  assert.deepEqual(loadStats(storage), {
    A: { 上路: 1, 打野: 0, 中路: 0, 下路: 0, 輔助: 0 }
  });
});

test('saveStats 寫回 lolDrawStats，clearStats 可清除同一個 key', () => {
  const storage = createStorage();

  saveStats({ A: { 上路: 1, 打野: 0, 中路: 0, 下路: 0, 輔助: 0 } }, storage);
  assert.match(storage.getItem(STORAGE_STATS), /"A"/);

  clearStats(storage);
  assert.equal(storage.getItem(STORAGE_STATS), null);
});

test('loadTheme 優先使用 lolTheme，並相容舊 lol-theme', () => {
  assert.equal(loadTheme(createStorage({ [STORAGE_THEME]: 'dark', [LEGACY_THEME_KEY]: 'light' }), false), 'dark');
  assert.equal(loadTheme(createStorage({ [LEGACY_THEME_KEY]: 'dark' }), false), 'dark');
  assert.equal(loadTheme(createStorage(), true), 'dark');
  assert.equal(loadTheme(createStorage(), false), 'light');
});

test('saveTheme 寫入 lolTheme 並移除舊 lol-theme', () => {
  const storage = createStorage({ [LEGACY_THEME_KEY]: 'dark' });

  saveTheme('light', storage);

  assert.equal(storage.getItem(STORAGE_THEME), 'light');
  assert.equal(storage.getItem(LEGACY_THEME_KEY), null);
});
