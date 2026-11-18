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

test('加入者只在本機準備成功後授權新結果，取消或重連撤銷授權', async () => {
  const fixture = setup({ command: ({ ready }) => {
    fixture.state.room.members[0].ready = ready;
    fixture.publish(fixture.state);
    return fixture.state.room;
  } });
  await connectFixture(fixture);
  const { room } = fixture.state;
  room.members[0].ready = true;
  const prior = setResult(fixture, 1);
  const allowed = result => fixture.controls.getAuthorizedResult(result.id, roomOptions.name);
  assert.equal(allowed(prior), null);

  await confirm(fixture, { type: 'ready', ready: true });
  assert.equal((await fixture.invoke('get-state')).state.localReady, true);
  assert.equal(allowed(prior), null);
  const first = setResult(fixture, 2);
  assert.deepEqual(allowed(first), first);
  const second = setResult(fixture, 3);
  assert.deepEqual(allowed(second), second);
  const cancel = fixture.invoke('command', { type: 'ready', ready: false });
  assert.equal(allowed(second), null);
  await cancel;

  await confirm(fixture, { type: 'ready', ready: true });
  fixture.state.connection = 'reconnecting';
  fixture.publish(fixture.state);
  fixture.state.connection = 'connected';
  assert.equal(allowed(setResult(fixture, 4)), null);
});

test('待確認的準備在出現名單變動後失效，晚到的回覆不恢復授權', async () => {
  let finish;
  const fixture = setup({ command: () => new Promise(resolve => { finish = resolve; }) });
  await connectFixture(fixture);
  const { room } = fixture.state;
  const { state } = await fixture.invoke('get-state');
  const pending = fixture.invoke('command', { type: 'ready', ready: true, consentContext: state.consentContext });
  room.members.push({ id: 'other', name: '隊友#TW2', approved: true, connected: false, manual: true });
  fixture.publish(fixture.state);
  room.members.pop();
  room.members[0].ready = true;
  const result = setResult(fixture, 1);
  finish(room);
  await pending;
  assert.equal(fixture.controls.getAuthorizedResult(result.id, roomOptions.name), null);
});

test('開始準備前名單已變更時，舊畫面的操作不送到服務端', async () => {
  const fixture = setup();
  await connectFixture(fixture);
  const { state } = await fixture.invoke('get-state');
  fixture.state.room.members.push({ id: 'other', name: '隊友#TW2', approved: true, connected: false, manual: true });
  fixture.publish(fixture.state);
  const reply = await fixture.invoke('command', { type: 'ready', ready: true, consentContext: state.consentContext });
  assert.deepEqual(reply, { ok: false, message: '房間狀態已變更，請重新確認' });
  assert.equal(fixture.calls.filter(([type]) => type === 'command').length, 0);
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
