export function createToastStore({ setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now } = {}) {
  let items = [];
  let sequence = 0;
  const listeners = new Set();
  const clocks = new Map();
  const publish = next => { items = next; listeners.forEach(listener => listener()); };
  const stop = id => { const clock = clocks.get(id); if (clock) clearTimer(clock.timer); clocks.delete(id); };
  const dismiss = id => { stop(id); publish(items.filter(item => item.id !== id)); };
  const schedule = (id, clock) => { clock.started = now(); clock.timer = setTimer(() => dismiss(id), clock.remaining); clocks.set(id, clock); };
  const notify = (message, options = {}) => {
    if (!message) return;
    if (typeof options === 'string') options = { type: options };
    const id = options.id || `notice-${++sequence}`;
    const type = options.type || 'success';
    const item = { id, version: ++sequence, type, message, group: options.group, action: options.action, pending: false };
    stop(id); publish([...items.filter(current => current.id !== id), item]);
    const persistent = options.persistent ?? (type === 'error' || Boolean(options.action));
    if (!persistent) schedule(id, { remaining: options.duration ?? (type === 'warning' ? 8000 : 4000), pauses: new Set() });
    return id;
  };
  const pause = (id, reason) => {
    const clock = clocks.get(id); if (!clock || clock.pauses.has(reason)) return;
    if (!clock.pauses.size) { clearTimer(clock.timer); clock.remaining = Math.max(0, clock.remaining - (now() - clock.started)); }
    clock.pauses.add(reason);
  };
  const resume = (id, reason) => { const clock = clocks.get(id); if (!clock || !clock.pauses.delete(reason) || clock.pauses.size) return; schedule(id, clock); };
  const runAction = async id => {
    const item = items.find(current => current.id === id); if (!item?.action || item.pending) return;
    pause(id, 'action'); publish(items.map(current => current.id === id ? { ...current, pending: true } : current));
    try { const result = await item.action.onClick(); if (items.find(current => current.id === id)?.version === item.version && result !== false) dismiss(id); }
    catch (error) { notify(error.message || '操作失敗，請再試一次', { ...item, type: 'error', persistent: true }); }
    finally {
      if (items.find(current => current.id === id)?.version === item.version) publish(items.map(current => current.id === id ? { ...current, pending: false } : current));
      resume(id, 'action');
    }
  };
  return { notify, dismiss, pause, resume, runAction,
    dismissGroup: group => items.filter(item => item.group === group).forEach(item => dismiss(item.id)),
    getSnapshot: () => items,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }
  };
}
