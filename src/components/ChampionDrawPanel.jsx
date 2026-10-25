import { notify, dismissNotice } from '../notifications.js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { drawChampion } from '../domain/drawChampion.js';
import { preloadImage } from '../domain/preloadImage.js';
import {
  CHAMPION_POOL_KEYS,
  CHAMPION_POSITION_LABELS,
  getChampionsForPosition
} from '../domain/championPositions.js';

export function ChampionDrawPanel({ championData, positionData, selectedPosition, onPositionChange }) {
  const [result, setResult] = useState(null);
  const [queuedResult, setQueuedResult] = useState(null);
  const [isPreparing, setIsPreparing] = useState(true);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealVersion, setRevealVersion] = useState(0);
  const [resultImageFailed, setResultImageFailed] = useState(false);

  const prepareRequestId = useRef(0);
  const revealTimer = useRef(null);

  const prepareNextChampion = useCallback(async (position) => {
    const requestId = prepareRequestId.current + 1;
    prepareRequestId.current = requestId;
    setQueuedResult(null);
    setIsPreparing(true);

    try {
      const pool = getChampionsForPosition(championData.champions, positionData, position);
      const champion = drawChampion(pool);
      const imageStatus = await preloadImage(champion.imageUrl);
      if (prepareRequestId.current !== requestId) return;

      dismissNotice('champion-prepare');
      setQueuedResult({ champion, imageStatus });

    } catch (prepareError) {
      if (prepareRequestId.current !== requestId) return;
      notify(prepareError.message || '準備英雄失敗', { id: 'champion-prepare', type: 'error', action: { label: '重試', onClick: () => prepareNextChampion(position) } });
      return false;
    } finally {
      if (prepareRequestId.current === requestId) setIsPreparing(false);
    }
  }, [championData, positionData]);

  useEffect(() => {
    prepareNextChampion(selectedPosition);
    return () => {
      prepareRequestId.current += 1;
    };
  }, [prepareNextChampion, selectedPosition]);

  useEffect(() => () => { clearTimeout(revealTimer.current); dismissNotice('champion-prepare'); }, []);

  const handleDraw = () => {
    if (!queuedResult || isPreparing || isRevealing) return;

    clearTimeout(revealTimer.current);
    setResult(queuedResult.champion);
    setResultImageFailed(queuedResult.imageStatus === 'error');
    setRevealVersion((version) => version + 1);
    setIsRevealing(true);

    notify('英雄已抽出', { id: 'champion-draw' });
    prepareNextChampion(selectedPosition);
    revealTimer.current = setTimeout(() => setIsRevealing(false), 240);
  };

  const handlePositionChange = (position) => {
    clearTimeout(revealTimer.current);
    setIsRevealing(false);
    onPositionChange(position);
    setResult(null);
    setResultImageFailed(false);
    setError('');
    if (position === selectedPosition) prepareNextChampion(position);
  };

  const selectedPositionLabel = CHAMPION_POSITION_LABELS[selectedPosition];
  const selectedPoolSize = selectedPosition === 'ALL' ? championData.champions.length : positionData.positions[selectedPosition].length;

  return (
    <section className="champion-flow" aria-labelledby="champion-draw-title">
      <div className="flow-heading">
        <span>獨立模式</span>
        <h1 id="champion-draw-title">抽一位英雄</h1>
      </div>
      <div className="champion-panel">
        <div className="champion-position-picker" role="group" aria-label="選擇英雄路線">
          {CHAMPION_POOL_KEYS.map((position) => (
            <button
              key={position}
              className={selectedPosition === position ? 'champion-position is-selected' : 'champion-position'}
              type="button"
              aria-pressed={selectedPosition === position}
              onClick={() => handlePositionChange(position)}
            >
              {CHAMPION_POSITION_LABELS[position]}
            </button>
          ))}
        </div>
        {result ? (
          <article key={revealVersion} className="champion-result" aria-live="polite">
            <div className="champion-image-frame">
              {resultImageFailed ? (
                <span className="champion-image-fallback">{result.name}</span>
              ) : (
                <img src={result.imageUrl} alt={result.name} onError={() => setResultImageFailed(true)} />
              )}
            </div>
            <span className="card-kicker">本次英雄</span>
            <h3>{result.name}</h3>
            <p className="champion-id">{result.id}</p>
          </article>
        ) : (
          <div className="champion-empty" role="status">{isPreparing ? `正在準備${selectedPositionLabel}英雄…` : '按下按鈕開始抽英雄'}</div>
        )}
        <div className="champion-actions">
          <button className="btn btn-primary btn-large" type="button" disabled={isPreparing || isRevealing || !queuedResult} onClick={handleDraw}>
            {isRevealing ? '揭曉中…' : isPreparing ? '準備下一隻…' : result ? '重新抽一隻' : '開始抽英雄'}
          </button>
        </div>
        <p className="champion-data-meta">資料版本：{positionData.version}　·　{selectedPositionLabel}英雄池：{selectedPoolSize} 隻</p>
      </div>
    </section>
  );
}
