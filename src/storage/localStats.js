import { normalizeStats } from '../domain/stats.js';
import { getDesktopData, hasDesktopData, saveDesktopStats } from './desktopData.js';

export const STORAGE_STATS = 'lolDrawStats';

function getDefaultStorage() {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function loadStats(storage) {
  if (storage === undefined && hasDesktopData()) return getDesktopData().stats;
  if (storage === undefined) storage = getDefaultStorage();
  if (!storage) return {};

  try {
    return normalizeStats(JSON.parse(storage.getItem(STORAGE_STATS) || '{}'));
  } catch {
    return {};
  }
}

export function saveStats(stats, storage) {
  if (storage === undefined && hasDesktopData()) return saveDesktopStats(stats);
  if (storage === undefined) storage = getDefaultStorage();
  if (!storage) return;
  storage.setItem(STORAGE_STATS, JSON.stringify(normalizeStats(stats)));
  return normalizeStats(stats);
}

export function clearStats(storage) {
  if (storage === undefined && hasDesktopData()) return saveDesktopStats({});
  if (storage === undefined) storage = getDefaultStorage();
  if (!storage) return;
  storage.removeItem(STORAGE_STATS);
}
