import React, { useEffect, useRef } from 'react';
import { positions } from '../domain/draw.js';
import { createPlayerLabels } from '../domain/playerNames.js';
import { describeClientPosition } from '../domain/clientRoster.js';
import { UiIcon } from './UiIcon.jsx';
import { SelectMenu } from './SelectMenu.jsx';
import { RoleIcon } from './RoleIcon.jsx';
import { KnownPlayers } from './KnownPlayers.jsx';
import { DrawModeControl, AutoApplySwitch } from './RoleWorkspace.jsx';
import { DiscordDestinationPicker } from './DiscordDestinationPicker.jsx';
import { DiscordSyncPanel } from './DiscordSyncPanel.jsx';

export function RoleSetup({ isDesktop, source, onSourceChange, lobby, players, busy, loading, error, drawMode, onDrawModeChange, preferredRoles, onPreferredRoleChange, autoApplyRoles, onAutoApplyRolesChange, onRefresh, onPrepare, onRemove, inputValue, onInputChange, onAdd, knownNames, onToggleKnown, discordSync, onManageWebhook }) {
  const picker = useRef(null);
  const names = players.map((player) => player.name);
  const labels = createPlayerLabels(names);
  useEffect(() => {
    const dismiss = (event) => { if (picker.current && !event.composedPath().includes(picker.current)) picker.current.open = false; };
    const escape = (event) => { if (event.key === 'Escape' && picker.current?.open) { picker.current.open = false; picker.current.querySelector('summary').focus(); } };
    const close = () => { if (picker.current) picker.current.open = false; };
    const scroll = (event) => { if (!picker.current?.querySelector('.recent-player-popover')?.contains(event.target)) close(); };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', escape);
    window.addEventListener('resize', close); document.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); window.removeEventListener('resize', close); document.removeEventListener('scroll', scroll, true); };
  }, []);
  const positionPicker = () => {
    if (!picker.current?.open) return;
    const anchor = picker.current.querySelector('summary').getBoundingClientRect();
    const menu = picker.current.querySelector('.recent-player-popover');
    const { width, height } = menu.getBoundingClientRect();
    const left = Math.max(16, Math.min(anchor.right - width, window.innerWidth - width - 16));
    const below = anchor.bottom + 8;
    const top = below + height <= window.innerHeight - 16 ? below : Math.max(16, anchor.top - height - 8);
    menu.style.setProperty('--picker-left', left + 'px');
    menu.style.setProperty('--picker-top', top + 'px');
  };
  return <section className="role-setup" aria-label="準備設定" aria-busy={busy}>
    <div className="workspace-scroll">
    <div className="preparation-heading"><h1>準備抽籤</h1></div>
    <div className="preparation-grid">
      <section className="preparation-panel roster-preparation"><header className="preparation-panel-title"><h3><UiIcon name="users" />參加玩家</h3><span>{players.length} / 5</span></header>
        {isDesktop ? <div className="source-switch" role="group" aria-label="玩家來源">{[['client', '客戶端隊伍'], ['manual', '手動名單']].map(([value, label]) => <button key={value} type="button" aria-pressed={source === value} className={source === value ? 'is-selected' : ''} disabled={busy} onClick={() => onSourceChange(value)}>{label}</button>)}</div> : <p className="preparation-source">手動名單</p>}
        {source === 'client' ? <div className="preparation-client-status"><span>{loading ? '讀取中…' : lobby ? `已讀取 ${players.length} 位玩家` : '尚未讀取隊伍'}</span><button className="text-button" type="button" disabled={busy} onClick={onRefresh} aria-label="重新讀取隊伍" title="重新讀取隊伍"><UiIcon name="history" /></button></div> : <form className="manual-add-form" onSubmit={(event) => { event.preventDefault(); onAdd(); }}><label className="sr-only" htmlFor="player-name">新增玩家</label><input id="player-name" type="text" autoComplete="off" value={inputValue} onChange={(event) => onInputChange(event.target.value)} placeholder={players.length >= 5 ? '已達 5 人上限' : '輸入玩家名稱'} disabled={busy || players.length >= 5} /><details ref={picker} className="recent-player-picker" onToggle={positionPicker}><summary title="歷史玩家"><UiIcon name="history" /><span>歷史玩家</span><UiIcon name="chevron" /></summary><div className="recent-player-popover"><header className="recent-player-header"><h3><UiIcon name="history" />歷史玩家 <span>{knownNames.length}</span></h3><button type="button" className="history-close" aria-label="關閉歷史玩家" title="關閉" onClick={() => { picker.current.open = false; picker.current.querySelector("summary").focus(); }}><UiIcon name="close" /></button></header><KnownPlayers names={knownNames} selectedPlayers={names} disabled={busy} onToggle={onToggleKnown} /></div></details><button className="btn btn-secondary icon-action" type="submit" aria-label="加入玩家" title="加入玩家" disabled={busy || players.length >= 5 || !inputValue.trim()}><UiIcon name="plus" /></button></form>}
        <div className="preparation-player-list" role="list" aria-label="參加玩家名單">{players.map((player) => <div key={player.name} className={`preparation-player-row${drawMode === 'custom' ? ' has-preference' : ''}`} role="listitem" data-player-id={player.name}><div className="preparation-player-name"><span className="player-label">{labels[player.name]}</span>{player.id && player.id === lobby?.localPlayerId && <span className="self-badge">你</span>}</div>{drawMode === 'custom' ? <SelectMenu className="inline-preference" label={`${labels[player.name]} 的主位偏好`} value={preferredRoles[player.name] || ''} disabled={busy} onChange={role => onPreferredRoleChange(player.name, role)} options={[{ value: '', label: '隨機', icon: <UiIcon name="shuffle" /> }, ...positions.map(role => ({ value: role, label: role, icon: <RoleIcon role={role} />, disabled: names.some(name => name !== player.name && preferredRoles[name] === role) }))]} /> : drawMode === 'client' ? <span className="client-preference-label">{describeClientPosition(player.firstPosition)}</span> : null}{source === 'manual' && <button className="remove-player" type="button" aria-label={`移除 ${labels[player.name]}`} disabled={busy} onClick={() => onRemove(player.name)}><UiIcon name="close" /></button>}</div>)}</div>
        {!players.length && <p className="preparation-empty"><UiIcon name="users" />{source === 'client' ? '等待 LoL 大廳' : '新增玩家'}</p>}
      </section>
      <div className="preparation-settings">
        <section className="preparation-panel draw-preparation">
          <div className="preparation-group"><h2><UiIcon name="shuffle" />分路</h2><DrawModeControl source={source} drawMode={drawMode} onChange={onDrawModeChange} disabled={busy} /><div className="rule-icons"><span title="主位不重複" aria-label="主位不重複"><UiIcon name="shield" /></span><span title="少於五人時，同時分配副位" aria-label="少於五人時，同時分配副位"><UiIcon name="users" /><span>＋</span></span></div></div>
          {isDesktop && source === 'client' && <div className="preparation-group"><AutoApplySwitch enabled={autoApplyRoles} disabled={busy} onChange={onAutoApplyRolesChange} /></div>}
        </section>
        <section className="preparation-panel discord-preparation" aria-label="Discord 設定">
          <header className="setting-section-heading discord-section-heading"><h2><UiIcon name="discord" />Discord</h2><DiscordDestinationPicker settings={discordSync.settings} disabled={busy} onSelect={discordSync.select} /><button className="text-button manage-webhook icon-action" type="button" aria-label="管理 Webhook" title="管理 Webhook" disabled={busy} onClick={onManageWebhook}><UiIcon name="settings" /><span className="sr-only">管理 Webhook</span></button></header>
          <div className="preparation-group"><DiscordSyncPanel showDestination={false} label="自動傳送" settings={discordSync.settings} status={discordSync.status} onSelect={discordSync.select} onToggle={discordSync.toggle} disabled={busy} /></div>
        </section>
      </div>
    </div>
    </div>
    <footer className="preparation-actions"><p className="action-summary visual-summary" aria-label={`${players.length} 位玩家`}><UiIcon name="users" /><span>{players.length} / 5</span></p><button className="btn btn-primary finish-setup" type="button" disabled={busy || !players.length} onClick={onPrepare}>進入抽籤 <UiIcon name="arrow" /></button></footer>
  </section>;
}
