import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createSyncRoomServer } from '../server/syncRoomServer.js';
import { SyncRoomClient } from '../src/desktop/syncRoomClient.js';

async function waitFor(check, message = '等待房間狀態逾時') {
  const end = Date.now() + 2500;
  while (Date.now() < end) {
    const result = check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(message);
}
async function setup(t, options) {
  const server = await createSyncRoomServer(options);
  t.after(() => server.close());
  return server;
}
function client(t, options) {
  const value = new SyncRoomClient({ requestTimeoutMs: 1200, reconnectDelayMs: 10, ...options });
  t.after(() => value.destroy());
  return value;
}
async function rawClient(t, url, options) {
  const socket = new WebSocket(url, options);
  const messages = [];
  socket.on('message', data => messages.push(JSON.parse(data.toString())));
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  t.after(() => socket.terminate());
  return {
    socket, messages,
    async send(value) {
      socket.send(JSON.stringify(value));
      return waitFor(() => {
        const index = messages.findIndex(item => item.type === 'ack' && item.requestId === value.requestId);
        return index >= 0 ? messages.splice(index, 1)[0] : null;
      });
    }
  };
}

test('兩個本機客戶端完成核准、準備、抽籤及移除；不接觸 LCU 或 Discord', async t => {
  const server = await setup(t);
  const host = client(t), guest = client(t);
  await host.connect({ url: server.url, action: 'create', name: '主持人#TW1' });
  const roomId = host.getState().room.roomId;
  await guest.connect({ url: server.url, action: 'join', roomId, name: '朋友#TW1' });
  const guestId = guest.getState().memberId;
  await assert.rejects(guest.command({ type: 'draw' }), /主持人/);
  await assert.rejects(guest.command({ type: 'ready', ready: true }), /核准/);
  await host.command({ type: 'approve', memberId: guestId });
  await host.command({ type: 'ready', ready: true });
  await guest.command({ type: 'ready', ready: true });
  const room = await host.command({ type: 'draw' });
  await waitFor(() => guest.getState().room.result?.id === room.result.id);
  assert.deepEqual(guest.getState().room.result, room.result);
  assert.equal(room.result.results.length, 2);
  assert.equal(new Set(room.result.results.map(result => result.main)).size, 2);
  assert.equal(JSON.stringify(host.getState()).includes('token'), false);
  await host.command({ type: 'remove', memberId: guestId });
  await waitFor(() => guest.getState().connection === 'disconnected');
  assert.match(guest.getState().error, /移出/);
  assert.equal(host.getState().room.members.length, 1);
  assert.equal(host.getState().room.result, null);
});

test('服務端以 session 身分授權並對重複抽籤 requestId 去重', async t => {
  const server = await setup(t);
  const host = await rawClient(t, server.url);
  const created = await host.send({ type: 'create', requestId: 1, name: '主持人#TW1' });
  assert.equal(created.ok, true);
  assert.equal(typeof created.token, 'string');
  await host.send({ type: 'ready', requestId: 2, ready: true });
  const drawn = await host.send({ type: 'draw', requestId: 3 });
  const duplicate = await host.send({ type: 'draw', requestId: 3 });
  assert.deepEqual(duplicate, drawn);
  assert.equal(drawn.room.result.version, 1);
  const spoof = await host.send({ type: 'connection', requestId: 4, connected: false });
  assert.equal(spoof.ok, false);
  const guest = await rawClient(t, server.url);
  const joined = await guest.send({ type: 'join', requestId: 1, roomId: created.room.roomId, name: '朋友#TW1' });
  const forged = await guest.send({ type: 'close', requestId: 2, actorId: created.memberId, memberId: created.memberId });
  assert.equal(forged.ok, false);
  assert.match(forged.message, /主持人/);
  const removed = await host.send({ type: 'remove', requestId: 5, memberId: joined.memberId });
  assert.equal(removed.ok, true);
  const attacker = await rawClient(t, server.url);
  const resumed = await attacker.send({ type: 'resume', requestId: 9, token: joined.token });
  assert.equal(resumed.ok, false);
});

test('短暫斷線以原 session 重連，清除準備與結果，不重送抽籤', async t => {
  const server = await setup(t);
  const host = client(t), guest = client(t);
  await host.connect({ url: server.url, action: 'create', name: '主持人#TW1' });
  await guest.connect({ url: server.url, action: 'join', roomId: host.getState().room.roomId, name: '朋友#TW1' });
  const id = guest.getState().memberId;
  await host.command({ type: 'approve', memberId: id });
  await host.command({ type: 'ready', ready: true });
  await guest.command({ type: 'ready', ready: true });
  await host.command({ type: 'draw' });
  const oldSocket = guest.socket;
  oldSocket.close();
  await waitFor(() => guest.socket !== oldSocket && guest.getState().connection === 'connected');
  assert.equal(guest.getState().memberId, id);
  assert.equal(guest.getState().room.members.length, 2);
  assert.equal(guest.getState().room.result, null);
  assert.equal(guest.getState().room.resultVersion, 1);
  assert.equal(guest.getState().room.members.every(member => !member.ready), true);
  await assert.rejects(host.command({ type: 'draw' }), /準備/);
});

test('離開與關房會撤銷 session，房間滿員與找不到房間有明確錯誤', async t => {
  const server = await setup(t, { maxRooms: 1 });
  const host = client(t);
  await host.connect({ url: server.url, action: 'create', name: '主持人#TW1' });
  const extra = client(t);
  await assert.rejects(extra.connect({ url: server.url, action: 'create', name: '其他#TW1' }), /數量已滿/);
  await assert.rejects(extra.connect({ url: server.url, action: 'join', roomId: 'ABCDEF', name: '其他#TW1' }), /找不到房間/);
  const guests = [];
  for (let index = 0; index < 4; index++) {
    const guest = client(t); guests.push(guest);
    await guest.connect({ url: server.url, action: 'join', roomId: host.getState().room.roomId, name: `朋友${index}#TW1` });
  }
  await assert.rejects(extra.connect({ url: server.url, action: 'join', roomId: host.getState().room.roomId, name: '其他#TW1' }), /5/);
  await guests[0].command({ type: 'leave' });
  assert.equal(guests[0].getState().room, null);
  await host.command({ type: 'close' });
  await waitFor(() => guests[1].getState().connection === 'disconnected');
  assert.match(guests[1].getState().error, /關閉/);
});

test('閒置到期清理房間，拒絕網頁 Origin 連線', async t => {
  let now = 100;
  const server = await setup(t, { now: () => now, roomTtlMs: 100, heartbeatMs: 30 });
  const host = client(t);
  await host.connect({ url: server.url, action: 'create', name: '主持人#TW1' });
  now += 101;
  await waitFor(() => host.getState().connection === 'disconnected');
  assert.match(host.getState().error, /到期/);
  const socket = new WebSocket(server.url, { origin: 'https://untrusted.example' });
  t.after(() => socket.terminate());
  await assert.rejects(new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); }), /403/);
});

