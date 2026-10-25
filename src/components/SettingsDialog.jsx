import React, { useEffect, useRef } from 'react';
import { DrawModeSelect, AutoApplySwitch } from './RoleWorkspace.jsx';
import { DiscordSyncPanel } from './DiscordSyncPanel.jsx';
import { DiscordSettingsPage } from './DiscordSettingsPage.jsx';
import { DataSettingsPanel } from './DataSettingsPanel.jsx';

export function SettingsDialog({ open, tab, onTabChange, onClose, isDesktop, source, drawMode, onDrawModeChange, autoApplyRoles, onAutoApplyRolesChange, discordSync, stats, dataInfo, dataNotice, onImportStats }) {
  const dialog = useRef(null);
  useEffect(() => {
    if (open && !dialog.current.open) dialog.current.showModal();
    else if (!open && dialog.current.open) dialog.current.close();
  }, [open]);
  return <dialog ref={dialog} className="settings-dialog" aria-labelledby="app-settings-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="settings-shell"><header className="settings-dialog-header"><h2 id="app-settings-title">設定</h2><button className="toolbar-icon" type="button" aria-label="關閉設定" onClick={onClose}>×</button></header><div className="settings-layout"><nav className="settings-nav" aria-label="設定分類">{[['draw', '抽籤'], ...(isDesktop ? [['client', '客戶端']] : []), ['discord', 'Discord'], ['data', '資料與備份']].map(([value, label]) => <button key={value} type="button" aria-current={tab === value ? 'page' : undefined} onClick={() => onTabChange(value)}>{label}</button>)}</nav><div className="settings-panel">
      {tab === 'draw' && <section><h3>抽籤偏好</h3><DrawModeSelect id="settings-draw-mode" source={source} drawMode={drawMode} onChange={onDrawModeChange} /><p className="settings-note">選擇「自訂主位偏好」，即可在玩家卡片中替每位玩家指定主位。</p><div className="settings-info"><strong>少於 5 人</strong><p>同時分配主位與副位；5 人隊伍只分配主位。</p></div></section>}
      {tab === 'client' && isDesktop && <section><h3>客戶端連動</h3><AutoApplySwitch enabled={autoApplyRoles} onChange={onAutoApplyRolesChange} /><p className="settings-note">抽籤後將你的主／副位寫回自己的 LoL 排隊偏好。套用失敗仍保留抽籤結果。</p><div className="settings-info"><strong>五人隊伍</strong><p>保留原本第二偏好；若與新主位衝突，會提示手動調整。</p></div><p className="settings-note">關閉開關不會還原已套用的分路。</p></section>}
      {tab === 'discord' && <section><h3>Discord 同步</h3><DiscordSyncPanel settings={discordSync.settings} status={discordSync.status} onSelect={discordSync.select} onToggle={discordSync.toggle} /><details className="webhook-manager"><summary>管理 Webhook</summary><DiscordSettingsPage compact settings={discordSync.settings} status={discordSync.status} onConfigure={discordSync.configure} onRemove={discordSync.remove} onClear={discordSync.clear} /></details><p className="settings-note">只有啟用同步後，抽籤結果才會傳送到選取的頻道。</p></section>}
      {tab === 'data' && <DataSettingsPanel stats={stats} isDesktop={isDesktop} info={dataInfo} notice={dataNotice} onImport={onImportStats} />}
    </div></div><footer className="settings-dialog-footer"><button className="btn btn-primary" type="button" onClick={onClose}>完成</button></footer></div>
  </dialog>;
}
