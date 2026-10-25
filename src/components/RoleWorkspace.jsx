import React from 'react';
import { positions } from '../domain/draw.js';
import { createPlayerLabels } from '../domain/playerNames.js';
import { describeClientPosition } from '../domain/clientRoster.js';
import { KnownPlayers } from './KnownPlayers.jsx';
import { RoleIcon } from './RoleIcon.jsx';

export function RoleBadge({ role, secondary = false }) {
  return role ? <span className={`table-role${secondary ? ' is-secondary' : ''}`}><span className="table-role-icon"><RoleIcon role={role} /></span><span>{role}</span></span> : <span className="empty-role">—</span>;
}

export function DrawModeSelect({ source, drawMode, onChange, disabled, id = 'draw-mode' }) {
  return <label className="draw-mode-field" htmlFor={id}><span>抽籤方式</span><select id={id} value={drawMode} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="random">全部隨機</option>{source === 'client' && <option value="client">保留客戶端第一偏好</option>}<option value="custom">自訂主位偏好</option></select></label>;
}

export function AutoApplySwitch({ enabled, disabled, onChange }) {
  return <label className="auto-apply-control"><input type="checkbox" role="switch" aria-label="抽完更新我的 LoL 分路" checked={enabled} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span className="switch-visual" aria-hidden="true" /><span>抽完更新我的 LoL 分路<small>僅更改自己的帳號</small></span></label>;
}

