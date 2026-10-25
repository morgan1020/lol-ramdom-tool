import React from 'react';
import { describeClientPosition } from '../domain/clientRoster.js';

export function ClientLobbyPanel({ lobby, error, busy, compact, usePreferences, onPreferencesChange, autoApplyRoles, onAutoApplyRolesChange, applyStatus, onRefresh, onDraw, onImport }) {
  return <section className="client-lobby-panel" aria-label="目前客戶端隊伍" aria-busy={busy}>
    <div className="client-lobby-heading"><div><span className="eyebrow">LoL 客戶端</span><h2>目前客戶端隊伍</h2></div><button className="btn btn-secondary" type="button" disabled={busy} onClick={onRefresh}>{busy ? '處理中…' : '重新讀取'}</button></div>
    <details className="client-lobby-details" open={!compact}>
    <summary>隊伍與偏好{lobby ? ` · ${lobby.players.length} 人` : ''} · {usePreferences ? '套用第一偏好' : '全部隨機'}</summary>
    {lobby ? <><ul className="client-player-list">{lobby.players.map((player) => <li key={player.id}><strong>{player.name}{player.isLeader && <small> 隊長</small>}</strong><span>第一偏好：{describeClientPosition(player.firstPosition)} · 第二偏好：{describeClientPosition(player.secondPosition)}</span></li>)}</ul><p className="client-read-time">最近讀取：{new Date(lobby.fetchedAt).toLocaleTimeString('zh-TW')} · {lobby.players.length} 人</p></> : <p>請先在 LoL 客戶端建立隊伍，再讀取目前成員。</p>}
    <label className="client-preference-option"><input type="checkbox" checked={usePreferences} disabled={busy} onChange={(event) => onPreferencesChange(event.target.checked)} />套用客戶端第一偏好（未勾選時全部隨機）</label>
    {usePreferences && <p className="client-read-time">補位與未選擇將隨機分配；第二偏好不作為限制。第一偏好重複時，請匯入後手動調整。</p>}
    <label className="client-preference-option"><input type="checkbox" checked={autoApplyRoles} disabled={busy} onChange={(event) => onAutoApplyRolesChange(event.target.checked)} />抽籤後自動套用自己的分路</label>
    <p className="client-read-time">只更改目前登入帳號的排隊偏好。五人抽籤沒有副位時保留原第二偏好；若與主位衝突則提示手動調整。關閉開關不會還原已套用的分路。</p>
    </details>
    {error && <p className="client-lobby-error" role="alert">{error}</p>}
    {applyStatus.message && <p className={`client-apply-status is-${applyStatus.state}`} role={applyStatus.state === 'error' ? 'alert' : 'status'}>{applyStatus.message}</p>}
    <div className="flow-actions split-actions"><button className="btn btn-secondary" type="button" disabled={busy || !lobby} onClick={onImport}>匯入後調整偏好</button><button className="btn btn-primary btn-large" type="button" disabled={busy} onClick={onDraw}>{busy ? '處理中…' : '讀取隊伍並抽籤'}</button></div>
    <p className="client-read-time">每次按下抽籤都會重新讀取隊伍。也可以使用下方手動抽籤。</p>
  </section>;
}
