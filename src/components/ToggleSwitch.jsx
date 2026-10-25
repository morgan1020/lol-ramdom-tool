import React from 'react';
import { UiIcon } from './UiIcon.jsx';

export function ToggleSwitch({ enabled, disabled, unavailable = false, label, onToggle }) {
  return <button className="discord-sync-switch" type="button" role="switch" aria-checked={enabled} aria-label={label} title={unavailable ? '請先設定傳送位置' : `${enabled ? '關閉' : '開啟'}${label}`} disabled={disabled || unavailable} onClick={onToggle}>
    <span className="discord-switch-caption" aria-hidden="true">{unavailable ? '未設定' : enabled ? '開啟' : '關閉'}</span>
    <span className="discord-switch-track" aria-hidden="true"><span><UiIcon name={enabled ? 'check' : 'close'} /></span></span>
  </button>;
}
