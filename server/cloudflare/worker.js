import { roomForMember, roomReplyForMember } from '../../src/domain/roomVisibility.js';
import { createRoom, reduceRoom } from '../../src/domain/syncRoom.js';
import { discoveryTtlMs, isTeamKey, selectRoom, teamKey } from '../../src/domain/roomDiscovery.js';

const allowedCommands = new Set(['approve', 'ready', 'draw', 'leave', 'close', 'remove', 'add-manual', 'sync-lobby', 'draw-settings']);
const validRequestId = value => Number.isSafeInteger(value) && value > 0;
const roomPath = /^\/rooms\/([A-Fa-f0-9]{10})$/;
const encoder = new TextEncoder();
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const hashToken = async token => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token))));
const ackKey = (hash, id) => `ack:${hash}:${id}`;
const option = (env, key, fallback) => {
  const value = Number(env[key]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
};
const indexStub = (env, key) => env.TEAM_INDEX.get(env.TEAM_INDEX.idFromName(key));

async function readTeamKey(request) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const buffer = new Uint8Array(64);
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (size + value.length > buffer.length) { await reader.cancel(); return null; }
    buffer.set(value, size);
    size += value.length;
  }
  const key = new TextDecoder().decode(buffer);
  return size === 64 && isTeamKey(key) ? key : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health' && !url.search) {
      return Response.json({ ok: true, protocol: 1 }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const lookup = url.pathname === '/rooms/lookup' && request.method === 'POST' && !url.search;
    const match = roomPath.exec(url.pathname);
    if (!lookup && (!match || url.search || request.method !== 'GET')) return new Response('Not found', { status: 404 });
    if (request.headers.has('Origin')) return new Response('Native clients only', { status: 403 });
    if (!lookup && request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
    if (!env.ROOM_CONNECTION_LIMITER?.limit) return new Response('Connection limiter unavailable', { status: 503 });
    try {
      const { success } = await env.ROOM_CONNECTION_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
      if (!success) return new Response('Too many connection attempts', { status: 429, headers: { 'Retry-After': '60' } });
    } catch { return new Response('Connection limiter unavailable', { status: 503 }); }
    if (lookup) {
      if (!env.TEAM_INDEX) return new Response('Lookup unavailable', { status: 503 });
      const key = await readTeamKey(request);
      if (!key) return new Response('Invalid lookup', { status: 400 });
      return indexStub(env, key).fetch('https://team-index/lookup', { method: 'POST' });
    }
    const roomId = match[1].toUpperCase();
    return env.SYNC_ROOMS.get(env.SYNC_ROOMS.idFromName(roomId)).fetch(request);
  }
};

export class TeamIndexDurableObject {
  constructor(ctx) { this.storage = ctx.storage; }

  async fetch(request) {
    const operation = new URL(request.url).pathname;
    if (operation === '/lookup') {
      const entries = await this.storage.get('rooms') || {};
      return Response.json(selectRoom(entries, Date.now()), { headers: { 'Cache-Control': 'no-store' } });
    }
    const { roomId, expiresAt } = await request.json();
    await this.storage.transaction(async txn => {
      const now = Date.now();
      const entries = Object.fromEntries(Object.entries(await txn.get('rooms') || {}).filter(([, until]) => until > now));
      if (expiresAt > now) entries[roomId] = expiresAt;
      else delete entries[roomId];
      await this.store(txn, entries);
    });
    return new Response(null, { status: 204 });
  }

  async store(txn, entries) {
    const expires = Object.values(entries);
    if (expires.length) {
      await txn.put('rooms', entries);
      await txn.setAlarm(Math.min(...expires));
    } else {
      await txn.delete('rooms');
      await txn.deleteAlarm();
    }
  }

  async alarm() {
    await this.storage.transaction(async txn => {
      const now = Date.now();
      const entries = Object.fromEntries(Object.entries(await txn.get('rooms') || {}).filter(([, until]) => until > now));
      await this.store(txn, entries);
    });
  }
}

