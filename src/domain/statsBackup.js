import { positions } from './draw.js';

export const MAX_STATS_FILE_BYTES = 5 * 1024 * 1024;
const format = 'lol-random-tool.stats';

export function statsBackupFilename(date = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  return `lol-stats-${day}.json`;
}

export function validateStats(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('統計資料格式錯誤');
  const entries = Object.entries(raw);
  if (entries.length > 5000) throw new Error('統計檔最多可包含 5000 位玩家');
  return Object.fromEntries(entries.map(([name, counts]) => {
    if (!name.trim() || name !== name.trim() || name.length > 200 || ['__proto__', 'constructor', 'prototype'].includes(name) || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('統計檔包含無效玩家名稱');
    if (!counts || typeof counts !== 'object' || Array.isArray(counts) || Object.keys(counts).some((key) => !positions.includes(key))) throw new Error('統計檔包含未知路線或不支援的資料');
    return [name, Object.fromEntries(positions.map((position) => {
      const value = counts[position] ?? 0;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000_000 || !Number.isInteger(value * 2)) throw new Error('統計次數必須是非負的整數或 0.5 倍數');
      return [position, value];
    }))];
  }));
}

export function createStatsBackup(stats) {
  return JSON.stringify({ format, version: 1, exportedAt: new Date().toISOString(), stats: validateStats(stats) }, null, 2);
}

export function parseStatsBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_STATS_FILE_BYTES) throw new Error('統計檔不可超過 5 MB');
  let data;
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('無法解析 JSON 統計檔'); }
  if (data?.format !== undefined) {
    if (data.format !== format || data.version !== 1 || Object.keys(data).some((key) => !['format', 'version', 'exportedAt', 'stats'].includes(key))) throw new Error('不支援的統計備份格式或版本');
    return validateStats(data.stats);
  }
  return validateStats(data);
}

export function importStats(current, incoming, mode = 'merge') {
  if (!['merge', 'replace'].includes(mode)) throw new Error('不支援的統計匯入方式');
  const checked = validateStats(incoming);
  return mode === 'replace' ? checked : validateStats({ ...validateStats(current), ...checked });
}
