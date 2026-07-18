export const positions = ['上路', '打野', '中路', '下路', '輔助'];

export const SECONDARY_ROLE_ERROR_MESSAGE = '無法生成符合副位路線唯一性與位置覆蓋條件的結果，請重試';

function randomIndex(max) {
  if (!Number.isInteger(max) || max <= 0) {
    throw new Error('隨機範圍必須是正整數');
  }

  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.getRandomValues) {
    const array = new Uint32Array(1);
    cryptoObject.getRandomValues(array);
    return array[0] % max;
  }

  return Math.floor(Math.random() * max);
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function validatePlayers(playerNames) {
  if (!Array.isArray(playerNames)) {
    throw new Error('玩家名單格式錯誤');
  }

  const cleaned = playerNames
    .map((name) => String(name || '').trim())
    .filter(Boolean);

  if (cleaned.length === 0) {
    throw new Error('請先加入玩家');
  }

  if (cleaned.length > positions.length) {
    throw new Error('抽籤人數已超過上限 5 人');
  }

  const unique = new Set(cleaned);
  if (unique.size !== cleaned.length) {
    throw new Error('抽籤名單包含重複玩家');
  }

  return cleaned;
}

export function createRouteKey(main, secondary) {
  return [main, secondary].sort((a, b) => a.localeCompare(b, 'zh-Hant')).join('|');
}

function validatePreferredRoles(names, preferredRoles) {
  const constrainedRoles = names
    .map((name) => preferredRoles[name])
    .filter(Boolean);

  const invalidRoles = constrainedRoles.filter((role) => !positions.includes(role));
  if (invalidRoles.length > 0) {
    throw new Error(`指定位置不存在：${[...new Set(invalidRoles)].join('、')}`);
  }

  const duplicatedRoles = constrainedRoles.filter((role, index) => constrainedRoles.indexOf(role) !== index);
  if (duplicatedRoles.length > 0) {
    throw new Error(`指定位置重複：${[...new Set(duplicatedRoles)].join('、')}`);
  }
}

function canCoverEnoughPositions(results) {
  const coveredPositions = new Set(results.flatMap((result) => [result.main, result.secondary]));
  return coveredPositions.size >= results.length + 1;
}

function buildSecondaryRoles(results) {
  const usedRouteKeys = new Set();

  function assignAt(index) {
    if (index === results.length) {
      return canCoverEnoughPositions(results);
    }

    const result = results[index];
    const choices = shuffle(positions.filter((position) => position !== result.main));
    for (const secondary of choices) {
      const routeKey = createRouteKey(result.main, secondary);
      if (usedRouteKeys.has(routeKey)) continue;

      result.secondary = secondary;
      usedRouteKeys.add(routeKey);
      if (assignAt(index + 1)) return true;
      usedRouteKeys.delete(routeKey);
      result.secondary = '';
    }

    result.secondary = '';
    return false;
  }

  if (!assignAt(0)) {
    throw new Error(SECONDARY_ROLE_ERROR_MESSAGE);
  }
}

export function drawAssignments(playerNames, preferredRoles = {}) {
  const names = validatePlayers(playerNames);
  validatePreferredRoles(names, preferredRoles);

  const constrainedRoles = names
    .map((name) => preferredRoles[name])
    .filter(Boolean);
  const shuffledRemainingPositions = shuffle(positions.filter((position) => !constrainedRoles.includes(position)));
  let nextRandomPosition = 0;

  const results = names.map((name) => ({
    name,
    main: preferredRoles[name] || shuffledRemainingPositions[nextRandomPosition++],
    secondary: ''
  }));

  if (names.length < positions.length) {
    buildSecondaryRoles(results);
  }

  return results;
}
