import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCurrentPlayerRoles } from '../src/desktop/applyRoles.js';
import { preferenceEndpoint, requestClient } from '../src/desktop/lcu.js';

function fixture({ count = 2, first = 'TOP', second = 'JUNGLE', isCustom = false, mapId = 11, finalPhase = 'Lobby', changedTeam = false, wrongAccount = false, refuse = false, ignoreWrite = false } = {}) {
  const members = Array.from({ length: count }, (_, i) => ({
    summonerId: i + 1, puuid: `id-${i + 1}`, firstPositionPreference: i === 0 ? first : 'UNSELECTED', secondPositionPreference: i === 0 ? second : 'UNSELECTED'
  }));
  const calls = [];
  const writes = [];
  let phases = 0;
  let lobbyReads = 0;
  const discover = async () => ({ port: 12345, password: 'synthetic' });
  const request = async (_connection, endpoint, options) => {
    calls.push(endpoint);
    if (endpoint === preferenceEndpoint) {
      writes.push(options);
      if (refuse) throw new Error('simulated rejection');
      if (!ignoreWrite) {
        members[0].firstPositionPreference = options.body.firstPreference;
        members[0].secondPositionPreference = options.body.secondPreference;
      }
      return null;
    }
    if (endpoint === '/lol-gameflow/v1/gameflow-phase') return ++phases >= 3 ? finalPhase : 'Lobby';
    if (endpoint === '/lol-lobby/v2/lobby') {
      lobbyReads++;
      return structuredClone({
        members: changedTeam && lobbyReads >= 3 ? members.slice(1) : members,
        localMember: members[0], gameConfig: { queueId: 420, isCustom, mapId }
      });
    }
    if (endpoint === '/lol-summoner/v1/current-summoner') return { puuid: wrongAccount ? 'other' : 'id-1', gameName: 'Player1', tagLine: 'TW' };
    const id = endpoint.split('/').at(-1);
    return { puuid: `id-${id}`, gameName: `Player${id}`, tagLine: 'TW' };
  };
  const roles = ['中路', '打野', '上路', '下路', '輔助'];
  const results = members.map((member, i) => ({ name: `Player${i + 1}#TW`, main: roles[i], secondary: count === 5 ? '' : (i === 0 ? '輔助' : '下路') }));
  return { discover, request, writes, results, calls };
}

test('only local member preferences are written once, and success requires read-back verification', async () => {
  const mock = fixture();
  const result = await applyCurrentPlayerRoles(mock.results, mock);
  assert.deepEqual(mock.writes, [{ method: 'PUT', body: { firstPreference: 'MIDDLE', secondPreference: 'UTILITY' } }]);
  assert.equal(result.name, 'Player1#TW');
  assert.equal(result.firstPosition, 'MIDDLE');
  assert.equal(result.secondPosition, 'UTILITY');
  assert.equal(result.unchanged, false);
  assert.equal(mock.calls.at(-1), '/lol-lobby/v2/lobby');
});

test('account, team, phase, custom lobby and unsupported map changes block all writes', async () => {
  for (const options of [{ wrongAccount: true }, { changedTeam: true }, { finalPhase: 'Matchmaking' }, { isCustom: true }, { mapId: 12 }]) {
    const mock = fixture(options);
    await assert.rejects(applyCurrentPlayerRoles(mock.results, mock));
    assert.equal(mock.writes.length, 0, JSON.stringify(options));
  }
});

test('stale or manual names and invalid draw payloads cannot change the client', async () => {
  for (const payload of [[], null, [{ name: 'Other#TW', main: '上路', secondary: '中路' }], [{ name: 'Player1#TW', main: 'INVALID' }], [{ name: 'Player1#TW', main: '上路' }, { name: 'Player2#TW', main: '上路' }]]) {
    const mock = fixture();
    await assert.rejects(applyCurrentPlayerRoles(payload, mock));
    assert.equal(mock.writes.length, 0);
  }
});

test('five-player draws preserve the current secondary preference and block conflicting preferences', async () => {
  const mock = fixture({ count: 5, second: 'JUNGLE' });
  await applyCurrentPlayerRoles(mock.results, mock);
  assert.equal(mock.writes[0].body.secondPreference, 'JUNGLE');
  const conflict = fixture({ count: 5, second: 'MIDDLE' });
  await assert.rejects(applyCurrentPlayerRoles(conflict.results, conflict), /既有第二偏好無法沿用/);
  assert.equal(conflict.writes.length, 0);
});

test('matching preferences perform verification without an unnecessary write', async () => {
  const mock = fixture({ first: 'MIDDLE', second: 'UTILITY' });
  const result = await applyCurrentPlayerRoles(mock.results, mock);
  assert.equal(result.unchanged, true);
  assert.equal(mock.writes.length, 0);
});

test('write rejection and read-back mismatch never retry or report success', async () => {
  for (const options of [{ refuse: true }, { ignoreWrite: true }]) {
    const mock = fixture(options);
    await assert.rejects(applyCurrentPlayerRoles(mock.results, mock));
    assert.equal(mock.writes.length, 1);
  }
});

test('native transport rejects arbitrary endpoints, methods and preference values before connecting', () => {
  const connection = { port: 12345, password: 'synthetic' };
  for (const [endpoint, options] of [
    ['/lol-lobby/v2/lobby', { method: 'DELETE' }],
    ['/lol-lobby/v2/lobby/members/another/position-preferences', { method: 'PUT', body: { firstPreference: 'TOP', secondPreference: 'MIDDLE' } }],
    [preferenceEndpoint, { method: 'PUT', body: { firstPreference: 'unknown', secondPreference: 'TOP' } }],
    [preferenceEndpoint, { method: 'PUT', body: { firstPreference: 'TOP', secondPreference: 'MIDDLE', extra: true } }]
  ]) assert.throws(() => requestClient(connection, endpoint, options), /不支援/);
});
