import { drawAssignments, positions, validatePreferredRoles } from './draw.js';

function validateId(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error(`${label}格式錯誤`);
  }
  return value;
}

export function validateRiotId(value) {
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

export function isRoomPlayerReady(member, hostId) {
  return member.approved && (member.manual === true || (member.connected && (member.id === hostId || member.ready)));
}

function invalidate(state) {
  if (state.result) state.result = { ...state.result, archived: true };
  for (const member of state.members) member.ready = false;
}

export function createRoom({ roomId, hostId, hostName }, now = Date.now()) {
  return {
    roomId: validateId(roomId, '房間代碼'),
    hostId: validateId(hostId, '成員識別'),
    revision: 0,
    createdAt: timestamp(now),
    members: [{ id: hostId, name: validateRiotId(hostName), approved: true, ready: false, connected: true }],
    resultVersion: 0,
    drawMode: 'random',
    preferences: {},
    result: null,
    closed: false
  };
}

// Authentication belongs to the transport. In particular, `connection` is a
// server-only event; clients must never be allowed to forward that command.
export function reduceRoom(state, actorId, command, { now = Date.now(), createMemberId } = {}) {
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
  const prunePreferences = () => {
    const names = new Set(next.members.map((entry) => entry.name));
    next.preferences = Object.fromEntries(Object.entries(next.preferences || {}).filter(([name]) => names.has(name)));
  };

  switch (command.type) {
    case 'sync-lobby': {
      requireHost();
      if (!Array.isArray(command.names) || command.names.length < 1 || command.names.length > 5) throw new Error('LoL 大廳需要 1～5 位玩家');
      const names = command.names.map(validateRiotId);
      if (new Set(names.map(name => name.toLowerCase())).size !== names.length || !names.includes(own.name)) throw new Error('無法確認 LoL 大廳名單或主持人的 Riot ID');
      if (next.members.some(entry => !entry.manual && !names.includes(entry.name))) {
        throw new Error('有 App 成員不在目前的 LoL 大廳，請先從同步房間移除該成員');
      }
      if (state.lobbySynced && names.length === state.members.length && names.every(name => state.members.some(entry => entry.name === name))) return state;
      next.lobbySynced = true;
      next.members = names.map(name => next.members.find(entry => entry.name === name)
        ?? { id: createMemberId(), name, approved: true, ready: false, connected: false, manual: true });
      prunePreferences();
      invalidate(next);
      break;
    }
    case 'draw-settings': {
      requireHost();
      if (command.revision !== state.revision) throw new Error('房間狀態已變更，請確認後再設定');
      if (!['random', 'client', 'custom'].includes(command.drawMode) || !command.preferences || typeof command.preferences !== 'object' || Array.isArray(command.preferences)) throw new Error('抽籤設定格式錯誤');
      const names = next.members.map((entry) => entry.name);
      const entries = Object.entries(command.preferences);
      if (entries.some(([name, role]) => !names.includes(name) || !positions.includes(role)) || (command.drawMode === 'random' && entries.length)) throw new Error('抽籤設定包含無效玩家或位置');
      validatePreferredRoles(names, command.preferences);
      const previous = state.preferences || {};
      if ((state.drawMode || 'random') === command.drawMode && entries.length === Object.keys(previous).length && entries.every(([name, role]) => previous[name] === role)) return state;
      next.drawMode = command.drawMode;
      next.preferences = Object.fromEntries(entries);
      invalidate(next);
      break;
    }
    case 'add-manual':
    case 'join': {
      const manual = command.type === 'add-manual';
      if (manual) requireHost();
      if (manual && state.lobbySynced) throw new Error('請從 LoL 大廳更新名單');
      validateId(command.memberId, '成員識別');
      if ((!manual && actorId !== command.memberId) || next.members.some((entry) => entry.id === command.memberId)) throw new Error('成員識別不符或已加入房間');
      const name = validateRiotId(command.name);
      const existing = next.members.find(entry => entry.name.toLowerCase() === name.toLowerCase());
      if (state.lobbySynced && !existing) throw new Error('此 Riot ID 不在主持人讀取的 LoL 大廳名單內');
      if (existing && (!state.lobbySynced || !existing.manual || manual)) throw new Error('此 Riot ID 已在房間內');
      if (!existing && state.members.length >= 5) throw new Error('房間已達 5 人上限（包含等待核准的玩家）');
      const joining = { id: command.memberId, name: existing?.name ?? name, approved: manual, ready: false, connected: !manual, ...(manual ? { manual: true } : {}) };
      if (existing) next.members[next.members.indexOf(existing)] = joining;
      else next.members.push(joining);
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
      if (actorId === state.hostId) return state;
      if (!own.approved) throw new Error('請等待主持人核准加入');
      if (own.ready === command.ready) return state;
      own.ready = command.ready;
      // Withdrawing consent makes a previous result unsuitable for application.
      if (!command.ready && next.result) next.result = { ...next.result, archived: true };
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
      if (state.lobbySynced && command.revision !== state.revision) throw new Error('房間狀態已變更，請確認後再抽籤');
      if (!next.members.every(member => isRoomPlayerReady(member, state.hostId))) {
        throw new Error('所有玩家中，使用 App 加入者都需通過核准、保持連線並準備完成才能抽籤');
      }
      const version = state.resultVersion + 1;
      next.result = {
        id: `${state.roomId}:${version}`,
        version,
        results: drawAssignments(next.members.map((entry) => entry.name), state.preferences || {}),
        preferences: { ...(state.preferences || {}) },
        createdAt: timestamp(now)
      };
      next.resultVersion = version;
      break;
    }
    case 'leave': {
      if (actorId === state.hostId) next.closed = true;
      if (state.lobbySynced && !next.closed) Object.assign(own, { id: createMemberId(), manual: true, approved: true, connected: false });
      else next.members = next.members.filter((entry) => entry.id !== actorId);
      prunePreferences();
      invalidate(next);
      break;
    }
    case 'remove': {
      requireHost();
      if (command.memberId === state.hostId) throw new Error('主持人不能移除自己，請使用離開或關閉房間');
      const target = next.members.find(entry => entry.id === command.memberId);
      if (!target) throw new Error('找不到要移除的玩家');
      if (state.lobbySynced) {
        if (target.manual) throw new Error('請從 LoL 大廳更新名單');
        Object.assign(target, { id: createMemberId(), manual: true, approved: true, connected: false });
      } else next.members = next.members.filter(entry => entry.id !== command.memberId);
      prunePreferences();
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
  if (next.closed) next.result = null;
  next.revision = state.revision + 1;
  return next;
}
