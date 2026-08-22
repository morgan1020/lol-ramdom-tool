import React, { useState } from 'react';
import { drawChampion } from '../domain/drawChampion.js';

export function ChampionDrawPanel({ championData }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleDraw = () => {
    try {
      setResult(drawChampion(championData.champions));
      setError('');
    } catch (drawError) {
      setResult(null);
      setError(drawError.message || '抽英雄失敗，請重試');
    }
  };

  return (
    <section className="champion-flow" aria-labelledby="champion-draw-title">
      <div className="flow-heading">
        <span>獨立模式</span>
        <h2 id="champion-draw-title">抽英雄</h2>
        <p>從目前版本的全部英雄中，隨機抽出一隻英雄。</p>
      </div>
      <div className="champion-panel">
        {result ? (
          <article className="champion-result" aria-live="polite">
            <div className="champion-image-frame">
              <img src={result.imageUrl} alt={result.name} onError={(event) => { event.currentTarget.style.display = 'none'; }} />
            </div>
            <span className="card-kicker">本次英雄</span>
            <h3>{result.name}</h3>
            <p className="champion-id">{result.id}</p>
          </article>
        ) : (
          <div className="champion-empty" role="status">按下按鈕開始抽英雄</div>
        )}
        {error && <p className="champion-error" role="alert">{error}</p>}
        <div className="champion-actions">
          <button className="btn btn-primary btn-large" type="button" onClick={handleDraw}>{result ? '重新抽一隻' : '開始抽英雄'}</button>
        </div>
        <p className="champion-data-meta">資料版本：{championData.version}　·　共 {championData.champions.length} 隻英雄</p>
      </div>
    </section>
  );
}
