import React from 'react';
import { useDialog, navigateTabs } from './ModalFrame.jsx';
import { UiIcon } from './UiIcon.jsx';
import { DiscordSyncPanel } from './DiscordSyncPanel.jsx';
import { DiscordSettingsPage } from './DiscordSettingsPage.jsx';
import { DiscordDestinationPicker } from './DiscordDestinationPicker.jsx';
import { DataSettingsPanel } from './DataSettingsPanel.jsx';

export function SettingsDialog({ open, tab, onTabChange, onClose, isDesktop, discordSync, stats, dataInfo, dataNotice, onImportStats }) {
  const dialog = useDialog(open);
  return <dialog ref={dialog} className="settings-dialog" aria-labelledby="app-settings-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="settings-shell"><header className="settings-dialog-header"><h2 id="app-settings-title">設定</h2><button className="toolbar-icon" type="button" aria-label="關閉設定" onClick={onClose}><UiIcon name="close" /></button></header><div className="settings-layout"><nav className="settings-nav" role="tablist" aria-label="設定分類" onKeyDown={navigateTabs}>{[['discord', 'Discord'], ['data', '資料與備份']].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} aria-current={tab === value ? 'page' : undefined} onClick={() => onTabChange(value)}>{label}</button>)}</nav><div className="settings-panel">
      {tab === 'discord' && <section><header className="setting-section-heading"><h3><UiIcon name="discord" />Discord</h3><DiscordDestinationPicker settings={discordSync.settings} disabled={discordSync.pending || discordSync.status.state === 'sending'} onSelect={discordSync.select} /></header><DiscordSyncPanel label="自動傳送" showDestination={false} settings={discordSync.settings} status={discordSync.status} onSelect={discordSync.select} onToggle={discordSync.toggle} /><div className="webhook-manager"><DiscordSettingsPage compact settings={discordSync.settings} status={discordSync.status} onConfigure={discordSync.configure} onRemove={discordSync.remove} onClear={discordSync.clear} /></div></section>}
      {tab === 'data' && <DataSettingsPanel stats={stats} isDesktop={isDesktop} info={dataInfo} notice={dataNotice} onImport={onImportStats} />}
      <details className="project-legal"><summary>非官方專案聲明</summary><p>LOL Random Tool is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.</p></details>
    </div></div><footer className="settings-dialog-footer"><button className="btn btn-primary" type="button" onClick={onClose}>完成</button></footer></div>
  </dialog>;
}
