import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawChampion } from '../src/domain/drawChampion.js';
import {
  CHAMPION_POSITION_KEYS,
  getChampionsForPosition,
  normalizeChampionPosition,
  normalizeChampionPositions,
  parseCommunityDragonPositionSource,
  validateChampionPositionsDocument
} from '../src/domain/championPositions.js';

const sourceVersion = `sha256:${'a'.repeat(64)}`;
const sourcePositions = {};
const champions = [];

for (const [positionIndex, position] of CHAMPION_POSITION_KEYS.entries()) {
  const sourcePosition = position === 'SUPPORT' ? 'UTILITY' : position;
  sourcePositions[sourcePosition] = {};

  for (let index = 1; index <= 10; index += 1) {
    const numericId = String(positionIndex * 10 + index);
    const id = `${position}Champion${index}`;
    champions.push({ id, key: numericId, name: `${position}英雄${index}`, imageUrl: `https://example.com/${id}.png` });
    sourcePositions[sourcePosition][numericId] = 0.01 * index;
  }
}

const championData = { version: '16.16.1', champions };

function createDocument(overrides = {}) {
  return normalizeChampionPositions(sourcePositions, championData, {
    sourceVersion,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides
  });
}

test('位置名稱會正規化，UTILITY 會合併為輔助', () => {
  assert.equal(normalizeChampionPosition('top'), 'TOP');
  assert.equal(normalizeChampionPosition('UTILITY'), 'SUPPORT');
  assert.throws(() => normalizeChampionPosition('ADC'), /不支援的英雄路線/);
});

test('CommunityDragon 來源只接受唯一且可驗證的 JSON.parse 資料區塊', () => {
  const source = `prefix JSON.parse('${JSON.stringify(sourcePositions)}') suffix`;
  assert.deepEqual(parseCommunityDragonPositionSource(source), sourcePositions);
  assert.throws(() => parseCommunityDragonPositionSource('沒有資料'), /找到 0 個/);
  assert.throws(() => parseCommunityDragonPositionSource(`${source}${source}`), /找到 2 個/);
});

test('位置資料使用 Data Dragon 數字 key 對照穩定英雄 ID', () => {
  const document = createDocument();

  assert.equal(document.dataDragonVersion, championData.version);
  assert.equal(document.positions.TOP.length, 10);
  assert.ok(document.positions.TOP.includes('TOPChampion1'));
  assert.equal(document.positions.SUPPORT.length, 10);
  assert.ok(document.positions.SUPPORT.includes('SUPPORTChampion1'));
});

test('未知英雄、缺少路線與不合理數量會拒絕產生更新資料', () => {
  const unknownChampion = structuredClone(sourcePositions);
  unknownChampion.TOP['9999'] = 0.1;
  assert.throws(() => normalizeChampionPositions(unknownChampion, championData, { sourceVersion }), /無法對應 Data Dragon/);

  const missingPosition = structuredClone(sourcePositions);
  delete missingPosition.JUNGLE;
  assert.throws(() => normalizeChampionPositions(missingPosition, championData, { sourceVersion }), /打野英雄數量不合理/);

  const tooFewChampions = structuredClone(sourcePositions);
  tooFewChampions.MIDDLE = { '21': 0.1 };
  assert.throws(() => normalizeChampionPositions(tooFewChampions, championData, { sourceVersion }), /中路英雄數量不合理/);
});

test('各路篩選只回傳該路英雄，抽取結果也屬於所選路線', () => {
  const document = createDocument();

  for (const position of CHAMPION_POSITION_KEYS) {
    const pool = getChampionsForPosition(champions, document, position);
    const expectedIds = new Set(document.positions[position]);
    assert.equal(pool.length, 10);
    assert.ok(pool.every((champion) => expectedIds.has(champion.id)));
    assert.ok(expectedIds.has(drawChampion(pool).id));
  }
});

test('所選路線英雄池為空時會回報明確錯誤', () => {
  const document = createDocument();
  document.positions.TOP = [];
  assert.throws(() => getChampionsForPosition(champions, document, 'TOP'), /上路英雄池為空/);
});

test('專案內英雄與位置快照版本一致且五路皆通過驗證', () => {
  const actualChampionData = JSON.parse(readFileSync(new URL('../src/data/champions.json', import.meta.url), 'utf8'));
  const actualPositionData = JSON.parse(readFileSync(new URL('../src/data/champion-positions.json', import.meta.url), 'utf8'));

  assert.doesNotThrow(() => validateChampionPositionsDocument(actualPositionData, actualChampionData));
});


test('不限路線包含未列於分路資料的英雄，且不依賴位置資料', () => {
  const champions = [{ id: 'A' }, { id: 'B' }, { id: 'Unassigned' }];
  const pool = getChampionsForPosition(champions, null, 'ALL');
  assert.deepEqual(pool, champions);
  assert.notEqual(pool, champions);
  pool.pop();
  assert.equal(champions.length, 3);
});
