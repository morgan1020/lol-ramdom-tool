import React from 'react';

export function PlayerInput({ value, playerCount, disabled, onChange, onAdd }) {
  return (
    <div className="player-input">
      <label className="field-label" htmlFor="player-name">新增玩家</label>
      <div className="input-group">
        <input
          id="player-name"
        type="text"
        value={value}
        disabled={disabled}
        placeholder={`輸入玩家名稱（${playerCount}/5）`}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onAdd();
        }}
        />
        <button className="btn btn-secondary" type="button" disabled={disabled} onClick={onAdd}>加入</button>
      </div>
    </div>
  );
}
