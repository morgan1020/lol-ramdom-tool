import React, { useEffect, useState } from 'react';
import { useSyncRoom } from '../hooks/useSyncRoom.js';
import { formatCopyText } from '../domain/copyFormat.js';
import { formatRoomInvitation, parseRoomInvitation } from '../domain/roomInvitation.js';
import { RoleIcon } from './RoleIcon.jsx';
import { UiIcon } from './UiIcon.jsx';
import '../syncRoom.css';

const connectionLabels = {
  disconnected: '尚未連線', connecting: '連線中…', connected: '已連線', reconnecting: '連線中斷，重新連線中…'
};

export function SyncRoomPanel() {
  const sync = useSyncRoom();
  const [url, setUrl] = useState('ws://127.0.0.1:8787/sync');
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [action, setAction] = useState('create');
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');
  const [invitation, setInvitation] = useState('');
  useEffect(() => { if (sync.serviceUrl) setUrl(sync.serviceUrl); }, [sync.serviceUrl]);
  const room = sync.room;
  const connected = sync.connection === 'connected';
  const self = room?.members.find((member) => member.id === sync.memberId);
  const activeRoom = room && !room.closed && self;
  const isHost = activeRoom && room.hostId === sync.memberId;
  const busy = sync.initializing || sync.busy || reading || sync.connection === 'connecting';
  const allReady = activeRoom && room.members.length > 0 && room.members.every((member) => member.approved && member.connected && member.ready);
  const canDraw = connected && isHost && allReady && !busy;
  const validName = /^[^#\r\n]+#[^#\s]+$/.test(name.trim());
  const waitingReason = !connected ? '恢復連線後才能操作。' : room?.members.some((member) => !member.approved)
    ? '主持人核准所有成員後，再請大家準備。' : room?.members.some((member) => !member.connected)
      ? '等待離線成員重新連線。' : !allReady ? '全部成員準備完成後，由主持人抽籤。' : '所有人已準備完成。';

  const readIdentity = async () => {
    setReading(true); setLocalError(''); setNotice('');
    try {
      const reply = await window.lolDesktop.readLobby();
      if (!reply.ok) throw new Error(reply.message || '無法讀取 LoL 大廳');
      const own = reply.lobby.players.find((player) => player.id === reply.lobby.localPlayerId);
      if (!own?.name) throw new Error('無法確認自己的 Riot ID，請手動輸入');
      setName(own.name);
      setNotice('已填入目前登入的 Riot ID');
    } catch (error) { setLocalError(error.message || '讀取 Riot ID 失敗'); }
    finally { setReading(false); }
  };
  const copy = async (text, message) => {
    setLocalError(''); setNotice('');
    try { await navigator.clipboard.writeText(text); setNotice(message); }
    catch { setLocalError('無法複製，請手動選取文字複製'); }
  };
  const connect = async (event) => {
    event.preventDefault();
    setLocalError(''); setNotice('');
    await sync.connect({ url: url.trim(), action, name: name.trim(), ...(action === 'join' ? { roomId: roomId.trim().toUpperCase() } : {}) });
  };
  const applyInvitation = () => {
    setLocalError(''); setNotice('');
    try {
      const parsed = parseRoomInvitation(invitation);
      setUrl(parsed.url); setRoomId(parsed.roomId); setAction('join');
      setNotice('已填入邀請，確認服務位址與自己的 Riot ID 後，再按加入');
    } catch (error) { setLocalError(error.message); }
  };
  const copyInvitation = () => {
    try { void copy(formatRoomInvitation({ url: sync.serviceUrl || url, roomId: room.roomId }), '已複製邀請，可傳給朋友貼上加入'); }
    catch (error) { setLocalError(error.message); }
  };
  const command = async (value) => {
    setLocalError(''); setNotice('');
    await sync.command(value);
  };
  const leave = async () => {
    setLocalError(''); setNotice('');
    if (connected && !await sync.command({ type: 'leave' })) return;
    await sync.disconnect();
  };

  return <section className="sync-room-panel" aria-labelledby="sync-room-title" aria-busy={busy}>
    <header className="sync-room-heading">
      <div><span className="eyebrow">桌面測試版</span><h1 id="sync-room-title">多人同步房間</h1><p>一人抽籤，所有人一起看結果。</p></div>
      <span className={`sync-connection sync-connection-${sync.connection}`} role="status">{sync.initializing ? '正在讀取房間…' : connectionLabels[sync.connection] || '連線狀態未知'}</span>
    </header>
    <p className="sync-room-scope">此階段僅同步分路結果，不會變更 LoL 分路、累計統計或傳送 Discord 訊息。</p>
    {(localError || sync.error) && <p className="sync-room-error" role="alert">{localError || sync.error}</p>}
    {notice && <p className="sync-room-notice" role="status">{notice}</p>}
    {!sync.available ? <p>多人同步房間僅提供 Windows App 使用，請更新 App 後再試。</p> : !activeRoom ? <form className="sync-connect-form" onSubmit={connect}>
      {room?.closed && <p className="sync-room-closed" role="status">房間已關閉，可以建立或加入另一個房間。</p>}
      <div className="source-switch" role="group" aria-label="房間操作">
        {[['create', '建立房間'], ['join', '加入房間']].map(([value, label]) => <button key={value} type="button" aria-pressed={action === value} className={action === value ? 'is-selected' : ''} disabled={busy} onClick={() => setAction(value)}>{label}</button>)}
      </div>
      <label className="sync-field" htmlFor="sync-player-name"><span>你的 Riot ID</span><div className="sync-identity-input"><input id="sync-player-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" placeholder="玩家名稱#TW1" maxLength={200} disabled={busy} required /><button className="btn btn-secondary" type="button" onClick={readIdentity} disabled={busy}>{reading ? '讀取中…' : '從 LoL 讀取'}</button></div><small>請輸入完整名稱與 # 標籤，方便朋友辨識。</small></label>
      {action === 'join' && <><details className="sync-invitation-entry"><summary>貼上朋友的邀請</summary><label className="sync-field" htmlFor="sync-invitation"><span>完整邀請內容</span><textarea id="sync-invitation" value={invitation} onChange={(event) => setInvitation(event.target.value)} placeholder={'英雄聯盟抽籤工具房間邀請\n服務：wss://服務網址/rooms\n房碼：房間代碼'} rows={3} maxLength={4096} disabled={busy} /></label><button className="btn btn-secondary" type="button" disabled={busy || !invitation.trim()} onClick={applyInvitation}>套用邀請</button><p className="sync-room-help">只填入服務位址與房碼，不會立即連線。</p></details><label className="sync-field" htmlFor="sync-room-code"><span>房間代碼</span><input id="sync-room-code" value={roomId} onChange={(event) => setRoomId(event.target.value.toUpperCase())} autoComplete="off" placeholder="輸入主持人提供的代碼" maxLength={24} disabled={busy} required /></label></>}
      <label className="sync-field" htmlFor="sync-server-url"><span>同步服務位址</span><input id="sync-server-url" type="text" value={url} onChange={(event) => setUrl(event.target.value)} autoComplete="off" spellCheck="false" placeholder="wss://你的服務.workers.dev/rooms" maxLength={2048} disabled={busy} required /><small>與朋友使用同一個服務。本機測試用 ws://127.0.0.1:8787/sync；跨電腦請填入已部署的 wss 雲端服務 /rooms 位址。</small></label>
      <button className="btn btn-primary" type="submit" disabled={busy || !validName || !url.trim() || (action === 'join' && !roomId.trim())}>{sync.initializing ? '正在讀取房間…' : busy ? '處理中…' : action === 'create' ? '建立房間' : '加入並等候核准'}</button>
      {sync.connection === 'connecting' && <button className="btn btn-secondary" type="button" onClick={() => sync.disconnect()}>取消連線</button>}
      <p className="sync-room-help">可連接本機測試服務或自行部署的雲端服務。每間最多 5 人，加入者需經主持人核准。服務會暫存房間成員名稱與抽籤結果；請使用信任的同步服務。</p>
    </form> : <div className="sync-room-body">
      <section className="sync-member-section" aria-labelledby="sync-members-title">
        <header className="sync-room-toolbar"><div><span className="eyebrow">房間代碼</span><div className="sync-room-code"><strong>{room.roomId}</strong><button type="button" className="text-button" onClick={() => copy(room.roomId, '已複製房間代碼')} aria-label="複製房間代碼"><UiIcon name="copy" /></button></div></div><button type="button" className="btn btn-secondary" disabled={busy} onClick={leave}>{isHost ? connected ? '關閉房間' : '離開本機連線' : '離開房間'}</button></header>
        <div className="sync-room-invite"><p className="sync-room-service">{sync.serviceUrl || url}</p><button className="btn btn-secondary" type="button" onClick={copyInvitation}>複製邀請</button></div>
        <div className="sync-section-title"><h2 id="sync-members-title">房間成員</h2><span>{room.members.length} / 5</span></div>
        <ul className="sync-member-list">{room.members.map((member) => <li key={member.id} data-member-id={member.id}>
          <div className="sync-member-name"><strong>{member.name}</strong><div>{member.id === room.hostId && <span className="self-badge">主持人</span>}{member.id === sync.memberId && <span className="self-badge">你</span>}</div></div>
          <div className="sync-member-state">{!member.connected ? <span>離線</span> : !member.approved ? <span>待核准</span> : <span className={member.ready ? 'sync-ready' : ''}>{member.ready ? '已準備' : '尚未準備'}</span>}{isHost && !member.approved && <button className="btn btn-secondary" type="button" disabled={busy || !connected || !member.connected} onClick={() => command({ type: 'approve', memberId: member.id })} aria-label={`核准 ${member.name}`}>核准</button>}{isHost && member.id !== sync.memberId && <button className="text-button sync-remove-member" type="button" disabled={busy || !connected} onClick={() => command({ type: 'remove', memberId: member.id })} aria-label={`${member.approved ? '移除' : '拒絕加入'} ${member.name}`}>{member.approved ? '移除' : '拒絕加入'}</button>}</div>
        </li>)}</ul>
        {!self?.approved && <p className="sync-room-waiting">等待主持人核准，通過後即可準備。</p>}
        <footer className="sync-room-actions"><p role="status">{waitingReason}</p><div>{self?.approved && <button className={`btn ${self.ready ? 'btn-secondary' : 'btn-primary'}`} type="button" disabled={busy || !connected} onClick={() => command({ type: 'ready', ready: !self.ready })}>{self.ready ? '取消準備' : '我準備好了'}</button>}{isHost && <button className="btn btn-primary" type="button" disabled={!canDraw} onClick={() => command({ type: 'draw' })}>{room.result ? '重新抽籤' : '開始抽籤'}</button>}</div></footer>
        <p className="sync-room-help">成員或連線變動後，大家需重新確認準備。主持人離開時，房間會關閉。</p>
      </section>
      <section className="sync-result-section" aria-labelledby="sync-result-title"><div className="sync-section-title"><h2 id="sync-result-title">同步結果</h2>{room.result && <span>第 {room.result.version} 次</span>}</div>
        {room.result ? <><ul className="sync-result-list">{room.result.results.map((result) => <li key={result.name}><strong>{result.name}</strong><span><RoleIcon role={result.main} />{result.main}{result.secondary && <small>副位 {result.secondary}</small>}</span></li>)}</ul><button className="btn btn-secondary" type="button" onClick={() => copy(formatCopyText(room.result.results), '已複製分路結果')}>複製結果</button></> : <div className="sync-result-empty"><UiIcon name="shuffle" /><p>準備完成後，結果會同步顯示在這裡。</p></div>}
      </section>
    </div>}
  </section>;
}
