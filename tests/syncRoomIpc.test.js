import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSyncRoomIpc } from '../src/desktop/syncRoomIpc.js';

function setup() {
  const handlers = new Map();
  const calls = [];
  const sent = [];
  const state = { connection: 'disconnected', memberId: null, room: null, error: '' };
  let publish;
  registerSyncRoomIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    isSender: (event) => event === 'trusted',
    getWindow: () => ({ isDestroyed: () => false, webContents: { send: (...args) => sent.push(args) } }),
    createClient: ({ onState }) => {
      publish = onState;
      return {
        getState: () => state,
        connect: async (value) => calls.push(['connect', value]),
        command: async (value) => calls.push(['command', value]),
        disconnect: async () => calls.push(['disconnect'])
      };
    }
  });
  return { calls, sent, state, publish, invoke: (name, payload, sender = 'trusted') => handlers.get(`sync-room:${name}`)(sender, payload) };
}

test('room IPC rejects foreign frames for reads and mutations', async () => {
  const fixture = setup();
  for (const name of ['get-state', 'connect', 'command', 'disconnect']) {
    assert.equal((await fixture.invoke(name, {}, 'foreign')).ok, false);
  }
  assert.deepEqual(fixture.calls, []);
});

test('room IPC never forwards actor identities or transport-only commands', async () => {
  const fixture = setup();
  for (const type of ['connection', 'join', 'resume', '__proto__']) {
    assert.equal((await fixture.invoke('command', { type, memberId: 'other', connected: false })).ok, false);
  }
  assert.equal((await fixture.invoke('command', { type: 'draw', actorId: 'host', results: [] })).ok, true);
  assert.deepEqual(fixture.calls, [['command', { type: 'draw' }]]);
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
