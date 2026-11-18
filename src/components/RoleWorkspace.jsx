import React from 'react';
import { createPlayerLabels } from '../domain/playerNames.js';
import { positions } from '../domain/draw.js';
import { UiIcon } from './UiIcon.jsx';
import { RoleIcon } from './RoleIcon.jsx';
import { ToggleSwitch } from './ToggleSwitch.jsx';
import { CopyResultButton } from './CopyResultButton.jsx';

export function RoleBadge({ role, secondary = false, assigned = false }) {
  return <span className={`table-role${secondary ? ' is-secondary' : ''}${assigned ? ' is-assigned' : ''}`} aria-label={`${secondary ? '副位' : '主位'}：${role}${assigned ? '（指定）' : ''}`}><span className="table-role-icon"><RoleIcon role={role} />{assigned && <span className="assignment-marker" title="指定主位" aria-label="指定主位"><UiIcon name="lock" /></span>}</span><span>{role}</span></span>;
}
export function AutoApplySwitch({ enabled, disabled, onChange }) {
  return <div className="auto-apply-control">
    <ToggleSwitch enabled={enabled} disabled={disabled} label="抽完更新我的 LoL 分路"
      caption="套用分路" onToggle={() => onChange(!enabled)} />
  </div>;
}
export function RoleResultCards({ players, results, preferences = {}, assignedPreferences = {}, localPlayerId, busy, revealId, renderPlayerCorner, renderPlayerDetails, renderPlayerActions, renderRolePicker, onAddPlayer }) {
  const labels = createPlayerLabels(players.map((player) => player.name));
  const resultByName = Object.fromEntries(results.map((result) => [result.name, result]));
  const roleOrder = (player) => {
    const index = positions.indexOf(resultByName[player.name]?.main);
    return index === -1 ? positions.length : index;
  };
  const orderedPlayers = results.length
    ? [...players].sort((a, b) => roleOrder(a) - roleOrder(b))
    : players;
  const slotCount = onAddPlayer ? positions.length : players.length;
  return <div className={`roster-card-grid count-${slotCount}${busy ? ' is-busy' : ''}`} role="list" aria-label="隊伍分路" style={{ '--player-count': Math.max(1, slotCount) }}>
      {orderedPlayers.map((player, index) => {
        const result = resultByName[player.name];
        const actions = renderPlayerActions?.(player);
        const isSelf = Boolean(player.id && player.id === localPlayerId);
        const reveal = Boolean(result && revealId != null);
        const preferredRole = preferences[player.name];
        return <article key={player.name} className={`roster-player-card${result ? ' has-result' : ''}${result && isSelf ? ' is-own-result' : ''}${actions ? ' has-player-actions' : ''}`} role="listitem" data-player-id={player.name} style={reveal ? { '--role-reveal-delay': `${index * 75}ms` } : undefined}>
          <header className="roster-player-header">
            <h3 className="player-label" title={renderPlayerDetails ? player.name : undefined}>{labels[player.name]}</h3>
            {renderPlayerCorner ? renderPlayerCorner(player, isSelf) : isSelf && <span className="self-badge">你</span>}
            {renderPlayerDetails?.(player)}
          </header>
          <div key={reveal ? revealId : 'static'} className={`draw-card-result${reveal ? ' is-revealing' : ''}`}>
            {result ? <>
              <RoleBadge role={result.main} assigned={assignedPreferences[player.name] === result.main} />
              {result.secondary && <div className="draw-secondary" title="備用分路"><RoleBadge role={result.secondary} secondary /></div>}
            </> : preferredRole
              ? <span className="table-role-icon card-preferred-role" role="img" aria-label={`指定主位：${preferredRole}`} title={`指定主位：${preferredRole}`}><RoleIcon role={preferredRole} /></span>
              : renderRolePicker
                ? <span className="card-random-role">交給抽籤</span>
                : <span className="empty-role" aria-label="等待抽籤">—</span>}
          </div>
          {renderRolePicker?.(player)}
          {reveal && isSelf && <span key={`glow-${revealId}`} className="own-result-glow" aria-hidden="true" />}
          {actions}
        </article>;
      })}
      {Array.from({ length: slotCount - players.length }, (_, index) =>
        <article key={index} className="roster-player-card solo-empty-card" role="listitem">
          <button className="solo-add-trigger" type="button" aria-label="新增玩家" disabled={busy} onClick={onAddPlayer}><UiIcon name="plus" /></button>
        </article>
      )}
    </div>;
}

export function RoleWorkspace({ players, results, localPlayerId, preferences, assignedPreferences, busy, revealId, drawDisabled, onDraw, onCopy, controls, status, renderPlayerActions, renderRolePicker, onAddPlayer }) {
  return <section className="role-workspace draw-workspace solo-draw-workspace" aria-labelledby="draw-result-title" aria-busy={busy}>
    <div className="workspace-scroll">
      <header className="draw-heading">
        <h1 id="draw-result-title" className="draw-screen-title">{results.length ? '本次抽籤結果' : '抽分路'}</h1>
      </header>
      {controls}
      <RoleResultCards players={players} results={results} localPlayerId={localPlayerId} preferences={preferences} assignedPreferences={assignedPreferences} busy={busy} revealId={revealId} renderPlayerActions={renderPlayerActions} renderRolePicker={renderRolePicker} onAddPlayer={onAddPlayer} />
    </div>
    <footer className="draw-screen-actions">
      {status && <div className="draw-footer-status solo-draw-discord">{status}</div>}
      <button className="btn btn-primary primary-draw" type="button" disabled={busy || drawDisabled} onClick={onDraw}><UiIcon name="shuffle" />{results.length ? '重新抽籤' : '開始抽籤'}</button>
      {results.length > 0 && <CopyResultButton resetKey={results} disabled={busy} onCopy={onCopy} />}
    </footer>
  </section>;
}