// Plain Durable Object class is intentional: this module also runs in workerd /
// Miniflare. Sessions survive hibernation; only SHA-256 token hashes are stored.
export class SyncRoomDurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.queue = Promise.resolve();
    this.data = null;
    this.closedUntil = null;
    this.ttl = option(env, 'ROOM_TTL_MS', 2 * 60 * 60 * 1000);
    this.hostGrace = option(env, 'HOST_DISCONNECT_GRACE_MS', 60000);
    this.handshakeTimeout = option(env, 'HANDSHAKE_TIMEOUT_MS', 10000);
    // Static text heartbeat replies do not wake hibernating objects or extend
    // room activity, so idle rooms still expire even while sockets stay healthy.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
    ctx.blockConcurrencyWhile(async () => {
      this.data = await ctx.storage.get('room') || null;
      this.closedUntil = await ctx.storage.get('closedUntil') || null;
      if (!this.data) return;
      const next = structuredClone(this.data);
      const sockets = ctx.getWebSockets();
      let changed = false;
      for (const [hash, session] of Object.entries(next.sessions)) {
        if (session.connectionId && !sockets.some(socket => {
          const attached = socket.deserializeAttachment();
          return attached?.connectionId === session.connectionId && attached.sessionHash === hash;
        })) {
          session.connectionId = null;
          next.state = reduceRoom(next.state, session.memberId, { type: 'connection', connected: false });
          if (session.memberId === next.state.hostId) next.hostDisconnectedAt ??= Date.now();
          changed = true;
        }
      }
      if (changed) {
        await this.save(next);
        if (next.hostDisconnectedAt != null) await this.updateIndex(next, 0);
      }
    });
  }
  serial(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }
  send(socket, value) {
    try { if (socket.readyState === 1) socket.send(JSON.stringify(value)); }
    catch { /* The close/error event handles connection state. */ }
  }
  close(socket, code = 1000, reason = 'Room ended') {
    // Hibernating sockets must reply to a peer close even when already CLOSING.
    try { if (socket.readyState !== 3) socket.close(code, reason); } catch { /* Already closed. */ }
  }
  currentSession(socket, data = this.data) {
    const attached = socket.deserializeAttachment();
    const session = data?.sessions[attached?.sessionHash];
    return session?.connectionId === attached?.connectionId ? session : null;
  }
  broadcast() {
    if (!this.data) return;
    for (const socket of this.ctx.getWebSockets()) {
      const session = this.currentSession(socket);
      if (session) this.send(socket, { type: 'state', room: roomForMember(this.data.state, session.memberId) });
    }
  }
  deadline(data = this.data) {
    const times = [];
    if (this.closedUntil != null) times.push(this.closedUntil);
    if (data) {
      times.push(data.lastActive + this.ttl);
      if (data.hostDisconnectedAt != null) times.push(data.hostDisconnectedAt + this.hostGrace);
    }
    for (const socket of this.ctx.getWebSockets()) {
      const attached = socket.deserializeAttachment();
      if (socket.readyState === 1 && attached && !attached.sessionHash) times.push(attached.acceptedAt + this.handshakeTimeout);
    }
    return times.length ? Math.max(Date.now() + 1, Math.min(...times)) : null;
  }
  async schedule() {
    const deadline = this.deadline();
    if (deadline == null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(deadline);
  }
  async save(next, { writes = [], deletes = [] } = {}) {
    await this.ctx.storage.transaction(async txn => {
      await txn.put('room', next);
      for (const [key, value] of writes) await txn.put(key, value);
      for (let index = 0; index < deletes.length; index += 128) await txn.delete(deletes.slice(index, index + 128));
    });
    this.data = next;
    await this.schedule();
  }
  async updateIndex(data, expiresAt = data?.indexedUntil) {
    if (!this.env.TEAM_INDEX || !data?.teamKey) return;
    try {
      await indexStub(this.env, data.teamKey).fetch('https://team-index/update', {
        method: 'POST', body: JSON.stringify({ roomId: data.state.roomId, expiresAt })
      });
    } catch { /* Room operation and invitation remain available if the index fails. */ }
  }
  async end(message, replySocket, reply) {
    const closedUntil = Date.now() + this.ttl;
    // Revoke every session and acknowledgement atomically while retaining only
    // a non-personal tombstone, so a recent invitation cannot be taken over.
    await this.ctx.storage.transaction(async txn => {
      const keys = Array.from((await txn.list()).keys());
      for (let index = 0; index < keys.length; index += 128) await txn.delete(keys.slice(index, index + 128));
      await txn.put('closedUntil', closedUntil);
    });
    const closedRoom = this.data;
    this.data = null;
    this.closedUntil = closedUntil;
    await this.schedule();
    if (reply) this.send(replySocket, reply);
    for (const socket of this.ctx.getWebSockets()) {
      this.send(socket, { type: 'ended', message });
      this.close(socket);
    }
    if (closedRoom?.hostDisconnectedAt == null && closedRoom?.indexedUntil > Date.now()) await this.updateIndex(closedRoom, 0);
  }
  async expire(now = Date.now()) {
    if (this.closedUntil != null && now >= this.closedUntil) {
      await this.ctx.storage.delete('closedUntil');
      this.closedUntil = null;
    }
    if (!this.data) return false;
    if (this.data.hostDisconnectedAt != null && now - this.data.hostDisconnectedAt >= this.hostGrace) {
      await this.end('主持人離線超過期限，房間已關閉'); return true;
    }
    if (now - this.data.lastActive >= this.ttl) {
      await this.end('房間閒置已到期，請重新建立'); return true;
    }
    return false;
  }
  fetch(request) {
    return this.serial(async () => {
      const url = new URL(request.url);
      const match = roomPath.exec(url.pathname);
      if (!match || url.search || request.method !== 'GET' || request.headers.has('Origin')) return new Response('Forbidden', { status: 403 });
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
      await this.expire();
      if (this.ctx.getWebSockets().filter(socket => socket.readyState === 1).length >= 10) return new Response('Too many connections', { status: 429 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const now = Date.now();
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ connectionId: crypto.randomUUID(), roomId: match[1].toUpperCase(), sessionHash: null,
        acceptedAt: now, rateStart: now, rateCount: 0 });
      await this.schedule();
      return new Response(null, { status: 101, webSocket: client });
    });
  }
  webSocketMessage(socket, message) {
    return this.serial(async () => {
      let request;
      try {
        if (await this.expire()) return;
        if (typeof message !== 'string') { this.close(socket, 1003, 'Text messages only'); return; }
        if (encoder.encode(message).byteLength > 8192) { this.close(socket, 1009, 'Message too large'); return; }
        const attached = socket.deserializeAttachment();
        if (!attached) { this.close(socket, 1008, 'Invalid connection'); return; }
        const now = Date.now();
        if (!attached.sessionHash && now - attached.acceptedAt >= this.handshakeTimeout) { this.close(socket, 1008, 'Handshake required'); return; }
        if (now - attached.rateStart >= 1000) { attached.rateStart = now; attached.rateCount = 0; }
        if (++attached.rateCount > 30) { this.close(socket, 1008, 'Rate limit'); return; }
        socket.serializeAttachment(attached);
        request = JSON.parse(message);
        if (!request || typeof request !== 'object' || !validRequestId(request.requestId)) throw new Error('訊息格式錯誤');
        if (!attached.sessionHash) await this.handshake(socket, attached, request, now);
        else await this.command(socket, attached, request, now);
      } catch (error) {
        const message = error instanceof SyntaxError ? '訊息格式錯誤' :
          (error instanceof Error && /^[\u3400-\u9fff]/u.test(error.message) ? error.message : '房間操作失敗，請稍後再試');
        this.send(socket, { type: 'ack', requestId: validRequestId(request?.requestId) ? request.requestId : null, ok: false, message });
      }
    });
  }
  async handshake(socket, attached, request, now) {
    const { type, requestId } = request;
    if (!['create', 'join', 'resume'].includes(type)) throw new Error('請先建立或加入房間');
    if (this.closedUntil != null) throw new Error(type === 'resume' ? '房間連線已失效，請重新加入' : '房間已關閉，請使用新的房間代碼');
    if ((request.roomId != null || request.handshakeToken !== undefined) && request.roomId !== attached.roomId) {
      throw new Error('房間代碼與連線路徑不符');
    }
    let next = this.data ? structuredClone(this.data) : null;
    const resuming = type === 'resume';
    const token = resuming ? request.token : request.handshakeToken === undefined ? randomToken() : request.handshakeToken;
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      throw new Error(resuming ? '房間連線已失效，請重新加入' : '房間憑證格式錯誤');
    }
    const hash = await hashToken(token);
    let session = next?.sessions[hash];
    const restoringHost = Boolean(session && next.hostDisconnectedAt != null && session.memberId === next.state.hostId);
    if (resuming || session) {
      if (!session) throw new Error('房間連線已失效，請重新加入');
      if (!resuming && (session.handshakeType !== type || session.handshakeName !== request.name)) throw new Error('房間憑證與原始操作不符');
      next.state = reduceRoom(next.state, session.memberId, { type: 'connection', connected: false });
      next.state = reduceRoom(next.state, session.memberId, { type: 'connection', connected: true });
      session.connectionId = attached.connectionId;
      session.lastRequestId = Math.max(session.lastRequestId, requestId);
      if (session.memberId === next.state.hostId) next.hostDisconnectedAt = null;
    } else {
      const memberId = crypto.randomUUID();
      if (type === 'create') {
        if (next) throw new Error('房間代碼已使用，請重新建立房間');
        next = { state: createRoom({ roomId: attached.roomId, hostId: memberId, hostName: request.name }, now), lastActive: now,
          hostDisconnectedAt: null, sessions: {} };
      } else {
        if (!next) throw new Error('找不到房間，請確認房間代碼');
        if (request.teamKey !== undefined && (!isTeamKey(request.teamKey) || next.teamKey !== request.teamKey ||
          !(next.indexedUntil > now) || next.hostDisconnectedAt != null)) throw new Error('隊伍房間已變更，請使用邀請加入');
        next.state = reduceRoom(next.state, memberId, { type: 'join', memberId, name: request.name });
      }
      session = { memberId, connectionId: attached.connectionId, lastRequestId: requestId, replyIds: [],
        handshakeType: type, handshakeName: request.name };
      next.sessions[hash] = session;
    }
    next.lastActive = now;
    await this.save(next);
    if (restoringHost && next.indexedUntil > now) await this.updateIndex(next);
    socket.serializeAttachment({ ...attached, sessionHash: hash });
    // Replacement is committed before closing the previous socket, so its close
    // handler cannot mark the newly resumed member as disconnected.
    for (const other of this.ctx.getWebSockets()) {
      if (other !== socket && other.deserializeAttachment()?.sessionHash === hash) this.close(other, 4001, 'Session resumed');
    }
    await this.schedule();
    this.send(socket, { type: 'ack', requestId, ok: true, ...(!resuming ? { token } : {}), memberId: session.memberId, room: roomForMember(next.state, session.memberId) });
    this.broadcast();
  }
  async command(socket, attached, request, now) {
    if (!this.currentSession(socket)) throw new Error('連線已失效');
    const next = structuredClone(this.data);
    const session = next.sessions[attached.sessionHash];
    const { requestId, type } = request;
    if (session.replyIds.includes(requestId)) {
      const saved = await this.ctx.storage.get(ackKey(attached.sessionHash, requestId));
      if (saved) { this.send(socket, roomReplyForMember(saved, next.state, session.memberId)); return; }
    }
    if (requestId <= session.lastRequestId) throw new Error('操作已過期，請確認目前房間狀態');
    session.lastRequestId = requestId;
    let reply;
    try {
      if (!allowedCommands.has(type)) throw new Error('不支援的房間操作');
      if (type !== 'leave' && roomForMember(next.state, session.memberId).pendingApproval) throw new Error('請等待主持人核准加入');
      const command = type === 'add-manual'
        ? { type, memberId: crypto.randomUUID(), name: request.name }
        : { type, memberId: request.memberId, ready: request.ready, names: request.names, revision: request.revision, drawMode: request.drawMode, preferences: request.preferences };
      next.state = reduceRoom(next.state, session.memberId, command, { now, createMemberId: () => crypto.randomUUID() });
      next.lastActive = now;
      reply = { type: 'ack', requestId, ok: true, room: roomForMember(next.state, session.memberId) };
    } catch (error) { reply = { type: 'ack', requestId, ok: false, message: error.message }; }
    if (reply.ok && next.state.closed) {
      await this.end('主持人已關閉房間', socket, reply); return;
    }
    const deletes = [];
    const removedHashes = [];
    if (reply.ok && (type === 'remove' || type === 'leave')) {
      const removedId = type === 'leave' ? session.memberId : request.memberId;
      for (const [hash, removed] of Object.entries(next.sessions)) if (removed.memberId === removedId) {
        removedHashes.push(hash);
        deletes.push(...removed.replyIds.map(id => ackKey(hash, id)));
        delete next.sessions[hash];
      }
    }
    const writes = [];
    if (next.sessions[attached.sessionHash]) {
      session.replyIds.push(requestId);
      if (session.replyIds.length > 128) deletes.push(ackKey(attached.sessionHash, session.replyIds.shift()));
      writes.push([ackKey(attached.sessionHash, requestId), reply]);
    }
    const previous = this.data;
    if (reply.ok && type === 'sync-lobby' && this.env.TEAM_INDEX) {
      next.teamKey = await teamKey(next.state.members.map(member => member.name), hashToken);
      next.indexedUntil = next.teamKey ? now + option(this.env, 'TEAM_INDEX_TTL_MS', discoveryTtlMs) : null;
    }
    await this.save(next, { writes, deletes });
    if (reply.ok && type === 'sync-lobby') {
      if (previous.teamKey !== next.teamKey && previous.indexedUntil > now) await this.updateIndex(previous, 0);
      if (next.teamKey) await this.updateIndex(next);
    }
    this.send(socket, reply);
    for (const other of this.ctx.getWebSockets()) if (removedHashes.includes(other.deserializeAttachment()?.sessionHash)) {
      this.send(other, { type: 'ended', message: type === 'leave' ? '已離開房間' : '主持人已將你移出房間' });
      this.close(other);
    }
    if (reply.ok) this.broadcast();
  }
  disconnected(socket) {
    return this.serial(async () => {
      const session = this.currentSession(socket);
      if (!session) { await this.schedule(); return; }
      const next = structuredClone(this.data);
      next.sessions[socket.deserializeAttachment().sessionHash].connectionId = null;
      next.state = reduceRoom(next.state, session.memberId, { type: 'connection', connected: false });
      if (session.memberId === next.state.hostId) next.hostDisconnectedAt = Date.now();
      await this.save(next);
      if (session.memberId === next.state.hostId && next.indexedUntil > Date.now()) await this.updateIndex(next, 0);
      this.broadcast();
    });
  }
  webSocketClose(socket) { this.close(socket); return this.disconnected(socket); }
  webSocketError(socket) { this.close(socket, 1011, 'Connection error'); return this.disconnected(socket); }
  alarm() {
    return this.serial(async () => {
      if (await this.expire()) return;
      const now = Date.now();
      for (const socket of this.ctx.getWebSockets()) {
        const attached = socket.deserializeAttachment();
        if (attached && !attached.sessionHash && now - attached.acceptedAt >= this.handshakeTimeout) this.close(socket, 1008, 'Handshake required');
      }
      await this.schedule();
    });
  }
}
