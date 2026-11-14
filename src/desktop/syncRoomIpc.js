import { readFileSync } from 'node:fs';
import path from 'node:path';
import { discoverSyncRoom, SyncRoomClient, validateSyncRoomUrl } from './syncRoomClient.js';

function defaultServiceUrl() {
  try {
    const override = process.env.LOL_ROOM_SERVICE_URL;
    if (override) return validateSyncRoomUrl(override);
    if (!process.resourcesPath) return '';
    const config = JSON.parse(readFileSync(path.join(process.resourcesPath, 'room-service.json'), 'utf8'));
    return validateSyncRoomUrl(config.url);
  }
  catch { return ''; }
}

// Keep network sessions in the main process. The renderer only receives public room state.
export function registerSyncRoomIpc({ ipcMain, isSender, getWindow, discover = discoverSyncRoom, createClient = (options) => new SyncRoomClient(options) }) {
  const configuredUrl = defaultServiceUrl();
  const publicState = state => configuredUrl ? { ...state, defaultServiceUrl: configuredUrl } : state;
  const client = createClient({ onState: (state) => {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('sync-room:state', publicState(state));
  } });
  const register = (channel, operation) => ipcMain.handle(channel, async (event, payload) => {
    if (!isSender(event)) return { ok: false, message: '不允許的房間操作來源' };
    try {
      await operation(payload);
      return { ok: true, state: publicState(client.getState()) };
    } catch {
      // Native network exceptions may contain the endpoint or session details.
      return { ok: false, message: client.getState().error || '房間操作失敗，請確認連線與房間狀態' };
    }
  });
  register('sync-room:get-state', () => {});
  ipcMain.handle('sync-room:discover', async (event, payload) => {
    if (!isSender(event)) return { ok: false, message: '不允許的房間操作來源' };
    try { return { ok: true, match: await discover(payload?.url, payload?.names) }; }
    catch { return { ok: false, message: '無法查詢目前隊伍，請使用邀請加入。' }; }
  });
  register('sync-room:connect', (payload) => {
    if (!payload || typeof payload !== 'object' || !['create', 'join'].includes(payload.action)) throw new Error('invalid');
    return client.connect({ url: payload.url, action: payload.action, roomId: payload.roomId, name: payload.name,
      ...(payload.teamKey !== undefined ? { teamKey: payload.teamKey } : {}) });
  });
  register('sync-room:command', (payload) => {
    if (!payload || typeof payload !== 'object') throw new Error('invalid');
    switch (payload.type) {
      case 'approve': case 'remove': return client.command({ type: payload.type, memberId: payload.memberId });
      case 'add-manual': return client.command({ type: 'add-manual', name: payload.name });
      case 'ready': return client.command({ type: 'ready', ready: payload.ready });
      case 'sync-lobby': return client.command({ type: 'sync-lobby', names: payload.names });
      case 'draw-settings': return client.command({ type: 'draw-settings', drawMode: payload.drawMode, preferences: payload.preferences, revision: payload.revision });
      case 'draw': return client.command({ type: 'draw', revision: payload.revision });
      case 'leave': case 'close': return client.command({ type: payload.type });
      default: throw new Error('invalid');
    }
  });
  register('sync-room:disconnect', () => client.disconnect());
  return client;
}
