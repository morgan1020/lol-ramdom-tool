import test from 'node:test';
import assert from 'node:assert/strict';
import { drawAssignments } from '../src/domain/draw.js';

function createRouteKey(main, secondary) {
  return [main, secondary].sort((a, b) => a.localeCompare(b, 'zh-Hant')).join('|');
}

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

test('少於 5 人時任意兩位玩家的主副位無序組合不得重複', () => {
  for (let n = 2; n <= 4; n += 1) {
    const players = Array.from({ length: n }, (_, i) => `玩家${i + 1}`);
    const result = drawAssignments(players);
    const routeKeys = result.map((row) => createRouteKey(row.main, row.secondary));

    assert.equal(new Set(routeKeys).size, routeKeys.length);
  }
});

test('少於 5 人時不會出現互為對調的重複路線', () => {
  const players = ['A', 'B', 'C', 'D'];

  for (let i = 0; i < 200; i += 1) {
    const result = drawAssignments(players);
    const routeKeys = new Set();

    for (const row of result) {
      const routeKey = createRouteKey(row.main, row.secondary);
      assert.ok(!routeKeys.has(routeKey), `發現重複路線：${routeKey}，結果=${JSON.stringify(result)}`);
      routeKeys.add(routeKey);
    }
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

test('可指定玩家偏好主位且其他玩家主位仍不重複', () => {
  const result = drawAssignments(['A', 'B', 'C'], { B: '中路' });
  const byName = Object.fromEntries(result.map((row) => [row.name, row]));

  assert.equal(byName.B.main, '中路');
  assert.equal(new Set(result.map((row) => row.main)).size, result.length);
});

test('重複指定相同偏好主位會拋錯', () => {
  assert.throws(
    () => drawAssignments(['A', 'B'], { A: '上路', B: '上路' }),
    /指定位置重複：上路/
  );
});
