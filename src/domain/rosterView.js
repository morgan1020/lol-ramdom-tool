import { createClientRoster } from './clientRoster.js';

export function rosterKey(names) {
  return JSON.stringify([...names].sort());
}

export function buildRoster({ source, lobby, manualPlayers, drawMode, preferredRoles }) {
  const names = source === 'client' ? createClientRoster(lobby, false).names : [...manualPlayers];
  if (drawMode === 'client' && source === 'client') return createClientRoster(lobby, true);
  const preferences = drawMode === 'custom'
    ? Object.fromEntries(names.filter((name) => preferredRoles[name]).map((name) => [name, preferredRoles[name]]))
    : {};
  return { names, preferences };
}
