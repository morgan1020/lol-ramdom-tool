import { DEFAULT_DISCORD_SYNC, normalizeDiscordSettings } from '../domain/discordSettings.js';
import { getDesktopData, hasDesktopData } from './desktopData.js';
export { DEFAULT_DISCORD_SYNC, STORAGE_DISCORD_SYNC } from '../domain/discordSettings.js';
const STORAGE_DISCORD_SYNC = 'lolDiscordSync';
function emptySettings() { return { ...DEFAULT_DISCORD_SYNC, destinations: [] }; }

function getDefaultStorage() {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}

export function loadDiscordSync(storage) {
  if (storage === undefined && hasDesktopData()) return getDesktopData().discord;
  if (storage === undefined) storage = getDefaultStorage();
  try {
    const settings = JSON.parse(storage?.getItem(STORAGE_DISCORD_SYNC) || 'null');
    if (!settings) return emptySettings();
    return normalizeDiscordSettings(settings);
  } catch {
    return emptySettings();
  }
}

export function saveDiscordSync(settings, storage) {
  if (storage === undefined && hasDesktopData()) throw new Error('桌面版 Webhook 必須由主程序加密保存');
  if (storage === undefined) storage = getDefaultStorage();
  const normalized = normalizeDiscordSettings(settings);
  try {
    if (!storage) throw new Error();
    storage.setItem(STORAGE_DISCORD_SYNC, JSON.stringify(normalized));
  } catch {
    throw new Error('瀏覽器無法儲存設定，請允許此網站使用本機儲存空間');
  }
  return normalized;
}

export function clearDiscordSync(storage) {
  if (storage === undefined && hasDesktopData()) throw new Error('桌面版 Discord 設定必須由主程序管理');
  if (storage === undefined) storage = getDefaultStorage();
  try {
    if (!storage) throw new Error();
    storage.removeItem(STORAGE_DISCORD_SYNC);
  } catch {
    throw new Error('瀏覽器無法清除設定，請檢查本機儲存空間權限');
  }
  return emptySettings();
}
