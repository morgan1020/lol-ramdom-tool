import test from 'node:test';
import assert from 'node:assert/strict';
import { createToastStore } from '../src/domain/toastStore.js';

function fixture() {
  let time = 0, seq = 0;
  const timers = new Map();
  const store = createToastStore({ now: () => time, setTimer: (callback, delay) => { const id = ++seq; timers.set(id, { callback, at: time + delay }); return id; }, clearTimer: id => timers.delete(id) });
  const advance = ms => { time += ms; for (const [id, item] of [...timers]) if (item.at <= time) { timers.delete(id); item.callback(); } };
  return { store, advance };
}
test('success expires; error and actionable warning stay until dismissed', () => {
  const { store, advance } = fixture();
  store.notify('完成'); store.notify('失敗', { id: 'error', type: 'error' });
  store.notify('確認', { type: 'warning', action: { label: '重試', onClick() {} } });
  advance(10000);
  assert.equal(store.getSnapshot().length, 2);
  store.dismiss('error'); assert.equal(store.getSnapshot().length, 1);
});
test('hover and keyboard focus pause the countdown independently', () => {
  const { store, advance } = fixture();
  const id = store.notify('完成'); advance(1000); store.pause(id, 'hover'); store.pause(id, 'focus');
  advance(20000); store.resume(id, 'hover'); advance(20000);
  assert.equal(store.getSnapshot().length, 1);
  store.resume(id, 'focus'); advance(2999); assert.equal(store.getSnapshot().length, 1);
  advance(1); assert.equal(store.getSnapshot().length, 0);
});
test('replacement resets old timer and preserves new content', () => {
  const { store, advance } = fixture();
  store.notify('完成', { id: 'same' }); advance(2000);
  store.notify('錯誤', { id: 'same', type: 'error' }); advance(5000);
  assert.deepEqual(store.getSnapshot().map(item => item.message), ['錯誤']);
});
test('retry suppresses duplicate clicks and does not dismiss replacement success', async () => {
  const { store } = fixture(); let finish, calls = 0;
  store.notify('失敗', { id: 'retry', type: 'error', action: { label: '重試', onClick: async () => { calls++; await new Promise(resolve => { finish = resolve; }); store.notify('成功', { id: 'retry' }); } } });
  const action = store.runAction('retry'); await store.runAction('retry'); assert.equal(calls, 1);
  assert.equal(store.getSnapshot()[0].pending, true); finish(); await action;
  assert.equal(store.getSnapshot()[0].message, '成功'); assert.equal(store.getSnapshot()[0].pending, false);
});
test('failed retry remains actionable and a successful retry dismisses it', async () => {
  const { store } = fixture(); let attempts = 0;
  store.notify('失敗', { id: 'retry', type: 'error', action: { label: '重試', onClick: async () => { if (++attempts === 1) throw Error('仍失敗'); } } });
  await store.runAction('retry'); assert.equal(store.getSnapshot()[0].message, '仍失敗');
  assert.equal(store.getSnapshot()[0].pending, false);
  await store.runAction('retry'); assert.equal(store.getSnapshot().length, 0);
});
test('false retry result retains the original notification', async () => {
  const { store } = fixture(); const id = store.notify('忙碌', { action: { label: '重試', onClick: () => false } });
  await store.runAction(id); assert.equal(store.getSnapshot().length, 1); assert.equal(store.getSnapshot()[0].pending, false);
});
test('clearing a context removes only its notices', () => {
  const { store, advance } = fixture(); store.notify('套用失敗', { group: 'apply', type: 'error' }); store.notify('複製完成');
  store.dismissGroup('apply'); assert.equal(store.getSnapshot().length, 1); advance(4000); assert.equal(store.getSnapshot().length, 0);
});
