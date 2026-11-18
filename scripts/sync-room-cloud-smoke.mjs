import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SyncRoomClient, validateSyncRoomUrl } from '../src/desktop/syncRoomClient.js';

const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await pause(20);
  }
  throw new Error('等待測試狀態逾時');
}
function expect(value) { if (!value) throw new Error('測試狀態不符預期'); }

// Only synthetic identities enter this run. Reports contain no room IDs,
// member IDs, session credentials, player names or server response bodies.
export async function runCloudSmoke({ url, requestTimeoutMs = 8000 } = {}) {
  const parsed = new URL(validateSyncRoomUrl(url));
  if (parsed.pathname.replace(/\/$/u, '') !== '/rooms') throw new Error('雲端測試服務位址需以 /rooms 結尾');
  parsed.pathname = '/rooms';
  const host = new SyncRoomClient({ requestTimeoutMs, reconnectDelayMs: 50 });
  const guest = new SyncRoomClient({ requestTimeoutMs, reconnectDelayMs: 50 });
  const report = { schemaVersion: 1, startedAt: new Date().toISOString(), syntheticDataOnly: true,
    realLcuWrites: 0, discordMessages: 0, checks: {}, ok: false };
  let phase = 'create';
  try {
    await host.connect({ url: parsed.href, action: 'create', name: '同步測試主持人#DEMO' });
    const roomId = host.getState().room.roomId;
    report.checks.create = true;
    phase = 'join';
    await guest.connect({ url: parsed.href, action: 'join', roomId, name: '同步測試朋友#DEMO' });
    const guestId = guest.getState().memberId;
    const pendingOnly = room => room?.pendingApproval === true && Object.keys(room).sort().join(',') === 'pendingApproval,revision,roomId';
    expect(pendingOnly(guest.getState().room));
    const pendingRevision = guest.getState().room.revision;
    guest.socket.close();
    await waitFor(() => guest.getState().connection === 'connected' && guest.getState().room?.revision > pendingRevision);
    expect(pendingOnly(guest.getState().room));
    report.checks.pendingRosterHidden = true;
    report.checks.join = true;
    phase = 'permissions';
    for (const command of [{ type: 'draw' }, { type: 'close' }, { type: 'ready', ready: true }]) {
      let rejected = false;
      try { await guest.command(command); } catch { rejected = true; }
      expect(rejected);
      expect(guest.getState().connection === 'connected');
    }
    report.checks.permissions = true;
    phase = 'draw';
    await host.command({ type: 'approve', memberId: guestId });
    await waitFor(() => guest.getState().room?.members?.length === 2);
    expect(guest.getState().room.members.some(member => member.name === '同步測試主持人#DEMO'));
    report.checks.approvedRosterVisible = true;
    const first = await host.command({ type: 'draw' });
    await waitFor(() => guest.getState().room?.result?.id === first.result.id);
    expect(JSON.stringify(guest.getState().room.result) === JSON.stringify(first.result));
    expect(first.result.results.length === 2 && new Set(first.result.results.map(item => item.main)).size === 2);
    report.checks.identicalResults = true;
    phase = 'reconnect';
    const before = guest.getState().room.revision;
    guest.socket.close();
    await waitFor(() => guest.getState().connection === 'connected' && guest.getState().room?.revision > before &&
      guest.getState().room?.members.find(member => member.id === guestId)?.connected === true);
    expect(guest.getState().memberId === guestId);
    const resumedRoom = guest.getState().room;
    expect(resumedRoom.members.every(member => !member.ready));
    expect(resumedRoom.result === null || (resumedRoom.result.archived === true &&
      resumedRoom.result.id === first.result.id && JSON.stringify(resumedRoom.result.results) === JSON.stringify(first.result.results)));
    report.checks.sameSessionReconnect = true;
    report.checks.reconnectPreservesPreviousResult = resumedRoom.result?.archived === true;
    phase = 'redraw';
    const second = await host.command({ type: 'draw' });
    await waitFor(() => guest.getState().room?.result?.id === second.result.id);
    expect(second.result.version === first.result.version + 1);
    report.checks.resultVersionsMonotonic = true;
    phase = 'close';
    await host.command({ type: 'close' });
    await waitFor(() => guest.getState().connection === 'disconnected');
    expect(guest.getState().room === null || guest.getState().room.closed);
    report.checks.close = true;
    report.ok = true;
  } catch {
    report.failedStep = phase;
  } finally {
    if (phase !== 'close' && host.getState().connection === 'connected') {
      try { await host.command({ type: 'close' }); } catch { /* Report already records failure; do not retry mutations. */ }
    }
    host.destroy(); guest.destroy();
    report.finishedAt = new Date().toISOString();
  }
  return report;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--url') {
    console.error('用法：node scripts/sync-room-cloud-smoke.mjs --url wss://你的服務/rooms');
    process.exitCode = 1;
  } else {
    try {
      const report = await runCloudSmoke({ url: args[1] });
      const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
      const output = path.join(root, 'release', 'sync-room-cloud-smoke');
      await mkdir(output, { recursive: true });
      const filename = path.join(output, `report-${Date.now()}.json`);
      await writeFile(filename, JSON.stringify(report, null, 2) + '\n');
      console.log(report.ok ? '多人雲端同步合成驗證通過。' : `多人雲端同步驗證失敗，階段：${report.failedStep}。`);
      console.log(`去識別報告：${filename}`);
      process.exitCode = report.ok ? 0 : 1;
    } catch {
      console.error('無法執行測試，請確認 --url 為 wss 服務 /rooms 位址；本機可使用 ws。');
      process.exitCode = 1;
    }
  }
}
