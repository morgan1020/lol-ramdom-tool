const actions = new Set(['approve', 'ready', 'draw', 'leave', 'close', 'remove']);
const roles = new Set(['上路', '打野', '中路', '下路', '輔助']);
const isId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const isCount = value => Number.isSafeInteger(value) && value >= 0;
const isName = value => typeof value === 'string' && value.length <= 200 && value === value.trim() &&
  value.split('#').length === 2 && value.split('#').every(part => part && part === part.trim()) && !/[\u0000-\u001f\u007f]/u.test(value);

export function validateRoomSnapshot(room) {
  const invalid = () => { throw new Error('房間狀態格式錯誤'); };
  if (!room || !isId(room.roomId) || !isId(room.hostId) || !isCount(room.revision) || !isCount(room.createdAt) ||
    !isCount(room.resultVersion) || typeof room.closed !== 'boolean' || !Array.isArray(room.members) ||
    room.members.length > 5 || (!room.closed && !room.members.length)) invalid();
  const members = room.members.map(member => {
    if (!member || !isId(member.id) || !isName(member.name) ||
      ['approved', 'ready', 'connected'].some(key => typeof member[key] !== 'boolean') ||
      (member.ready && (!member.approved || !member.connected))) invalid();
    return { id: member.id, name: member.name, approved: member.approved, ready: member.ready, connected: member.connected };
  });
  if (new Set(members.map(member => member.id)).size !== members.length ||
    new Set(members.map(member => member.name.toLowerCase())).size !== members.length ||
    (!room.closed && !members.some(member => member.id === room.hostId && member.approved))) invalid();
  let result = null;
  if (room.result !== null) {
    const value = room.result;
    if (!value || room.closed || !isCount(value.version) || value.version < 1 || value.version !== room.resultVersion ||
      value.id !== `${room.roomId}:${value.version}` || !isCount(value.createdAt) || !Array.isArray(value.results) ||
      value.results.length !== members.length || members.some(member => !member.approved || !member.connected || !member.ready)) invalid();
    const results = value.results.map(assignment => {
      if (!assignment || !members.some(member => member.name === assignment.name) || !roles.has(assignment.main) ||
        !(assignment.secondary === '' || (roles.has(assignment.secondary) && assignment.secondary !== assignment.main))) invalid();
      return { name: assignment.name, main: assignment.main, secondary: assignment.secondary };
    });
    if (new Set(results.map(item => item.name)).size !== results.length || new Set(results.map(item => item.main)).size !== results.length) invalid();
    result = { id: value.id, version: value.version, createdAt: value.createdAt, results };
  }
  return { roomId: room.roomId, hostId: room.hostId, revision: room.revision, createdAt: room.createdAt,
    resultVersion: room.resultVersion, closed: room.closed, members, result };
}

function publicError(value) {
  return typeof value === 'string' && value.length <= 200 ? value.replace(/[\u0000-\u001f\u007f]/gu, '') : '房間操作失敗，請確認連線與房間狀態';
}

