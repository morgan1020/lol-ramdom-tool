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
    '### 🎲 英雄聯盟分路結果',
    '> 🛡️ **阿哲**　上路／打野',
    '> 🔮 **小明**　中路／輔助',
    '> 🏹 **安妮**　下路／上路'
  ].join('\n'));
});

test('五人結果只顯示主位', () => {
  const text = formatCopyText([{ name: '小美', main: '輔助', secondary: '' }]);

  assert.equal(text, '### 🎲 英雄聯盟分路結果\n> 💚 **小美**　輔助');
  assert.doesNotMatch(text, /／|副位/);
});

