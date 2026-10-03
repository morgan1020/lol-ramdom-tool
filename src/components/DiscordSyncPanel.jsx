import React, { useState } from 'react';
import { getActiveDiscordDestination, getDiscordDestinationLabel } from '../domain/discordDestinations.js';

export function DiscordSyncPanel({ settings, status, onSelect, onToggle }) {
  const [error, setError] = useState('');
  const active = getActiveDiscordDestination(settings);
  const sending = status.state === 'sending';
  const runAction = (action) => {
    try { action(); setError(''); }
    catch (actionError) { setError(actionError.message); }
  };
  return <section className="discord-sync-controls" aria-label="Discord 同步">
    <span className="discord-sync-label">Discord <span>同步</span></span>
    <button className="discord-sync-switch" type="button" role="switch" aria-checked={settings.enabled} aria-label="Discord 自動同步" disabled={sending || !active} onClick={() => runAction(onToggle)}>
      <span className="discord-switch-track" aria-hidden="true"><span /></span>
    </button>
    {settings.destinations.length > 1 ? <div className="discord-destination-select"><select aria-label="本次傳送位置" value={settings.activeDestinationId} disabled={sending} onChange={(event) => runAction(() => onSelect(event.target.value))}>
      {!active && <option value="" disabled>選擇 Webhook</option>}
      {settings.destinations.map((destination) => <option key={destination.id} value={destination.id}>{getDiscordDestinationLabel(destination)}</option>)}
    </select><svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" /></svg></div> : <span className="discord-current-name">{active ? getDiscordDestinationLabel(active) : '請先到設定頁新增 Webhook'}</span>}
    {error && <p className="discord-sync-error" role="alert">{error}</p>}
  </section>;
}

export function DiscordSyncStatus({ status, onRetry }) {
  if (!status.message) return null;
  return <div className={`discord-sync-status is-${status.state}`} role={status.state === 'error' ? 'alert' : 'status'}>
    <p>{status.message}</p>
    {status.state === 'error' && <button className="btn btn-secondary" type="button" onClick={onRetry}>重送本次結果</button>}
  </div>;
}
