import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';
import { WebSocket } from 'ws';
import { runCloudSmoke } from '../scripts/sync-room-cloud-smoke.mjs';
import { discoverSyncRoom, SyncRoomClient } from '../src/desktop/syncRoomClient.js';
import { TeamIndexDurableObject } from '../server/cloudflare/worker.js';
import { dropFirstHandshakeAck } from './helpers/dropFirstHandshakeAck.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = path.join(root, 'release', 'sync-room-cloud-test');
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, timeoutMs = 6000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const value = check();
    if (value) return value;
    await pause(10);
  }
  assert.fail('等待 Cloudflare 本地 runtime 狀態逾時');
}

async function runtime(t, bindings = {}, { connectionLimit = 60 } = {}) {
  await mkdir(artifactRoot, { recursive: true });
  const persistence = await mkdtemp(path.join(artifactRoot, 'run-'));
  const options = convertV4MiniflareOptions({
    name: 'sync-room-test',
    modules: ['server/cloudflare/worker.js', 'src/domain/syncRoom.js', 'src/domain/draw.js', 'src/domain/roomDiscovery.js', 'src/domain/roomVisibility.js']
      .map(file => ({ type: 'ESModule', path: path.join(root, file) })),
    modulesRoot: root,
    compatibilityDate: '2026-11-11',
    host: '127.0.0.1', port: 0,
    durableObjects: {
      SYNC_ROOMS: { className: 'SyncRoomDurableObject', useSQLite: true },
      TEAM_INDEX: { className: 'TeamIndexDurableObject', useSQLite: true }
    },
    resourcePersistencePath: persistence,
    ratelimits: connectionLimit === false ? {} : { ROOM_CONNECTION_LIMITER: { namespace_id: '2026111101', simple: { limit: connectionLimit, period: 60 } } },
    bindings,
    log: new Log(LogLevel.ERROR)
  });
  let mf;
  const launch = async () => {
    mf = new Miniflare(options);
    const url = new URL(await mf.ready);
    return { mf, base: `${url.origin.replace(/^http/u, 'ws')}/rooms` };
  };
  t.after(async () => {
    await mf?.dispose();
    const relative = path.relative(artifactRoot, persistence);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('拒絕清理測試目錄外的資料');
    await rm(persistence, { recursive: true, force: true });
  });
  const initial = await launch();
  return { ...initial, async restart() { await mf.dispose(); return launch(); } };
}

async function rawClient(t, base, roomId, options) {
  const socket = new WebSocket(`${base}/${roomId}`, options);
  const messages = [];
  socket.on('message', data => messages.push(JSON.parse(data.toString())));
  socket.on('error', () => {});
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  t.after(() => { if (socket.readyState !== 3) socket.terminate(); });
  return {
    socket, messages,
    async send(value) {
      socket.send(JSON.stringify(value));
      return waitFor(() => {
        const index = messages.findIndex(item => item.type === 'ack' && item.requestId === value.requestId);
        return index < 0 ? null : messages.splice(index, 1)[0];
      });
    },
    async close() {
      if (socket.readyState === 3) return;
      await new Promise(resolve => { socket.once('close', resolve); socket.close(); });
    }
  };
}

test('Cloudflare workerd runtime：正式客戶端完成雙人同步、權限、重連與關房', { timeout: 45000 }, async t => {
  const { base } = await runtime(t);
  const report = await runCloudSmoke({ url: base, requestTimeoutMs: 5000 });
  assert.equal(report.ok, true, `失敗階段：${report.failedStep || 'unknown'}`);
  assert.equal(Object.values(report.checks).every(Boolean), true);
  assert.equal(report.checks.sameSessionReconnect, true);
  assert.equal(report.checks.identicalResults, true);
  assert.equal(report.realLcuWrites, 0);
});

