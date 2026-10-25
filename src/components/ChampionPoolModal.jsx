import { notify, dismissNotice } from '../notifications.js';
import { ModalFrame, navigateTabs } from './ModalFrame.jsx';
import { UiIcon } from './UiIcon.jsx';
import React, { useEffect, useState } from 'react';
import {
  CHAMPION_POOL_KEYS,
  CHAMPION_POSITION_LABELS,
  getChampionsForPosition
} from '../domain/championPositions.js';

export function ChampionPoolModal({ open, championData, positionData, initialPosition, onClose }) {
  const [viewPosition, setViewPosition] = useState(initialPosition);

  useEffect(() => {
    if (open) setViewPosition(initialPosition);
  }, [initialPosition, open]);


  let champions = [];
  let error = '';
  try {
    champions = getChampionsForPosition(championData.champions, positionData, viewPosition);
  } catch (poolError) {
    error = poolError.message || '英雄池資料讀取失敗';
  }

  useEffect(() => { if (open && error) notify(error, { id: 'champion-pool', type: 'error' }); else dismissNotice('champion-pool'); }, [open, error]);
  const positionLabel = CHAMPION_POSITION_LABELS[viewPosition];

  return (
    <ModalFrame open={open} onClose={onClose} labelId="champion-pool-title">
      <section className="stats-content champion-pool-content" aria-labelledby="champion-pool-title">
        <div className="stats-header">
          <h2 id="champion-pool-title">英雄池一覽</h2>
          <button className="stats-close" type="button" onClick={onClose} aria-label="關閉英雄池一覽"><UiIcon name="close" /></button>
        </div>
        <div className="champion-pool-tabs" role="tablist" aria-label="英雄池分路" onKeyDown={navigateTabs}>
          {CHAMPION_POOL_KEYS.map((position) => (
            <button
              id={`champion-pool-tab-${position}`}
              key={position}
              className={viewPosition === position ? 'champion-pool-tab is-selected' : 'champion-pool-tab'}
              type="button"
              role="tab"
              aria-selected={viewPosition === position}
              tabIndex={viewPosition === position ? 0 : -1}
              aria-controls="champion-pool-panel"
              onClick={() => setViewPosition(position)}
            >
              {CHAMPION_POSITION_LABELS[position]}
            </button>
          ))}
        </div>
        <div
          id="champion-pool-panel"
          className="stats-scroll champion-pool-scroll"
          role="tabpanel"
          aria-labelledby={`champion-pool-tab-${viewPosition}`}
        >
          <div className="champion-pool-summary">
            <strong>{positionLabel}</strong>
            <span>{champions.length} 隻英雄</span>
          </div>
          {error ? (
            <p className="settings-note">英雄池暫時無法載入</p>
          ) : (
            <ul className="champion-name-grid">
              {champions.map((champion) => <li key={champion.id}>{champion.name}</li>)}
            </ul>
          )}
        </div>
        <div className="stats-actions champion-pool-actions">
          <p className="champion-pool-meta">位置資料版本：{positionData.version}</p>
        </div>
      </section>
    </ModalFrame>
  );
}
