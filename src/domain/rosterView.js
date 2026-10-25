import { createClientRoster } from './clientRoster.js';
import { validatePlayers, validatePreferredRoles } from './draw.js';

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

export function prepareRoster(options) {
  const roster = buildRoster(options);
  validatePlayers(roster.names);
  validatePreferredRoles(roster.names, roster.preferences);
  return { ...roster, source: options.source, localPlayerId: options.source === 'client' ? options.lobby.localPlayerId : null };
}

export function matchesPreparedRoster(prepared, current) {
  return prepared?.source === current.source && prepared.localPlayerId === current.localPlayerId
    && rosterKey(prepared.names) === rosterKey(current.names)
    && current.names.every((name) => (prepared.preferences[name] || '') === (current.preferences[name] || ''));
}
