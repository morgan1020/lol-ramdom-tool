export const CHAMPION_POSITION_SCHEMA_VERSION = 1;
export const CHAMPION_POSITION_SOURCE = 'CommunityDragon champion statistics';
export const CHAMPION_POSITION_SOURCE_URL = 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champion-statistics/global/default/rcp-fe-lol-champion-statistics.js';
export const CHAMPION_POSITION_KEYS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT'];
export const CHAMPION_POSITION_LABELS = {
  TOP: '上路',
  JUNGLE: '打野',
  MIDDLE: '中路',
  BOTTOM: '下路',
  SUPPORT: '輔助'
};

const MIN_CHAMPIONS_PER_POSITION = 10;
const MIN_POSITIONED_CHAMPION_RATIO = 0.5;

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`英雄位置資料缺少${label}`);
  }

  return value.trim();
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}格式錯誤`);
  }

  return value;
}

function buildChampionIndexes(championData) {
  if (!championData || !Array.isArray(championData.champions) || championData.champions.length === 0) {
    throw new Error('Data Dragon 英雄資料不可為空');
  }

  const byKey = new Map();
  const byId = new Map();

  for (const champion of championData.champions) {
    const id = requireString(champion?.id, '英雄 ID');
    const key = requireString(String(champion?.key || ''), `英雄數字 ID：${id}`);
    const name = requireString(champion?.name, `英雄名稱：${id}`);

    if (!/^\d+$/.test(key)) {
      throw new Error(`Data Dragon 英雄數字 ID 格式錯誤：${id}`);
    }

    if (byKey.has(key) || byId.has(id)) {
      throw new Error(`Data Dragon 英雄 ID 重複：${id}`);
    }

    byKey.set(key, { ...champion, id, key, name });
    byId.set(id, { ...champion, id, key, name });
  }

  return { byKey, byId };
}

export function normalizeChampionPosition(position) {
  const normalized = requireString(position, '路線').toUpperCase();
  const canonical = normalized === 'UTILITY' ? 'SUPPORT' : normalized;

  if (!CHAMPION_POSITION_KEYS.includes(canonical)) {
    throw new Error(`不支援的英雄路線：${position}`);
  }

  return canonical;
}

export function parseCommunityDragonPositionSource(sourceText) {
  if (typeof sourceText !== 'string' || sourceText.trim() === '') {
    throw new Error('CommunityDragon 來源內容為空');
  }

  const matches = [...sourceText.matchAll(/JSON\.parse\('((?:\\.|[^'\\])*)'\)/g)];
  if (matches.length !== 1) {
    throw new Error(`CommunityDragon 來源格式無法可靠解析：找到 ${matches.length} 個位置資料區塊`);
  }

  const encodedJson = matches[0][1];
  if (encodedJson.includes('\\')) {
    throw new Error('CommunityDragon 位置資料包含不支援的跳脫字元');
  }

  try {
    return requireObject(JSON.parse(encodedJson), 'CommunityDragon 位置資料');
  } catch (error) {
    if (error.message === 'CommunityDragon 位置資料格式錯誤') throw error;
    throw new Error(`CommunityDragon 位置資料不是有效 JSON：${error.message}`);
  }
}

export function normalizeChampionPositions(sourcePositions, championData, {
  sourceVersion,
  sourceLastModified = null,
  updatedAt = new Date().toISOString()
} = {}) {
  requireObject(sourcePositions, 'CommunityDragon 位置資料');
  const { byKey, byId } = buildChampionIndexes(championData);
  const normalizedSets = Object.fromEntries(CHAMPION_POSITION_KEYS.map((position) => [position, new Set()]));

  for (const [sourcePosition, rawRates] of Object.entries(sourcePositions)) {
    const position = normalizeChampionPosition(sourcePosition);
    requireObject(rawRates, `${sourcePosition} 路線資料`);

    const entries = Object.entries(rawRates);
    if (entries.length === 0) {
      throw new Error(`${CHAMPION_POSITION_LABELS[position]}路線資料不可為空`);
    }

    for (const [numericId, playRate] of entries) {
      if (!/^\d+$/.test(numericId)) {
        throw new Error(`CommunityDragon 英雄數字 ID 格式錯誤：${numericId}`);
      }

      if (typeof playRate !== 'number' || !Number.isFinite(playRate) || playRate <= 0 || playRate > 1) {
        throw new Error(`CommunityDragon 英雄使用率格式錯誤：${numericId}`);
      }

      const champion = byKey.get(numericId);
      if (!champion) {
        throw new Error(`CommunityDragon 英雄數字 ID 無法對應 Data Dragon：${numericId}`);
      }

      normalizedSets[position].add(champion.id);
    }
  }

  const positions = {};
  for (const position of CHAMPION_POSITION_KEYS) {
    positions[position] = [...normalizedSets[position]].sort((a, b) => {
      const championA = byId.get(a);
      const championB = byId.get(b);
      return championA.name.localeCompare(championB.name, 'zh-Hant') || a.localeCompare(b);
    });
  }

  const resolvedSourceVersion = requireString(sourceVersion, '來源版本');
  const document = {
    schemaVersion: CHAMPION_POSITION_SCHEMA_VERSION,
    version: `${requireString(championData.version, 'Data Dragon 版本')}+${resolvedSourceVersion.replace(/^sha256:/, '').slice(0, 12)}`,
    source: CHAMPION_POSITION_SOURCE,
    sourceUrl: CHAMPION_POSITION_SOURCE_URL,
    sourceVersion: resolvedSourceVersion,
    sourceLastModified: sourceLastModified ? requireString(sourceLastModified, '來源更新時間') : null,
    dataDragonVersion: championData.version,
    updatedAt: requireString(updatedAt, '更新時間'),
    positions
  };

  validateChampionPositionsDocument(document, championData);
  return document;
}

export function validateChampionPositionsDocument(document, championData = null) {
  requireObject(document, '英雄位置資料文件');

  if (document.schemaVersion !== CHAMPION_POSITION_SCHEMA_VERSION) {
    throw new Error(`不支援的英雄位置資料格式版本：${document.schemaVersion}`);
  }

  requireString(document.version, '版本');
  if (document.source !== CHAMPION_POSITION_SOURCE || document.sourceUrl !== CHAMPION_POSITION_SOURCE_URL) {
    throw new Error('英雄位置資料來源不正確');
  }

  const sourceVersion = requireString(document.sourceVersion, '來源版本');
  if (!/^sha256:[a-f0-9]{64}$/.test(sourceVersion)) {
    throw new Error('英雄位置來源版本格式錯誤');
  }

  if (document.sourceLastModified !== null) {
    requireString(document.sourceLastModified, '來源更新時間');
  }

  requireString(document.dataDragonVersion, 'Data Dragon 版本');
  const updatedAt = requireString(document.updatedAt, '更新時間');
  if (Number.isNaN(Date.parse(updatedAt))) {
    throw new Error('英雄位置資料更新時間格式錯誤');
  }

  const positions = requireObject(document.positions, '英雄路線清單');
  const positionKeys = Object.keys(positions).sort();
  const expectedKeys = [...CHAMPION_POSITION_KEYS].sort();
  if (positionKeys.length !== expectedKeys.length || positionKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error('英雄位置資料必須完整包含五路');
  }

  const championIndexes = championData ? buildChampionIndexes(championData) : null;
  if (championData && document.dataDragonVersion !== championData.version) {
    throw new Error('英雄位置資料與 Data Dragon 版本不一致');
  }

  const positionedChampionIds = new Set();
  for (const position of CHAMPION_POSITION_KEYS) {
    const championIds = positions[position];
    if (!Array.isArray(championIds) || championIds.length < MIN_CHAMPIONS_PER_POSITION) {
      throw new Error(`${CHAMPION_POSITION_LABELS[position]}英雄數量不合理：${championIds?.length || 0}`);
    }

    const uniqueIds = new Set();
    for (const rawChampionId of championIds) {
      const championId = requireString(rawChampionId, `${CHAMPION_POSITION_LABELS[position]}英雄 ID`);
      if (uniqueIds.has(championId)) {
        throw new Error(`${CHAMPION_POSITION_LABELS[position]}包含重複英雄：${championId}`);
      }
      if (championIndexes && !championIndexes.byId.has(championId)) {
        throw new Error(`${CHAMPION_POSITION_LABELS[position]}包含未知英雄：${championId}`);
      }

      uniqueIds.add(championId);
      positionedChampionIds.add(championId);
    }
  }

  if (championIndexes && positionedChampionIds.size < championIndexes.byId.size * MIN_POSITIONED_CHAMPION_RATIO) {
    throw new Error(`英雄位置涵蓋數量不合理：${positionedChampionIds.size}`);
  }

  return document;
}

export function getChampionsForPosition(champions, positionDocument, position) {
  if (!Array.isArray(champions)) {
    throw new Error('英雄池格式錯誤');
  }

  const canonicalPosition = normalizeChampionPosition(position);
  const championIds = positionDocument?.positions?.[canonicalPosition];
  if (!Array.isArray(championIds)) {
    throw new Error(`${CHAMPION_POSITION_LABELS[canonicalPosition]}英雄池格式錯誤`);
  }
  if (championIds.length === 0) {
    throw new Error(`${CHAMPION_POSITION_LABELS[canonicalPosition]}英雄池為空`);
  }

  const championsById = new Map(champions.map((champion) => [champion.id, champion]));
  return championIds.map((championId) => {
    const champion = championsById.get(championId);
    if (!champion) {
      throw new Error(`${CHAMPION_POSITION_LABELS[canonicalPosition]}包含未知英雄：${championId}`);
    }
    return champion;
  });
}
