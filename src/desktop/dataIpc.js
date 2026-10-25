import { writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { statsBackupFilename } from '../domain/statsBackup.js';

export function registerDataIpc({ ipcMain, store, isSender, getWindow, dialog, shell }) {
  const register = (channel, operation) => ipcMain.handle(channel, async (event, ...args) => {
    if (!isSender(event)) return { ok: false, message: '不允許的資料操作來源' };
    try { return { ok: true, value: await operation(...args) }; }
    catch (error) {
      // File/crypto failures are wrapped by the store; never return native objects or secrets.
      return { ok: false, message: typeof error?.message === 'string' && !/https?:\/\//i.test(error.message) ? error.message : '資料操作失敗，請稍後再試' };
    }
  });
  register('data:initialize', (legacy) => store.initialize(legacy));
  register('data:save-stats', (stats) => store.saveStats(stats));
  register('data:save-preferences', (patch) => store.savePreferences(patch));
  register('data:discord-change', (action, payload) => store.changeDiscord(action, payload));
  register('data:discord-send', (results) => store.sendDraw(results));
  register('data:import-stats', (text, mode) => store.importStats(text, mode));
  register('data:open-folder', async () => {
    const error = await shell.openPath(store.directory);
    if (error) throw new Error('無法開啟資料夾，請確認 AppData 存取權限');
    return true;
  });
  register('data:export-stats', async () => {
    await store.queue;
    const text = store.exportStats();
    const { canceled, filePath } = await dialog.showSaveDialog(getWindow(), {
      title: '匯出統計', defaultPath: statsBackupFilename(),
      filters: [{ name: 'JSON 統計', extensions: ['json'] }]
    });
    if (canceled || !filePath) return { canceled: true };
    const temporary = path.join(path.dirname(filePath), `.lol-stats-${randomUUID()}.tmp`);
    try { await writeFile(temporary, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 }); await rename(temporary, filePath); }
    catch { throw new Error('匯出失敗，請確認目標資料夾可寫入'); }
    finally { await unlink(temporary).catch(() => {}); }
    return { canceled: false };
  });
}