test('Cloudflare 同隊索引在主持人斷線、重連和到期時維持正確結果', { timeout: 30000 }, async t => {
  const { base } = await runtime(t, { TEAM_INDEX_TTL_MS: '2200' });
  const host = new SyncRoomClient({ reconnectDelayMs: 300 });
  const guest = new SyncRoomClient();
  t.after(() => { host.destroy(); guest.destroy(); });
  const names = ['主持人#TW1', '朋友#TW2', '甲#TW3', '乙#TW4', '丙#TW5'];
  const url = base;
  await host.connect({ url, action: 'create', name: names[0] });
  await host.command({ type: 'sync-lobby', names });
  const match = await discoverSyncRoom(url, names);
  assert.equal(match.roomId, host.getState().room.roomId);
  host.socket.close();
  await waitFor(() => host.getState().connection === 'reconnecting');
  await waitFor(() => host.getState().connection === 'connected');
  assert.deepEqual(await discoverSyncRoom(url, names), match);
  await pause(2250);
  assert.deepEqual(await discoverSyncRoom(url, names), { status: 'missing' });
  await assert.rejects(guest.connect({ url, action: 'join', name: names[1], ...match }), /隊伍房間已變更/);
  await guest.connect({ url, action: 'join', name: names[1], roomId: match.roomId });
  assert.deepEqual(Object.keys(guest.getState().room).sort(), ['pendingApproval', 'revision', 'roomId']);
  assert.equal(guest.getState().room.pendingApproval, true);
  await host.command({ type: 'close' });
});

test('量測五人房短效索引每次查找與清理的儲存呼叫', async t => {
  const values = new Map();
  const operations = { reads: 0, puts: 0, deletes: 0, setAlarms: 0, deleteAlarms: 0 };
  const storage = {
    async get(key) { operations.reads++; return values.get(key); },
    async put(key, value) { operations.puts++; values.set(key, value); },
    async delete(key) { operations.deletes++; return values.delete(key); },
    async setAlarm() { operations.setAlarms++; },
    async deleteAlarm() { operations.deleteAlarms++; },
    async transaction(callback) { return callback(this); }
  };
  const index = new TeamIndexDurableObject({ storage });
  const roomId = 'ABCDE12345';
  const update = expiresAt => index.fetch(new Request('https://team-index/update', {
    method: 'POST', body: JSON.stringify({ roomId, expiresAt })
  }));
  await update(Date.now() + 600000);
  for (let guest = 0; guest < 4; guest++) {
    const match = await index.fetch(new Request('https://team-index/lookup', { method: 'POST' }));
    assert.deepEqual(await match.json(), { status: 'found', roomId });
  }
  await update(0);
  assert.deepEqual(operations, { reads: 6, puts: 1, deletes: 1, setAlarms: 1, deleteAlarms: 1 });
  t.diagnostic(JSON.stringify({ guestLookups: 4, indexCalls: 6, ...operations }));
});

test('Cloudflare workerd 加入 ACK 遺失後重試同一席位，拒絕錯誤身分及房間重播', { timeout: 30000 }, async t => {
  const { base } = await runtime(t);
  const roomId = 'ABCDEF0123';
  const host = await rawClient(t, base, roomId);
  assert.equal((await host.send({ type: 'create', requestId: 1, roomId, name: '主持人#TW1' })).ok, true);
  const { observed, WebSocketImpl } = dropFirstHandshakeAck();
  const guest = new SyncRoomClient({ WebSocketImpl });
  t.after(() => guest.destroy());
  const state = await guest.connect({ url: base, action: 'join', roomId, name: '朋友#TW1' });
  const [initial, retry] = observed.requests;
  assert.deepEqual(retry, { ...initial, requestId: retry.requestId });
  assert.equal(state.memberId, observed.ack.memberId);
  assert.deepEqual(Object.keys(observed.ack.room).sort(), ['pendingApproval', 'revision', 'roomId']);
  assert.equal(state.room.pendingApproval, true);
  const pendingBroadcast = await waitFor(() => host.messages.find(message =>
    message.type === 'state' && message.room.members.some(member => member.id === state.memberId)));
  assert.equal(pendingBroadcast.room.members.length, 2);
  assert.equal((await host.send({ type: 'approve', requestId: 2, memberId: state.memberId })).ok, true);
  await waitFor(() => guest.getState().room.members?.length === 2);

  const other = await rawClient(t, base, roomId);
  assert.equal((await other.send({ ...initial, name: '其他人#TW1' })).ok, false);
  const wrongRoom = await rawClient(t, base, 'FFFFFFFFFF');
  assert.equal((await wrongRoom.send(initial)).ok, false);
  assert.equal((await wrongRoom.send({ type: 'resume', requestId: 2, token: observed.ack.token })).ok, false);
});

