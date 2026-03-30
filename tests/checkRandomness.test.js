const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_RUNS,
  analyzeDistribution,
  formatReport,
  parseArgs,
  runCli
} = require('../scripts/check-randomness');

test('parseArgs 預設使用 10000 次抽樣', () => {
  const result = parseArgs(['A', 'B', 'C']);

  assert.equal(result.runs, DEFAULT_RUNS);
  assert.deepEqual(result.playerNames, ['A', 'B', 'C']);
});

test('parseArgs 支援 --runs 參數', () => {
  const result = parseArgs(['--runs', '500', 'A', 'B', 'C', 'D']);

  assert.equal(result.runs, 500);
  assert.deepEqual(result.playerNames, ['A', 'B', 'C', 'D']);
});

test('parseArgs 在缺少玩家時會拋錯並顯示用法', () => {
  assert.throws(() => parseArgs([]), /請提供至少 1 位玩家/);
});

test('parseArgs 在 --runs 非法時會拋錯', () => {
  assert.throws(() => parseArgs(['--runs', '0', 'A']), /大於 0 的整數/);
  assert.throws(() => parseArgs(['--runs', 'abc', 'A']), /大於 0 的整數/);
});

test('analyzeDistribution 會統計主位，且 5 人時副位總和為 0', () => {
  const runs = 200;
  const distribution = analyzeDistribution(['A', 'B', 'C', 'D', 'E'], runs);

  for (const name of ['A', 'B', 'C', 'D', 'E']) {
    const mainTotal = Object.values(distribution.mainCounts[name]).reduce((sum, value) => sum + value, 0);
    const secondaryTotal = Object.values(distribution.secondaryCounts[name]).reduce((sum, value) => sum + value, 0);
    assert.equal(mainTotal, runs);
    assert.equal(secondaryTotal, 0);
  }
});

test('analyzeDistribution 在少於 5 人時會統計副位', () => {
  const runs = 200;
  const distribution = analyzeDistribution(['A', 'B', 'C'], runs);

  for (const name of ['A', 'B', 'C']) {
    const mainTotal = Object.values(distribution.mainCounts[name]).reduce((sum, value) => sum + value, 0);
    const secondaryTotal = Object.values(distribution.secondaryCounts[name]).reduce((sum, value) => sum + value, 0);
    assert.equal(mainTotal, runs);
    assert.equal(secondaryTotal, runs);
  }
});

test('formatReport 會輸出主位與副位摘要', () => {
  const report = formatReport(
    ['A'],
    10,
    {
      mainCounts: {
        A: {
          上路: 2,
          打野: 2,
          中路: 2,
          下路: 2,
          輔助: 2
        }
      },
      secondaryCounts: {
        A: {
          上路: 0,
          打野: 4,
          中路: 3,
          下路: 2,
          輔助: 1
        }
      }
    }
  );

  assert.match(report, /抽樣次數：10/);
  assert.match(report, /A/);
  assert.match(report, /主位：/);
  assert.match(report, /上路：2 次 \(20\.00%\)｜偏差 \+0\.00/);
  assert.match(report, /副位：/);
  assert.match(report, /打野：4 次 \(40\.00%\)/);
});

test('runCli 成功時回傳 0 並輸出摘要', () => {
  const outputs = [];
  const errors = [];

  const code = runCli(['--runs', '20', 'A', 'B', 'C'], (message) => outputs.push(message), (message) => errors.push(message));

  assert.equal(code, 0);
  assert.equal(errors.length, 0);
  assert.equal(outputs.length, 1);
  assert.match(outputs[0], /抽樣次數：20/);
});

test('runCli 失敗時回傳 1 並輸出錯誤', () => {
  const outputs = [];
  const errors = [];

  const code = runCli([], (message) => outputs.push(message), (message) => errors.push(message));

  assert.equal(code, 1);
  assert.equal(outputs.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /請提供至少 1 位玩家/);
});
