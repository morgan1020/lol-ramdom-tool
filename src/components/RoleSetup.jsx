import React, { useEffect, useRef } from 'react';
import { positions } from '../domain/draw.js';
import { createPlayerLabels } from '../domain/playerNames.js';
import { describeClientPosition } from '../domain/clientRoster.js';
import { KnownPlayers } from './KnownPlayers.jsx';
import { DrawModeSelect, AutoApplySwitch } from './RoleWorkspace.jsx';
import { DiscordSyncPanel } from './DiscordSyncPanel.jsx';

export function RoleSetup({ isDesktop, source, onSourceChange, lobby, players, busy, loading, error, drawMode, onDrawModeChange, preferredRoles, onPreferredRoleChange, autoApplyRoles, onAutoApplyRolesChange, onRefresh, onPrepare, onRemove, inputValue, onInputChange, onAdd, knownNames, onToggleKnown, discordSync, onManageWebhook }) {
  const picker = useRef(null);
  const names = players.map((player) => player.name);
  const labels = createPlayerLabels(names);
  useEffect(() => {
    const dismiss = (event) => { if (picker.current && !event.composedPath().includes(picker.current)) picker.current.open = false; };
    const escape = (event) => { if (event.key === 'Escape' && picker.current?.open) { picker.current.open = false; picker.current.querySelector('summary').focus(); } };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, []);
  return <section className="role-setup" aria-label="準備設定" aria-busy={busy}>
    <div className="workspace-scroll">
    <div className="preparation-heading"><h1>準備這次抽籤</h1><p>確認玩家與規則，開始這次分路抽籤。</p></div>
    <div className="preparation-grid">
      <section className="preparation-panel roster-preparation"><header className="preparation-panel-title"><h3>參加玩家</h3><span>{players.length} / 5 人</span></header>
        {isDesktop ? <div className="source-switch" role="group" aria-label="玩家來源">{[['client', '客戶端隊伍'], ['manual', '手動名單']].map(([value, label]) => <button key={value} type="button" aria-pressed={source === value} className={source === value ? 'is-selected' : ''} disabled={busy} onClick={() => onSourceChange(value)}>{label}</button>)}</div> : <p className="preparation-source">手動名單</p>}
        {source === 'client' ? <div className="preparation-client-status"><span>{loading ? '讀取中…' : lobby ? `已讀取 ${players.length} 位玩家` : '尚未讀取隊伍'}</span><button className="text-button" type="button" disabled={busy} onClick={onRefresh} aria-label="重新讀取隊伍">↻ 重新讀取</button></div> : <form className="manual-add-form" onSubmit={(event) => { event.preventDefault(); onAdd(); }}><label className="sr-only" htmlFor="player-name">新增玩家</label><input id="player-name" type="text" autoComplete="off" value={inputValue} onChange={(event) => onInputChange(event.target.value)} placeholder={players.length >= 5 ? '已達 5 人上限' : '輸入玩家名稱'} disabled={busy || players.length >= 5} /><details ref={picker} className="recent-player-picker"><summary>歷史玩家 <span aria-hidden="true">▾</span></summary><div className="recent-player-popover"><KnownPlayers names={knownNames} selectedPlayers={names} disabled={busy} onToggle={onToggleKnown} /></div></details><button className="btn btn-secondary" type="submit" disabled={busy || players.length >= 5 || !inputValue.trim()}>加入</button></form>}
        <div className="preparation-player-list" role="list" aria-label="參加玩家名單">{players.map((player) => <div key={player.name} className={`preparation-player-row${drawMode === 'custom' ? ' has-preference' : ''}`} role="listitem" data-player-id={player.name}><div className="preparation-player-name"><span className="player-label">{labels[player.name]}</span>{player.id && player.id === lobby?.localPlayerId && <span className="self-badge">你</span>}</div>{drawMode === 'custom' ? <select className="inline-preference" aria-label={`${labels[player.name]} 的主位偏好`} value={preferredRoles[player.name] || ''} disabled={busy} onChange={(event) => onPreferredRoleChange(player.name, event.target.value)}><option value="">隨機</option>{positions.map((role) => <option key={role} value={role} disabled={names.some((name) => name !== player.name && preferredRoles[name] === role)}>{role}</option>)}</select> : drawMode === 'client' ? <span className="client-preference-label">{describeClientPosition(player.firstPosition)}</span> : null}{source === 'manual' && <button className="remove-player" type="button" aria-label={`移除 ${labels[player.name]}`} disabled={busy} onClick={() => onRemove(player.name)}>×</button>}</div>)}</div>
        {!players.length && <p className="preparation-empty">{source === 'client' ? '在 LoL 建立大廳後，重新讀取隊伍。' : '加入這次一起抽籤的玩家。'}</p>}
      </section>
      <div className="preparation-settings">
        <section className="preparation-panel draw-preparation">
          <div className="preparation-group"><h2>抽籤規則</h2><DrawModeSelect source={source} drawMode={drawMode} onChange={onDrawModeChange} disabled={busy} /><p className="preparation-rule-note">每位玩家的主位不重複。少於五人時，同時分配副位。</p></div>
          {isDesktop && source === 'client' && <div className="preparation-group"><AutoApplySwitch enabled={autoApplyRoles} disabled={busy} onChange={onAutoApplyRolesChange} /></div>}
        </section>
        <details className="preparation-panel discord-preparation">
          <summary><h2>Discord 同步</h2><span>{discordSync.settings.enabled ? '已啟用' : '未啟用'} <span aria-hidden="true">⌄</span></span></summary>
          <div className="preparation-group"><DiscordSyncPanel label="自動傳送結果" settings={discordSync.settings} status={discordSync.status} onSelect={discordSync.select} onToggle={discordSync.toggle} disabled={busy} /><button className="text-button manage-webhook" type="button" disabled={busy} onClick={onManageWebhook}>管理 Webhook</button></div>
        </details>
      </div>
    </div>
    {error && <p className="inline-status is-error preparation-error" role="alert">{error}</p>}
    </div>
    <footer className="preparation-actions"><p className="action-summary"><strong>{players.length ? '準備完成' : '等待加入玩家'}</strong><span>{players.length} 位玩家 · {drawMode === 'custom' ? '自訂主位偏好' : drawMode === 'client' ? '保留客戶端第一偏好' : '全部隨機'}</span></p><button className="btn btn-primary finish-setup" type="button" disabled={busy || !players.length} onClick={onPrepare}>完成設定，進入抽籤 <span aria-hidden="true">→</span></button></footer>
  </section>;
}