test('Cloudflare Worker 路由與 Origin 限制，健康檢查不建立房間', { timeout: 30000 }, async t => {
  const { mf, base } = await runtime(t);
  assert.equal((await mf.dispatchFetch('http://localhost/health')).status, 200);
  for (const route of ['/rooms', '/rooms/SHORT', '/rooms/ABCDEFGHIJ', '/rooms/ABCDEF0123/extra', '/other']) {
    assert.equal((await mf.dispatchFetch(`http://localhost${route}`)).status, 404, route);
  }
  assert.equal((await mf.dispatchFetch('http://localhost/rooms/ABCDEF0123')).status, 426);
  const browser = new WebSocket(`${base}/ABCDEF0123`, { origin: 'https://untrusted.example' });
  t.after(() => browser.terminate());
  await assert.rejects(new Promise((resolve, reject) => { browser.once('open', resolve); browser.once('error', reject); }), /403/);
});

test('Durable Object 以 session 授權、拒絕偽造連線事件並去重抽籤', { timeout: 30000 }, async t => {
  const { base } = await runtime(t);
  const host = await rawClient(t, base, 'ABCDEF0123');
  const created = await host.send({ type: 'create', requestId: 1, roomId: 'ABCDEF0123', name: '測試主持人#DEMO' });
  assert.equal(created.ok, true);
  assert.equal((await host.send({ type: 'ready', requestId: 2, ready: true })).ok, true);
  const draw = await host.send({ type: 'draw', requestId: 3 });
  assert.equal(draw.ok, true);
  assert.deepEqual(await host.send({ type: 'draw', requestId: 3 }), draw);
  assert.equal((await host.send({ type: 'connection', requestId: 4, connected: false })).ok, false);
  const guest = await rawClient(t, base, 'ABCDEF0123');
  const joined = await guest.send({ type: 'join', requestId: 1, roomId: 'ABCDEF0123', name: '測試朋友#DEMO' });
  assert.equal(joined.ok, true);
  assert.equal((await guest.send({ type: 'close', requestId: 2, actorId: created.memberId })).ok, false);
  assert.equal((await host.send({ type: 'remove', requestId: 5, memberId: joined.memberId })).ok, true);
  const removed = await rawClient(t, base, 'ABCDEF0123');
  assert.equal((await removed.send({ type: 'resume', requestId: 10, token: joined.token })).ok, false);
  await host.send({ type: 'close', requestId: 6 });
});

test('SQLite DO 持久化：重建真 runtime 後恢復 session、版本及去重紀錄', { timeout: 45000 }, async t => {
  const instance = await runtime(t);
  const host = await rawClient(t, instance.base, '012345ABCD');
  const created = await host.send({ type: 'create', requestId: 1, roomId: '012345ABCD', name: '持久化測試#DEMO' });
  assert.equal(created.ok, true);
  await host.send({ type: 'ready', requestId: 2, ready: true });
  const draw = await host.send({ type: 'draw', requestId: 3 });
  assert.equal(draw.ok, true);
  // Runtime disposal tears down real workerd, not a fake in-memory class. The
  // next instance uses the same SQLite persistence directory and class name.
  await host.close();
  const restarted = await instance.restart();
  const resumed = await rawClient(t, restarted.base, '012345ABCD');
  const resumedReply = await resumed.send({ type: 'resume', requestId: 10, token: created.token });
  assert.equal(resumedReply.ok, true);
  assert.equal(resumedReply.memberId, created.memberId);
  assert.equal(resumedReply.room.result.archived, true);
  assert.equal(resumedReply.room.resultVersion, 1);
  assert.equal(resumedReply.room.members[0].ready, false);
  const replay = await resumed.send({ type: 'draw', requestId: 3 });
  assert.deepEqual(replay, draw);
  await resumed.send({ type: 'ready', requestId: 11, ready: true });
  const next = await resumed.send({ type: 'draw', requestId: 12 });
  assert.equal(next.ok, true);
  assert.equal(next.room.result.version, 2);
  await resumed.send({ type: 'close', requestId: 13 });
});

