import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHAMPION_POSITION_KEYS,
  CHAMPION_POSITION_LABELS,
  CHAMPION_POSITION_SOURCE_URL,
  normalizeChampionPositions,
  parseCommunityDragonPositionSource,
  validateChampionPositionsDocument
} from '../src/domain/championPositions.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');
const championDataPath = path.join(projectDirectory, 'src', 'data', 'champions.json');
const outputPath = path.join(projectDirectory, 'src', 'data', 'champion-positions.json');
const requestTimeoutMs = 15_000;

async function readJson(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

async function fetchSource() {
  const response = await fetch(CHAMPION_POSITION_SOURCE_URL, { signal: AbortSignal.timeout(requestTimeoutMs) });
  if (!response.ok) {
    throw new Error(`下載失敗（${response.status}）：${CHAMPION_POSITION_SOURCE_URL}`);
  }

  return {
    sourceText: await response.text(),
    lastModified: response.headers.get('last-modified')
  };
}

async function readExistingDocument() {
  try {
    const document = await readJson(outputPath);
    validateChampionPositionsDocument(document);
    return document;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`既有英雄位置資料無法驗證，已停止以避免覆蓋：${error.message}`);
  }
}

function getPositionDifference(previous, next, championsById, position) {
  const previousIds = new Set(previous?.positions?.[position] || []);
  const nextIds = new Set(next.positions[position]);
  const getName = (championId) => championsById.get(championId)?.name || championId;

  return {
    added: [...nextIds].filter((championId) => !previousIds.has(championId)).map(getName).sort((a, b) => a.localeCompare(b, 'zh-Hant')),
    removed: [...previousIds].filter((championId) => !nextIds.has(championId)).map(getName).sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  };
}

async function writeAtomically(document) {
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  const serialized = `${JSON.stringify(document, null, 2)}\n`;

  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(temporaryPath, serialized, 'utf8');
    await fs.rename(temporaryPath, outputPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function main() {
  const championData = await readJson(championDataPath);
  console.log(`使用 Data Dragon ${championData.version} 英雄資料對照數字 ID…`);

  const { sourceText, lastModified } = await fetchSource();
  const sourceVersion = `sha256:${createHash('sha256').update(sourceText).digest('hex')}`;
  const sourcePositions = parseCommunityDragonPositionSource(sourceText);
  const document = normalizeChampionPositions(sourcePositions, championData, {
    sourceVersion,
    sourceLastModified: lastModified
  });
  validateChampionPositionsDocument(document, championData);

  const previous = await readExistingDocument();
  const championsById = new Map(championData.champions.map((champion) => [champion.id, champion]));
  const differences = Object.fromEntries(CHAMPION_POSITION_KEYS.map((position) => [
    position,
    getPositionDifference(previous, document, championsById, position)
  ]));

  await writeAtomically(document);

  console.log(`已更新 ${path.relative(process.cwd(), outputPath)}`);
  console.log(`資料版本：${document.version}`);
  for (const position of CHAMPION_POSITION_KEYS) {
    const difference = differences[position];
    console.log(`${CHAMPION_POSITION_LABELS[position]}：${document.positions[position].length} 隻`);
    console.log(`  新增：${difference.added.length ? difference.added.join('、') : '無'}`);
    console.log(`  移除：${difference.removed.length ? difference.removed.join('、') : '無'}`);
  }
}

main().catch((error) => {
  console.error(`英雄位置資料更新失敗：${error.message}`);
  process.exitCode = 1;
});
