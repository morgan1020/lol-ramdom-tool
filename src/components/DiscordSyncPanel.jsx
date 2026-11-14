import { notify, dismissNotice } from '../notifications.js';
import React, { useState } from 'react';
import { getActiveDiscordDestination, getDiscordDestinationLabel } from '../domain/discordDestinations.js';
import { UiIcon } from './UiIcon.jsx';
import { ToggleSwitch } from './ToggleSwitch.jsx';
import { SelectMenu } from './SelectMenu.jsx';

export function DiscordSyncPanel({ settings, status, onToggle, disabled = false, label = 'Discord 同步' }) {
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
  </section>;
}

export function DrawDiscordControls({ discordSync, disabled, onManage }) {
  const { settings, status } = discordSync;
  const locked = disabled || discordSync.pending || status.state === 'sending';

  const active = getActiveDiscordDestination(settings);
  const selected = active && settings.enabled ? active.id : 'off';
  const summary = !active ? '未設定' : settings.enabled ? getDiscordDestinationLabel(active) : '不自動傳送';
  const options = [
    { value: 'off', label: '不自動傳送' },
    ...settings.destinations.map(destination => ({
      value: destination.id, label: `自動傳送到 ${getDiscordDestinationLabel(destination)}`
    })),
    { value: 'manage', label: '管理 Webhook', icon: <UiIcon name="settings" /> }
  ];

  return <SelectMenu className="draw-discord-menu" triggerClassName="discord-destination-trigger"
    menuClassName="discord-destination-menu" label="Discord" displayLabel={summary} triggerIcon={<UiIcon name="discord" />}
    value={selected} options={options} disabled={locked}
    onChange={id => id === 'manage' ? onManage() : discordSync.setDelivery(id === 'off' ? null : id)} />;
}
