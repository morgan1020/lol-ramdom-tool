import test from 'node:test';
import assert from 'node:assert/strict';
import { SyncRoomClient, validateSyncRoomUrl, validateRoomSnapshot } from '../src/desktop/syncRoomClient.js';
import { createRoom } from '../src/domain/syncRoom.js';

function routedSocketFixture({ wrongRoom = false, firstReply } = {}) {
  const sockets = [];
  class RoutedSocket extends EventTarget {
    constructor(url) {
      super(); this.url = url; this.readyState = 0; sockets.push(this);
      queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); });
    }
    send(data) {
      this.request = JSON.parse(data);
      if (this === sockets[0] && firstReply) {
        const reply = firstReply(this.request);
        if (reply) queueMicrotask(() => this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(reply) })));
        return;
      }
      const roomId = wrongRoom ? 'FFFFFFFFFF' : new URL(this.url).pathname.split('/').at(-1);
      const room = createRoom({ roomId, hostId: 'host', hostName: '測試#TW1' });
      queueMicrotask(() => this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify({
        type: 'ack', requestId: this.request.requestId, ok: true, token: 't'.repeat(40), memberId: 'host', room
      }) })));
    }
    close() { if (this.readyState === 3) return; this.readyState = 3; this.dispatchEvent(new Event('close')); }
  }
  return { sockets, RoutedSocket };
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForHeartbeat(check) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (check()) return;
    await pause(5);
  }
  assert.fail('等待心跳狀態逾時');
}
function heartbeatFixture(pongForSocket = () => true) {
  const sockets = [];
  class HeartbeatSocket extends EventTarget {
    constructor(url) {
      super(); this.url = url; this.readyState = 0; this.sent = []; this.index = sockets.length;
      sockets.push(this);
      queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); });
    }
    message(value) { this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(value) })); }
    send(data) {
      const request = JSON.parse(data);
      this.sent.push(request);
      if (request.type === 'ping') {
        if (pongForSocket(this.index)) queueMicrotask(() => this.message({ type: 'pong' }));
        return;
      }
      if (!['create', 'resume'].includes(request.type)) return;
      const room = createRoom({ roomId: 'ROOM01', hostId: 'host', hostName: '測試#TW1' });
      queueMicrotask(() => this.message({ type: 'ack', requestId: request.requestId, ok: true,
        token: 't'.repeat(40), memberId: 'host', room }));
    }
    // Simulate a half-open network: calling close never produces a close event.
    close() { this.readyState = 2; this.closeCalled = true; }
  }
  return { sockets, HeartbeatSocket };
}

test('初次握手靜默逾時只重試一次，沿用原路由與憑證', async t => {
  const { sockets, RoutedSocket } = routedSocketFixture({ firstReply: () => null });
  const client = new SyncRoomClient({ WebSocketImpl: RoutedSocket, requestTimeoutMs: 25 });
  t.after(() => client.destroy());
  await client.connect({ url: 'wss://sync.example/rooms', action: 'create', name: '測試#TW1' });
  assert.equal(sockets.length, 2);
  assert.equal(sockets[0].url, sockets[1].url);
  assert.equal(sockets[0].request.handshakeToken, sockets[1].request.handshakeToken);
  assert.equal(client.pending.size, 0);
});

test('業務拒絕只回報失敗，即使訊息看起來像逾時', async t => {
  const { sockets, RoutedSocket } = routedSocketFixture({
    firstReply: request => ({ type: 'ack', requestId: request.requestId, ok: false, message: '同步服務連線逾時' })
  });
  const client = new SyncRoomClient({ WebSocketImpl: RoutedSocket });
  t.after(() => client.destroy());
  await assert.rejects(client.connect({ url: 'wss://sync.example/rooms', action: 'create', name: '測試#TW1' }), /逾時/);
  assert.equal(sockets.length, 1);
  assert.equal(client.getState().connection, 'disconnected');
});

