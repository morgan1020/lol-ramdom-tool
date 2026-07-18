import React from 'react';
import { positions } from '../domain/draw.js';

const roleAssets = {
  上路: '/assets/roles/Top_icon.png',
  打野: '/assets/roles/Jungle_icon.png',
  中路: '/assets/roles/Middle_icon.png',
  下路: '/assets/roles/Bottom_icon.png',
  輔助: '/assets/roles/Support_icon.png'
};

function RoleColumn({ role, label }) {
  return (
    <div className="role-col">
      {label && <span className="role-label">{label}</span>}
      <img src={roleAssets[role]} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
      <div className="role-name">{role}</div>
    </div>
  );
}

export function PlayerCard({ player, result, preferredRole, hasDrawn, onRemove, onPreferredRoleChange }) {
  return (
    <article className={result ? 'player-card has-result' : 'player-card'}>
      {!hasDrawn && (
        <button className="btn-remove" type="button" title="移除玩家" onClick={() => onRemove(player)}>×</button>
      )}
      <div className="card-header">
        <div className="card-name">{player}</div>
      </div>

      {!hasDrawn && (
        <label className="preferred-role-control">
          <span>偏好主位</span>
          <select value={preferredRole || ''} onChange={(event) => onPreferredRoleChange(player, event.target.value)}>
            <option value="">隨機</option>
            {positions.map((position) => (
              <option key={position} value={position}>{position}</option>
            ))}
          </select>
        </label>
      )}

      {result && (
        <div className="card-result">
          <RoleColumn role={result.main} label={result.secondary ? '主要' : ''} />
          {result.secondary && (
            <>
              <div className="role-divider" aria-hidden="true" />
              <RoleColumn role={result.secondary} label="次要" />
            </>
          )}
        </div>
      )}
    </article>
  );
}