export function RoleWorkspace({ isDesktop, source, onSourceChange, lobby, players, results, busy, loading, error, applyStatus, drawMode, onDrawModeChange, preferredRoles, onPreferredRoleChange, autoApplyRoles, onAutoApplyRolesChange, onRefresh, onDraw, onCopy, onRemove, inputValue, onInputChange, onAdd, knownNames, onToggleKnown, completedAt, discordStatus, onRetryDiscord }) {
  const names = players.map((player) => player.name);
  const labels = createPlayerLabels(names);
  const hasResults = results.length > 0;
  const resultByName = Object.fromEntries(results.map((result) => [result.name, result]));
  return <section className="role-workspace" aria-label="分路抽籤" aria-busy={busy}>
    <div className="workspace-toolbar">
      {isDesktop ? <div className="source-switch" role="group" aria-label="玩家來源">{[['client', '客戶端隊伍'], ['manual', '手動名單']].map(([value, label]) => <button key={value} className={source === value ? 'is-selected' : ''} type="button" aria-pressed={source === value} disabled={busy} onClick={() => onSourceChange(value)}><span className="source-dot" aria-hidden="true" />{label}</button>)}</div> : <strong className="manual-source-title">手動名單</strong>}
      <div className="roster-connection">{source === 'client' ? <><span className={`connection-state${lobby ? ' is-connected' : ''}`}><i aria-hidden="true" />{loading ? '讀取中…' : lobby ? `已讀取 · ${players.length} 人` : '尚未連線'}</span><button className="toolbar-icon" type="button" aria-label="重新讀取隊伍" title="重新讀取隊伍" disabled={busy} onClick={onRefresh}>↻</button></> : <span>{players.length} / 5 人</span>}</div>
    </div>
    {source === 'manual' && <div className="manual-roster-tools"><form className="manual-add-form" onSubmit={(event) => { event.preventDefault(); onAdd(); }}><label className="sr-only" htmlFor="player-name">新增玩家</label><input id="player-name" type="text" autoComplete="off" value={inputValue} onChange={(event) => onInputChange(event.target.value)} placeholder={players.length >= 5 ? '已達 5 人上限' : '輸入玩家名稱'} disabled={busy || players.length >= 5} /><button className="btn btn-secondary" type="submit" disabled={busy || players.length >= 5 || !inputValue.trim()}>加入</button><details className="recent-player-picker"><summary>最近玩家</summary><div className="recent-player-popover"><KnownPlayers names={knownNames} selectedPlayers={names} disabled={busy} onToggle={onToggleKnown} /></div></details></form></div>}
    <div className={`roster-card-grid count-${players.length}${busy ? ' is-busy' : ''}`} role="list" aria-label="隊伍分路" style={{ '--player-count': Math.max(1, players.length) }}>
      {players.map((player) => {
        const result = resultByName[player.name];
        const own = player.id && player.id === lobby?.localPlayerId;
        const preferred = drawMode === 'client' ? describeClientPosition(player.firstPosition) : preferredRoles[player.name];
        return <article key={player.name} className={`roster-player-card${own ? ' is-self' : ''}${result ? ' has-result' : ''}`} role="listitem" data-player-id={player.name}>
          {source === 'manual' && <button className="remove-player" type="button" aria-label={`移除 ${labels[player.name]}`} disabled={busy} onClick={() => onRemove(player.name)}>×</button>}
          <header className="roster-player-header"><span className="player-avatar" aria-hidden="true">{Array.from(labels[player.name])[0]}</span><h3 className="player-label">{labels[player.name]}</h3>{own && <span className="self-badge">你</span>}</header>
          <div className={`card-role-grid${result && !result.secondary ? ' is-single-role' : ''}`}>
            <div className="card-role-slot"><span className="card-role-caption">主位</span>{drawMode === 'custom' && !hasResults ? <select className="inline-preference" aria-label={`${labels[player.name]} 的主位偏好`} value={preferredRoles[player.name] || ''} disabled={busy} onChange={(event) => onPreferredRoleChange(player.name, event.target.value)}><option value="">隨機</option>{positions.map((role) => <option key={role} value={role} disabled={names.some((name) => name !== player.name && preferredRoles[name] === role)}>{role}</option>)}</select> : result ? <RoleBadge role={result.main} /> : preferred && !['未選擇', '補位'].includes(preferred) && drawMode !== 'random' ? <span className="pending-preference">{preferred}<small>偏好</small></span> : <span className="card-role-placeholder" aria-label="等待抽籤">?</span>}</div>
            {(!result || result.secondary) && <div className="card-role-slot"><span className="card-role-caption">副位</span>{result?.secondary ? <RoleBadge role={result.secondary} secondary /> : <span className="card-role-placeholder is-secondary" aria-label="等待抽籤">?</span>}</div>}
          </div>
          <p className="player-card-note">{result ? result.secondary ? '主位與副位已分配' : '五人隊伍 · 僅分配主位' : drawMode === 'custom' ? '可指定主位，也可隨機' : '等待揭曉'}</p>
        </article>;
      })}
      {!players.length && <div className="roster-empty"><span aria-hidden="true">♧</span><strong>{source === 'client' ? '讀取你的隊伍' : '準備這次的隊伍'}</strong><p>{source === 'client' ? '在 LoL 建立大廳後，按右上角重新讀取。' : '加入 1～5 位玩家，即可開始抽籤。'}</p></div>}
    </div>
    <div className="workspace-status" aria-live="polite">
      {error && <p className="inline-status is-error" role="alert">{error}</p>}
      {applyStatus.message && <p className={`inline-status is-${applyStatus.state}`} role={applyStatus.state === 'error' ? 'alert' : 'status'}>{applyStatus.message}</p>}
      {discordStatus.message && <div className={`inline-status is-${discordStatus.state}`} role={discordStatus.state === 'error' ? 'alert' : 'status'}><span>{discordStatus.message}</span>{discordStatus.state === 'error' && <button className="text-button" type="button" onClick={onRetryDiscord}>重送本次結果</button>}</div>}
      {!error && !applyStatus.message && !discordStatus.message && <p className="status-hint">{busy ? '正在為隊伍安排分路…' : completedAt && hasResults ? `抽籤完成 · ${completedAt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}` : source === 'client' && lobby ? '隊伍已就緒，抽籤時會重新讀取名單。' : players.length ? '隊伍已就緒' : '等待加入玩家'}</p>}
    </div>
    <div className="workspace-rule-row"><DrawModeSelect source={source} drawMode={drawMode} onChange={onDrawModeChange} disabled={busy} />{hasResults && drawMode === 'custom' && <button className="text-button" type="button" disabled={busy} onClick={() => onDrawModeChange('custom')}>調整偏好</button>}{source === 'client' && lobby && <span className="read-time">名單更新 {new Date(lobby.fetchedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</span>}</div>
    <div className="workspace-actions">{isDesktop ? <AutoApplySwitch enabled={autoApplyRoles} disabled={busy} onChange={onAutoApplyRolesChange} /> : <span className="web-storage-hint">紀錄儲存在目前瀏覽器</span>}<div className="draw-buttons">{hasResults && <button className="btn btn-secondary" type="button" disabled={busy} onClick={onCopy}>複製結果</button>}<button className="btn btn-primary primary-draw" type="button" disabled={busy || (source === 'manual' && !players.length)} onClick={onDraw}>{busy ? loading ? '讀取中…' : '抽籤中…' : hasResults ? '重新抽籤' : '開始抽籤'}</button></div></div>
  </section>;
}
