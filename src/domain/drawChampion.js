export const EMPTY_CHAMPION_POOL_ERROR_MESSAGE = '英雄池不可為空';

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

export function validateChampionPool(champions) {
  if (!Array.isArray(champions)) {
    throw new Error('英雄池格式錯誤');
  }

  if (champions.length === 0) {
    throw new Error(EMPTY_CHAMPION_POOL_ERROR_MESSAGE);
  }

  return champions;
}

export function drawChampion(champions) {
  const pool = validateChampionPool(champions);
  const selected = pool[randomIndex(pool.length)];

  return { ...selected };
}
