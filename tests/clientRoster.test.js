import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientRoster, describeClientPosition } from '../src/domain/clientRoster.js';
import { drawAssignments } from '../src/domain/draw.js';

test('client roster defaults to random, only explicit opt-in constrains first preference', () => {
  const lobby = { players: [{ name: '測試#TW', firstPosition: 'TOP', secondPosition: 'JUNGLE' }, { name: '隊友#TW', firstPosition: 'FILL' }] };
  assert.deepEqual(createClientRoster(lobby), { names: ['測試#TW', '隊友#TW'], preferences: {} });
  assert.deepEqual(createClientRoster(lobby, true).preferences, { '測試#TW': '上路' });
  assert.equal(describeClientPosition('FILL'), '補位');
  assert.equal(describeClientPosition('UNSELECTED'), '未選擇');
});

test('duplicate first preferences block drawing rather than silently overriding a player', () => {
  const { names, preferences } = createClientRoster({ players: [{ name: 'A#TW', firstPosition: 'TOP' }, { name: 'B#TW', firstPosition: 'TOP' }] }, true);
  assert.throws(() => drawAssignments(names, preferences), /指定位置重複/);
});

test('client roster rejects empty, duplicate and oversized teams', () => {
  assert.throws(() => createClientRoster({ players: [] }), /請先加入玩家/);
  assert.throws(() => createClientRoster({ players: [{ name: 'A' }, { name: 'A' }] }), /重複玩家/);
  assert.throws(() => createClientRoster({ players: Array.from({ length: 6 }, (_, i) => ({ name: String(i) })) }), /上限/);
});
