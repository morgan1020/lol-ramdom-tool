const emptyStats = () => ({
  "上路": 0,
  "打野": 0,
  "中路": 0,
  "下路": 0,
  "輔助": 0
});

function applyDrawToStats(existing, drawResults) {
  const next = { ...existing };

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

module.exports = {
  emptyStats,
  applyDrawToStats
};
