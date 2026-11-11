import test from 'node:test';
import assert from 'node:assert/strict';
import { SyncRoomClient, validateSyncRoomUrl, validateRoomSnapshot } from '../src/desktop/syncRoomClient.js';
import { createRoom } from '../src/domain/syncRoom.js';

test('服務網址只允許本機明文或 TLS，拒絕帳密與 query/hash', () => {
  for (const url of ['ws://127.0.0.1:8787/sync', 'ws://localhost:8787/sync', 'ws://[::1]/sync', 'wss://room.example/sync']) assert.equal(validateSyncRoomUrl(url), url);
  for (const url of ['http://localhost', 'ws://192.168.1.1/sync', 'ws://example.com', 'wss://a:b@room.example', 'wss://room.example?secret=x', 'wss://room.example#x', 'bad']) {
    assert.throws(() => validateSyncRoomUrl(url));
  }
});

test('快照為複製，舊 revision 不覆蓋新狀態；憑證不進入快照', () => {
  const states = [];
  const client = new SyncRoomClient({ onState: state => states.push(state) });
  client.token = 'synthetic-private-token';
  const room = createRoom({ roomId: 'ABCDEF', hostId: 'a', hostName: '測試#TW1' });
  client.acceptRoom({ ...room, revision: 2 });
  client.acceptRoom({ ...room, revision: 1 });
  const state = client.getState();
  state.room.members.length = 0;
  assert.equal(client.getState().room.members.length, 1);
  assert.equal(states.length, 1);
  assert.equal(JSON.stringify(state).includes('synthetic-private-token'), false);
  client.destroy();
});

test('公開房間快照拒絕損壞欄位，白名單移除額外資料', () => {
  const room = createRoom({ roomId: 'ABCDEF', hostId: 'a', hostName: '測試#TW1' });
  for (const patch of [{ members: [null] }, { members: [] }, { members: Array(6).fill(room.members[0]) },
    { hostId: 'unknown' }, { result: {} }, { closed: 'false' }, { resultVersion: -1 }]) {
    assert.throws(() => validateRoomSnapshot({ ...room, ...patch }), /格式錯誤/);
  }
  const clean = validateRoomSnapshot({ ...room, token: 'secret', members: [{ ...room.members[0], secret: 'secret' }] });
  assert.equal(JSON.stringify(clean).includes('secret'), false);
});

test('未連線不傳送操作，無效命令及連線動作被拒絕', async () => {
  const client = new SyncRoomClient();
  await assert.rejects(client.command({ type: 'draw' }), /尚未連線/);
  await assert.rejects(client.command({ type: 'connection' }), /不支援/);
  await assert.rejects(client.connect({ url: 'ws://localhost/sync', action: 'resume', name: '測試#TW1' }), /建立或加入/);
  client.destroy();
});

test('操作逾時不自動重送，disconnect 清除未完成操作', async () => {
  const sent = [];
  const client = new SyncRoomClient({ requestTimeoutMs: 20 });
  client.socket = { readyState: 1, send: data => sent.push(JSON.parse(data)), close() {} };
  client.emit({ connection: 'connected' });
  await assert.rejects(client.command({ type: 'draw' }), /不會自動重送/);
  assert.equal(sent.length, 1);
  const pending = client.command({ type: 'ready', ready: true });
  client.disconnect();
  await assert.rejects(pending, /已中斷/);
  assert.equal(client.pending.size, 0);
  assert.equal(client.getState().room, null);
});

test('損壞的握手 ack 會拒絕 Promise，且不留下 pending 或跨 IPC 的損壞狀態', async () => {
  class FakeSocket extends EventTarget {
    constructor() { super(); this.readyState = 0; queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
    send(data) {
      const request = JSON.parse(data);
      queueMicrotask(() => this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify({ type: 'ack', requestId: request.requestId, ok: true, room: { members: [null] } }) })));
    }
    close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
  }
  const client = new SyncRoomClient({ WebSocketImpl: FakeSocket, requestTimeoutMs: 50 });
  await assert.rejects(client.connect({ url: 'ws://localhost/sync', action: 'create', name: '測試#TW1' }), /格式錯誤/);
  assert.equal(client.pending.size, 0);
  assert.equal(client.getState().room, null);
  assert.equal(client.getState().connection, 'disconnected');
  client.destroy();
});

test('舊 resume 失敗不能污染後來建立的房間或安排額外重連', async () => {
  const sockets = [];
  class ControlledSocket extends EventTarget {
    constructor() { super(); this.readyState = 0; sockets.push(this); queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
    send(data) {
      const request = JSON.parse(data);
      this.request = request;
      if (request.type === 'resume') return;
      const room = createRoom({ roomId: `ROOM${sockets.length}`, hostId: 'host', hostName: request.name });
      queueMicrotask(() => this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify({
        type: 'ack', requestId: request.requestId, ok: true, token: 'a'.repeat(40), memberId: 'host', room
      }) })));
    }
    close() { if (this.readyState === 3) return; this.readyState = 3; this.dispatchEvent(new Event('close')); }
  }
  const client = new SyncRoomClient({ WebSocketImpl: ControlledSocket, requestTimeoutMs: 100, reconnectDelayMs: 1 });
  try {
    await client.connect({ url: 'ws://localhost/sync', action: 'create', name: '原房間#TW1' });
    sockets[0].close();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(sockets[1].request.type, 'resume');
    await client.connect({ url: 'ws://localhost/sync', action: 'create', name: '新房間#TW1' });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(client.getState().connection, 'connected');
    assert.equal(client.getState().room.members[0].name, '新房間#TW1');
    assert.equal(client.getState().error, '');
    assert.equal(sockets.length, 3);
  } finally { client.destroy(); }
});
