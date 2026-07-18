import test from 'node:test';
import assert from 'node:assert/strict';
import { getResultShortcutAction } from '../src/domain/resultShortcuts.js';

const resultPage = { step: 'result', isStatsOpen: false, isDrawing: false, hasModifier: false, isInteractiveTarget: false };

test('結果頁的 Z、X、C 對應既有操作', () => {
  assert.equal(getResultShortcutAction({ ...resultPage, key: 'z' }), 'roster');
  assert.equal(getResultShortcutAction({ ...resultPage, key: 'x' }), 'preferences');
  assert.equal(getResultShortcutAction({ ...resultPage, key: 'c' }), 'copy');
});

test('Enter 只在結果頁且非互動元件焦點時重抽', () => {
  assert.equal(getResultShortcutAction({ ...resultPage, key: 'Enter' }), 'draw');
  assert.equal(getResultShortcutAction({ ...resultPage, key: 'Enter', isInteractiveTarget: true }), null);
  assert.equal(getResultShortcutAction({ ...resultPage, key: 'Enter', isDrawing: true }), null);
});

test('統計視窗、其他步驟與修飾鍵不觸發結果頁快捷鍵', () => {
  assert.equal(getResultShortcutAction({ ...resultPage, key: 'z', isStatsOpen: true }), null);
  assert.equal(getResultShortcutAction({ ...resultPage, key: 'c', step: 'preferences' }), null);
  assert.equal(getResultShortcutAction({ ...resultPage, key: 'x', hasModifier: true }), null);
});