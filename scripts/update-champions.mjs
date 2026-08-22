import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DATA_DRAGON_BASE_URL,
  DEFAULT_CHAMPION_LOCALE,
  normalizeChampionData,
  validateChampionDataDocument
} from '../src/domain/championData.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(scriptDirectory, '..', 'src', 'data', 'champions.json');
const requestTimeoutMs = 15_000;

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) });
  if (!response.ok) {
    throw new Error(`下載失敗（${response.status}）：${url}`);
  }

  return response.json();
}

async function readExistingDocument() {
  try {
    const content = await fs.readFile(outputPath, 'utf8');
    const document = JSON.parse(content);
    validateChampionDataDocument(document);
    return document;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      console.warn('既有英雄資料不是有效 JSON，將視為沒有上一版資料。');
      return null;
    }
    throw error;
  }
}

function getChampionNames(document) {
  return new Set((document?.champions || []).map((champion) => champion.name));
}

function getDifference(previous, next) {
  const previousNames = getChampionNames(previous);
  const nextNames = getChampionNames(next);

  return {
    added: [...nextNames].filter((name) => !previousNames.has(name)).sort((a, b) => a.localeCompare(b, 'zh-Hant')),
    removed: [...previousNames].filter((name) => !nextNames.has(name)).sort((a, b) => a.localeCompare(b, 'zh-Hant'))
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
  console.log('讀取 Data Dragon 版本清單…');
  const versions = await fetchJson(`${DATA_DRAGON_BASE_URL}/api/versions.json`);
  if (!Array.isArray(versions) || versions.length === 0 || typeof versions[0] !== 'string') {
    throw new Error('Data Dragon 版本清單格式錯誤');
  }

  const version = versions[0];
  const sourceUrl = `${DATA_DRAGON_BASE_URL}/cdn/${encodeURIComponent(version)}/data/${DEFAULT_CHAMPION_LOCALE}/champion.json`;
  console.log(`下載 ${version} / ${DEFAULT_CHAMPION_LOCALE} 英雄資料…`);
  const rawData = await fetchJson(sourceUrl);
  const document = normalizeChampionData(rawData, {
    version,
    locale: DEFAULT_CHAMPION_LOCALE
  });
  validateChampionDataDocument(document);

  const previous = await readExistingDocument();
  const difference = getDifference(previous, document);
  await writeAtomically(document);

  console.log(`已更新 ${path.relative(process.cwd(), outputPath)}`);
  console.log(`資料版本：${document.version}`);
  console.log(`英雄數量：${document.champions.length}`);
  console.log(`新增：${difference.added.length ? difference.added.join('、') : '無'}`);
  console.log(`移除：${difference.removed.length ? difference.removed.join('、') : '無'}`);
}

main().catch((error) => {
  console.error(`英雄資料更新失敗：${error.message}`);
  process.exitCode = 1;
});
