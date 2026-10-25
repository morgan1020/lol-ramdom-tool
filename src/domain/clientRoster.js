import { validatePlayers } from './draw.js';

const roleNames = { TOP: '上路', JUNGLE: '打野', MIDDLE: '中路', BOTTOM: '下路', UTILITY: '輔助' };

export function describeClientPosition(position) {
  return roleNames[position] || (position === 'FILL' ? '補位' : '未選擇');
}

export function createClientRoster(lobby, usePreferences = false) {
  if (!Array.isArray(lobby?.players)) throw new Error('客戶端名單格式錯誤');
  const names = validatePlayers(lobby.players.map((player) => player.name));
  const preferences = {};
  if (usePreferences) {
    for (const player of lobby.players) {
      const role = roleNames[player.firstPosition];
      if (role) preferences[player.name] = role;
    }
  }
  return { names, preferences };
}
