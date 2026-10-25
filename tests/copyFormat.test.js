import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCopyText } from '../src/domain/copyFormat.js';

test('複製格式依主位排序並以每位玩家一行顯示副位', () => {
  const text = formatCopyText([
    { name: '安妮', main: '下路', secondary: '上路' },
    { name: '阿哲', main: '上路', secondary: '打野' },
    { name: '小明', main: '中路', secondary: '輔助' }
  ]);

  assert.equal(text, [
    '### 英雄聯盟分路結果',
    '> **阿哲**　上路／打野',
    '> **小明**　中路／輔助',
    '> **安妮**　下路／上路'
  ].join('\n'));
});

test('複製五人結果固定依上野中下輔排序，且不改動原始結果', () => {
  const results = [
    { name: '輔助玩家', main: '輔助' },
    { name: '下路玩家', main: '下路' },
    { name: '中路玩家', main: '中路' },
    { name: '打野玩家', main: '打野' },
    { name: '上路玩家', main: '上路' }
  ];
  const original = structuredClone(results);

  assert.equal(formatCopyText(results), [
    '### 英雄聯盟分路結果',
    '> **上路玩家**　上路',
    '> **打野玩家**　打野',
    '> **中路玩家**　中路',
    '> **下路玩家**　下路',
    '> **輔助玩家**　輔助'
  ].join('\n'));
  assert.deepEqual(results, original);
});

test('五人結果只顯示主位', () => {
  const text = formatCopyText([{ name: '小美', main: '輔助', secondary: '' }]);

  assert.equal(text, '### 英雄聯盟分路結果\n> **小美**　輔助');
  assert.doesNotMatch(text, /／|副位/);
});