test('新 connect 取代舊握手後，舊 transport 失敗不能重試或改動新房間', async t => {
  const { sockets, RoutedSocket } = routedSocketFixture({ firstReply: () => null });
  const client = new SyncRoomClient({ WebSocketImpl: RoutedSocket });
  t.after(() => client.destroy());
  const previous = client.connect({ url: 'wss://sync.example/rooms', action: 'join', roomId: '1234567890', name: '測試#TW1' });
  const rejected = assert.rejects(previous, /取代|中斷/);
  await Promise.resolve();
  const current = await client.connect({ url: 'wss://sync.example/rooms', action: 'join', roomId: 'ABCDEF0123', name: '測試#TW1' });
  await rejected;
  sockets[0].dispatchEvent(new Event('close'));
  assert.equal(sockets.length, 2);
  assert.equal(current.room.roomId, 'ABCDEF0123');
  assert.deepEqual(client.getState(), current);
});

test('靜默斷網心跳逾時會隔離半開socket並resume，不等待close也不重送操作', async () => {
  const { sockets, HeartbeatSocket } = heartbeatFixture(index => index > 0);
  const client = new SyncRoomClient({ WebSocketImpl: HeartbeatSocket, heartbeatIntervalMs: 8,
    heartbeatTimeoutMs: 12, reconnectDelayMs: 1, requestTimeoutMs: 500 });
  try {
    await client.connect({ url: 'ws://localhost/sync', action: 'create', name: '測試#TW1' });
    const draw = client.command({ type: 'draw' });
    await assert.rejects(draw, /心跳逾時/);
    await waitForHeartbeat(() => sockets.length === 2 && client.getState().connection === 'connected');
    assert.equal(sockets[0].closeCalled, true);
    assert.equal(sockets[1].sent[0].type, 'resume');
    assert.equal(sockets[1].sent[0].token, 't'.repeat(40));
    assert.equal(sockets.flatMap(socket => socket.sent).filter(message => message.type === 'draw').length, 1);
    assert.equal(client.pending.size, 0);
    assert.equal(client.requestTimeoutMs, 500);
    sockets[0].dispatchEvent(new Event('close'));
    assert.equal(client.getState().connection, 'connected');
  } finally { client.destroy(); }
});

test('正常pong維持連線且不消耗requestId，disconnect停止所有心跳', async () => {
  const { sockets, HeartbeatSocket } = heartbeatFixture();
  const client = new SyncRoomClient({ WebSocketImpl: HeartbeatSocket, heartbeatIntervalMs: 5, heartbeatTimeoutMs: 20 });
  try {
    await client.connect({ url: 'ws://localhost/sync', action: 'create', name: '測試#TW1' });
    await waitForHeartbeat(() => sockets[0].sent.filter(message => message.type === 'ping').length >= 3);
    assert.equal(client.getState().connection, 'connected');
    assert.equal(sockets.length, 1);
    assert.equal(client.sequence, 1);
    assert.equal(client.heartbeatDeadline, null);
    for (const ping of sockets[0].sent.filter(message => message.type === 'ping')) assert.deepEqual(ping, { type: 'ping' });
    client.disconnect();
    const count = sockets[0].sent.length;
    assert.equal(client.heartbeatTimer, null);
    assert.equal(client.heartbeatDeadline, null);
    await pause(30);
    assert.equal(sockets[0].sent.length, count);
    assert.equal(sockets.length, 1);
  } finally { client.destroy(); }
});

test('舊socket的pong不能清除新連線deadline，只有新socket的pong有效', async () => {
  const { sockets, HeartbeatSocket } = heartbeatFixture(() => false);
  const client = new SyncRoomClient({ WebSocketImpl: HeartbeatSocket, heartbeatIntervalMs: 8,
    heartbeatTimeoutMs: 30, reconnectDelayMs: 1 });
  try {
    await client.connect({ url: 'ws://localhost/sync', action: 'create', name: '測試#TW1' });
    await waitForHeartbeat(() => sockets.length === 2 && sockets[1].sent.some(message => message.type === 'ping'));
    const deadline = client.heartbeatDeadline;
    assert.ok(deadline);
    sockets[0].message({ type: 'pong' });
    assert.equal(client.heartbeatDeadline, deadline);
    sockets[1].message({ type: 'pong' });
    assert.equal(client.heartbeatDeadline, null);
    client.disconnect();
    await pause(40);
    assert.equal(sockets.length, 2);
    assert.equal(client.getState().connection, 'disconnected');
  } finally { client.destroy(); }
});

