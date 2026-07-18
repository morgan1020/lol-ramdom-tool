import { normalizeStats } from '../domain/stats.js';

export const STORAGE_STATS = 'lolDrawStats';

function getDefaultStorage() {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function loadStats(storage = getDefaultStorage()) {
  if (!storage) return {};

  try {
    return normalizeStats(JSON.parse(storage.getItem(STORAGE_STATS) || '{}'));
  } catch {
    return {};
  }
}

export function saveStats(stats, storage = getDefaultStorage()) {
  if (!storage) return;
  storage.setItem(STORAGE_STATS, JSON.stringify(normalizeStats(stats)));
}

export function clearStats(storage = getDefaultStorage()) {
  if (!storage) return;
  storage.removeItem(STORAGE_STATS);
}
