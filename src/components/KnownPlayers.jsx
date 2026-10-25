import React from 'react';
import { createPlayerLabels } from '../domain/playerNames.js';
import { UiIcon } from './UiIcon.jsx';

export function KnownPlayers({ names, selectedPlayers, disabled, onToggle }) {
  const labels = createPlayerLabels(names);
  if (names.length === 0) {
    return <div className="known-hints"><span className="muted-text">尚未累積歷史玩家</span></div>;
  }

  return (
    <div className="known-hints" aria-label="歷史玩家">
      {names.map((name) => {
        const selected = selectedPlayers.includes(name);
        return (
          <button
            key={name}
            className={selected ? 'known-chip is-selected' : 'known-chip'}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            title={`${name} · ${selected ? '點擊取消選取' : '點擊加入名單'}`}
            onClick={() => onToggle(name)}
          >
            <UiIcon name={selected ? 'check' : 'plus'} />
            <span>{labels[name]}</span>
          </button>
        );
      })}
    </div>
  );
}
