import React from 'react';
import { getActiveDiscordDestination, getDiscordDestinationLabel } from '../domain/discordDestinations.js';
import { SelectMenu } from './SelectMenu.jsx';

export function DiscordDestinationPicker({ settings, disabled, onSelect }) {
  const active = getActiveDiscordDestination(settings);
  if (settings.destinations.length < 2) {
    const label = active ? getDiscordDestinationLabel(active) : '未設定';
    return <span className="discord-destination-static" title={`Discord：${label}`}>{label}</span>;
  }
  return <SelectMenu className="discord-destination-picker" triggerClassName="discord-destination-trigger" menuClassName="discord-destination-menu" label="本次傳送位置" value={settings.activeDestinationId} options={settings.destinations.map(destination => ({ value: destination.id, label: getDiscordDestinationLabel(destination) }))} disabled={disabled} onChange={onSelect} />;
}
