import { positions } from './draw.js';
import { formatCopyText } from './copyFormat.js';

export function normalizeDiscordWebhook(rawUrl) {
  try {
    const url = new URL(String(rawUrl).trim());
    if (url.protocol !== 'https:' || url.hostname !== 'discord.com' || url.port ||
      url.username || url.password || url.search || url.hash ||
      !/^\/api\/(?:v\d+\/)?webhooks\/\d+\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) {
      throw new Error();
    }
    return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
  } catch {
    throw new Error('請貼上 Discord 文字頻道的完整 Webhook 網址');
  }
}

function escapeName(name) {
  return name.replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').replace(/([\\`*_{}\[\]()<>~|])/g, '\\$1');
}

export function buildDiscordDrawMessage(results) {
  if (!Array.isArray(results) || results.length < 1 || results.length > 5) {
    throw new Error('Discord 同步需要 1～5 位玩家的分路結果');
  }

  const safeResults = results.map((result) => {
    if (typeof result?.name !== 'string' || !result.name.trim() ||
      !positions.includes(result.main) || (result.secondary && !positions.includes(result.secondary))) {
      throw new Error('分路結果格式錯誤');
    }
    return { ...result, name: escapeName(result.name) };
  });
  const content = formatCopyText(safeResults);
  if (content.length > 2000) throw new Error('結果超過 Discord 訊息長度限制，請縮短玩家名稱');
  return { content, allowed_mentions: { parse: [] } };
}

export async function sendDiscordDraw(webhookUrl, results, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000
} = {}) {
  const url = new URL(normalizeDiscordWebhook(webhookUrl));
  url.searchParams.set('wait', 'true');
  const payload = buildDiscordDrawMessage(results);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url.href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      signal: controller.signal
    });
    if (response.status === 429) throw new Error('Discord 傳送過於頻繁，請稍後再試');
    if ([401, 403, 404].includes(response.status)) throw new Error('Webhook 已失效或無法存取，請重新設定');
    if (!response.ok) throw new Error('Discord 未接受訊息，請先確認頻道後再試');
    const message = await response.json();
    if (!/^\d+$/.test(message?.id || '')) throw new Error('無法確認訊息已送出，請先查看 Discord 頻道');
    return message.id;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('傳送逾時，無法確認是否已送出，請先查看 Discord 頻道');
    if (error instanceof TypeError || error instanceof SyntaxError) {
      throw new Error('無法確認訊息已送出，請檢查網路與 Discord 頻道');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