test('DO alarm 清理主持人離線房間，舊 token 不能復活房間', { timeout: 30000 }, async t => {
  const { base } = await runtime(t, { HOST_DISCONNECT_GRACE_MS: '100', ROOM_TTL_MS: '10000' });
  const host = await rawClient(t, base, '00000ABCDE');
  const created = await host.send({ type: 'create', requestId: 1, roomId: '00000ABCDE', name: '到期測試#DEMO' });
  assert.equal(created.ok, true);
  await host.close();
  await pause(500);
  const resumed = await rawClient(t, base, '00000ABCDE');
  const reply = await resumed.send({ type: 'resume', requestId: 2, token: created.token });
  assert.equal(reply.ok, false);
});

test('真 workerd hibernation：保留雙 WebSocket attachment 與 session，喚醒後結果一致', { timeout: 30000 }, async t => {
  const { mf, base } = await runtime(t);
  const roomId = 'ABCDE56789';
  const host = await rawClient(t, base, roomId);
  const created = await host.send({ type: 'create', requestId: 1, roomId, name: '休眠主持人#DEMO' });
  assert.equal(created.ok, true);
  const guest = await rawClient(t, base, roomId);
  const joined = await guest.send({ type: 'join', requestId: 1, roomId, name: '休眠朋友#DEMO' });
  assert.equal(joined.ok, true);
  await host.send({ type: 'approve', requestId: 2, memberId: joined.memberId });
  await host.send({ type: 'ready', requestId: 3, ready: true });
  await guest.send({ type: 'ready', requestId: 2, ready: true });
  const first = await host.send({ type: 'draw', requestId: 4 });
  assert.equal(first.ok, true);
  await mf.unsafeEvictDurableObject('sync-room-test', 'SyncRoomDurableObject', { name: roomId, webSockets: 'hibernate' });
  assert.equal(host.socket.readyState, WebSocket.OPEN);
  assert.equal(guest.socket.readyState, WebSocket.OPEN);
  const second = await host.send({ type: 'draw', requestId: 5 });
  assert.equal(second.ok, true);
  assert.equal(second.room.result.version, 2);
  const observed = await waitFor(() => guest.messages.find(message => message.type === 'state' && message.room.result?.id === second.room.result.id));
  assert.deepEqual(observed.room.result, second.room.result);
  assert.deepEqual(await host.send({ type: 'draw', requestId: 4 }), first);
  await host.send({ type: 'close', requestId: 6 });
});

test('關房墓碑經 runtime 重啟後仍禁止搶用舊房碼或恢復舊 session', { timeout: 30000 }, async t => {
  const instance = await runtime(t);
  const roomId = '99999ABCDE';
  const host = await rawClient(t, instance.base, roomId);
  const created = await host.send({ type: 'create', requestId: 1, roomId, name: '關房測試#DEMO' });
  assert.equal(created.ok, true);
  assert.equal((await host.send({ type: 'close', requestId: 2 })).ok, true);
  const restarted = await instance.restart();
  const other = await rawClient(t, restarted.base, roomId);
  const recreated = await other.send({ type: 'create', requestId: 1, roomId, name: '另一位測試#DEMO' });
  assert.equal(recreated.ok, false);
  assert.match(recreated.message, /已關閉/);
  assert.equal((await other.send({ type: 'join', requestId: 2, roomId, name: '另一位測試#DEMO' })).ok, false);
  assert.equal((await other.send({ type: 'resume', requestId: 3, token: created.token })).ok, false);
});

test('Cloudflare 連線限流在 DO 建立前生效，缺少 binding 時拒絕服務', { timeout: 30000 }, async t => {
  const limited = await runtime(t, {}, { connectionLimit: 1 });
  await rawClient(t, limited.base, '11111ABCDE');
  const second = new WebSocket(`${limited.base}/22222ABCDE`);
  t.after(() => second.terminate());
  await assert.rejects(new Promise((resolve, reject) => { second.once('open', resolve); second.once('error', reject); }), /429/);
  const unconfigured = await runtime(t, {}, { connectionLimit: false });
  const third = new WebSocket(`${unconfigured.base}/33333ABCDE`);
  t.after(() => third.terminate());
  await assert.rejects(new Promise((resolve, reject) => { third.once('open', resolve); third.once('error', reject); }), /503/);
});

