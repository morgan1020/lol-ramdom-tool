import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import { createSyncRoomServer } from '../server/syncRoomServer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const runId = `${Date.now()}-${process.pid}`;
const output = path.join(root, 'release', 'sync-room-demo');
const childEnvironment = { ...process.env };
delete childEnvironment.ELECTRON_RUN_AS_NODE;
await mkdir(output, { recursive: true });
const server = await createSyncRoomServer();
const children = new Set();
const ready = new Set();
let stopping = false;
let finish;
const finished = new Promise((resolve) => { finish = resolve; });
let deadline;

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(deadline);
  process.exitCode = code;
  const exits = [...children].map((child) => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    const force = setTimeout(() => child.kill(), 5000);
    force.unref();
    child.once('exit', () => { clearTimeout(force); resolve(); });
    if (child.connected) child.send({ type: 'shutdown' }, () => {});
    else child.kill();
  }));
  await Promise.all(exits);
  await server.close();
  finish();
}

process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
deadline = setTimeout(() => {
  console.error('雙 App 測試啟動逾時，請確認已執行 npm run build。');
  void stop(1);
}, 45000);

console.log(`多人同步本機測試：${server.url}`);
console.log('正在開啟兩個隔離 App；主持人建立房間，再將代碼填入另一個視窗加入。');
console.log('使用合成 Riot ID，禁止真實 LoL 讀寫與 Discord 傳送；關閉兩個視窗或按 Ctrl+C 結束。');

try {
  for (const role of ['host', 'guest']) {
    const profile = path.join(output, `profile-${runId}-${role}`);
    const child = spawn(electron, [path.join(root, 'scripts', 'sync-room-demo-app.js')], {
      cwd: root,
      env: { ...childEnvironment, SYNC_ROOM_DEMO_ROLE: role, SYNC_ROOM_DEMO_URL: server.url, SYNC_ROOM_DEMO_PROFILE: profile },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      windowsHide: true
    });
    children.add(child);
    child.on('message', (message) => {
      if (message?.type === 'ready') {
        ready.add(role);
        console.log(`${role === 'host' ? '主持人' : '加入者'}測試視窗已就緒。`);
        if (ready.size === 2) {
          clearTimeout(deadline);
          if (check) {
            console.log('雙 App 啟動與預填驗證通過。');
            void stop();
          }
        }
      } else if (message?.type === 'failed') {
        console.error(`測試視窗啟動失敗：${message.message}`);
        void stop(1);
      }
    });
    child.once('error', (error) => {
      children.delete(child);
      console.error(`無法啟動測試 App：${error.message}`);
      void stop(1);
    });
    child.once('exit', (code) => {
      children.delete(child);
      if (!stopping && !ready.has(role)) console.error(`測試視窗 ${role} 在就緒前結束（${code ?? 'signal'}）。`);
      if (!stopping && (code || !ready.has(role))) void stop(code || 1);
      else if (!stopping && children.size === 0) void stop();
    });
  }
} catch (error) {
  console.error(error.message);
  await stop(1);
}
await finished;
