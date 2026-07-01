const { randomInt } = require('node:crypto');

const positions = ["上路", "打野", "中路", "下路", "輔助"];
const SECONDARY_ROLE_ERROR_MESSAGE = "無法生成符合副位路線唯一性與位置覆蓋條件的結果，請重試";

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function validatePlayers(playerNames) {
  if (!Array.isArray(playerNames)) {
    throw new Error("玩家名單格式錯誤");
  }

  const cleaned = playerNames
    .map((name) => String(name || "").trim())
    .filter(Boolean);

  if (cleaned.length === 0) {
    throw new Error("請先加入玩家");
  }

  if (cleaned.length > 5) {
    throw new Error("抽籤人數已超過上限 5 人");
  }

  const unique = new Set(cleaned);
  if (unique.size !== cleaned.length) {
    throw new Error("抽籤名單包含重複玩家");
  }

  return cleaned;
}

function createRouteKey(main, secondary) {
  return [main, secondary].sort((a, b) => a.localeCompare(b, 'zh-Hant')).join('|');
}

function canCoverEnoughPositions(results) {
  const coveredPositions = new Set(results.flatMap((r) => [r.main, r.secondary]));
  return coveredPositions.size >= results.length + 1;
}

function buildSecondaryRoles(results) {
  const usedRouteKeys = new Set();

  function assignAt(index) {
    if (index === results.length) {
      return canCoverEnoughPositions(results);
    }

    const result = results[index];
    const choices = shuffle(positions.filter((pos) => pos !== result.main));
    for (const secondary of choices) {
      const routeKey = createRouteKey(result.main, secondary);
      if (usedRouteKeys.has(routeKey)) {
        continue;
      }

      result.secondary = secondary;
      usedRouteKeys.add(routeKey);
      if (assignAt(index + 1)) {
        return true;
      }
      usedRouteKeys.delete(routeKey);
      result.secondary = "";
    }

    result.secondary = "";
    return false;
  }

  if (!assignAt(0)) {
    throw new Error(SECONDARY_ROLE_ERROR_MESSAGE);
  }
}

function drawAssignments(playerNames) {
  const names = validatePlayers(playerNames);
  const shuffledPositions = shuffle(positions);

  const results = names.map((name, index) => ({
    name,
    main: shuffledPositions[index],
    secondary: ""
  }));

  if (names.length < 5) {
    buildSecondaryRoles(results);
  }

  return results;
}

module.exports = {
  positions,
  drawAssignments,
  validatePlayers,
  SECONDARY_ROLE_ERROR_MESSAGE
};
