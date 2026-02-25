const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeCandidateNames } = require('../src/domain/poolMerge');

test('合併名單時會加入新玩家並保留既有順序', () => {
  const result = mergeCandidateNames(['A'], ['B', 'C']);
  assert.deepEqual(result.nextPool, ['A', 'B', 'C']);
  assert.deepEqual(result.added, ['B', 'C']);
});

test('重複名稱會被略過並記錄 duplicate', () => {
  const result = mergeCandidateNames(['A', 'B'], ['B', 'C', 'C']);
  assert.deepEqual(result.nextPool, ['A', 'B', 'C']);
  assert.deepEqual(result.duplicates, ['B']);
});

test('超過上限會略過並記錄 skippedFull', () => {
  const result = mergeCandidateNames(['A', 'B', 'C', 'D'], ['E', 'F']);
  assert.deepEqual(result.nextPool, ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(result.added, ['E']);
  assert.deepEqual(result.skippedFull, ['F']);
});
