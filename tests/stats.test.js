const test = require('node:test');
const assert = require('node:assert/strict');
const { applyDrawToStats } = require('../src/domain/stats');

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
