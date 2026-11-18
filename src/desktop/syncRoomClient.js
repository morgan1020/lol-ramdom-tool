import { createHash, randomBytes } from 'node:crypto';
import { validateRoomServiceUrl } from '../domain/roomInvitation.js';
import { isTeamKey, teamKey } from '../domain/roomDiscovery.js';
import { isRoomPlayerReady } from '../domain/syncRoom.js';

const actions = new Set(['approve', 'ready', 'draw', 'leave', 'close', 'remove', 'add-manual', 'sync-lobby', 'draw-settings']);
const roles = new Set(['上路', '打野', '中路', '下路', '輔助']);
const isId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const isCount = value => Number.isSafeInteger(value) && value >= 0;
class RoomTransportError extends Error {}
const isName = value => typeof value === 'string' && value.length <= 200 && value === value.trim() &&
  value.split('#').length === 2 && value.split('#').every(part => part && part === part.trim()) && !/[\u0000-\u001f\u007f]/u.test(value);

export function validateRoomSnapshot(room) {
  const invalid = () => { throw new Error('房間狀態格式錯誤'); };
  if (room?.pendingApproval === true && isId(room.roomId) && isCount(room.revision)) {
    return { roomId: room.roomId, revision: room.revision, pendingApproval: true };
  }
  if (!room || !isId(room.roomId) || !isId(room.hostId) || !isCount(room.revision) || !isCount(room.createdAt) ||
    (room.lobbySynced !== undefined && room.lobbySynced !== true) ||
    !isCount(room.resultVersion) || typeof room.closed !== 'boolean' || !Array.isArray(room.members) ||
    room.members.length > 5 || (!room.closed && !room.members.length)) invalid();
  const members = room.members.map(member => {
    if (!member || !isId(member.id) || !isName(member.name) ||
      ['approved', 'ready', 'connected'].some(key => typeof member[key] !== 'boolean') ||
      (member.ready && (!member.approved || !member.connected)) ||
      (member.manual !== undefined && (member.manual !== true || member.connected || !member.approved))) invalid();
    return { id: member.id, name: member.name, approved: member.approved, ready: member.ready, connected: member.connected, ...(member.manual ? { manual: true } : {}) };
  });
  if (new Set(members.map(member => member.id)).size !== members.length ||
    new Set(members.map(member => member.name.toLowerCase())).size !== members.length ||
    (!room.closed && !members.some(member => member.id === room.hostId && member.approved && !member.manual))) invalid();
  const pending = room.pendingMembers === undefined ? [] : room.pendingMembers;
  if (!Array.isArray(pending) || pending.length > 4) invalid();
  const pendingMembers = pending.map(member => {
    if (!isId(member?.id) || !isName(member?.name) || typeof member.connected !== 'boolean' || members.some(entry => entry.id === member.id)) invalid();
    return { id: member.id, name: member.name, approved: false, ready: false, connected: member.connected };
  });
  if (new Set(pendingMembers.map(member => member.id)).size !== pendingMembers.length ||
    new Set(pendingMembers.map(member => member.name.toLowerCase())).size !== pendingMembers.length) invalid();
  const readPreferences = (value, names) => {
    if (value === undefined) return {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
    const entries = Object.entries(value);
    if (entries.some(([name, role]) => !names.includes(name) || !roles.has(role)) || new Set(entries.map(([, role]) => role)).size !== entries.length) invalid();
    return Object.fromEntries(entries);
  };
  const drawMode = room.drawMode === undefined ? 'random' : room.drawMode;
  if (!['random', 'client', 'custom'].includes(drawMode)) invalid();
  const preferences = readPreferences(room.preferences, members.map(member => member.name));
  if (drawMode === 'random' && Object.keys(preferences).length) invalid();
  let result = null;
  if (room.result !== null) {
    const value = room.result;
    if (!value || room.closed || !isCount(value.version) || value.version < 1 || value.version !== room.resultVersion ||
      value.id !== `${room.roomId}:${value.version}` || !isCount(value.createdAt) || !Array.isArray(value.results) ||
      value.results.length < 1 || value.results.length > 5 ||
      (value.archived !== undefined && value.archived !== true) ||
      (!value.archived && (value.results.length !== members.length || !members.every(member => isRoomPlayerReady(member, room.hostId))))) invalid();
    const results = value.results.map(assignment => {
      if (!assignment || !isName(assignment.name) || (!value.archived && !members.some(member => member.name === assignment.name)) || !roles.has(assignment.main) ||
        !(assignment.secondary === '' || (roles.has(assignment.secondary) && assignment.secondary !== assignment.main))) invalid();
      return { name: assignment.name, main: assignment.main, secondary: assignment.secondary };
    });
    if (new Set(results.map(item => item.name)).size !== results.length || new Set(results.map(item => item.main)).size !== results.length) invalid();
    const resultPreferences = readPreferences(value.preferences, results.map(item => item.name));
    if (Object.entries(resultPreferences).some(([name, role]) => results.find(item => item.name === name).main !== role)) invalid();
    result = { id: value.id, version: value.version, createdAt: value.createdAt, results, preferences: resultPreferences, ...(value.archived ? { archived: true } : {}) };
  }
  return { roomId: room.roomId, hostId: room.hostId, revision: room.revision, createdAt: room.createdAt,
    resultVersion: room.resultVersion, closed: room.closed, members, result, drawMode, preferences,
    ...(pendingMembers.length ? { pendingMembers } : {}), ...(room.lobbySynced ? { lobbySynced: true } : {}) };
}

function publicError(value) {
  return typeof value === 'string' && value.length <= 200 ? value.replace(/[\u0000-\u001f\u007f]/gu, '') : '房間操作失敗，請確認連線與房間狀態';
}

export function validateSyncRoomUrl(value) {
  return validateRoomServiceUrl(value);
}

export async function discoverSyncRoom(url, names, { fetchImpl = fetch } = {}) {
  const key = teamKey(names, value => createHash('sha256').update(value).digest('hex'));
  if (!key) return { status: 'missing' };
  const endpoint = new URL(validateSyncRoomUrl(url));
  endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
  endpoint.pathname = endpoint.pathname.replace(/\/$/u, '') + '/lookup';
  const response = await fetchImpl(endpoint, {
    method: 'POST', body: key, redirect: 'error', signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error('無法查詢目前隊伍');
  const match = await response.json();
  if (match?.status === 'found' && /^[A-F0-9]{10}$/.test(match.roomId)) return { status: 'found', roomId: match.roomId, teamKey: key };
  if (match?.status === 'missing' || match?.status === 'ambiguous') return { status: match.status };
  throw new Error('找房回應格式錯誤');
}

export class SyncRoomClient {
  constructor({ onState = () => {}, WebSocketImpl = globalThis.WebSocket, requestTimeoutMs = 8000,
    reconnectDelayMs = 500, maxReconnectAttempts = 5, heartbeatIntervalMs = 25000, heartbeatTimeoutMs = 10000 } = {}) {
    this.onState = onState;
    this.WebSocketImpl = WebSocketImpl;
    this.requestTimeoutMs = requestTimeoutMs;
    this.reconnectDelayMs = reconnectDelayMs;
    this.maxReconnectAttempts = maxReconnectAttempts;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.heartbeatTimeoutMs = heartbeatTimeoutMs;
    this.heartbeatTimer = null;
    this.heartbeatDeadline = null;
    this.state = { connection: 'disconnected', memberId: null, room: null, error: '', serviceUrl: '' };
    this.pending = new Map();
    this.sequence = 0;
    this.generation = 0;
    this.token = null;
    this.resumeAdmission = false;
    this.socket = null;
    this.reconnectTimer = null;
    this.attempts = 0;
    this.connectOperation = 0;
  }
  getState() { return structuredClone(this.state); }
  emit(patch) { this.state = { ...this.state, ...patch }; this.onState(this.getState()); }
  rejectPending(message) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(message)); }
    this.pending.clear();
  }
  clearHeartbeat() {
    clearInterval(this.heartbeatTimer); this.heartbeatTimer = null;
    clearTimeout(this.heartbeatDeadline); this.heartbeatDeadline = null;
  }
  startHeartbeat(socket, generation) {
    const current = () => generation === this.generation && this.socket === socket;
    if (!current()) return;
    this.clearHeartbeat();
    const lost = () => {
      if (!current()) return;
      // A half-open connection may never emit close. Retire its generation first.
      this.generation++;
      this.clearHeartbeat();
      this.socket = null;
      this.rejectPending('房間心跳逾時，連線中斷；操作不會自動重送，請確認結果');
      if (this.token) this.scheduleReconnect();
      else this.emit({ connection: 'disconnected' });
      try { socket.close(); } catch { /* The retired socket cannot affect the new session. */ }
    };
    this.heartbeatTimer = setInterval(() => {
      if (!current() || this.heartbeatDeadline) return;
      if (socket.readyState !== 1) { lost(); return; }
      this.heartbeatDeadline = setTimeout(lost, this.heartbeatTimeoutMs);
      this.heartbeatDeadline.unref?.();
      try { socket.send('{"type":"ping"}'); } catch { lost(); }
    }, this.heartbeatIntervalMs);
    this.heartbeatTimer.unref?.();
  }
  disconnect() {
    this.connectOperation++;
    this.generation++;
    clearTimeout(this.reconnectTimer); this.reconnectTimer = null;
    this.clearHeartbeat();
    this.token = null; this.url = null;
    this.resumeAdmission = false;
    this.expectedRoomId = null;
    this.rejectPending('已中斷房間連線');
    const socket = this.socket; this.socket = null;
    if (socket && socket.readyState < 2) socket.close();
    this.emit({ connection: 'disconnected', memberId: null, room: null, error: '' });
    return this.getState();
  }
  destroy() { this.disconnect(); this.onState = () => {}; }
  async connect({ url, action, roomId, name, teamKey } = {}) {
    let target;
    let requestedRoomId;
    let socketUrl;
    try {
      target = validateSyncRoomUrl(url);
      if (!['create', 'join'].includes(action)) throw new Error('請選擇建立或加入房間');
      if (teamKey !== undefined && (action !== 'join' || !isTeamKey(teamKey))) throw new Error('找房資料格式錯誤');
      if (typeof name !== 'string' || !isName(name.trim())) throw new Error('請輸入完整 Riot ID');
      if (action === 'join' && (typeof roomId !== 'string' || !/^[A-Z0-9]{6,16}$/i.test(roomId.trim()))) throw new Error('請輸入有效房間代碼');
      const parsed = new URL(target);
      if (parsed.pathname === '/rooms') {
        parsed.pathname = '/rooms';
        target = parsed.href;
        requestedRoomId = action === 'create' ? randomBytes(5).toString('hex').toUpperCase() : roomId.trim().toUpperCase();
        if (!/^[A-F0-9]{10}$/.test(requestedRoomId)) throw new Error('雲端房間代碼需為 10 位十六進位字元');
        parsed.pathname = `/rooms/${requestedRoomId}`;
      } else requestedRoomId = action === 'join' ? roomId.trim().toUpperCase() : undefined;
      socketUrl = parsed.href;
    } catch (error) { this.emit({ error: error.message }); throw error; }
    this.disconnect();
    const operation = ++this.connectOperation;
    this.url = socketUrl;
    this.expectedRoomId = requestedRoomId || null;
    this.attempts = 0;
    this.emit({ connection: 'connecting', serviceUrl: target });
    const handshake = { type: action, name: name.trim(), roomId: requestedRoomId, teamKey, handshakeToken: randomBytes(32).toString('hex') };
    try {
      if (operation !== this.connectOperation) throw new Error('房間連線已取代');
      try {
        await this.open(handshake);
      } catch (error) {
        if (!(error instanceof RoomTransportError) || operation !== this.connectOperation) throw error;
        const socket = this.socket;
        this.generation++;
        this.socket = null;
        this.rejectPending('房間連線已取代');
        if (socket?.readyState < 2) socket.close();
        await this.open(handshake);
      }
      if (operation !== this.connectOperation) throw new Error('房間連線已取代');
      return this.getState();
    } catch (error) {
      if (operation === this.connectOperation) { this.disconnect(); this.emit({ error: publicError(error.message) }); }
      throw error;
    }
  }
  request(payload) {
    if (!this.socket || this.socket.readyState !== 1) return Promise.reject(new RoomTransportError('房間尚未連線，請稍後再試'));
    const requestId = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new RoomTransportError('操作逾時，結果可能已生效，請確認房間狀態；不會自動重送'));
      }, this.requestTimeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      try { this.socket.send(JSON.stringify({ ...payload, requestId })); }
      catch { clearTimeout(timer); this.pending.delete(requestId); reject(new RoomTransportError('傳送失敗，請確認房間連線')); }
    });
  }
  open(handshake) {
    this.clearHeartbeat();
    const generation = ++this.generation;
    let socket;
    try {
      // Only cloud resumes use the native WebSocket header extension. The
      // original message handshake remains compatible with older services.
      const options = handshake.type === 'resume' && this.resumeAdmission && /^\/rooms\/[A-F0-9]{10}$/.test(new URL(this.url).pathname) &&
        /^[a-f0-9]{64}$/.test(handshake.token)
        ? { headers: { Authorization: `RoomResume ${handshake.token}` } }
        : undefined;
      socket = options ? new this.WebSocketImpl(this.url, options) : new this.WebSocketImpl(this.url);
    } catch { return Promise.reject(new RoomTransportError('無法建立同步服務連線')); }
    this.socket = socket;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true; clearTimeout(openTimer);
        if (error) reject(error); else resolve();
      };
      const current = () => generation === this.generation && this.socket === socket;
      const openTimer = setTimeout(() => { finish(new RoomTransportError('同步服務連線逾時')); socket.close(); }, this.requestTimeoutMs);
      socket.addEventListener('open', async () => {
        if (!current()) return;
        clearTimeout(openTimer);
        try {
          const reply = await this.request(handshake);
          if (!current() || settled) { finish(new Error('房間連線已取代')); return; }
          if (!isId(reply.memberId) || (!reply.room?.pendingApproval && !reply.room?.members?.some(member => member.id === reply.memberId))) throw new Error('房間身分格式錯誤');
          if (handshake.type !== 'resume' && (typeof reply.token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(reply.token))) throw new Error('房間憑證格式錯誤');
          const room = validateRoomSnapshot(reply.room);
          this.token = reply.token || this.token;
          this.resumeAdmission = reply.resumeAdmission === true;
          this.attempts = 0;
          this.emit({ connection: 'connected', memberId: reply.memberId, room, error: '' });
          this.startHeartbeat(socket, generation);
          finish();
        } catch (error) { finish(error); socket.close(); }
      });
      socket.addEventListener('message', (event) => {
        if (!current()) return;
        try {
          if (typeof event.data !== 'string' || event.data.length > 65536) throw new Error('同步服務訊息過大或格式錯誤');
          const reply = JSON.parse(event.data);
          if (reply.type === 'pong') {
            clearTimeout(this.heartbeatDeadline); this.heartbeatDeadline = null;
          } else if (reply.type === 'ack') {
            const pending = this.pending.get(reply.requestId);
            if (!pending) return;
            this.pending.delete(reply.requestId); clearTimeout(pending.timer);
            if (reply.ok) {
              try {
                if (reply.room) this.acceptRoom(reply.room);
                pending.resolve(reply);
              } catch (error) { pending.reject(error); throw error; }
            } else pending.reject(new Error(publicError(reply.message)));
          } else if (reply.type === 'state') this.acceptRoom(reply.room);
          else if (reply.type === 'ended') {
            this.clearHeartbeat();
            this.token = null;
            this.emit({ connection: 'disconnected', room: null, memberId: null, error: publicError(reply.message) });
            socket.close();
          }
        } catch (error) {
          const message = error instanceof SyntaxError ? '同步服務訊息格式錯誤' : publicError(error.message);
          this.emit({ error: message }); finish(new Error(message)); socket.close();
        }
      });
      socket.addEventListener('error', () => { if (current()) finish(new RoomTransportError('無法連線同步服務，請確認服務已啟動')); });
      socket.addEventListener('close', () => {
        if (!current()) { finish(new Error('房間連線已取代')); return; }
        this.clearHeartbeat();
        finish(new RoomTransportError('同步服務連線已中斷'));
        this.socket = null;
        this.rejectPending('房間連線中斷，操作不會自動重送，請確認結果');
        if (this.token) this.scheduleReconnect();
      });
    });
  }
  acceptRoom(room) {
    const snapshot = validateRoomSnapshot(room);
    if (this.expectedRoomId && snapshot.roomId !== this.expectedRoomId) throw new Error('同步服務回傳不同房間，已中止連線');
    const previous = this.state.room;
    if (previous?.roomId === room.roomId && previous.revision >= room.revision) return;
    this.emit({ room: snapshot });
  }
  scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (this.attempts >= this.maxReconnectAttempts) {
      this.emit({ connection: 'disconnected', error: '無法恢復房間連線，請離開後重新加入' }); return;
    }
    const delay = Math.min(this.reconnectDelayMs * (2 ** this.attempts++), 10000);
    this.emit({ connection: 'reconnecting', error: '連線中斷，正在重新連線；未確認的操作不會自動重送' });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.token) return;
      const operation = this.connectOperation;
      const token = this.token;
      void this.open({ type: 'resume', token }).catch((error) => {
        if (operation !== this.connectOperation || token !== this.token) return;
        this.emit({ error: error.message });
        this.scheduleReconnect();
      });
    }, delay);
  }
  async command(command) {
    const generation = this.generation;
    try {
      if (!command || !actions.has(command.type)) throw new Error('不支援的房間操作');
      if (this.state.connection !== 'connected') throw new Error('房間尚未連線，請稍後再試');
      const reply = await this.request(command.type === 'add-manual'
        ? { type: command.type, name: command.name }
        : { type: command.type, memberId: command.memberId, ready: command.ready, names: command.names, revision: command.revision, drawMode: command.drawMode, preferences: command.preferences });
      if (generation === this.generation) {
        if (command.type === 'leave' || command.type === 'close') this.disconnect();
        else this.emit({ error: '' });
      }
      return validateRoomSnapshot(reply.room);
    } catch (error) {
      if (generation === this.generation) this.emit({ error: publicError(error.message) });
      throw error;
    }
  }
}
