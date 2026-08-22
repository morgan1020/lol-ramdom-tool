export const CHAMPION_DATA_SCHEMA_VERSION = 1;
export const CHAMPION_DATA_SOURCE = 'Riot Data Dragon';
export const DEFAULT_CHAMPION_LOCALE = 'zh_TW';
export const DATA_DRAGON_BASE_URL = 'https://ddragon.leagueoflegends.com';

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`英雄資料缺少${label}`);
  }

  return value.trim();
}

function requireChampionSource(rawData) {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    throw new Error('英雄資料格式錯誤');
  }

  if (rawData.type !== 'champion' || !rawData.data || typeof rawData.data !== 'object' || Array.isArray(rawData.data)) {
    throw new Error('Data Dragon 英雄資料格式錯誤');
  }

  const entries = Object.values(rawData.data);
  if (entries.length === 0) {
    throw new Error('Data Dragon 英雄資料為空');
  }

  return entries;
}

export function normalizeChampionData(rawData, {
  version,
  locale = DEFAULT_CHAMPION_LOCALE,
  updatedAt = new Date().toISOString()
} = {}) {
  const resolvedVersion = requireString(version || rawData?.version, '版本');
  const resolvedLocale = requireString(locale, '語系');
  const entries = requireChampionSource(rawData);
  const ids = new Set();
  const keys = new Set();
  const names = new Set();

  const champions = entries.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('英雄資料項目格式錯誤');
    }

    const id = requireString(entry.id, 'ID');
    const key = requireString(String(entry.key || ''), `數字 ID：${id}`);
    const name = requireString(entry.name, `名稱：${id}`);
    const imageFile = requireString(entry.image?.full, `圖片：${id}`);

    if (ids.has(id) || keys.has(key) || names.has(name)) {
      throw new Error(`英雄資料包含重複項目：${id}`);
    }

    ids.add(id);
    keys.add(key);
    names.add(name);

    return {
      id,
      key,
      name,
      imageUrl: `${DATA_DRAGON_BASE_URL}/cdn/${encodeURIComponent(resolvedVersion)}/img/champion/${encodeURIComponent(imageFile)}`
    };
  });

  champions.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant') || a.id.localeCompare(b.id));

  const document = {
    schemaVersion: CHAMPION_DATA_SCHEMA_VERSION,
    source: CHAMPION_DATA_SOURCE,
    locale: resolvedLocale,
    version: resolvedVersion,
    updatedAt: requireString(updatedAt, '更新時間'),
    champions
  };

  validateChampionDataDocument(document);
  return document;
}

export function validateChampionDataDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('英雄資料文件格式錯誤');
  }

  if (document.schemaVersion !== CHAMPION_DATA_SCHEMA_VERSION) {
    throw new Error(`不支援的英雄資料格式版本：${document.schemaVersion}`);
  }

  if (document.source !== CHAMPION_DATA_SOURCE) {
    throw new Error('英雄資料來源不正確');
  }

  requireString(document.locale, '語系');
  requireString(document.version, '版本');
  requireString(document.updatedAt, '更新時間');

  if (!Array.isArray(document.champions) || document.champions.length === 0) {
    throw new Error('英雄資料清單不可為空');
  }

  const ids = new Set();
  const keys = new Set();
  const names = new Set();

  for (const champion of document.champions) {
    const id = requireString(champion?.id, 'ID');
    const key = requireString(String(champion?.key || ''), `數字 ID：${id}`);
    const name = requireString(champion?.name, `名稱：${id}`);
    const imageUrl = requireString(champion?.imageUrl, `圖片：${id}`);

    if (!imageUrl.startsWith(`${DATA_DRAGON_BASE_URL}/cdn/`)) {
      throw new Error(`英雄圖片網址來源不正確：${id}`);
    }

    if (ids.has(id) || keys.has(key) || names.has(name)) {
      throw new Error(`英雄資料包含重複項目：${id}`);
    }

    ids.add(id);
    keys.add(key);
    names.add(name);
  }

  return document;
}
