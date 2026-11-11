// A normal window close is an explicit departure, unlike a recoverable socket drop.
export function bindSyncRoomWindowLifecycle(window, client, { timeoutMs = 1000 } = {}) {
  let closing = false;
  let finished = false;
  let timer;
  const disconnect = () => {
    try { client?.disconnect(); } catch { /* Closing must not be blocked by cleanup. */ }
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    disconnect();
    if (!window.isDestroyed()) window.destroy();
  };
  window.on('close', (event) => {
    if (finished || window.isDestroyed()) return;
    if (closing) { event.preventDefault(); return; }
    let connected = false;
    try { connected = client?.getState().connection === 'connected'; } catch { /* Close normally. */ }
    if (!connected) {
      finished = true;
      disconnect();
      return;
    }
    event.preventDefault();
    closing = true;
    timer = setTimeout(finish, Math.min(1000, Math.max(0, timeoutMs)));
    // Promise wrapping also handles a synchronous command validation error.
    void Promise.resolve().then(() => client.command({ type: 'leave' })).then(finish, finish);
  });
  window.on('closed', () => {
    clearTimeout(timer);
    if (finished) return;
    finished = true;
    disconnect();
  });
}
