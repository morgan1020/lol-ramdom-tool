import React from 'react';
import { positions } from '../domain/draw.js';
import { RoleIcon } from './RoleIcon.jsx';

function RoleColumn({ role, label }) {
  return <div className="role-col">{label && <span className="role-label">{label}</span>}<RoleIcon role={role} /><div className="role-name">{role}</div></div>;
}

export function PlayerCard({ player, result, preferredRole, hasDrawn, unavailableRoles = [], onRemove, onPreferredRoleChange }) {
  return <article className={result ? 'player-card has-result' : 'player-card'}>
    {!hasDrawn && onRemove && <button className="btn-remove" type="button" title="移除玩家" aria-label={`移除 ${player}`} onClick={() => onRemove(player)}>×</button>}
    <div className="card-header"><span className="card-kicker">召喚師</span><div className="card-name">{player}</div></div>
    {!hasDrawn && <div className="preferred-role-control"><span>偏好主位 <em>可略過</em></span><div className="role-picker" role="group" aria-label={`${player} 的偏好主位`}>
      <button className={preferredRole ? 'role-choice' : 'role-choice is-selected'} type="button" onClick={() => onPreferredRoleChange(player, '')}>隨機</button>
      {positions.map((position) => {
        const selected = preferredRole === position;
        const unavailable = unavailableRoles.includes(position) && !selected;
        return <button key={position} className={selected ? 'role-choice is-selected' : 'role-choice'} type="button" disabled={unavailable} title={unavailable ? '已被其他玩家選為偏好主位' : position} onClick={() => onPreferredRoleChange(player, position)}><RoleIcon role={position} /><span>{position}</span></button>;
      })}
    </div></div>}
    {result && <div className="card-result"><RoleColumn role={result.main} label={result.secondary ? '主要' : ''} />{result.secondary && <><div className="role-divider" aria-hidden="true" /><RoleColumn role={result.secondary} label="次要" /></>}</div>}
  </article>;
}
