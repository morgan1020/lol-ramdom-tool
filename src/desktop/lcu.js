import { execFile } from 'node:child_process';
import https from 'node:https';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class ClientError extends Error {}

export function parseConnection(commandLine) {
  const port = Number(commandLine.match(/--app-port=(\d+)/)?.[1]);
  const password = commandLine.match(/--remoting-auth-token=([^\s"']+)/)?.[1];
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !password) {
    throw new ClientError('無法讀取客戶端連線資訊，請確認 LoL 客戶端已登入');
  }
  return { port, password };
}

export async function discoverConnection() {
  if (process.platform !== 'win32') throw new ClientError('目前僅支援 Windows 的 LoL 客戶端');
  // Credentials stay in the main process; never persist or log this output.
  const script = "$p = Get-CimInstance Win32_Process -Filter \"Name = 'LeagueClientUx.exe'\" | Where-Object { $_.CommandLine } | Select-Object -First 1; if ($p) { [Console]::Out.Write($p.CommandLine) }";
  try {
    const { stdout } = await execFileAsync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), [
      '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')
    ], { windowsHide: true, timeout: 8000, maxBuffer: 128 * 1024 });
    if (!stdout.trim()) throw new ClientError('找不到可連線的 LoL 客戶端，請先開啟並登入；若客戶端以系統管理員執行，請確認兩者權限一致');
    return parseConnection(stdout);
  } catch (error) {
    if (error instanceof ClientError) throw error;
    throw new ClientError('無法讀取 LoL 客戶端，請確認客戶端已開啟且兩者權限一致');
  }
}

export const preferenceEndpoint = '/lol-lobby/v2/lobby/members/localMember/position-preferences';
const clientPositions = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY', 'FILL', 'UNSELECTED'];

export function requestClient(connection, endpoint, { method = 'GET', body } = {}) {
  // Only fixed loopback endpoints. The sole write targets the logged-in local member.
  const readable = method === 'GET' && body === undefined && /^\/lol-(?:gameflow\/v1\/gameflow-phase|lobby\/v2\/lobby|summoner\/v1\/(?:current-summoner|summoners\/\d+))$/.test(endpoint);
  const writable = method === 'PUT' && endpoint === preferenceEndpoint && body &&
    Object.keys(body).length === 2 && clientPositions.includes(body.firstPreference) && clientPositions.includes(body.secondPreference);
  if (!readable && !writable) {
    throw new ClientError('不支援的客戶端查詢');
  }
  const payload = writable ? JSON.stringify(body) : undefined;
  const uncertainWrite = '套用結果無法確認，請查看客戶端；不會自動重送';
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: '127.0.0.1', port: connection.port, path: endpoint, method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
      auth: `riot:${connection.password}`,
      // LCU uses a self-signed certificate. This exception is confined to this loopback request.
      rejectUnauthorized: false, agent: false
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
        if (body.length > 1024 * 1024) request.destroy(new Error('Response too large'));
      });
      response.on('error', () => reject(new ClientError(writable ? uncertainWrite : '讀取客戶端中斷，請重新讀取隊伍')));
      response.on('end', () => {
        if (writable && (response.statusCode < 200 || response.statusCode >= 300)) return reject(new ClientError('客戶端拒絕套用分路，請確認模式支援排隊偏好且尚未開始排隊'));
        if (writable && !body.trim()) return resolve(null);
        if (!writable && response.statusCode === 404) return reject(new ClientError('目前沒有可讀取的組隊大廳，請先建立隊伍'));
        if (!writable && response.statusCode !== 200) return reject(new ClientError('客戶端拒絕查詢，請重新讀取隊伍'));
        try { resolve(JSON.parse(body)); }
        catch { reject(new ClientError(writable ? uncertainWrite : '客戶端回傳格式異常，請重新讀取隊伍')); }
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('Timeout')), 4000);
    request.on('close', () => clearTimeout(timer));
    request.on('error', () => reject(new ClientError(writable ? uncertainWrite : '無法連線至 LoL 客戶端，請確認客戶端仍在執行')));
    request.end(payload);
  });
}

function humanMembers(lobby) {
  if (!Array.isArray(lobby?.members)) throw new ClientError('客戶端隊伍格式異常，暫時無法匯入');
  return lobby.members.filter((member) => !member.isBot && !member.isSpectator);
}

function fingerprint(lobby) {
  return JSON.stringify(humanMembers(lobby).map((member) => [String(member.summonerId), member.puuid, member.firstPositionPreference, member.secondPositionPreference]).sort((a, b) => a[0].localeCompare(b[0])));
}

export async function readLobby({ discover = discoverConnection, request = requestClient } = {}) {
  const connection = await discover();
  const read = (endpoint) => request(connection, endpoint);
  if (await read('/lol-gameflow/v1/gameflow-phase') !== 'Lobby') {
    throw new ClientError('請先回到組隊大廳；選角、排隊或遊戲中暫不匯入');
  }
  const lobby = await read('/lol-lobby/v2/lobby');
  const members = humanMembers(lobby);
  if (members.length === 0) throw new ClientError('目前大廳沒有可匯入的玩家');
  if (members.length > 5) throw new ClientError('目前大廳超過 5 位玩家，請先調整隊伍，或使用手動名單');
  const players = await Promise.all(members.map(async (member) => {
    const summonerId = String(member.summonerId);
    if (!/^\d+$/.test(summonerId) || summonerId === '0') throw new ClientError('無法辨識隊伍玩家，請重新讀取');
    const summoner = await read(`/lol-summoner/v1/summoners/${summonerId}`);
    const gameName = typeof summoner?.gameName === 'string' ? summoner.gameName.trim() : '';
    const tagLine = typeof summoner?.tagLine === 'string' ? summoner.tagLine.trim() : '';
    if (!gameName || !tagLine) throw new ClientError('無法取得完整 Riot ID，請稍候重新讀取');
    return {
      id: typeof member.puuid === 'string' && member.puuid ? member.puuid : summonerId,
      name: `${gameName}#${tagLine}`, isLeader: Boolean(member.isLeader),
      firstPosition: member.firstPositionPreference || 'UNSELECTED',
      secondPosition: member.secondPositionPreference || 'UNSELECTED'
    };
  }));
  const latest = await read('/lol-lobby/v2/lobby');
  if (fingerprint(lobby) !== fingerprint(latest) || await read('/lol-gameflow/v1/gameflow-phase') !== 'Lobby') {
    throw new ClientError('隊伍或偏好在讀取期間變動，請重新讀取');
  }
  if (new Set(players.map((player) => player.id)).size !== players.length || new Set(players.map((player) => player.name)).size !== players.length) {
    throw new ClientError('客戶端回傳重複玩家，請重新讀取');
  }
  return {
    players, fetchedAt: new Date().toISOString(),
    localPlayerId: lobby.localMember ? String(lobby.localMember.puuid || lobby.localMember.summonerId) : null,
    queueId: lobby.gameConfig?.queueId ?? null,
    isCustom: Boolean(lobby.gameConfig?.isCustom)
  };
}
