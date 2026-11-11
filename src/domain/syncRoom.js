import { drawAssignments } from './draw.js';

function validateId(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error(`${label}格式錯誤`);
  }
  return value;
}

function validateName(value) {
  if (typeof value !== 'string') throw new Error('請提供完整 Riot ID（名稱#標籤）');
  const name = value.trim();
  const parts = name.split('#');
  if (name.length > 200 || parts.length !== 2 || parts.some((part) => !part.trim() || part !== part.trim()) || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new Error('請提供完整 Riot ID（名稱#標籤）');
  }
  return name;
}

function timestamp(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('房間時間格式錯誤');
  return value;
}

function invalidate(state) {
  state.result = null;
  for (const member of state.members) member.ready = false;
}

export function createRoom({ roomId, hostId, hostName }, now = Date.now()) {
  return {
    roomId: validateId(roomId, '房間代碼'),
    hostId: validateId(hostId, '成員識別'),
    revision: 0,
    createdAt: timestamp(now),
    members: [{ id: hostId, name: validateName(hostName), approved: true, ready: false, connected: true }],
    resultVersion: 0,
    result: null,
    closed: false
  };
}

// Authentication belongs to the transport. In particular, `connection` is a
// server-only event; clients must never be allowed to forward that command.
export function reduceRoom(state, actorId, command, { now = Date.now() } = {}) {
  if (state.closed) throw new Error('房間已關閉，請重新建立或加入房間');
  validateId(actorId, '成員識別');
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('房間指令格式錯誤');
  const member = state.members.find((entry) => entry.id === actorId);
  if (command.type !== 'join' && !member) throw new Error('你不在這個房間內');
  if (!['join', 'connection', 'leave'].includes(command.type) && !member.connected) throw new Error('連線中斷，請重新連線');
  const next = { ...state, members: state.members.map((entry) => ({ ...entry })) };
  const own = next.members.find((entry) => entry.id === actorId);
  const requireHost = () => {
    if (actorId !== state.hostId) throw new Error('只有主持人可以執行此操作');
  };

  switch (command.type) {
    case 'join': {
      validateId(command.memberId, '成員識別');
      if (actorId !== command.memberId || member) throw new Error('成員識別不符或已加入房間');
      if (state.members.length >= 5) throw new Error('房間已達 5 人上限（包含等待核准的玩家）');
      const name = validateName(command.name);
      if (state.members.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) throw new Error('此 Riot ID 已在房間內');
      next.members.push({ id: command.memberId, name, approved: false, ready: false, connected: true });
      invalidate(next);
      break;
    }
    case 'approve': {
      requireHost();
      const target = next.members.find((entry) => entry.id === command.memberId);
      if (!target) throw new Error('找不到要核准的玩家');
      if (target.approved) return state;
      target.approved = true;
      invalidate(next);
      break;
    }
    case 'ready': {
      if (typeof command.ready !== 'boolean') throw new Error('準備狀態格式錯誤');
      if (!own.approved) throw new Error('請等待主持人核准加入');
      if (own.ready === command.ready) return state;
      own.ready = command.ready;
      // Withdrawing consent makes a previous result unsuitable for application.
      if (!command.ready) next.result = null;
      break;
    }
    case 'connection': {
      if (typeof command.connected !== 'boolean') throw new Error('連線狀態格式錯誤');
      if (own.connected === command.connected) return state;
      own.connected = command.connected;
      invalidate(next);
      break;
    }
    case 'draw': {
      requireHost();
      if (next.members.some((entry) => !entry.approved || !entry.connected || !entry.ready)) {
        throw new Error('所有玩家都需通過核准、保持連線並準備完成才能抽籤');
      }
      const version = state.resultVersion + 1;
      next.result = {
        id: `${state.roomId}:${version}`,
        version,
        results: drawAssignments(next.members.map((entry) => entry.name)),
        createdAt: timestamp(now)
      };
      next.resultVersion = version;
      break;
    }
    case 'leave': {
      next.members = next.members.filter((entry) => entry.id !== actorId);
      if (actorId === state.hostId) next.closed = true;
      invalidate(next);
      break;
    }
    case 'remove': {
      requireHost();
      if (command.memberId === state.hostId) throw new Error('主持人不能移除自己，請使用離開或關閉房間');
      if (!next.members.some((entry) => entry.id === command.memberId)) throw new Error('找不到要移除的玩家');
      next.members = next.members.filter((entry) => entry.id !== command.memberId);
      invalidate(next);
      break;
    }
    case 'close': {
      requireHost();
      next.closed = true;
      invalidate(next);
      break;
    }
    default:
      throw new Error('不支援的房間指令');
  }
  next.revision = state.revision + 1;
  return next;
}
