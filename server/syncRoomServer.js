import { roomForMember, roomReplyForMember } from '../src/domain/roomVisibility.js';
import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { createRoom, reduceRoom } from '../src/domain/syncRoom.js';
import { discoveryTtlMs, isTeamKey, selectRoom, teamKey } from '../src/domain/roomDiscovery.js';

const commands = new Set(['approve', 'ready', 'draw', 'leave', 'close', 'remove', 'add-manual', 'sync-lobby', 'draw-settings']);
const roomCode = () => randomBytes(5).toString('hex').toUpperCase();
const validId = (id) => Number.isSafeInteger(id) && id > 0;
const hashTeam = value => createHash('sha256').update(value).digest('hex');

export async function createSyncRoomServer({ host = '127.0.0.1', port = 0, maxRooms = 100, maxConnections = 100,
  roomTtlMs = 2 * 60 * 60 * 1000, hostDisconnectGraceMs = 60000, handshakeTimeoutMs = 10000, heartbeatMs = 30000,
  indexTtlMs = discoveryTtlMs, now = Date.now, onDiscovery = () => {} } = {}) {
  const rooms = new Map();
  const sessions = new Map();
  const teamRooms = new Map();
  const lookupRates = new Map();
  const http = createServer(async (request, response) => {
    const reply = (status, data) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(data));
    };
    if (request.url !== '/sync/lookup' || request.method !== 'POST') return reply(404, {});
    if (stopping || request.headers.origin || request.headers['content-length'] !== '64') return reply(400, {});
    const time = now();
    const ip = request.socket.remoteAddress;
    const rate = lookupRates.get(ip) || { start: time, count: 0 };
    if (time - rate.start >= 60000) Object.assign(rate, { start: time, count: 0 });
    if (!lookupRates.has(ip) && lookupRates.size >= 1024) return reply(429, {});
    lookupRates.set(ip, rate);
    if (++rate.count > 60) return reply(429, {});
    try {
      let key = '';
      for await (const chunk of request) key += chunk.toString('utf8');
      if (!isTeamKey(key)) return reply(400, {});
      onDiscovery('lookup');
      const candidates = Object.fromEntries([...(teamRooms.get(key) || [])].filter(([id]) => {
        const entry = rooms.get(id);
        return entry && entry.hostDisconnectedAt == null && time - entry.lastActive < roomTtlMs;
      }));
      reply(200, selectRoom(candidates, time));
    } catch { if (!response.destroyed) reply(400, {}); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });
  let stopping = false;
  const send = (socket, value) => {
    if (!socket || socket.readyState !== 1) return;
    if (socket.bufferedAmount > 65536) { socket.terminate(); return; }
    socket.send(JSON.stringify(value));
  };
  const broadcast = (entry) => {
    for (const session of sessions.values()) if (session.roomId === entry.state.roomId && session.socket) {
      send(session.socket, { type: 'state', room: roomForMember(entry.state, session.memberId) });
    }
  };
  function removeRoom(roomId, message) {
    const entry = rooms.get(roomId);
    if (!entry) return;
    removeFromIndex(entry);
    for (const [token, session] of sessions) if (session.roomId === roomId) {
      send(session.socket, { type: 'ended', message });
      session.socket?.close(1000, 'Room ended');
      sessions.delete(token);
    }
    rooms.delete(roomId);
  }
  function removeFromIndex(entry) {
    const indexed = teamRooms.get(entry.teamKey);
    if (indexed?.delete(entry.state.roomId)) onDiscovery('delete');
    if (indexed && !indexed.size) teamRooms.delete(entry.teamKey);
  }
  function indexLobby(entry, key) {
    if (entry.teamKey !== key) removeFromIndex(entry);
    entry.teamKey = key;
    if (!key) return;
    if (!teamRooms.has(key)) teamRooms.set(key, new Map());
    teamRooms.get(key).set(entry.state.roomId, now() + indexTtlMs);
    onDiscovery('put');
  }
  function bind(socket, session) {
    const previous = session.socket;
    session.socket = socket;
    socket.session = session;
    if (previous && previous !== socket) previous.close(4001, 'Session resumed');
  }
  http.on('upgrade', (request, socket, head) => {
    // This prototype accepts native clients only; reject web-page cross-origin access.
    if (stopping || request.url !== '/sync' || request.headers.origin || wss.clients.size >= maxConnections) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws));
  });
  wss.on('connection', (socket) => {
    socket.alive = true;
    socket.on('pong', () => { socket.alive = true; });
    const timer = setTimeout(() => { if (!socket.session) socket.close(1008, 'Handshake required'); }, handshakeTimeoutMs);
    timer.unref();
    let rateStart = now();
    let rateCount = 0;
    socket.on('message', (raw, binary) => {
      let request;
      try {
        if (binary) throw new Error('不支援二進位訊息');
        if (now() - rateStart >= 1000) { rateStart = now(); rateCount = 0; }
        if (++rateCount > 30) { socket.close(1008, 'Rate limit'); return; }
        if (raw.toString() === '{"type":"ping"}') { send(socket, { type: 'pong' }); return; }
        request = JSON.parse(raw.toString());
        if (!request || typeof request !== 'object' || !validId(request.requestId)) throw new Error('訊息格式錯誤');
        const { requestId, type } = request;
        let session = socket.session;
        if (!session) {
          const handshake = type === 'create' || type === 'join';
          const token = handshake ? request.handshakeToken : undefined;
          if (token !== undefined && (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))) throw new Error('房間憑證格式錯誤');
          const requestedRoomId = typeof request.roomId === 'string' ? request.roomId.toUpperCase() : request.roomId;
          session = sessions.get(type === 'resume' ? request.token : token);
          if (type === 'resume' || session) {
            if (!session || !rooms.has(session.roomId)) throw new Error('房間連線已失效，請重新加入');
            if (handshake && (session.handshakeType !== type || session.handshakeName !== request.name ||
              session.requestedRoomId !== requestedRoomId)) throw new Error('房間憑證與原始操作不符');
            const entry = rooms.get(session.roomId);
            if (entry.state.closed) throw new Error('房間已關閉');
            // A resume may replace a still-open socket. Always withdraw readiness
            // before binding the replacement; the old socket's close is ignored.
            entry.state = reduceRoom(entry.state, session.memberId, { type: 'connection', connected: false });
            bind(socket, session);
            session.lastRequestId = Math.max(session.lastRequestId, requestId);
            entry.state = reduceRoom(entry.state, session.memberId, { type: 'connection', connected: true });
            if (session.memberId === entry.state.hostId) entry.hostDisconnectedAt = null;
            entry.lastActive = now();
            send(socket, { type: 'ack', requestId, ok: true, ...(handshake ? { token } : {}), memberId: session.memberId, room: roomForMember(entry.state, session.memberId) });
            broadcast(entry);
          } else if (handshake) {
            if (type === 'create' && rooms.size >= maxRooms) throw new Error('房間數量已滿，請稍後再試');
            const memberId = randomUUID();
            let entry;
            if (type === 'create') {
              let roomId;
              do { roomId = roomCode(); } while (rooms.has(roomId));
              entry = { state: createRoom({ roomId, hostId: memberId, hostName: request.name }, now()), lastActive: now() };
              rooms.set(roomId, entry);
            } else {
              entry = typeof request.roomId === 'string' ? rooms.get(request.roomId.toUpperCase()) : null;
              if (!entry) throw new Error('找不到房間，請確認房間代碼');
              if (request.teamKey !== undefined && (!isTeamKey(request.teamKey) || entry.teamKey !== request.teamKey ||
                !(teamRooms.get(entry.teamKey)?.get(entry.state.roomId) > now()) || entry.hostDisconnectedAt != null ||
                now() - entry.lastActive >= roomTtlMs)) throw new Error('隊伍房間已變更，請使用邀請加入');
              entry.state = reduceRoom(entry.state, memberId, { type: 'join', memberId, name: request.name });
              entry.lastActive = now();
            }
            const sessionToken = token ?? randomBytes(32).toString('base64url');
            session = { token: sessionToken, roomId: entry.state.roomId, memberId, socket: null, lastRequestId: requestId, replies: new Map(),
              handshakeType: type, handshakeName: request.name, requestedRoomId };
            sessions.set(sessionToken, session);
            bind(socket, session);
            send(socket, { type: 'ack', requestId, ok: true, token: sessionToken, memberId, room: roomForMember(entry.state, session.memberId) });
            broadcast(entry);
          } else throw new Error('請先建立或加入房間');
          clearTimeout(timer);
          return;
        }
        if (session.socket !== socket || !sessions.has(session.token)) throw new Error('連線已失效');
        if (session.replies.has(requestId)) { send(socket, roomReplyForMember(session.replies.get(requestId), rooms.get(session.roomId).state, session.memberId)); return; }
        if (requestId <= session.lastRequestId) throw new Error('操作已過期，請確認目前房間狀態');
        session.lastRequestId = requestId;
        let reply;
        const entry = rooms.get(session.roomId);
        try {
          if (!entry || entry.state.closed) throw new Error('房間已關閉');
          if (!commands.has(type)) throw new Error('不支援的房間操作');
          if (type !== 'leave' && roomForMember(entry.state, session.memberId).pendingApproval) throw new Error('請等待主持人核准加入');
          // Actor identity and connection commands can never be supplied by clients.
          const command = type === 'add-manual'
            ? { type, memberId: randomUUID(), name: request.name }
            : { type, memberId: request.memberId, ready: request.ready, names: request.names, revision: request.revision, drawMode: request.drawMode, preferences: request.preferences };
          const next = reduceRoom(entry.state, session.memberId, command, { now: now(), createMemberId: randomUUID });
          if (type === 'sync-lobby') {
            // Node's hash is synchronous so room mutation and index updates share one turn.
            indexLobby(entry, teamKey(next.members.map(member => member.name), hashTeam));
          }
          entry.state = next;
          entry.lastActive = now();
          reply = { type: 'ack', requestId, ok: true, room: roomForMember(entry.state, session.memberId) };
        } catch (error) { reply = { type: 'ack', requestId, ok: false, message: error.message }; }
        session.replies.set(requestId, reply);
        if (session.replies.size > 128) session.replies.delete(session.replies.keys().next().value);
        send(socket, reply);
        if (reply.ok) {
          broadcast(entry);
          if (entry.state.closed) removeRoom(entry.state.roomId, '主持人已關閉房間');
          else if (type === 'remove') {
            for (const [token, removed] of sessions) if (removed.roomId === session.roomId && removed.memberId === request.memberId) {
              send(removed.socket, { type: 'ended', message: '主持人已將你移出房間' });
              sessions.delete(token);
              removed.socket?.close(1000, 'Removed from room');
            }
          }
          else if (type === 'leave') {
            sessions.delete(session.token);
            socket.close(1000, 'Left room');
          }
        }
      } catch (error) {
        send(socket, { type: 'ack', requestId: validId(request?.requestId) ? request.requestId : null, ok: false, message: error instanceof SyntaxError ? '訊息格式錯誤' : error.message });
      }
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      clearTimeout(timer);
      const session = socket.session;
      if (!session || session.socket !== socket) return;
      session.socket = null;
      const entry = rooms.get(session.roomId);
      if (!entry || entry.state.closed || ![...entry.state.members, ...entry.state.pendingMembers].some(member => member.id === session.memberId)) return;
      entry.state = reduceRoom(entry.state, session.memberId, { type: 'connection', connected: false });
      if (session.memberId === entry.state.hostId) entry.hostDisconnectedAt = now();
      broadcast(entry);
    });
  });
  const sweep = setInterval(() => {
    for (const [ip, rate] of lookupRates) if (now() - rate.start >= 60000) lookupRates.delete(ip);
    for (const [key, entries] of teamRooms) {
      for (const [id, expiresAt] of entries) if (expiresAt <= now()) { entries.delete(id); onDiscovery('delete'); }
      if (!entries.size) teamRooms.delete(key);
    }
    for (const [id, entry] of rooms) {
      if (entry.hostDisconnectedAt != null && now() - entry.hostDisconnectedAt >= hostDisconnectGraceMs) {
        removeRoom(id, '主持人離線超過期限，房間已關閉');
      } else if (now() - entry.lastActive >= roomTtlMs) removeRoom(id, '房間閒置已到期，請重新建立');
    }
    for (const socket of wss.clients) {
      if (!socket.alive) socket.terminate();
      else { socket.alive = false; socket.ping(); }
    }
  }, heartbeatMs);
  sweep.unref();
  try { await new Promise((resolve, reject) => { http.once('error', reject); http.listen(port, host, resolve); }); }
  catch (error) { clearInterval(sweep); wss.close(); throw error; }
  return {
    url: `ws://${host.includes(':') ? `[${host}]` : host}:${http.address().port}/sync`,
    async close() {
      stopping = true; clearInterval(sweep);
      for (const socket of wss.clients) socket.terminate();
      await new Promise(resolve => wss.close(resolve));
      await new Promise(resolve => http.close(resolve));
      sessions.clear(); rooms.clear();
    }
  };
}