test('DO 關閉超過 128 筆回覆快取的房間時，分批清理且不留下可恢復 session', { timeout: 30000 }, async t => {
  const { base } = await runtime(t);
  const roomId = '55555ABCDE';
  const peers = [];
  const tokens = [];
  for (let index = 0; index < 5; index += 1) {
    const peer = await rawClient(t, base, roomId);
    const handshake = await peer.send({ type: index === 0 ? 'create' : 'join', requestId: 1, roomId, name: `快取測試${index}#DEMO` });
    assert.equal(handshake.ok, true);
    peers.push(peer); tokens.push(handshake.token);
  }
  // 26 replies for each of 5 sessions exceeds the KV API's 128-key delete
  // batch ceiling while remaining below the per-socket 30 messages/sec limit.
  for (const [index, peer] of peers.entries()) {
    for (let requestId = 2; requestId <= 27; requestId += 1) {
      const reply = await peer.send({ type: 'ready', requestId, ready: true });
      assert.equal(reply.ok, index === 0);
    }
  }
  assert.equal((await peers[0].send({ type: 'close', requestId: 28 })).ok, true);
  const resumed = await rawClient(t, base, roomId);
  assert.equal((await resumed.send({ type: 'resume', requestId: 30, token: tokens[0] })).ok, false);
});

test('cloud-smoke CLI 使用真 runtime 並產生不含身分或憑證的報告', { timeout: 30000 }, async t => {
  const { base } = await runtime(t);
  const { stdout } = await promisify(execFile)(process.execPath, [path.join(root, 'scripts', 'sync-room-cloud-smoke.mjs'), '--url', base], { cwd: root, timeout: 20000 });
  assert.match(stdout, /合成驗證通過/);
  const filename = /去識別報告：([^\r\n]+)/u.exec(stdout)?.[1];
  assert.ok(filename);
  const expectedRoot = path.join(root, 'release', 'sync-room-cloud-smoke');
  const relative = path.relative(expectedRoot, filename);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  const text = await readFile(filename, 'utf8');
  const report = JSON.parse(text);
  assert.equal(report.ok, true);
  assert.equal(report.syntheticDataOnly, true);
  for (const forbidden of ['token', 'roomId', 'memberId', '#DEMO', base]) assert.equal(text.includes(forbidden), false);
});

test('休眠中的 DO 自動回應 heartbeat，維持 revision、準備與結果不變', { timeout: 30000 }, async t => {
  const { mf, base } = await runtime(t);
  const roomId = '77777ABCDE';
  const host = await rawClient(t, base, roomId);
  assert.equal((await host.send({ type: 'create', requestId: 1, roomId, name: '心跳測試#DEMO' })).ok, true);
  await host.send({ type: 'ready', requestId: 2, ready: true });
  const before = await host.send({ type: 'draw', requestId: 3 });
  assert.equal(before.ok, true);
  await mf.unsafeEvictDurableObject('sync-room-test', 'SyncRoomDurableObject', { name: roomId, webSockets: 'hibernate' });
  host.socket.send('{"type":"ping"}');
  await waitFor(() => host.messages.find(message => message.type === 'pong'));
  assert.equal(host.socket.readyState, WebSocket.OPEN);
  // Repeating an already-true ready command is a core no-op. Its fresh ack
  // exposes the actual current state, rather than reading an old cached reply.
  const current = await host.send({ type: 'ready', requestId: 4, ready: true });
  assert.equal(current.ok, true);
  assert.deepEqual(current.room, before.room);
  const after = await host.send({ type: 'draw', requestId: 5 });
  assert.equal(after.ok, true);
  assert.equal(after.room.revision, before.room.revision + 1);
  assert.equal(after.room.result.version, before.room.result.version + 1);
  await host.send({ type: 'close', requestId: 6 });
});
