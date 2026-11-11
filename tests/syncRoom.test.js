import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, reduceRoom } from '../src/domain/syncRoom.js';

const create = () => createRoom({ roomId: 'room_1', hostId: 'host', hostName: '主持人#TW1' }, 100);
const apply = (state, actor, type, fields = {}) => reduceRoom(state, actor, { type, ...fields }, { now: 200 });
const join = (state, id = 'guest', name = '朋友#TW2') => apply(state, id, 'join', { memberId: id, name });
function readyRoom(count = 2) {
  let state = create();
  for (let index = 1; index < count; index += 1) {
    const id = `guest${index}`;
    state = join(state, id, `朋友${index}#TW2`);
    state = apply(state, 'host', 'approve', { memberId: id });
  }
  for (const member of state.members) state = apply(state, member.id, 'ready', { ready: true });
  return state;
}

test('建立房間驗證完整 Riot ID 與識別，主持人需自行準備', () => {
  const state = create();
  assert.equal(state.members[0].approved, true);
  assert.equal(state.members[0].ready, false);
  assert.equal(state.createdAt, 100);
  assert.equal(state.resultVersion, 0);
  for (const hostName of ['', '沒有標籤', '名稱#', '#TW1', '名稱#TW1#多餘', '名稱\n#TW1', '名稱# TW1', 'a'.repeat(201) + '#TW1']) {
    assert.throws(() => createRoom({ roomId: 'room', hostId: 'host', hostName }), /完整 Riot ID/);
  }
  assert.throws(() => createRoom({ roomId: '../room', hostId: 'host', hostName: '名稱#TW1' }), /格式/);
  assert.throws(() => createRoom({ roomId: 'room', hostId: 'host', hostName: '名稱#TW1' }, NaN), /時間/);
});

test('加入需要核准，容量包含待核准成員，名稱忽略大小寫不可重複', () => {
  let state = join(create());
  assert.equal(state.members[1].approved, false);
  assert.throws(() => apply(state, 'guest', 'ready', { ready: true }), /核准/);
  assert.throws(() => join(state, 'other', '朋友#tw2'), /已在房間/);
  assert.throws(() => apply(state, 'other', 'join', { memberId: 'impersonated', name: '其他#TW1' }), /識別/);
  assert.throws(() => join(state, 'guest', '其他#TW1'), /已加入/);
  for (let index = 2; index <= 4; index += 1) state = join(state, `guest${index}`, `朋友${index}#TW1`);
  assert.equal(state.members.length, 5);
  assert.throws(() => join(state, 'sixth', '第六#TW1'), /5 人上限/);
});

test('只有主持人可核准、抽籤或關房，陌生人無法操作', () => {
  const state = join(create());
  for (const type of ['approve', 'draw', 'close']) {
    assert.throws(() => apply(state, 'guest', type, { memberId: 'guest' }), /主持人/);
  }
  for (const type of ['ready', 'draw', 'leave', 'connection']) {
    assert.throws(() => apply(state, 'stranger', type), /不在這個房間/);
  }
  assert.throws(() => apply(state, 'host', 'approve', { memberId: 'missing' }), /找不到/);
});

test('任何尚未核准、未準備或斷線成員都會阻擋抽籤', () => {
  assert.throws(() => apply(create(), 'host', 'draw'), /所有玩家/);
  let state = join(apply(create(), 'host', 'ready', { ready: true }));
  assert.throws(() => apply(state, 'host', 'draw'), /所有玩家/);
  state = apply(state, 'host', 'approve', { memberId: 'guest' });
  state = apply(state, 'host', 'ready', { ready: true });
  assert.throws(() => apply(state, 'host', 'draw'), /所有玩家/);
  state = apply(readyRoom(), 'guest1', 'connection', { connected: false });
  assert.throws(() => apply(state, 'host', 'draw'), /所有玩家/);
  assert.throws(() => apply(state, 'guest1', 'ready', { ready: true }), /連線中斷/);
});

test('1～5 人抽籤保留既有主副位規則及完整 Riot ID', () => {
  for (let count = 1; count <= 5; count += 1) {
    const state = readyRoom(count);
    const next = apply(state, 'host', 'draw');
    assert.deepEqual(next.result.results.map((row) => row.name), state.members.map((entry) => entry.name));
    assert.equal(new Set(next.result.results.map((row) => row.main)).size, count);
    for (const row of next.result.results) {
      assert.notEqual(row.main, row.secondary);
      assert.equal(row.secondary === '', count === 5);
    }
    assert.equal(next.result.version, 1);
    assert.equal(next.result.id, 'room_1:1');
    assert.equal(next.result.createdAt, 200);
  }
});

