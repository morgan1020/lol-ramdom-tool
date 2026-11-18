import { readFileSync } from 'node:fs';
import path from 'node:path';
import { discoverSyncRoom, SyncRoomClient, validateSyncRoomUrl } from './syncRoomClient.js';

class StaleConsentError extends Error {}

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
  let session;
  let contextKey;
  let consent;
  let consentEpoch = 0;
  let contextVersion = 0;
  let connectionAttempt = 0;

  function revokeConsent() {
    consent = null;
    consentEpoch += 1;
  }

  function inspect(state) {
    const { room, memberId, serviceUrl, connection } = state;
    const member = room?.members?.find(entry => entry.id === memberId);
    const localIsHost = session?.action === 'create';
    const current = connection === 'connected' && session && memberId === session.memberId &&
      room?.roomId === session.roomId && serviceUrl === session.serviceUrl && room.lobbySynced && !room.closed &&
      member?.approved && member.connected && member.name === session.name && (memberId === room.hostId) === localIsHost;
    const key = current ? JSON.stringify([
      room.hostId,
      room.members.map(entry => [entry.id, entry.name, Boolean(entry.manual), entry.approved, entry.connected]).sort(),
      room.drawMode, Object.entries(room.preferences ?? {}).sort()
    ]) : null;
    return { key, room, member, localIsHost };
  }

  function observe(state) {
    const current = inspect(state);
    if (current.key !== contextKey) {
      contextVersion += 1;
      revokeConsent();
    } else if (consent?.kind === 'guest') {
      if (!current.member?.ready) revokeConsent();
      else if (current.room.result?.archived) consent.afterVersion = Math.max(consent.afterVersion, current.room.result.version);
    } else if (consent?.kind === 'host' && consent.result !== JSON.stringify(current.room?.result)) revokeConsent();
    contextKey = current.key;
    return current;
  }

  function authorizedResult(state) {
    const { room } = observe(state);
    const result = room?.result;
    if (!consent || !contextKey || !result || result.archived) return null;
    if (consent.kind === 'host') return consent.result === JSON.stringify(result) ? result : null;
    return result.version > consent.afterVersion ? result : null;
  }

  function publicState(state) {
    const result = authorizedResult(state);
    return {
      ...state,
      ...(configuredUrl ? { defaultServiceUrl: configuredUrl } : {}),
      ...(session?.action === 'create' ? { localIsHost: true } : {}),
      ...(contextKey ? { consentContext: contextVersion } : {}),
      ...(consent?.kind === 'guest' ? { localReady: true } : {}),
      ...(result ? { authorizedResultId: result.id } : {})
    };
  }

  const publish = state => {
    const snapshot = publicState(state);
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('sync-room:state', snapshot);
  };
  const client = createClient({ onState: publish });
  const register = (channel, operation) => ipcMain.handle(channel, async (event, payload) => {
    if (!isSender(event)) return { ok: false, message: '不允許的房間操作來源' };
    try {
      await operation(payload);
      return { ok: true, state: publicState(client.getState()) };
    } catch (error) {
      if (error instanceof StaleConsentError) return { ok: false, message: error.message };
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
  register('sync-room:connect', async (payload) => {
    if (!payload || typeof payload !== 'object' || !['create', 'join'].includes(payload.action)) throw new Error('invalid');
    const attempt = ++connectionAttempt;
    session = null;
    revokeConsent();
    await client.connect({ url: payload.url, action: payload.action, roomId: payload.roomId, name: payload.name,
      ...(payload.teamKey !== undefined ? { teamKey: payload.teamKey } : {}) });
    if (attempt !== connectionAttempt) return;
    const state = client.getState();
    if (state.connection === 'connected' && state.room) {
      session = { action: payload.action, name: payload.name.trim(), roomId: state.room.roomId,
        memberId: state.memberId, serviceUrl: state.serviceUrl };
      publish(state);
    }
  });
  async function commandWithConsent(command, displayedContext) {
    const before = observe(client.getState());
    const eligible = contextKey && (command.type === 'ready' ? !before.localIsHost && command.ready === true : before.localIsHost);
    // A click must refer to the roster and settings the local App displayed.
    if (eligible && displayedContext !== contextVersion) throw new StaleConsentError('房間狀態已變更，請重新確認');
    const afterVersion = before.room?.resultVersion;
    revokeConsent();
    const epoch = consentEpoch;
    publish(client.getState());
    const ack = await client.command(command);
    const state = client.getState();
    const current = observe(state);
    if (!eligible || epoch !== consentEpoch) return;
    const confirmed = inspect({ ...state, room: ack });
    if (confirmed.key !== contextKey) return;
    if (command.type === 'ready' && current.member?.ready && confirmed.member?.ready) {
      consent = { kind: 'guest', afterVersion };
    } else if (command.type === 'draw' && ack?.result && !ack.result.archived &&
      ack.result.version === afterVersion + 1 && JSON.stringify(ack.result) === JSON.stringify(current.room?.result)) {
      consent = { kind: 'host', result: JSON.stringify(ack.result) };
    }
    publish(state);
  }
  register('sync-room:command', (payload) => {
    if (!payload || typeof payload !== 'object') throw new Error('invalid');
    switch (payload.type) {
      case 'approve': case 'remove': return client.command({ type: payload.type, memberId: payload.memberId });
      case 'add-manual': return client.command({ type: 'add-manual', name: payload.name });
      case 'ready':
        if (typeof payload.ready !== 'boolean') throw new Error('invalid');
        return commandWithConsent({ type: 'ready', ready: payload.ready }, payload.consentContext);
      case 'sync-lobby': return client.command({ type: 'sync-lobby', names: payload.names });
      case 'draw-settings': return client.command({ type: 'draw-settings', drawMode: payload.drawMode, preferences: payload.preferences, revision: payload.revision });
      case 'draw': return commandWithConsent({ type: 'draw', revision: payload.revision }, payload.consentContext);
      case 'leave': case 'close':
        revokeConsent();
        publish(client.getState());
        return client.command({ type: payload.type });
      default: throw new Error('invalid');
    }
  });
  register('sync-room:disconnect', () => {
    connectionAttempt += 1;
    session = null;
    revokeConsent();
    return client.disconnect();
  });
  return {
    client, revokeConsent,
    getAuthorizedResult(resultId, name) {
      const result = authorizedResult(client.getState());
      return result?.id === resultId && name === session?.name ? result : null;
    }
  };
}
