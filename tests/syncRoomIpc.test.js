import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSyncRoomIpc } from '../src/desktop/syncRoomIpc.js';

function setup({ command } = {}) {
  const handlers = new Map();
  const calls = [];
  const sent = [];
  const state = { connection: 'disconnected', memberId: null, room: null, error: '' };
  let publish;
  const controls = registerSyncRoomIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    isSender: (event) => event === 'trusted',
    getWindow: () => ({ isDestroyed: () => false, webContents: { send: (...args) => sent.push(args) } }),
    createClient: ({ onState }) => {
      publish = onState;
      return {
        getState: () => state,
        connect: async (value) => calls.push(['connect', value]),
        command: async (value) => {
          calls.push(['command', value]);
          return command?.(value);
        },
        disconnect: async () => calls.push(['disconnect'])
      };
    }
  });
  return { calls, sent, state, publish, controls, invoke: (name, payload, sender = 'trusted') => handlers.get(`sync-room:${name}`)(sender, payload) };
}

test('room IPC rejects foreign frames for reads and mutations', async () => {
  const fixture = setup();
  for (const name of ['get-state', 'connect', 'command', 'disconnect']) {
    assert.equal((await fixture.invoke(name, {}, 'foreign')).ok, false);
  }
  assert.deepEqual(fixture.calls, []);
});

const roomOptions = { action: 'join', url: 'ws://127.0.0.1:8787', roomId: 'ABCDEF', name: '玩家#TW1' };
const roomMember = { id: 'self', name: roomOptions.name, approved: true, connected: true, ready: false };

async function connectFixture(fixture, action = 'join') {
  Object.assign(fixture.state, {
    connection: 'connected', serviceUrl: roomOptions.url, memberId: 'self',
    room: {
      roomId: roomOptions.roomId, hostId: action === 'create' ? 'self' : 'host', lobbySynced: true,
      members: [{ ...roomMember }], resultVersion: 0, result: null, drawMode: 'random', preferences: {}
    }
  });
  return fixture.invoke('connect', { ...roomOptions, action });
}

function setResult(fixture, version) {
  const room = fixture.state.room;
  room.resultVersion = version;
  room.result = { id: `${room.roomId}:${version}`, version, results: [{ name: roomOptions.name, main: '上路' }] };
  fixture.publish(fixture.state);
  return room.result;
}

async function confirm(fixture, command) {
  const { state } = await fixture.invoke('get-state');
  return fixture.invoke('command', { ...command, consentContext: state.consentContext });
}

test('本機開關只授權後續結果，同房重連保留選擇，新的連線獨立設定', async () => {
  const fixture = setup();
  const { state } = await connectFixture(fixture);
  assert.equal(state.autoApply, true);
  const allowed = version => fixture.controls.getAuthorizedResult(setResult(fixture, version).id, roomOptions.name);
  const toggle = enabled => fixture.invoke('command', { type: 'auto-apply', enabled, localSession: state.localSession });
  assert.ok(allowed(1));
  await toggle(false);
  fixture.state.connection = 'reconnecting';
  fixture.publish(fixture.state);
  fixture.state.connection = 'connected';
  fixture.publish(fixture.state);
  assert.equal((await fixture.invoke('get-state')).state.autoApply, false);
  assert.equal(allowed(2), null);
  await toggle(true);
  assert.equal(fixture.controls.getAuthorizedResult(fixture.state.room.result.id, roomOptions.name), null);
  assert.ok(allowed(3));
  fixture.state.connection = 'reconnecting';
  fixture.publish(fixture.state);
  fixture.state.connection = 'connected';
  assert.equal(allowed(4), null);
  assert.ok(allowed(5));
  await toggle(false);
  await fixture.invoke('disconnect');
  const next = await connectFixture(fixture);
  assert.equal(next.state.autoApply, true);
  assert.equal((await toggle(false)).ok, false);
  assert.ok(allowed(1));
  assert.equal(fixture.calls.some(([type]) => type === 'command'), false);
});

test('未核准、隊伍變更及恢復連線的既有結果都不會套用', async () => {
  const fixture = setup();
  await connectFixture(fixture);
  const { room } = fixture.state;
  room.members[0].approved = false;
  const result = setResult(fixture, 1);
  const allowed = () => fixture.controls.getAuthorizedResult(result.id, roomOptions.name);
  assert.equal(allowed(), null);
  room.members[0].approved = true;
  assert.equal(allowed(), null);
  room.members.push({ id: 'other', name: '隊友#TW2', approved: true, connected: false, manual: true });
  assert.equal(allowed(), null);
});

test('主持人只能套用自己在本機發起的那次抽籤', async () => {
  const fixture = setup({ command: () => {
    setResult(fixture, 2);
    return fixture.state.room;
  } });
  await connectFixture(fixture, 'create');
  const prior = setResult(fixture, 1);
  assert.equal(fixture.controls.getAuthorizedResult(prior.id, roomOptions.name), null);
  await confirm(fixture, { type: 'draw', revision: 10 });
  const result = fixture.state.room.result;
  assert.deepEqual(fixture.controls.getAuthorizedResult(result.id, roomOptions.name), result);
  const later = setResult(fixture, 3);
  assert.equal(fixture.controls.getAuthorizedResult(later.id, roomOptions.name), null);
});

test('服務回報的房主身分無法取代本機建立房間的操作', async () => {
  const fixture = setup({ command: () => {
    setResult(fixture, 1);
    return fixture.state.room;
  } });
  await connectFixture(fixture, 'join');
  fixture.state.room.hostId = fixture.state.memberId;
  await confirm(fixture, { type: 'draw', revision: 1 });
  const { state } = await fixture.invoke('get-state');
  assert.equal(state.localIsHost, undefined);
  assert.equal(fixture.controls.getAuthorizedResult(state.room.result.id, roomOptions.name), null);
});

test('room IPC never forwards actor identities or transport-only commands', async () => {
  const fixture = setup();
  for (const type of ['connection', 'join', 'resume', '__proto__']) {
    assert.equal((await fixture.invoke('command', { type, memberId: 'other', connected: false })).ok, false);
  }
  assert.equal((await fixture.invoke('command', { type: 'draw', revision: 4, actorId: 'host', results: [] })).ok, true);
  assert.deepEqual(fixture.calls, [['command', { type: 'draw', revision: 4 }]]);
});

test('room IPC exposes public state and narrowly selects connection fields', async () => {
  const fixture = setup();
  const options = { action: 'join', url: 'ws://127.0.0.1:8787', roomId: 'ABCDEF', name: '玩家#TW1' };
  assert.equal((await fixture.invoke('connect', { ...options, token: 'injected', memberId: 'host' })).ok, true);
  assert.deepEqual(fixture.calls, [['connect', options]]);
  assert.deepEqual(await fixture.invoke('get-state'), { ok: true, state: fixture.state });
  fixture.publish(fixture.state);
  assert.deepEqual(fixture.sent, [['sync-room:state', fixture.state]]);
  assert.equal((await fixture.invoke('disconnect')).ok, true);
});
