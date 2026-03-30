const { drawAssignments, positions } = require('../src/domain/draw');

const DEFAULT_RUNS = 10000;

function usage() {
  return [
    '用法：node scripts/check-randomness.js [--runs 次數] 玩家1 玩家2 ...',
    '範例：node scripts/check-randomness.js --runs 10000 A B C D E'
  ].join('\n');
}

function parseArgs(argv) {
  const args = [...argv];
  let runs = DEFAULT_RUNS;
  const playerNames = [];

  while (args.length > 0) {
    const arg = args.shift();

    if (arg === '--runs') {
      const rawRuns = args.shift();
      const parsedRuns = Number.parseInt(rawRuns, 10);
      if (!Number.isInteger(parsedRuns) || parsedRuns <= 0) {
        throw new Error('`--runs` 必須是大於 0 的整數');
      }
      runs = parsedRuns;
      continue;
    }

    playerNames.push(arg);
  }

  if (playerNames.length === 0) {
    throw new Error(`請提供至少 1 位玩家\n${usage()}`);
  }

  return {
    runs,
    playerNames
  };
}

function createMainCounts(playerNames) {
  return Object.fromEntries(
    playerNames.map((name) => [name, Object.fromEntries(positions.map((position) => [position, 0]))])
  );
}

function analyzeDistribution(playerNames, runs) {
  const mainCounts = createMainCounts(playerNames);
  const secondaryCounts = createMainCounts(playerNames);

  for (let i = 0; i < runs; i += 1) {
    const results = drawAssignments(playerNames);
    for (const result of results) {
      mainCounts[result.name][result.main] += 1;
      if (result.secondary) {
        secondaryCounts[result.name][result.secondary] += 1;
      }
    }
  }

  return {
    mainCounts,
    secondaryCounts
  };
}

function formatCountLine(position, count, totalAssignments, expectedPerPosition = null) {
  const ratio = totalAssignments === 0 ? 0 : (count / totalAssignments) * 100;
  if (expectedPerPosition === null) {
    return `  ${position}：${count} 次 (${ratio.toFixed(2)}%)`;
  }

  const delta = count - expectedPerPosition;
  const sign = delta >= 0 ? '+' : '';
  return `  ${position}：${count} 次 (${ratio.toFixed(2)}%)｜偏差 ${sign}${delta.toFixed(2)}`;
}

function formatReport(playerNames, runs, distribution) {
  const { mainCounts, secondaryCounts } = distribution;
  const expectedMainPerPosition = runs / positions.length;
  const lines = [
    `抽樣次數：${runs}`,
    `玩家數：${playerNames.length}`,
    `主位理論平均：每位玩家每個主位約 ${expectedMainPerPosition.toFixed(2)} 次`,
    `副位說明：少於 5 人時才會出現副位；副位受覆蓋規則影響，僅顯示實際分布`,
    ''
  ];

  for (const name of playerNames) {
    lines.push(`${name}`);
    lines.push('主位：');

    for (const position of positions) {
      const count = mainCounts[name][position];
      lines.push(formatCountLine(position, count, runs, expectedMainPerPosition));
    }

    const secondaryTotal = Object.values(secondaryCounts[name]).reduce((sum, value) => sum + value, 0);
    lines.push('副位：');
    if (secondaryTotal === 0) {
      lines.push('  無副位資料');
    } else {
      for (const position of positions) {
        const count = secondaryCounts[name][position];
        lines.push(formatCountLine(position, count, secondaryTotal));
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function runCli(argv = process.argv.slice(2), stdout = console.log, stderr = console.error) {
  try {
    const { runs, playerNames } = parseArgs(argv);
    const distribution = analyzeDistribution(playerNames, runs);
    stdout(formatReport(playerNames, runs, distribution));
    return 0;
  } catch (error) {
    stderr(error.message);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = {
  DEFAULT_RUNS,
  analyzeDistribution,
  formatReport,
  parseArgs,
  runCli,
  usage
};
