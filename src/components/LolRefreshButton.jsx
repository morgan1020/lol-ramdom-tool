import React, { useState } from 'react';
import { UiIcon } from './UiIcon.jsx';

export function LolRefreshButton({ disabled, loading, onRefresh }) {
  const [refreshCount, setRefreshCount] = useState(0);

  return <button className="btn icon-action lol-refresh-button" type="button" disabled={disabled || loading}
    aria-label="讀取 LoL 隊伍" title={loading ? '讀取中…' : '讀取 LoL 隊伍'} aria-busy={loading}
    onClick={() => {
      setRefreshCount(count => count + 1);
      onRefresh();
    }}>
    <span key={refreshCount} className={refreshCount ? 'is-spinning' : undefined}><UiIcon name="refresh" /></span>
  </button>;
}
