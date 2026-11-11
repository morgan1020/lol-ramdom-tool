import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { bindSyncRoomWindowLifecycle } from '../src/desktop/syncRoomLifecycle.js';

function setup({ connection = 'connected', command = async () => {}, timeoutMs = 1000 } = {}) {
  const window = new EventEmitter();
  let destroyed = false;
  let destroys = 0;
  let disconnects = 0;
  const commands = [];
  window.isDestroyed = () => destroyed;
  window.destroy = () => { destroys += 1; destroyed = true; window.emit('closed'); };
  window.close = () => {
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    window.emit('close', event);
    if (!event.prevented && !destroyed) window.destroy();
    return event;
  };
  const client = {
    getState: () => ({ connection }),
    disconnect: () => { disconnects += 1; },
    command: (value) => { commands.push(value); return command(value); }
  };
  bindSyncRoomWindowLifecycle(window, client, { timeoutMs });
  return { window, commands, get disconnects() { return disconnects; }, get destroys() { return destroys; } };
}

test('連線中關視窗先送出 leave，完成後中斷連線並關閉', async () => {
  let resolve;
  const fixture = setup({ command: () => new Promise((done) => { resolve = done; }) });
  const closed = once(fixture.window, 'closed');
  assert.equal(fixture.window.close().prevented, true);
  assert.equal(fixture.window.isDestroyed(), false);
  await Promise.resolve();
  assert.deepEqual(fixture.commands, [{ type: 'leave' }]);
  resolve();
  await closed;
  assert.equal(fixture.disconnects, 1);
  assert.equal(fixture.destroys, 1);
});

test('離開失敗或同步拋錯仍可關閉視窗', async () => {
  for (const command of [() => Promise.reject(new Error('離線')), () => { throw new Error('操作失敗'); }]) {
    const fixture = setup({ command });
    const closed = once(fixture.window, 'closed');
    fixture.window.close();
    await closed;
    assert.equal(fixture.disconnects, 1);
    assert.equal(fixture.destroys, 1);
  }
});

test('離開無回應時到期關閉，遲到回覆不重複操作視窗', async () => {
  let resolve;
  const fixture = setup({ command: () => new Promise((done) => { resolve = done; }), timeoutMs: 10 });
  const closed = once(fixture.window, 'closed');
  fixture.window.close();
  await closed;
  assert.equal(fixture.disconnects, 1);
  resolve();
  await Promise.resolve();
  assert.equal(fixture.destroys, 1);
  assert.equal(fixture.disconnects, 1);
});

test('重複點關閉只送出一次離開指令', async () => {
  let resolve;
  const fixture = setup({ command: () => new Promise((done) => { resolve = done; }) });
  const closed = once(fixture.window, 'closed');
  assert.equal(fixture.window.close().prevented, true);
  assert.equal(fixture.window.close().prevented, true);
  await Promise.resolve();
  assert.equal(fixture.commands.length, 1);
  resolve();
  await closed;
  assert.equal(fixture.destroys, 1);
});

test('未連線立即關閉，不等待服務', () => {
  for (const connection of ['disconnected', 'connecting', 'reconnecting']) {
    const fixture = setup({ connection });
    assert.equal(fixture.window.close().prevented, false);
    assert.equal(fixture.window.isDestroyed(), true);
    assert.deepEqual(fixture.commands, []);
    assert.equal(fixture.disconnects, 1);
  }
});

test('視窗被其他來源銷毀後，離開回覆不再呼叫 destroy', async () => {
  let resolve;
  const fixture = setup({ command: () => new Promise((done) => { resolve = done; }) });
  fixture.window.close();
  await Promise.resolve();
  fixture.window.destroy();
  resolve();
  await Promise.resolve();
  assert.equal(fixture.destroys, 1);
  assert.equal(fixture.disconnects, 1);
});
