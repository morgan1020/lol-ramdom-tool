import React from 'react';
import { UiIcon } from './UiIcon.jsx';

export function DiscordDrawStatus({ enabled, destination, status }) {
  const state = !enabled ? 'off' : !destination ? 'unconfigured' : status.state;
  const labels = { off: '未啟用', unconfigured: '未設定', idle: '待傳送', sending: '傳送中', sent: '已傳送', error: '傳送失敗' };
  const label = labels[state] || '待傳送';
  const active = Boolean(enabled && destination);
  const availability = !destination ? '尚未設定' : active ? '傳送已開啟' : '傳送已關閉';
  const detail = `${destination || 'Discord'} · ${availability}${active ? ` · ${label}${status.message ? ` · ${status.message}` : ''}` : ''}`;
  return <div className={`discord-draw-status is-${state}`} data-state={state} role="status" aria-live="polite" aria-label={`Discord：${destination || '未設定'}，${availability}`} title={detail}>
    <UiIcon name="discord" /><span className="discord-destination-name">{destination || 'Discord'}</span><span className={`discord-availability${active ? ' is-enabled' : ''}`}><UiIcon name={active ? 'send' : 'sendOff'} />{availability}</span>
  </div>;
}
