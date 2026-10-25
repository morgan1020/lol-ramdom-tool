import { notify, dismissNotice } from '../notifications.js';
import React, { useEffect, useState } from 'react';
import { getActiveDiscordDestination, getDiscordDestinationLabel } from '../domain/discordDestinations.js';
import { UiIcon } from './UiIcon.jsx';
import { DiscordDestinationPicker } from './DiscordDestinationPicker.jsx';
import { ToggleSwitch } from './ToggleSwitch.jsx';

export function DiscordSyncPanel({ settings, status, onSelect, onToggle, disabled = false, label = 'Discord 同步', showDestination = true }) {
  const setError = message => { if (message) notify(message, { id: 'discord-controls', type: 'error' }); else dismissNotice('discord-controls'); };
  const [pending, setPending] = useState(false);
  const active = getActiveDiscordDestination(settings);
  const sending = disabled || status.state === 'sending' || pending;
  const runAction = async (action) => {
    setPending(true);
    try { await action(); setError(''); }
    catch (actionError) { notify(actionError.message || '無法儲存設定', { id: 'discord-controls', type: 'error', action: { label: '重試', onClick: () => runAction(action) } }); return false; }
    finally { setPending(false); }
  };
  return <section className="discord-sync-controls" aria-label="Discord 同步">
    <span className="discord-sync-label"><UiIcon name="send" />{label}</span>
    <ToggleSwitch enabled={settings.enabled} disabled={sending} unavailable={!active} label="Discord 自動同步" onToggle={() => runAction(onToggle)} />
    {showDestination && <div className="discord-panel-destination"><DiscordDestinationPicker settings={settings} disabled={sending} onSelect={id => runAction(() => onSelect(id))} /></div>}
  </section>;
}

export function DiscordSyncStatus({ status, onRetry }) {
  useEffect(() => { if (status.message) notify(status.message, { id: 'discord-status', type: status.state === 'error' ? 'error' : 'success', ...(status.state === 'error' ? { action: { label: '重送', onClick: onRetry } } : {}) }); }, [status.message, status.state, onRetry]);
  return null;
}
