const legacyKeys = ['lolDrawStats', 'lolDiscordSync', 'lolTheme', 'lol-theme', 'lolAutoApplyRoles'];
let snapshot = null;

export function hasDesktopData() {
  return typeof window !== 'undefined' && typeof window.lolDesktop?.initializeData === 'function';
}

export function getDesktopData() {
  if (!snapshot) throw new Error('桌面資料尚未載入，請重新開啟 App');
  return snapshot;
}

function adopt(next) {
  if (!snapshot || next.revision >= snapshot.revision) snapshot = next;
  return snapshot;
}

export async function desktopRequest(method, ...args) {
  const reply = await window.lolDesktop[method](...args);
  if (!reply?.ok) throw new Error(reply?.message || '桌面資料操作失敗，請稍後再試');
  return reply.value;
}

export async function initializeDesktopData() {
  if (typeof window !== 'undefined' && window.lolDesktop && !hasDesktopData()) throw new Error('桌面版本不相容，請重新啟動 App');
  if (!hasDesktopData()) return null;
  const legacy = Object.fromEntries(legacyKeys.map((key) => [key, window.localStorage.getItem(key)]));
  const result = await desktopRequest('initializeData', legacy);
  adopt(result.data);
  let cleanupFailed = false;
  for (const key of result.cleanupKeys) {
    try {
      if (window.localStorage.getItem(key) === legacy[key]) window.localStorage.removeItem(key);
      else cleanupFailed = true;
    } catch { cleanupFailed = true; }
  }
  return { ...snapshot, notice: cleanupFailed ? '新資料已驗證儲存；部分舊資料尚未清除，下次開啟會再確認。' : result.notice };
}

export async function saveDesktopStats(stats) {
  const data = adopt(await desktopRequest('saveDataStats', stats));
  return data.stats;
}

export async function saveDesktopPreferences(patch) {
  const data = adopt(await desktopRequest('saveDataPreferences', patch));
  return data.preferences;
}

export async function changeDesktopDiscord(action, payload) {
  const data = adopt(await desktopRequest('changeDataDiscord', action, payload));
  return data.discord;
}

export async function importDesktopStats(text, mode) {
  return adopt(await desktopRequest('importDataStats', text, mode)).stats;
}
