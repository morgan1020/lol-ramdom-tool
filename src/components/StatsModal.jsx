import { ModalFrame } from './ModalFrame.jsx';
import { UiIcon } from './UiIcon.jsx';
import React from 'react';
import { positions } from '../domain/draw.js';
import { sortPlayerNames } from '../domain/stats.js';
import { createPlayerLabels } from '../domain/playerNames.js';

export function StatsModal({ open, stats, onClose, onClear }) {

  const names = sortPlayerNames(stats);
  const labels = createPlayerLabels(names);

  return (
    <ModalFrame open={open} onClose={onClose} labelId="stats-title">
      <section className="stats-content" aria-labelledby="stats-title">
        <div className="stats-header">
          <h2 id="stats-title">歷史統計</h2>
          <button className="stats-close" type="button" onClick={onClose} aria-label="關閉統計"><UiIcon name="close" /></button>
        </div>
        <div className="stats-scroll">
          <table>
            <thead>
              <tr>
                <th>玩家</th>
                {positions.map((position) => <th key={position}>{position}</th>)}
              </tr>
            </thead>
            <tbody>
              {names.map((name) => (
                <tr key={name}>
                  <td>{labels[name]}</td>
                  {positions.map((position) => <td key={position}>{stats[name]?.[position] || 0}</td>)}
                </tr>
              ))}
              {names.length === 0 && (
                <tr><td colSpan={positions.length + 1}>尚無統計紀錄</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="stats-actions"><p className="shortcut-hint">快捷鍵：<kbd>Z</kbd> 修改名單 <kbd>X</kbd> 修改偏好 <kbd>C</kbd> 複製結果 <kbd>Enter</kbd> 再抽一次</p>
          <button className="btn btn-secondary btn-danger-text" type="button" onClick={onClear}>清空紀錄</button>
        </div>
      </section>
    </ModalFrame>
  );
}
