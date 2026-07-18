import React from 'react';

export function PlayerInput({ value, playerCount, hasDrawn, disabled, onChange, onAdd, onEdit, onDraw, onCopy }) {
  return (
    <div className="input-group">
      <input
        type="text"
        value={value}
        disabled={disabled || hasDrawn}
        placeholder={`輸入玩家名稱... (目前 ${playerCount}/5)`}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onAdd();
        }}
      />
      {!hasDrawn && (
        <button className="btn btn-primary" type="button" onClick={onAdd}>加入玩家</button>
      )}
      {hasDrawn && (
        <button className="btn btn-secondary" type="button" onClick={onEdit}>修改名單</button>
      )}
      <button className="btn btn-primary" type="button" disabled={playerCount === 0} onClick={onDraw}>
        {hasDrawn ? '重新抽籤' : '開始抽籤'}
      </button>
      {hasDrawn && (
        <button className="btn btn-secondary" type="button" onClick={onCopy}>複製結果</button>
      )}
    </div>
  );
}
