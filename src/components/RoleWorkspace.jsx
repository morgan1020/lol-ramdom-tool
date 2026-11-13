import React from 'react';
import { createPlayerLabels } from '../domain/playerNames.js';
import { positions } from '../domain/draw.js';
import { UiIcon } from './UiIcon.jsx';
import { RoleIcon } from './RoleIcon.jsx';
import { ToggleSwitch } from './ToggleSwitch.jsx';

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
export function RoleResultCards({ players, results, assignedPreferences = {}, localPlayerId, busy, revealId, renderPlayerDetails, renderPlayerActions }) {
  const labels = createPlayerLabels(players.map((player) => player.name));
  const resultByName = Object.fromEntries(results.map((result) => [result.name, result]));
  const roleOrder = (player) => {
    const index = positions.indexOf(resultByName[player.name]?.main);
    return index === -1 ? positions.length : index;
  };
  const orderedPlayers = results.length
    ? [...players].sort((a, b) => roleOrder(a) - roleOrder(b))
    : players;
  return <div className={`roster-card-grid count-${players.length}${busy ? ' is-busy' : ''}`} role="list" aria-label="隊伍分路" style={{ '--player-count': Math.max(1, players.length) }}>
      {orderedPlayers.map((player, index) => {
        const result = resultByName[player.name];
        const actions = renderPlayerActions?.(player);
        const isSelf = Boolean(player.id && player.id === localPlayerId);
        const reveal = Boolean(result && revealId != null);
        return <article key={player.name} className={`roster-player-card${result ? ' has-result' : ''}${result && isSelf ? ' is-own-result' : ''}${actions ? ' has-player-actions' : ''}`} role="listitem" data-player-id={player.name} style={reveal ? { '--role-reveal-delay': `${index * 75}ms` } : undefined}>
          <header className="roster-player-header">
            <h3 className="player-label" title={renderPlayerDetails ? player.name : undefined}>{labels[player.name]}</h3>
            {isSelf && <span className="self-badge">你</span>}
            {renderPlayerDetails?.(player)}
          </header>
          <div key={reveal ? revealId : 'static'} className={`draw-card-result${reveal ? ' is-revealing' : ''}`}>{result ? <><RoleBadge role={result.main} assigned={assignedPreferences[player.name] === result.main} />{result.secondary && <div className="draw-secondary" title="備用分路"><RoleBadge role={result.secondary} secondary /></div>}</> : <span className="empty-role" aria-label="等待抽籤">—</span>}</div>
          {reveal && isSelf && <span key={`glow-${revealId}`} className="own-result-glow" aria-hidden="true" />}
          {actions}
        </article>;
      })}
    </div>;
}

export function RoleWorkspace({ players, results, localPlayerId, assignedPreferences, archived, busy, revealId, drawDisabled, onReturn, onDraw, onCopy, summary, status, children }) {
  return <section className="role-workspace draw-workspace" aria-labelledby="draw-result-title" aria-busy={busy}>
    <div className="workspace-scroll">
      <header className="draw-heading">
        <h1 id="draw-result-title" className="draw-screen-title">{archived ? '上次抽籤結果' : results.length ? '本次抽籤結果' : '隊伍已就緒'}</h1>
        <button className="btn btn-return" type="button" disabled={busy} onClick={onReturn}><UiIcon name="back" />返回設定</button>
      </header>
      {summary ?? <p className="result-scope visual-summary" aria-label={`${players.length} 位玩家`}><UiIcon name="users" />{players.length}</p>}
      <RoleResultCards players={players} results={results} localPlayerId={localPlayerId} assignedPreferences={assignedPreferences} busy={busy} revealId={archived ? null : revealId} />
      {children}
    </div>
    <footer className="draw-screen-actions">
      {status && <div className="draw-footer-status">{status}</div>}
      {onDraw && <button className="btn btn-primary primary-draw" type="button" disabled={busy || drawDisabled} onClick={onDraw}><UiIcon name="shuffle" />{results.length ? '重新抽籤' : '開始抽籤'}</button>}
      {results.length > 0 && <button className="btn btn-secondary copy-results icon-action" type="button" title="複製結果" aria-label="複製結果" disabled={busy} onClick={onCopy}><UiIcon name="copy" /></button>}
    </footer>
  </section>;
}
