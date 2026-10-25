import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoster, rosterKey } from '../src/domain/rosterView.js';

const lobby = { players: [{ name: 'A#TW', firstPosition: 'TOP' }, { name: 'B#TW', firstPosition: 'FILL' }] };
const input = { source: 'client', lobby, manualPlayers: ['手動玩家'], preferredRoles: { 'A#TW': '中路', 舊隊友: '輔助' } };

test('client drawing uses the current full account identifiers and explicitly selected rule', () => {
  assert.deepEqual(buildRoster({ ...input, drawMode: 'random' }), { names: ['A#TW', 'B#TW'], preferences: {} });
  assert.deepEqual(buildRoster({ ...input, drawMode: 'client' }).preferences, { 'A#TW': '上路' });
  assert.deepEqual(buildRoster({ ...input, drawMode: 'custom' }).preferences, { 'A#TW': '中路' });
});

test('manual and client sources keep separate rosters, including matching display names', () => {
  assert.deepEqual(buildRoster({ ...input, source: 'manual', drawMode: 'random' }), { names: ['手動玩家'], preferences: {} });
  assert.equal(rosterKey(['A#1', 'B#2']), rosterKey(['B#2', 'A#1']));
  assert.notEqual(rosterKey(['A#1']), rosterKey(['A#2']));
});
