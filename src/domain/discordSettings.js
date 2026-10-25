import { normalizeDiscordWebhook } from './discordSync.js';
import { getDiscordWebhookId } from './discordDestinations.js';

export const STORAGE_DISCORD_SYNC = 'lolDiscordSync';
export const DEFAULT_DISCORD_SYNC = { schemaVersion: 2, destinations: [], activeDestinationId: '', enabled: false };

function emptySettings() {
  return { ...DEFAULT_DISCORD_SYNC, destinations: [] };
}

export function normalizeDiscordSettings(settings) {
  // 保留舊版 Webhook 網址與啟用狀態。
  if (!settings.schemaVersion && settings.webhookUrl) {
    const webhookUrl = normalizeDiscordWebhook(settings.webhookUrl);
    const id = getDiscordWebhookId(webhookUrl);
    return { ...emptySettings(), destinations: [{ id, webhookUrl, label: `Webhook ${id}` }], activeDestinationId: id, enabled: settings.enabled === true };
  }
  if (settings.schemaVersion !== 2 || !Array.isArray(settings.destinations)) throw new Error('Discord 設定格式錯誤');
  const ids = new Set();
  const destinations = settings.destinations.map((destination) => {
    const webhookUrl = normalizeDiscordWebhook(destination.webhookUrl);
    const id = getDiscordWebhookId(webhookUrl);
    if (destination.id !== id || ids.has(id)) throw new Error('Discord 設定重複或格式錯誤');
    ids.add(id);
    return {
      id,
      webhookUrl,
      label: (typeof destination.label === 'string' && destination.label.trim()) ? destination.label.trim().slice(0, 80) : (typeof destination.info?.webhookName === 'string' && destination.info.webhookName.slice(0, 80)) || `Webhook ${id}`
    };
  });
  const activeDestinationId = ids.has(settings.activeDestinationId) ? settings.activeDestinationId : '';
  return { schemaVersion: 2, destinations, activeDestinationId, enabled: Boolean(activeDestinationId) && settings.enabled === true };
}


