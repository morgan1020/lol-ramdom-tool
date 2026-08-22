import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAMPION_DATA_SCHEMA_VERSION,
  CHAMPION_DATA_SOURCE,
  normalizeChampionData,
  validateChampionDataDocument
} from '../src/domain/championData.js';

function createRawData() {
  return {
    type: 'champion',
    version: '16.16.1',
    data: {
      Ahri: {
        id: 'Ahri',
        key: '103',
        name: '阿璃',
        image: { full: 'Ahri.png' }
      },
      Aatrox: {
        id: 'Aatrox',
        key: '266',
        name: '厄薩斯',
        image: { full: 'Aatrox.png' }
      }
    }
  };
}

test('normalizeChampionData 會產生穩定的版本化英雄資料', () => {
  const document = normalizeChampionData(createRawData(), {
    version: '16.16.1',
    locale: 'zh_TW',
    updatedAt: '2026-08-22T00:00:00.000Z'
  });

  assert.equal(document.schemaVersion, CHAMPION_DATA_SCHEMA_VERSION);
  assert.equal(document.source, CHAMPION_DATA_SOURCE);
  assert.equal(document.locale, 'zh_TW');
  assert.deepEqual(document.champions.map((champion) => champion.id), ['Aatrox', 'Ahri']);
  assert.equal(document.champions[1].imageUrl, 'https://ddragon.leagueoflegends.com/cdn/16.16.1/img/champion/Ahri.png');
});

test('normalizeChampionData 遇到缺少必要欄位時會拒絕資料', () => {
  const rawData = createRawData();
  delete rawData.data.Ahri.image;

  assert.throws(() => normalizeChampionData(rawData, { version: '16.16.1' }), /英雄資料缺少圖片/);
});

test('validateChampionDataDocument 會拒絕重複英雄', () => {
  const document = normalizeChampionData(createRawData(), { version: '16.16.1' });
  document.champions.push({ ...document.champions[0] });

  assert.throws(() => validateChampionDataDocument(document), /英雄資料包含重複項目/);
});
