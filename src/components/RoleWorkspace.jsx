import React from 'react';
import { createPlayerLabels } from '../domain/playerNames.js';
import { RoleIcon } from './RoleIcon.jsx';

export function RoleBadge({ role, secondary = false }) {
  return <span className={`table-role${secondary ? ' is-secondary' : ''}`}><span className="table-role-icon"><RoleIcon role={role} /></span><span>{role}</span></span>;
}
export function DrawModeSelect({ source, drawMode, onChange, disabled, id = 'draw-mode' }) {
  return <label className="draw-mode-field" htmlFor={id}><span>抽籤方式</span><select id={id} aria-label="抽籤方式" value={drawMode} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="random">全部隨機</option>{source === 'client' && <option value="client">保留客戶端第一偏好</option>}<option value="custom">自訂主位偏好</option></select></label>;
}
export function AutoApplySwitch({ enabled, disabled, onChange }) {
  return <label className="auto-apply-control"><input type="checkbox" role="switch" aria-label="抽完更新我的 LoL 分路" checked={enabled} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span className="switch-visual" aria-hidden="true" /><span>抽完更新我的 LoL 分路<small>僅更改自己的帳號</small></span></label>;
}
export function RoleWorkspace({ lobby, players, results, busy, loading, error, applyStatus, onReturn, onDraw, onCopy, discordStatus, onRetryDiscord }) {
  const labels = createPlayerLabels(players.map((player) => player.name));
  const resultByName = Object.fromEntries(results.map((result) => [result.name, result]));
  return <section className="role-workspace draw-workspace" aria-label="抽籤操作" aria-busy={busy}>
    <h2 className="draw-screen-title">{results.length ? '抽籤結果' : '隊伍已就緒'}</h2>
    <div className={`roster-card-grid count-${players.length}${busy ? ' is-busy' : ''}`} role="list" aria-label="隊伍分路" style={{ '--player-count': Math.max(1, players.length) }}>
      {players.map((player) => {
        const result = resultByName[player.name];
        return <article key={player.name} className={`roster-player-card${result ? ' has-result' : ''}`} role="listitem" data-player-id={player.name}>
          <header className="roster-player-header"><h3 className="player-label">{labels[player.name]}</h3>{player.id && player.id === lobby?.localPlayerId && <span className="self-badge">你</span>}</header>
          <div className="draw-card-result">{result ? <><RoleBadge role={result.main} />{result.secondary && <div className="draw-secondary"><span>副位</span><RoleBadge role={result.secondary} secondary /></div>}</> : <span className="empty-role" aria-label="等待抽籤">—</span>}</div>
        </article>;
      })}
    </div>
    <div className="draw-feedback" aria-live="polite">
      {error && <p className="inline-status is-error" role="alert">{error}</p>}
      {applyStatus.state === 'error' && <p className="inline-status is-error" role="alert">{applyStatus.message}</p>}
      {discordStatus.state === 'error' && <div className="inline-status is-error" role="alert"><span>{discordStatus.message}</span><button className="text-button" type="button" disabled={busy} onClick={onRetryDiscord}>重送本次結果</button></div>}
    </div>
    <footer className="draw-screen-actions"><button className="btn btn-return" type="button" disabled={busy} onClick={onReturn}>返回設定</button><button className="btn btn-secondary copy-results" type="button" disabled={busy || !results.length} onClick={onCopy}>複製結果</button><button className="btn btn-primary primary-draw" type="button" disabled={busy} onClick={onDraw}>{busy ? loading ? '讀取中…' : '處理中…' : results.length ? '重新抽籤' : '開始抽籤'}</button></footer>
  </section>;
}
