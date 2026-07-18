import { positions } from './draw.js';

export function emptyStats() {
  return Object.fromEntries(positions.map((position) => [position, 0]));
}

export function normalizeStats(rawStats) {
  if (!rawStats || typeof rawStats !== 'object' || Array.isArray(rawStats)) {
    return {};
  }

  const normalized = {};
  for (const [name, values] of Object.entries(rawStats)) {
    const cleanedName = String(name || '').trim();
    if (!cleanedName) continue;

    const nextValues = emptyStats();
    for (const position of positions) {
      const value = Number(values?.[position] || 0);
      nextValues[position] = Number.isFinite(value) ? value : 0;
    }
    normalized[cleanedName] = nextValues;
  }

  return normalized;
}

export function ensurePlayerStats(stats, playerName) {
  const normalized = normalizeStats(stats);
  if (!normalized[playerName]) {
    normalized[playerName] = emptyStats();
  }
  return normalized;
}

export function applyDrawToStats(existing, drawResults) {
  const next = normalizeStats(existing);

  for (const result of drawResults) {
    if (!next[result.name]) {
      next[result.name] = emptyStats();
    }

    next[result.name][result.main] += 1;

    if (result.secondary) {
      next[result.name][result.secondary] += 0.5;
    }
  }

  return next;
}

export function getPlayerTotal(values) {
  return positions.reduce((sum, position) => sum + (Number(values?.[position]) || 0), 0);
}

export function sortPlayerNames(stats) {
  const normalized = normalizeStats(stats);
  return Object.keys(normalized).sort((a, b) => {
    const totalA = getPlayerTotal(normalized[a]);
    const totalB = getPlayerTotal(normalized[b]);
    if (totalA !== totalB) return totalB - totalA;
    return a.localeCompare(b, 'zh-Hant');
  });
}
