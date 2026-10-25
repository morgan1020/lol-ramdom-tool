import React from 'react';
import { createPlayerLabels } from '../domain/playerNames.js';
import { UiIcon } from './UiIcon.jsx';
import { RoleIcon } from './RoleIcon.jsx';
import { ToggleSwitch } from './ToggleSwitch.jsx';
import { DiscordDrawStatus } from './DiscordDrawStatus.jsx';

export function RoleBadge({ role, secondary = false, assigned = false }) {
  return <span className={`table-role${secondary ? ' is-secondary' : ''}${assigned ? ' is-assigned' : ''}`} aria-label={`${secondary ? '副位' : '主位'}：${role}${assigned ? '（指定）' : ''}`}><span className="table-role-icon"><RoleIcon role={role} />{assigned && <span className="assignment-marker" title="指定主位" aria-label="指定主位"><UiIcon name="lock" /></span>}</span><span>{role}</span></span>;
}
export function DrawModeControl({ source, drawMode, onChange, disabled, id = 'draw-mode' }) {
  const options = [
    { value: 'random', label: '隨機', title: '全部隨機', icon: 'shuffle' },
    ...(source === 'client' ? [{ value: 'client', label: '沿用', title: '保留客戶端第一偏好', icon: 'monitor' }] : []),
    { value: 'custom', label: '指定', title: '自訂主位偏好', icon: 'sliders' }
  ];
  const handleKey = async (event, index) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const group = event.currentTarget.parentElement;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + options.length) % options.length;
    await onChange(options[next].value);
    requestAnimationFrame(() => group.querySelector('[data-value="' + options[next].value + '"]')?.focus());
  };
  return <div id={id} className="draw-mode-options" style={{ '--mode-count': options.length }} role="radiogroup" aria-label="抽籤方式" data-value={drawMode}>
    {options.map(({ value, label, title, icon }, index) => <button key={value} type="button" role="radio" aria-checked={drawMode === value} aria-label={title} title={title} tabIndex={drawMode === value ? 0 : -1} data-value={value} disabled={disabled} onClick={() => value !== drawMode && onChange(value)} onKeyDown={event => handleKey(event, index)}><UiIcon name={icon} /><span>{label}</span></button>)}
  </div>;
}
export function AutoApplySwitch({ enabled, disabled, onChange }) {
  return <div className="auto-apply-control setting-toggle-row"><span className="setting-control-label" title="抽完更新自己的 LoL 分路；僅更改自己的帳號"><UiIcon name="monitor" />套用分路</span><ToggleSwitch enabled={enabled} disabled={disabled} label="抽完更新我的 LoL 分路" onToggle={() => onChange(!enabled)} /></div>;
}
export function RoleWorkspace({ lobby, players, results, assignedPreferences = {}, busy, loading, onReturn, onDraw, onCopy, discordStatus, discordEnabled, discordDestination, onRetryDiscord }) {
  const labels = createPlayerLabels(players.map((player) => player.name));
  const resultByName = Object.fromEntries(results.map((result) => [result.name, result]));
  return <section className="role-workspace draw-workspace" aria-label="抽籤操作" aria-busy={busy}>
    <div className="workspace-scroll">
    <header className="draw-heading"><div><h1 className="draw-screen-title">{results.length ? '本次抽籤結果' : '隊伍已就緒'}</h1></div><button className="btn btn-return" type="button" disabled={busy} onClick={onReturn}><UiIcon name="back" />返回設定</button></header>
    <p className="result-scope visual-summary" aria-label={`${players.length} 位玩家`}><UiIcon name="users" />{players.length}</p>
    <div className={`roster-card-grid count-${players.length}${busy ? ' is-busy' : ''}`} role="list" aria-label="隊伍分路" style={{ '--player-count': Math.max(1, players.length) }}>
      {players.map((player) => {
        const result = resultByName[player.name];
        return <article key={player.name} className={`roster-player-card${result ? ' has-result' : ''}`} role="listitem" data-player-id={player.name}>
          <header className="roster-player-header"><h3 className="player-label">{labels[player.name]}</h3>{player.id && player.id === lobby?.localPlayerId && <span className="self-badge">你</span>}</header>
          <div className="draw-card-result">{result ? <><RoleBadge role={result.main} assigned={assignedPreferences[player.name] === result.main} />{result.secondary && <div className="draw-secondary" title="備用分路"><RoleBadge role={result.secondary} secondary /></div>}</> : <span className="empty-role" aria-label="等待抽籤">—</span>}</div>
        </article>;
      })}
    </div>
    </div>
    <footer className="draw-screen-actions"><DiscordDrawStatus enabled={discordEnabled} destination={discordDestination} status={discordStatus} /><div className="draw-action-buttons"><button className="btn btn-secondary copy-results icon-action" type="button" title="複製結果" aria-label="複製結果" disabled={busy || !results.length} onClick={onCopy}><UiIcon name="copy" /></button><button className="btn btn-primary primary-draw" type="button" disabled={busy} onClick={onDraw}><UiIcon name="shuffle" />{busy ? loading ? '讀取中…' : '處理中…' : results.length ? '重新抽籤' : '開始抽籤'}</button></div></footer>
  </section>;
}
