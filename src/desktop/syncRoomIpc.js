import { SyncRoomClient } from './syncRoomClient.js';

// Keep network sessions in the main process. The renderer only receives public room state.
export function registerSyncRoomIpc({ ipcMain, isSender, getWindow, createClient = (options) => new SyncRoomClient(options) }) {
  const client = createClient({ onState: (state) => {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('sync-room:state', state);
  } });
  const register = (channel, operation) => ipcMain.handle(channel, async (event, payload) => {
    if (!isSender(event)) return { ok: false, message: '不允許的房間操作來源' };
    try {
      await operation(payload);
      return { ok: true, state: client.getState() };
    } catch {
      // Native network exceptions may contain the endpoint or session details.
      return { ok: false, message: client.getState().error || '房間操作失敗，請確認連線與房間狀態' };
    }
  });
  register('sync-room:get-state', () => {});
  register('sync-room:connect', (payload) => {
    if (!payload || typeof payload !== 'object' || !['create', 'join'].includes(payload.action)) throw new Error('invalid');
    return client.connect({ url: payload.url, action: payload.action, roomId: payload.roomId, name: payload.name });
  });
  register('sync-room:command', (payload) => {
    if (!payload || typeof payload !== 'object') throw new Error('invalid');
    switch (payload.type) {
      case 'approve': case 'remove': return client.command({ type: payload.type, memberId: payload.memberId });
      case 'ready': return client.command({ type: 'ready', ready: payload.ready });
      case 'draw': case 'leave': case 'close': return client.command({ type: payload.type });
      default: throw new Error('invalid');
    }
  });
  register('sync-room:disconnect', () => client.disconnect());
  return client;
}
