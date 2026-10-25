import React, { useEffect, useRef } from 'react';
import { DiscordSyncPanel } from './DiscordSyncPanel.jsx';
import { DiscordSettingsPage } from './DiscordSettingsPage.jsx';
import { DataSettingsPanel } from './DataSettingsPanel.jsx';

export function SettingsDialog({ open, tab, onTabChange, onClose, isDesktop, discordSync, stats, dataInfo, dataNotice, onImportStats }) {
  const dialog = useRef(null);
  useEffect(() => {
    if (open && !dialog.current.open) dialog.current.showModal();
    else if (!open && dialog.current.open) dialog.current.close();
  }, [open]);
  return <dialog ref={dialog} className="settings-dialog" aria-labelledby="app-settings-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="settings-shell"><header className="settings-dialog-header"><h2 id="app-settings-title">設定</h2><button className="toolbar-icon" type="button" aria-label="關閉設定" onClick={onClose}>×</button></header><div className="settings-layout"><nav className="settings-nav" aria-label="設定分類">{[['discord', 'Discord'], ['data', '資料與備份']].map(([value, label]) => <button key={value} type="button" aria-current={tab === value ? 'page' : undefined} onClick={() => onTabChange(value)}>{label}</button>)}</nav><div className="settings-panel">
      {tab === 'discord' && <section><h3>Discord 同步</h3><DiscordSyncPanel settings={discordSync.settings} status={discordSync.status} onSelect={discordSync.select} onToggle={discordSync.toggle} /><details className="webhook-manager"><summary>管理 Webhook</summary><DiscordSettingsPage compact settings={discordSync.settings} status={discordSync.status} onConfigure={discordSync.configure} onRemove={discordSync.remove} onClear={discordSync.clear} /></details><p className="settings-note">只有啟用同步後，抽籤結果才會傳送到選取的頻道。</p></section>}
      {tab === 'data' && <DataSettingsPanel stats={stats} isDesktop={isDesktop} info={dataInfo} notice={dataNotice} onImport={onImportStats} />}
    </div></div><footer className="settings-dialog-footer"><button className="btn btn-primary" type="button" onClick={onClose}>完成</button></footer></div>
  </dialog>;
}
