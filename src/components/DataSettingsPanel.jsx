import React, { useRef, useState } from 'react';
import { createStatsBackup, MAX_STATS_FILE_BYTES, parseStatsBackup, statsBackupFilename } from '../domain/statsBackup.js';
import { createPlayerLabels } from '../domain/playerNames.js';
import { desktopRequest } from '../storage/desktopData.js';

export function DataSettingsPanel({ stats, isDesktop, info, notice, onImport }) {
  const fileInput = useRef(null);
  const [preview, setPreview] = useState(null);
  const [mode, setMode] = useState('merge');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const action = async (operation) => {
    setPending(true); setError(''); setMessage('');
    try { await operation(); }
    catch (actionError) { setError(actionError.message || '資料操作失敗'); }
    finally { setPending(false); }
  };
  const exportStats = () => action(async () => {
    if (isDesktop) {
      const result = await desktopRequest('exportDataStats');
      if (!result.canceled) setMessage('統計已匯出。');
    } else {
      const url = URL.createObjectURL(new Blob([createStatsBackup(stats)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = statsBackupFilename();
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('已交由瀏覽器下載統計檔。');
    }
  });
  const names = preview ? Object.keys(preview.stats) : [];
  const labels = createPlayerLabels(names);
  const overlaps = names.filter((name) => Object.hasOwn(stats, name)).length;
  const nextCount = preview ? mode === 'replace' ? names.length : new Set([...Object.keys(stats), ...names]).size : 0;
  return <section className="data-settings-panel"><h3>資料與備份</h3>
    <p className="settings-note">目前有 {Object.keys(stats).length} 位玩家。備份只包含統計與完整玩家識別碼，不包含 Webhook 網址或其他設定。</p>
    {isDesktop ? <div className="settings-info"><strong>AppData 專屬資料夾</strong><p className="data-directory">{info?.directory}</p><p>Webhook 以系統加密保存，由主程序傳送訊息。</p>{info?.encryptionAvailable === false && <p role="alert">系統加密目前無法使用，無法新增 Webhook。</p>}<button className="text-button" type="button" disabled={pending} onClick={() => action(() => desktopRequest('openDataFolder'))}>開啟資料夾</button></div> : <p className="settings-note">網站資料仍保存在目前瀏覽器；可使用統計備份搬移到其他瀏覽器或桌面 App。</p>}
    {notice && <p className="settings-note" role="status">{notice}</p>}
    <div className="data-actions"><button className="btn btn-secondary" type="button" disabled={pending} onClick={exportStats}>匯出統計</button><button className="btn btn-secondary" type="button" disabled={pending} onClick={() => fileInput.current.click()}>匯入統計</button><input ref={fileInput} className="sr-only" type="file" disabled={pending} accept=".json,application/json" aria-label="選擇統計 JSON 檔" onChange={(event) => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file) return;
      void action(async () => {
        setPreview(null);
        if (file.size > MAX_STATS_FILE_BYTES) throw new Error('統計檔不可超過 5 MB');
        const text = await file.text();
        const incoming = parseStatsBackup(text);
        setMode('merge'); setPreview({ text, stats: incoming });
      });
    }} /></div>
    {preview && <div className="stats-import-preview"><h4>匯入預覽</h4><p>檔案包含 {names.length} 位玩家，其中 {overlaps} 位已存在。</p><p>{names.slice(0, 5).map((name) => labels[name]).join('、')}{names.length > 5 ? '…' : ''}</p><label htmlFor="stats-import-mode">匯入方式</label><select id="stats-import-mode" value={mode} disabled={pending} onChange={(event) => setMode(event.target.value)}><option value="merge">合併名單，同名紀錄以匯入檔為準</option><option value="replace">取代全部統計</option></select><p className={mode === 'replace' ? 'data-replace-warning' : ''}>{mode === 'replace' ? '現有統計會全部取代。' : '保留其他玩家；相同玩家的次數不會重複累加。'}完成後共 {nextCount} 位玩家。</p><div className="data-actions"><button className="btn btn-primary" type="button" disabled={pending} onClick={() => action(async () => { await onImport(preview.text, mode); setPreview(null); setMessage('統計已匯入並儲存。'); })}>{pending ? '儲存中…' : mode === 'replace' ? '確認取代全部紀錄' : '確認合併匯入'}</button><button className="btn btn-secondary" type="button" disabled={pending} onClick={() => setPreview(null)}>取消</button></div></div>}
    {error && <p className="data-error" role="alert">{error}</p>}{message && <p className="data-notice" role="status">{message}</p>}
  </section>;
}
