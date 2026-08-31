import test from 'node:test';
import assert from 'node:assert/strict';
import { preloadImage } from '../src/domain/preloadImage.js';

function createFakeImage(outcome) {
  return {
    onload: null,
    onerror: null,
    set src(value) {
      this.currentSrc = value;
      if (outcome === 'loaded') queueMicrotask(() => this.onload?.());
      if (outcome === 'error') queueMicrotask(() => this.onerror?.());
    }
  };
}

test('圖片預載成功後回報 loaded', async () => {
  const result = await preloadImage('https://example.com/champion.png', {
    createImage: () => createFakeImage('loaded'),
    timeoutMs: 20
  });

  assert.equal(result, 'loaded');
});

test('圖片載入失敗時回報 error', async () => {
  const result = await preloadImage('https://example.com/champion.png', {
    createImage: () => createFakeImage('error'),
    timeoutMs: 20
  });

  assert.equal(result, 'error');
});

test('圖片載入超時時會停止等待', async () => {
  const result = await preloadImage('https://example.com/champion.png', {
    createImage: () => createFakeImage('pending'),
    timeoutMs: 5
  });

  assert.equal(result, 'timeout');
});