export function validateSyncRoomUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('請輸入有效的同步服務網址'); }
  if (url.username || url.password || url.search || url.hash ||
    !(url.protocol === 'wss:' || (url.protocol === 'ws:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) {
    throw new Error('同步服務需使用 wss；只有本機 localhost 可使用 ws，網址不可包含帳密、查詢或片段');
  }
  return url.href;
}

export class SyncRoomClient {
  constructor({ onState = () => {}, WebSocketImpl = globalThis.WebSocket, requestTimeoutMs = 8000,
    reconnectDelayMs = 500, maxReconnectAttempts = 5 } = {}) {
    this.onState = onState;
    this.WebSocketImpl = WebSocketImpl;
    this.requestTimeoutMs = requestTimeoutMs;
    this.reconnectDelayMs = reconnectDelayMs;
    this.maxReconnectAttempts = maxReconnectAttempts;
    this.state = { connection: 'disconnected', memberId: null, room: null, error: '' };
    this.pending = new Map();
    this.sequence = 0;
    this.generation = 0;
    this.token = null;
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
  disconnect() {
    this.connectOperation++;
    this.generation++;
    clearTimeout(this.reconnectTimer); this.reconnectTimer = null;
    this.token = null; this.url = null;
    this.rejectPending('已中斷房間連線');
    const socket = this.socket; this.socket = null;
    if (socket && socket.readyState < 2) socket.close();
    this.emit({ connection: 'disconnected', memberId: null, room: null, error: '' });
    return this.getState();
  }
  destroy() { this.disconnect(); this.onState = () => {}; }
  async connect({ url, action, roomId, name } = {}) {
    let target;
    try {
      target = validateSyncRoomUrl(url);
      if (!['create', 'join'].includes(action)) throw new Error('請選擇建立或加入房間');
      if (typeof name !== 'string' || !isName(name.trim())) throw new Error('請輸入完整 Riot ID');
      if (action === 'join' && (typeof roomId !== 'string' || !/^[A-Z0-9]{6,16}$/i.test(roomId.trim()))) throw new Error('請輸入有效房間代碼');
    } catch (error) { this.emit({ error: error.message }); throw error; }
    this.disconnect();
    const operation = ++this.connectOperation;
    this.url = target;
    this.attempts = 0;
    this.emit({ connection: 'connecting' });
    try {
      await this.open({ type: action, name: name.trim(), roomId: roomId?.trim().toUpperCase() });
      return this.getState();
    } catch (error) {
      if (operation === this.connectOperation) { this.disconnect(); this.emit({ error: publicError(error.message) }); }
      throw error;
    }
  }
  request(payload) {
    if (!this.socket || this.socket.readyState !== 1) return Promise.reject(new Error('房間尚未連線，請稍後再試'));
    const requestId = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('操作逾時，結果可能已生效，請確認房間狀態；不會自動重送'));
      }, this.requestTimeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      try { this.socket.send(JSON.stringify({ ...payload, requestId })); }
      catch { clearTimeout(timer); this.pending.delete(requestId); reject(new Error('傳送失敗，請確認房間連線')); }
    });
  }
  open(handshake) {
    const generation = ++this.generation;
    let socket;
    try { socket = new this.WebSocketImpl(this.url); } catch { return Promise.reject(new Error('無法建立同步服務連線')); }
    this.socket = socket;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true; clearTimeout(openTimer);
        if (error) reject(error); else resolve();
      };
      const current = () => generation === this.generation && this.socket === socket;
      const openTimer = setTimeout(() => { finish(new Error('同步服務連線逾時')); socket.close(); }, this.requestTimeoutMs);
      socket.addEventListener('open', async () => {
        if (!current()) return;
        try {
          const reply = await this.request(handshake);
          if (!current()) return;
          if (!isId(reply.memberId) || !reply.room.members.some(member => member.id === reply.memberId)) throw new Error('房間身分格式錯誤');
          if (handshake.type !== 'resume' && (typeof reply.token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(reply.token))) throw new Error('房間憑證格式錯誤');
          const room = validateRoomSnapshot(reply.room);
          this.token = reply.token || this.token;
          this.attempts = 0;
          this.emit({ connection: 'connected', memberId: reply.memberId, room, error: '' });
          finish();
        } catch (error) { finish(error); socket.close(); }
      });
      socket.addEventListener('message', (event) => {
        if (!current()) return;
        try {
          if (typeof event.data !== 'string' || event.data.length > 65536) throw new Error('同步服務訊息過大或格式錯誤');
          const reply = JSON.parse(event.data);
          if (reply.type === 'ack') {
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
            this.token = null;
            this.emit({ connection: 'disconnected', room: null, memberId: null, error: publicError(reply.message) });
            socket.close();
          }
        } catch (error) {
          const message = error instanceof SyntaxError ? '同步服務訊息格式錯誤' : publicError(error.message);
          this.emit({ error: message }); finish(new Error(message)); socket.close();
        }
      });
      socket.addEventListener('error', () => { if (current()) finish(new Error('無法連線同步服務，請確認服務已啟動')); });
      socket.addEventListener('close', () => {
        if (!current()) { finish(new Error('房間連線已取代')); return; }
        finish(new Error('同步服務連線已中斷'));
        this.socket = null;
        this.rejectPending('房間連線中斷，操作不會自動重送，請確認結果');
        if (this.token) this.scheduleReconnect();
        else this.emit({ connection: 'disconnected' });
      });
    });
  }
  acceptRoom(room) {
    const snapshot = validateRoomSnapshot(room);
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
      const reply = await this.request({ type: command.type, memberId: command.memberId, ready: command.ready });
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
