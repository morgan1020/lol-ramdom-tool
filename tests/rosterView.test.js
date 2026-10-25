import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoster, rosterKey, prepareRoster, matchesPreparedRoster } from '../src/domain/rosterView.js';

const lobby = { players: [{ name: 'A#TW', firstPosition: 'TOP' }, { name: 'B#TW', firstPosition: 'FILL' }] };
const input = { source: 'client', lobby, manualPlayers: ['手動玩家'], preferredRoles: { 'A#TW': '中路', 舊隊友: '輔助' } };

test('preparation validates names and duplicate preferences without drawing or changing the input', () => {
  assert.throws(() => prepareRoster({ ...input, source: 'manual', manualPlayers: [], drawMode: 'random' }), /加入玩家/);
  assert.throws(() => prepareRoster({ ...input, drawMode: 'custom', preferredRoles: { 'A#TW': '上路', 'B#TW': '上路' } }), /重複/);
  const manual = ['玩家#1', '玩家#2'];
  const prepared = prepareRoster({ ...input, source: 'manual', manualPlayers: manual, drawMode: 'random' });
  assert.deepEqual(prepared.names, manual);
  assert.notEqual(prepared.names, manual);
  assert.deepEqual(prepared.preferences, {});
  assert.equal(prepared.localPlayerId, null);
});

test('prepared rosters reject member, account, source and preference changes but accept reordering', () => {
  const options = { ...input, lobby: { ...lobby, localPlayerId: 'local-1' }, drawMode: 'client' };
  const prepared = prepareRoster(options);
  assert.equal(matchesPreparedRoster(prepared, prepareRoster({ ...options, lobby: { ...options.lobby, players: [...lobby.players].reverse() } })), true);
  assert.equal(matchesPreparedRoster(prepared, { ...prepared, names: ['A#OTHER', 'B#TW'] }), false);
  assert.equal(matchesPreparedRoster(prepared, { ...prepared, localPlayerId: 'local-2' }), false);
  assert.equal(matchesPreparedRoster(prepared, { ...prepared, source: 'manual' }), false);
  assert.equal(matchesPreparedRoster(prepared, { ...prepared, preferences: { 'A#TW': '中路' } }), false);
});

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
