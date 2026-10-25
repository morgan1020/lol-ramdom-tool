import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatsBackup, importStats, parseStatsBackup, validateStats, statsBackupFilename } from '../src/domain/statsBackup.js';

test('statistics backups round-trip full Riot IDs and half counts, with no application settings', () => {
  assert.equal(statsBackupFilename(new Date('2026-10-24T20:00:00Z')), 'lol-stats-2026-10-25.json');
  const stats = validateStats({ '同名#TW1': { 上路: 1, 輔助: 0.5 }, '同名#TW2': { 中路: 2 } });
  const text = createStatsBackup(stats);
  assert.deepEqual(parseStatsBackup(text), stats);
  assert.deepEqual(parseStatsBackup(JSON.stringify(stats)), stats);
  assert.doesNotMatch(text, /webhook|discord|autoApply|theme/i);
});

test('merge replaces matching players without adding counts; re-importing is idempotent', () => {
  const current = { 'A#TW': { 上路: 5 }, 'B#TW': { 中路: 3 } };
  const incoming = { 'A#TW': { 上路: 2 }, 'A#OTHER': { 輔助: 0.5 } };
  const merged = importStats(current, incoming);
  assert.equal(merged['A#TW'].上路, 2);
  assert.equal(merged['B#TW'].中路, 3);
  assert.ok(merged['A#OTHER']);
  assert.deepEqual(importStats(merged, incoming), merged);
  assert.deepEqual(Object.keys(importStats(current, incoming, 'replace')), ['A#TW', 'A#OTHER']);
});

test('malformed, oversized, unsupported, negative, and prototype-related backups reject', () => {
  for (const text of ['invalid json', '[]', 'null', JSON.stringify({ format: 'other', version: 1, stats: {} }), JSON.stringify({ A: { 上路: -1 } }), JSON.stringify({ A: { 上路: 0.1 } }), JSON.stringify({ A: { 上路: '1' } }), '{"__proto__":{"上路":1}}', JSON.stringify({ A: { webhookUrl: 'synthetic' } }), ' '.repeat(5 * 1024 * 1024 + 1)]) {
    assert.throws(() => parseStatsBackup(text));
  }
  assert.throws(() => importStats({}, {}, 'add'));
});