test('名單與連線變動撤銷準備和舊結果，重連後需重新準備', () => {
  const drawn = apply(readyRoom(), 'host', 'draw');
  for (const next of [join(drawn, 'new', '新人#TW1'), apply(drawn, 'guest1', 'leave'), apply(drawn, 'guest1', 'connection', { connected: false })]) {
    assert.equal(next.result, null);
    assert.ok(next.members.every((entry) => !entry.ready));
    assert.equal(next.resultVersion, 1);
  }
  const disconnected = apply(drawn, 'guest1', 'connection', { connected: false });
  const connected = apply(disconnected, 'guest1', 'connection', { connected: true });
  assert.ok(connected.members.every((entry) => !entry.ready));
  assert.throws(() => apply(connected, 'host', 'draw'), /所有玩家/);
});

test('結果版本不因失效而重用，取消準備會清除舊結果', () => {
  let state = apply(readyRoom(), 'host', 'draw');
  const firstId = state.result.id;
  state = apply(state, 'guest1', 'ready', { ready: false });
  assert.equal(state.result, null);
  state = apply(state, 'guest1', 'ready', { ready: true });
  state = apply(state, 'host', 'draw');
  assert.equal(state.result.version, 2);
  assert.notEqual(state.result.id, firstId);
  state = apply(state, 'host', 'draw');
  assert.equal(state.result.version, 3);
});

test('主持人離開或關閉即結束房間，不轉移主持權', () => {
  const state = readyRoom();
  for (const type of ['leave', 'close']) {
    const next = apply(state, 'host', type);
    assert.equal(next.closed, true);
    assert.equal(next.result, null);
    assert.equal(next.hostId, 'host');
    assert.throws(() => apply(next, 'guest1', 'ready', { ready: true }), /已關閉/);
    assert.throws(() => join(next, 'new', '新人#TW1'), /已關閉/);
  }
});

test('主持人可移除待核准或斷線成員，撤銷準備並清除結果', () => {
  const pending = join(create());
  assert.throws(() => apply(pending, 'guest', 'remove', { memberId: 'host' }), /主持人/);
  assert.throws(() => apply(pending, 'host', 'remove', { memberId: 'host' }), /不能移除自己/);
  assert.throws(() => apply(pending, 'host', 'remove', { memberId: 'missing' }), /找不到/);
  assert.equal(apply(pending, 'host', 'remove', { memberId: 'guest' }).members.length, 1);
  const drawn = apply(readyRoom(), 'host', 'draw');
  const removed = apply(drawn, 'host', 'remove', { memberId: 'guest1' });
  assert.equal(removed.revision, drawn.revision + 1);
  assert.equal(removed.result, null);
  assert.equal(removed.resultVersion, drawn.resultVersion);
  assert.ok(removed.members.every((entry) => !entry.ready));
  assert.equal(removed.closed, false);
  const disconnected = apply(drawn, 'guest1', 'connection', { connected: false });
  assert.equal(apply(disconnected, 'host', 'remove', { memberId: 'guest1' }).members.length, 1);
});

test('狀態更新不修改輸入、重複設定不增加 revision、拒絕畸形指令', () => {
  const state = readyRoom();
  const original = structuredClone(state);
  apply(state, 'guest1', 'connection', { connected: false });
  apply(state, 'host', 'draw');
  assert.deepEqual(state, original);
  assert.equal(apply(state, 'host', 'ready', { ready: true }), state);
  assert.equal(apply(state, 'host', 'connection', { connected: true }), state);
  assert.equal(apply(state, 'host', 'approve', { memberId: 'guest1' }), state);
  assert.equal(apply(state, 'host', 'draw').revision, state.revision + 1);
  assert.throws(() => apply(state, 'host', 'ready', { ready: 'true' }), /格式/);
  assert.throws(() => apply(state, 'host', 'connection', { connected: 1 }), /格式/);
  assert.throws(() => apply(state, 'host', 'unknown'), /不支援/);
  assert.throws(() => reduceRoom(state, 'host', null), /格式/);
});
