const { randomInt } = require('node:crypto');

const positions = ["上路", "打野", "中路", "下路", "輔助"];

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

function buildSecondaryRoles(results) {
  const maxAttempts = 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    for (const result of results) {
      const choices = positions.filter((pos) => pos !== result.main);
      result.secondary = choices[randomInt(choices.length)];
    }

    const combinations = results.map((r) => [r.main, r.secondary].sort().join("|"));
    if (new Set(combinations).size === results.length) {
      return;
    }
  }

  throw new Error("無法生成合法組合，請重試");
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
  validatePlayers
};
