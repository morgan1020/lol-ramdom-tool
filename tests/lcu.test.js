import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConnection, readLobby } from '../src/desktop/lcu.js';

const member = (id, overrides = {}) => ({ summonerId: id, puuid: `player-${id}`, firstPositionPreference: 'TOP', secondPositionPreference: 'UNSELECTED', ...overrides });

function mockClient(members, { phase = 'Lobby', latestMembers = members, latestPhase = phase, summoner = { gameName: '測試', tagLine: 'TW' } } = {}) {
  const calls = [];
  let lobbyReads = 0;
  let phaseReads = 0;
  return {
    calls,
    discover: async () => ({ port: 12345, password: 'synthetic-test-only' }),
    request: async (_connection, endpoint) => {
      calls.push(endpoint);
      if (endpoint === '/lol-gameflow/v1/gameflow-phase') return phaseReads++ ? latestPhase : phase;
      if (endpoint === '/lol-lobby/v2/lobby') return { members: lobbyReads++ ? latestMembers : members };
      return { ...summoner, gameName: `${summoner.gameName || ''}${summoner.gameName ? endpoint.split('/').at(-1) : ''}` };
    }
  };
}

test('discovery parses quoted client parameters and rejects invalid connection data', () => {
  assert.deepEqual(parseConnection('"client.exe" "--app-port=12345" "--remoting-auth-token=synthetic"'), { port: 12345, password: 'synthetic' });
  for (const command of ['', '--app-port=0 --remoting-auth-token=x', '--app-port=99999 --remoting-auth-token=x', '--app-port=12345']) {
    assert.throws(() => parseConnection(command), /連線資訊/);
  }
});

test('read lobby resolves every Riot ID, filters bots and spectators, keeps credentials out of result', async () => {
  const client = mockClient([member(1, { isLeader: true }), member(2), member(3, { isBot: true }), member(4, { isSpectator: true })]);
  const result = await readLobby(client);
  assert.deepEqual(result.players.map((player) => player.name), ['測試1#TW', '測試2#TW']);
  assert.equal(result.players[0].isLeader, true);
  assert.equal(result.players[0].firstPosition, 'TOP');
  assert.equal(result.players[0].secondPosition, 'UNSELECTED');
  assert.equal(JSON.stringify(result).includes('synthetic-test-only'), false);
  assert.equal(client.calls.some((endpoint) => endpoint.endsWith('/3') || endpoint.endsWith('/4')), false);
});

test('non-lobby states never attempt to read players', async () => {
  for (const phase of ['None', 'ChampSelect', 'InProgress', 'Matchmaking']) {
    const client = mockClient([member(1)], { phase });
    await assert.rejects(readLobby(client), /組隊大廳/);
    assert.equal(client.calls.length, 1);
  }
});

test('empty and more-than-five lobbies reject without truncating', async () => {
  await assert.rejects(readLobby(mockClient([])), /沒有可匯入/);
  const oversized = Array.from({ length: 6 }, (_, i) => member(i + 1));
  await assert.rejects(readLobby(mockClient(oversized)), /超過 5/);
});

test('changed roster, preferences, or game phase invalidate the snapshot', async () => {
  for (const latestMembers of [[member(2)], [member(1, { firstPositionPreference: 'JUNGLE' })]]) {
    await assert.rejects(readLobby(mockClient([member(1)], { latestMembers })), /讀取期間變動/);
  }
  await assert.rejects(readLobby(mockClient([member(1)], { latestPhase: 'Matchmaking' })), /讀取期間變動/);
});

test('missing Riot ID, invalid identifiers, and duplicate players fail closed', async () => {
  await assert.rejects(readLobby(mockClient([member(1)], { summoner: { gameName: '', tagLine: '' } })), /完整 Riot ID/);
  await assert.rejects(readLobby(mockClient([member('../secret')])), /無法辨識/);
  await assert.rejects(readLobby(mockClient([member(1), member(1)])), /重複玩家/);
});

test('connection failures propagate without a fallback to stale team data', async () => {
  const client = mockClient([member(1)]);
  client.request = async () => { throw new Error('simulated disconnect'); };
  await assert.rejects(readLobby(client), /simulated disconnect/);
});
