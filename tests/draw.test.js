const test = require('node:test');
const assert = require('node:assert/strict');
const { drawAssignments } = require('../src/domain/draw');

test('1~5 人可成功抽籤且主位不重複', () => {
  for (let n = 1; n <= 5; n += 1) {
    const players = Array.from({ length: n }, (_, i) => `玩家${i + 1}`);
    const result = drawAssignments(players);

    assert.equal(result.length, n);
    assert.equal(new Set(result.map((r) => r.main)).size, n);
  }
});

test('少於 5 人時副位不等於主位且位置覆蓋數達到人數加一', () => {
  for (let n = 1; n <= 4; n += 1) {
    const players = Array.from({ length: n }, (_, i) => `玩家${i + 1}`);
    const result = drawAssignments(players);

    for (const row of result) {
      assert.notEqual(row.secondary, '');
      assert.notEqual(row.main, row.secondary);
    }

    const coveredPositions = new Set(result.flatMap((row) => [row.main, row.secondary]));
    assert.ok(coveredPositions.size >= result.length + 1);
  }
});

test('5 人時不產生副位，沿用既有行為', () => {
  const result = drawAssignments(['A', 'B', 'C', 'D', 'E']);

  assert.equal(result.length, 5);
  for (const row of result) {
    assert.equal(row.secondary, '');
  }
});

test('0 人會拋錯', () => {
  assert.throws(() => drawAssignments([]), /請先加入玩家/);
});

test('超過 5 人會拋錯', () => {
  assert.throws(() => drawAssignments(['A', 'B', 'C', 'D', 'E', 'F']), /上限 5 人/);
});
