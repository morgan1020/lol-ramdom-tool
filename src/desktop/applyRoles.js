import { ClientError, discoverConnection, preferenceEndpoint, readLobby, requestClient } from './lcu.js';

const clientRoles = { 上路: 'TOP', 打野: 'JUNGLE', 中路: 'MIDDLE', 下路: 'BOTTOM', 輔助: 'UTILITY' };
const validPreferences = [...Object.values(clientRoles), 'FILL', 'UNSELECTED'];

function memberId(member) {
  return member ? String(member.puuid || member.summonerId) : '';
}

function validateResults(results) {
  if (!Array.isArray(results) || results.length < 1 || results.length > 5 || results.some((result) =>
    typeof result?.name !== 'string' || !result.name.trim() || result.name.length > 200 ||
    !Object.hasOwn(clientRoles, result.main) || (result.secondary && (!Object.hasOwn(clientRoles, result.secondary) || result.secondary === result.main)))) {
    throw new ClientError('抽籤結果格式錯誤，未更改客戶端');
  }
  if (new Set(results.map((result) => result.name)).size !== results.length || new Set(results.map((result) => result.main)).size !== results.length) {
    throw new ClientError('抽籤結果包含重複玩家或主位，未更改客戶端');
  }
}

function matchesTeam(snapshot, lobby) {
  const members = lobby?.members?.filter((member) => !member.isBot && !member.isSpectator);
  return Array.isArray(members) && members.length === snapshot.players.length &&
    members.every((member) => snapshot.players.some((player) => player.id === memberId(member))) &&
    memberId(lobby.localMember) === snapshot.localPlayerId &&
    lobby.gameConfig?.queueId === snapshot.queueId && !lobby.gameConfig?.isCustom;
}

export async function applyCurrentPlayerRoles(results, { discover = discoverConnection, request = requestClient } = {}) {
  validateResults(results);
  const connection = await discover();
  const read = (endpoint) => request(connection, endpoint);
  const snapshot = await readLobby({ discover: async () => connection, request });
  if (snapshot.isCustom) throw new ClientError('自訂房間不支援排隊分路偏好，未更改客戶端');
  const current = await read('/lol-summoner/v1/current-summoner');
  const ownId = memberId(current);
  const ownName = current?.gameName && current?.tagLine ? `${current.gameName.trim()}#${current.tagLine.trim()}` : '';
  const ownPlayer = snapshot.players.find((player) => player.id === ownId && player.name === ownName);
  if (!ownPlayer || ownId !== snapshot.localPlayerId) throw new ClientError('無法確認目前登入帳號，未更改客戶端');
  if (results.length !== snapshot.players.length || results.some((result) => !snapshot.players.some((player) => player.name === result.name))) {
    throw new ClientError('目前隊伍與抽籤名單不同，未更改客戶端；請重新讀取隊伍並抽籤');
  }
  const ownResult = results.find((result) => result.name === ownName);
  const lobby = await read('/lol-lobby/v2/lobby');
  if (!matchesTeam(snapshot, lobby)) throw new ClientError('隊伍或登入帳號已變更，未更改客戶端');
  if (lobby.gameConfig?.mapId !== 11) throw new ClientError('目前模式不支援召喚峽谷分路偏好，未更改客戶端');
  const firstPreference = clientRoles[ownResult.main];
  // Five-player draws have no secondary role: preserve the actual current preference.
  const secondPreference = ownResult.secondary ? clientRoles[ownResult.secondary] : lobby.localMember.secondPositionPreference;
  if (!validPreferences.includes(secondPreference) || firstPreference === secondPreference) {
    throw new ClientError('本次沒有副位，既有第二偏好無法沿用，請手動調整客戶端；未更改客戶端');
  }
  if (await read('/lol-gameflow/v1/gameflow-phase') !== 'Lobby') throw new ClientError('已離開組隊大廳，未更改客戶端');
  const preferences = { firstPreference, secondPreference };
  const unchanged = lobby.localMember.firstPositionPreference === firstPreference && lobby.localMember.secondPositionPreference === secondPreference;
  if (!unchanged) await request(connection, preferenceEndpoint, { method: 'PUT', body: preferences });
  let verified;
  try { verified = await read('/lol-lobby/v2/lobby'); }
  catch { throw new ClientError('套用結果無法確認，請查看客戶端；不會自動重送'); }
  if (!matchesTeam(snapshot, verified) || verified.localMember.firstPositionPreference !== firstPreference || verified.localMember.secondPositionPreference !== secondPreference) {
    throw new ClientError('客戶端分路與預期不符，請查看客戶端；不會自動重送');
  }
  return { name: ownName, firstPosition: firstPreference, secondPosition: secondPreference, unchanged, fetchedAt: new Date().toISOString() };
}
