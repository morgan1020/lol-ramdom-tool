import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDrawToStats, emptyStats, normalizeStats, sortPlayerNames } from '../src/domain/stats.js';

test('主位 +1、副位 +0.5', () => {
  const drawResults = [
    { name: 'A', main: '上路', secondary: '打野' },
    { name: 'B', main: '中路', secondary: '' }
  ];

  const next = applyDrawToStats({}, drawResults);

  assert.equal(next.A['上路'], 1);
  assert.equal(next.A['打野'], 0.5);
  assert.equal(next.B['中路'], 1);
  assert.equal(next.B['下路'], 0);
});

test('normalizeStats 會補齊舊統計缺少的位置欄位', () => {
  const normalized = normalizeStats({
    A: { 上路: 2, 打野: 1 },
    B: { 中路: 3, 輔助: 0.5 }
  });

  assert.deepEqual(normalized.A, { ...emptyStats(), 上路: 2, 打野: 1 });
  assert.deepEqual(normalized.B, { ...emptyStats(), 中路: 3, 輔助: 0.5 });
});

test('sortPlayerNames 依總次數由高到低排序，次數相同依中文名稱排序', () => {
  const stats = normalizeStats({
    C: { 上路: 1 },
    A: { 上路: 2 },
    B: { 打野: 2 }
  });

  assert.deepEqual(sortPlayerNames(stats), ['A', 'B', 'C']);
});
