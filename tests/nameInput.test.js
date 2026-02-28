const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCandidateNames } = require('../src/domain/nameInput');

test('支援逗號分隔', () => {
  const names = parseCandidateNames('A,B,C');
  assert.deepEqual(names, ['A', 'B', 'C']);
});

test('支援換行分隔', () => {
  const names = parseCandidateNames('A\nB\nC');
  assert.deepEqual(names, ['A', 'B', 'C']);
});

test('支援逗號與換行混合', () => {
  const names = parseCandidateNames('A, B\nC,\nD');
  assert.deepEqual(names, ['A', 'B', 'C', 'D']);
});

test('會過濾空白與空值', () => {
  const names = parseCandidateNames(' A , ,\n  \nB ');
  assert.deepEqual(names, ['A', 'B']);
});
