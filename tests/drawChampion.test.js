import test from 'node:test';
import assert from 'node:assert/strict';
import { drawChampion, validateChampionPool } from '../src/domain/drawChampion.js';

const champions = [
  { id: 'Ahri', key: '103', name: '阿璃', imageUrl: 'https://example.com/Ahri.png' },
  { id: 'Aatrox', key: '266', name: '厄薩斯', imageUrl: 'https://example.com/Aatrox.png' }
];

test('drawChampion 會從英雄池抽出一隻且不修改輸入資料', () => {
  const original = structuredClone(champions);
  const result = drawChampion(champions);

  assert.ok(champions.some((champion) => champion.id === result.id));
  assert.deepEqual(champions, original);
  assert.notEqual(result, champions[0]);
});

test('空英雄池會拋出明確錯誤', () => {
  assert.throws(() => validateChampionPool([]), /英雄池不可為空/);
  assert.throws(() => drawChampion([]), /英雄池不可為空/);
});

test('非陣列英雄池會拋出格式錯誤', () => {
  assert.throws(() => drawChampion(null), /英雄池格式錯誤/);
});
