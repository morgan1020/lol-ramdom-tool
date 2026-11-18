import React from 'react';
import { positions } from '../domain/draw.js';
import { RoleIcon } from './RoleIcon.jsx';
import { SelectMenu } from './SelectMenu.jsx';
import { UiIcon } from './UiIcon.jsx';

export function CardRolePicker({ player, players, labels, preferences, disabled, onOpen, onChange }) {
  return <SelectMenu
    className="sync-role-picker"
    menuClassName="sync-role-menu"
    label={`${labels[player.name]} 的主位偏好`}
    value={preferences[player.name] ?? ''}
    disabled={disabled} onOpen={onOpen}
    options={[{ value: '', label: '交給抽籤', icon: <UiIcon name="shuffle" /> }, ...positions.map(role => {
      const owner = players.find(other => other.name !== player.name && preferences[other.name] === role);
      return { value: role, label: owner ? `${role}（${labels[owner.name]}）` : role, icon: <RoleIcon role={role} />, disabled: Boolean(owner) };
    })]}
    onChange={onChange}
  />;
}
