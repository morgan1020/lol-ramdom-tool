import test from 'node:test';
import assert from 'node:assert/strict';
import { displayPlayerName, createPlayerLabels } from '../src/domain/playerNames.js';
import { formatCopyText } from '../src/domain/copyFormat.js';
import { drawAssignments } from '../src/domain/draw.js';
import { applyDrawToStats } from '../src/domain/stats.js';

test('hide only the trailing Riot tag while keeping ordinary player names intact', () => {
  assert.equal(displayPlayerName('八方肉包#1020'), '八方肉包');
  assert.equal(displayPlayerName('隊友 A'), '隊友 A');
  assert.equal(displayPlayerName('含#字元#TW'), '含#字元');
  assert.equal(displayPlayerName('#沒有名稱'), '#沒有名稱');
});

test('same displayed names remain separate accounts in drawing, stats, and copied results', () => {
  const names = ['同名玩家#TW1', '同名玩家#TW2'];
  const labels = createPlayerLabels(names);
  assert.deepEqual(labels, { '同名玩家#TW1': '同名玩家 · 1', '同名玩家#TW2': '同名玩家 · 2' });
  const results = drawAssignments(names);
  assert.deepEqual(results.map((result) => result.name), names);
  assert.deepEqual(Object.keys(applyDrawToStats({}, results)), names);
  const before = structuredClone(results);
  const copied = formatCopyText(results);
  assert.doesNotMatch(copied, /#TW/);
  assert.match(copied, /同名玩家 · 1/);
  assert.match(copied, /同名玩家 · 2/);
  assert.deepEqual(results, before);
});
