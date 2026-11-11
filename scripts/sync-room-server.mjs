import { createSyncRoomServer } from '../server/syncRoomServer.js';

const server = await createSyncRoomServer({ host: process.env.SYNC_ROOM_HOST || '127.0.0.1', port: Number(process.env.SYNC_ROOM_PORT || 8787) });
console.log(`多人同步測試服務已啟動：${server.url}`);
console.log('房間與重連憑證僅存在記憶體；停止服務會清除全部房間。');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
