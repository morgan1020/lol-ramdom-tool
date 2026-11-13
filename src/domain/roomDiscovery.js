import { validateRiotId } from './syncRoom.js';

export const discoveryTtlMs = 10 * 60 * 1000;
export const isTeamKey = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function teamKey(names, digest) {
  if (!Array.isArray(names) || names.length < 2 || names.length > 5) return null;
  const normalized = names.map(name => validateRiotId(name).toLowerCase()).sort();
  if (new Set(normalized).size !== normalized.length) return null;
  return digest(JSON.stringify(normalized));
}

export function selectRoom(entries, now) {
  const matches = Object.entries(entries).filter(([, expiresAt]) => expiresAt > now);
  if (matches.length === 1) return { status: 'found', roomId: matches[0][0] };
  return { status: matches.length ? 'ambiguous' : 'missing' };
}