test('重疊 connect 的舊失敗不會拆掉新連線，主持人 leave 能正常完成', async t => {
  const server = await setup(t);
  const host = client(t);
  const obsolete = host.connect({ url: server.url, action: 'create', name: '舊連線#TW1' }).catch(error => error);
  await host.connect({ url: server.url, action: 'create', name: '新連線#TW1' });
  assert.ok(await obsolete instanceof Error);
  assert.equal(host.getState().connection, 'connected');
  assert.equal(host.getState().room.members[0].name, '新連線#TW1');
  await host.command({ type: 'leave' });
  assert.equal(host.getState().connection, 'disconnected');
  assert.equal(host.getState().room, null);
});

test('resume 取代仍在線的 session 也撤銷準備與結果，舊 socket 關閉不影響新連線', async t => {
  const server = await setup(t);
  const host = await rawClient(t, server.url);
  const created = await host.send({ type: 'create', requestId: 1, name: '主持人#TW1' });
  await host.send({ type: 'ready', requestId: 2, ready: true });
  await host.send({ type: 'draw', requestId: 3 });
  const replacement = await rawClient(t, server.url);
  const resumed = await replacement.send({ type: 'resume', requestId: 4, token: created.token });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.room.result, null);
  assert.equal(resumed.room.resultVersion, 1);
  assert.equal(resumed.room.members[0].ready, false);
  assert.equal(resumed.room.members[0].connected, true);
  await waitFor(() => host.socket.readyState === 3);
  const ready = await replacement.send({ type: 'ready', requestId: 5, ready: true });
  assert.equal(ready.ok, true);
  assert.equal(ready.room.members[0].connected, true);
  const drawn = await replacement.send({ type: 'draw', requestId: 6 });
  assert.equal(drawn.room.result.version, 2);
});

test('主持人離線超過期限自動關房，避免失去主持人的孤兒房間', async t => {
  let now = 100;
  const server = await setup(t, { now: () => now, hostDisconnectGraceMs: 50, heartbeatMs: 10 });
  const host = await rawClient(t, server.url);
  const created = await host.send({ type: 'create', requestId: 1, name: '主持人#TW1' });
  const guest = client(t);
  await guest.connect({ url: server.url, action: 'join', roomId: created.room.roomId, name: '朋友#TW1' });
  host.socket.close();
  await waitFor(() => guest.getState().room.members.find(member => member.id === created.memberId)?.connected === false);
  now += 51;
  await waitFor(() => guest.getState().connection === 'disconnected');
  assert.match(guest.getState().error, /主持人離線/);
  assert.equal(guest.getState().room, null);
});

test('限制連線數、未驗證握手時間及 WebSocket 訊息大小', async t => {
  const server = await setup(t, { maxConnections: 1, handshakeTimeoutMs: 80 });
  const first = await rawClient(t, server.url);
  const rejected = new WebSocket(server.url);
  t.after(() => rejected.terminate());
  await assert.rejects(new Promise((resolve, reject) => { rejected.once('open', resolve); rejected.once('error', reject); }), /403/);
  const handshakeCode = await new Promise(resolve => first.socket.once('close', resolve));
  assert.equal(handshakeCode, 1008);
  const oversized = await rawClient(t, server.url);
  const closed = new Promise(resolve => oversized.socket.once('close', resolve));
  oversized.socket.send('x'.repeat(9000));
  assert.equal(await closed, 1009);
});

test('訊息洪水會關閉連線，避免快速重複操作耗用服務資源', async t => {
  const server = await setup(t);
  const host = await rawClient(t, server.url);
  await host.send({ type: 'create', requestId: 1, name: '主持人#TW1' });
  const closed = new Promise(resolve => host.socket.once('close', resolve));
  for (let requestId = 2; requestId < 42; requestId++) host.socket.send(JSON.stringify({ type: 'ready', requestId, ready: true }));
  assert.equal(await closed, 1008);
});
