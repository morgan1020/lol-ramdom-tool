const title = '英雄聯盟抽籤工具房間邀請';

export function validateRoomServiceUrl(value) {
  let url;
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error('請輸入有效的同步服務網址');
  try { url = new URL(value); } catch { throw new Error('請輸入有效的同步服務網址'); }
  if (url.username || url.password || /[?#]/u.test(url.href) ||
    !(url.protocol === 'wss:' || (url.protocol === 'ws:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) {
    throw new Error('同步服務需使用 wss；只有本機 localhost 可使用 ws，網址不可包含帳密、查詢或片段');
  }
  if (url.pathname === '/rooms/') url.pathname = '/rooms';
  return url.href;
}

function invitationFields({ url, roomId }) {
  const serviceUrl = validateRoomServiceUrl(url);
  if (typeof roomId !== 'string' || !/^[A-Z0-9]{6,16}$/i.test(roomId.trim())) throw new Error('邀請中的房間代碼格式錯誤');
  const code = roomId.trim().toUpperCase();
  if (new URL(serviceUrl).pathname === '/rooms' && !/^[A-F0-9]{10}$/.test(code)) throw new Error('雲端房間代碼需為 10 位十六進位字元');
  return { url: serviceUrl, roomId: code };
}

export function formatRoomInvitation(fields) {
  const { url, roomId } = invitationFields(fields);
  return `${title}\n服務：${url}\n房碼：${roomId}`;
}

export function parseRoomInvitation(text) {
  if (typeof text !== 'string' || text.length > 4096) throw new Error('邀請內容過長或格式錯誤');
  const lines = text.trim().split(/\r?\n/).map(line => line.trim());
  if (lines.length !== 3 || lines[0] !== title || !lines[1].startsWith('服務：') || !lines[2].startsWith('房碼：')) {
    throw new Error('請貼上完整邀請，包含同步服務位址與房間代碼');
  }
  return invitationFields({ url: lines[1].slice(3).trim(), roomId: lines[2].slice(3).trim() });
}
