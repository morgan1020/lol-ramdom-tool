import { normalizeDiscordWebhook, sendDiscordDraw } from './discordSync.js';

export function getDiscordWebhookId(webhookUrl) {
  return new URL(normalizeDiscordWebhook(webhookUrl)).pathname.split('/').at(-2);
}

export function getActiveDiscordDestination(settings) {
  return settings.destinations.find((destination) => destination.id === settings.activeDestinationId) || null;
}

export function getDiscordDestinationLabel(destination) {
  return destination?.label || `Webhook ${destination?.id || ''}`;
}

export async function sendActiveDiscordDraw(settings, results, options) {
  const destination = getActiveDiscordDestination(settings);
  if (!settings.enabled || !destination) return null;
  return sendDiscordDraw(destination.webhookUrl, results, options);
}

export function upsertDiscordDestination(settings, { webhookUrl, label = '', previousId }) {
  const normalizedUrl = normalizeDiscordWebhook(webhookUrl);
  if (!String(label).trim()) throw new Error('請填寫自訂名稱');
  const destination = {
    id: getDiscordWebhookId(normalizedUrl),
    webhookUrl: normalizedUrl,
    label: String(label).trim().slice(0, 80)
  };
  if (previousId && !settings.destinations.some((item) => item.id === previousId)) throw new Error('找不到要編輯的設定');
  if (previousId && previousId !== destination.id && settings.destinations.some((item) => item.id === destination.id)) throw new Error('這個 Webhook 已存在，請編輯原本的設定');
  const existing = settings.destinations.some((item) => item.id === destination.id);
  const replacedActive = previousId && settings.activeDestinationId === previousId;
  return {
    ...settings,
    activeDestinationId: replacedActive || !settings.activeDestinationId ? destination.id : settings.activeDestinationId,
    destinations: existing || previousId ? settings.destinations.map((item) => item.id === (previousId || destination.id) ? destination : item) : [...settings.destinations, destination]
  };
}

export function selectDiscordDestination(settings, id) {
  if (!settings.destinations.some((destination) => destination.id === id)) throw new Error('找不到這組 Discord 設定');
  return { ...settings, activeDestinationId: id };
}

export function removeDiscordDestination(settings, id) {
  const destinations = settings.destinations.filter((destination) => destination.id !== id);
  const removedActive = settings.activeDestinationId === id;
  return {
    ...settings,
    destinations,
    activeDestinationId: removedActive ? destinations[0]?.id || '' : settings.activeDestinationId,
    enabled: removedActive ? false : settings.enabled
  };
}