test('服務ended即使沒有close事件仍清除心跳，離開後不重連', async () => {
  const { sockets, HeartbeatSocket } = heartbeatFixture(() => false);
  const client = new SyncRoomClient({ WebSocketImpl: HeartbeatSocket, heartbeatIntervalMs: 5, heartbeatTimeoutMs: 15 });
  try {
    await client.connect({ url: 'ws://localhost/sync', action: 'create', name: '測試#TW1' });
    await waitForHeartbeat(() => client.heartbeatDeadline);
    sockets[0].message({ type: 'ended', message: '房間已關閉' });
    assert.equal(client.heartbeatTimer, null);
    assert.equal(client.heartbeatDeadline, null);
    assert.equal(client.getState().connection, 'disconnected');
    await pause(30);
    assert.equal(sockets.length, 1);
  } finally { client.destroy(); }
});

test('雲端建房以安全亂數產生房碼並固定路由，公開狀態只包含服務 base', async () => {
  const { sockets, RoutedSocket } = routedSocketFixture();
  const client = new SyncRoomClient({ WebSocketImpl: RoutedSocket });
  try {
    await client.connect({ url: 'wss://room.example/rooms/', action: 'create', name: '測試#TW1' });
    const roomId = client.getState().room.roomId;
    assert.match(roomId, /^[0-9A-F]{10}$/);
    assert.equal(sockets[0].url, `wss://room.example/rooms/${roomId}`);
    assert.equal(sockets[0].request.roomId, roomId);
    assert.equal(client.getState().serviceUrl, 'wss://room.example/rooms');
    assert.equal(JSON.stringify(client.getState()).includes('t'.repeat(40)), false);
  } finally { client.destroy(); }
});

test('雲端加入與 resume 維持同一房碼路由，resume 不重新加入', async () => {
  const { sockets, RoutedSocket } = routedSocketFixture();
  const client = new SyncRoomClient({ WebSocketImpl: RoutedSocket, reconnectDelayMs: 1 });
  try {
    await client.connect({ url: 'ws://127.0.0.1:8788/rooms', action: 'join', roomId: 'a123456789', name: '測試#TW1' });
    assert.equal(sockets[0].url, 'ws://127.0.0.1:8788/rooms/A123456789');
    assert.equal(sockets[0].request.type, 'join');
    sockets[0].close();
    for (let attempt = 0; attempt < 50 && (sockets.length !== 2 || client.getState().connection !== 'connected'); attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(client.getState().connection, 'connected');
    assert.equal(sockets.length, 2);
    assert.equal(sockets[1].url, sockets[0].url);
    assert.equal(sockets[1].request.type, 'resume');
    assert.equal(sockets[1].request.roomId, undefined);
  } finally { client.destroy(); }
});

test('雲端拒絕非10位hex房碼與不同路由的回覆', async () => {
  const { sockets, RoutedSocket } = routedSocketFixture({ wrongRoom: true });
  const client = new SyncRoomClient({ WebSocketImpl: RoutedSocket });
  try {
    for (const roomId of ['123456', 'ABCDEFGHIJ', '12345678901', '../AAAAAAA']) {
      await assert.rejects(client.connect({ url: 'wss://room.example/rooms', action: 'join', roomId, name: '測試#TW1' }), /房間代碼/);
    }
    assert.equal(sockets.length, 0);
    await assert.rejects(client.connect({ url: 'wss://room.example/rooms', action: 'join', roomId: '123456789A', name: '測試#TW1' }), /不同房間/);
    assert.equal(client.getState().room, null);
    assert.equal(client.getState().connection, 'disconnected');
  } finally { client.destroy(); }
});

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
