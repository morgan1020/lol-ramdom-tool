import React, { useEffect, useRef, useState } from 'react';
import { useSyncRoom } from '../hooks/useSyncRoom.js';
import { formatCopyText } from '../domain/copyFormat.js';
import { formatRoomInvitation, parseRoomInvitation } from '../domain/roomInvitation.js';
import { isRoomPlayerReady } from '../domain/syncRoom.js';
import { getActiveDiscordDestination } from '../domain/discordDestinations.js';
import { DrawModeControl, RoleWorkspace } from './RoleWorkspace.jsx';
import { DiscordSyncPanel } from './DiscordSyncPanel.jsx';
import { DiscordDestinationPicker } from './DiscordDestinationPicker.jsx';
import { SelectMenu } from './SelectMenu.jsx';
import { RoleIcon } from './RoleIcon.jsx';
import { createClientRoster } from '../domain/clientRoster.js';
import { createPlayerLabels } from '../domain/playerNames.js';
import { positions, validatePreferredRoles } from '../domain/draw.js';
import { UiIcon } from './UiIcon.jsx';
import '../syncRoom.css';

const connectionLabels = {
  disconnected: '尚未連線', connecting: '連線中…', connected: '已連線', reconnecting: '連線中斷，重新連線中…'
};

async function readLobby() {
  const reply = await window.lolDesktop.readLobby();
  if (!reply.ok) throw new Error(reply.message || '無法讀取 LoL 大廳');
  const { players, localPlayerId } = reply.lobby;
  const own = players.find(player => player.id === localPlayerId);
  if (!own?.name) throw new Error('無法確認目前登入的 Riot ID');
  return { name: own.name, names: players.map(player => player.name), lobby: reply.lobby };
}

export function SyncRoomPanel({ visible, onBack, discordSync, onManageWebhook, onRecordDraw }) {
  const sync = useSyncRoom();
  const [url, setUrl] = useState('');

  const [action, setAction] = useState('create');
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');
  const [invitation, setInvitation] = useState('');
  const [roomPage, setRoomPage] = useState(null);
  const [revealId, setRevealId] = useState(null);
  const seenResultId = useRef(null);
  const [applying, setApplying] = useState(false);
  const [application, setApplication] = useState(null);
  const autoAttempt = useRef(null);
  const pendingDraw = useRef(null);
  const deliveryQueue = useRef(Promise.resolve());
  const [delivery, setDelivery] = useState(null);
  useEffect(() => {
    if (sync.serviceUrl) setUrl(sync.serviceUrl);
    else if (sync.defaultServiceUrl) setUrl(current => current || sync.defaultServiceUrl);
  }, [sync.serviceUrl, sync.defaultServiceUrl]);
  const room = sync.room;
  const connected = sync.connection === 'connected';
  const self = room?.members.find((member) => member.id === sync.memberId);
  const activeRoom = room && !room.closed && self;
  const isHost = activeRoom && room.hostId === sync.memberId;
  const busy = sync.initializing || sync.busy || reading || applying || sync.connection === 'connecting';
  const discordBusy = discordSync.pending || discordSync.status.state === 'sending';
  const allReady = activeRoom && room.members.every(member => isRoomPlayerReady(member, room.hostId));
  const drawMode = room?.drawMode ?? 'random';
  const preferences = room?.preferences ?? {};
  const canDraw = connected && isHost && room.lobbySynced && allReady && !busy;
  const waitingReason = !connected ? '恢復連線後才能操作。' : !room?.lobbySynced ? '等待主持人讀取 LoL 大廳。' : room?.members.some((member) => !member.approved)
    ? '主持人核准加入後，再請連線玩家準備。' : room?.members.some((member) => !member.manual && !member.connected)
      ? '等待離線成員重新連線。' : !allReady ? '連線玩家準備完成後，由主持人抽籤。' : '可以開始抽籤。';
  const result = connected && activeRoom && room.lobbySynced && self.approved && (isHost || self.ready) && !room.result?.archived ? room.result : null;
  const roomId = activeRoom ? room.roomId : null;
  const resultId = result?.id;
  const page = roomPage?.roomId === roomId ? roomPage.view : 'setup';
  const showRoomPage = view => {
    setRevealId(null);
    setRoomPage({ roomId, view });
  };
  useEffect(() => {
    if (!resultId || seenResultId.current === resultId) return;
    seenResultId.current = resultId;
    setRoomPage({ roomId, view: 'draw' });
    if (visible) setRevealId(resultId);
  }, [roomId, resultId, visible]);
  useEffect(() => {
    if (!visible || !resultId) setRevealId(null);
  }, [visible, resultId]);
  useEffect(() => {
    if (!roomId || !allReady) {
      setRoomPage(current => current?.view === 'draw' ? null : current);
    }
  }, [roomId, allReady]);
  const ownName = self?.name;
  const resultPlayers = room?.result?.results.map(row =>
    room.members.find(member => member.name === row.name) ?? { name: row.name }
  ) ?? [];
  const { settings: discordSettings, syncDraw } = discordSync;
  const currentDiscordSettings = useRef(discordSettings);
  useEffect(() => { currentDiscordSettings.current = discordSettings; }, [discordSettings]);
  useEffect(() => {
    if (!isHost || !result || pendingDraw.current !== result.id) return;
    pendingDraw.current = null;
    void onRecordDraw(result.results);
    if (!discordSettings.enabled || !getActiveDiscordDestination(discordSettings)) return;
    setDelivery({ id: result.id, status: 'queued' });
    const updateDelivery = status => {
      setDelivery(current => current?.id === result.id ? { ...current, status } : current);
    };
    deliveryQueue.current = deliveryQueue.current.then(async () => {
      if (discordSettings !== currentDiscordSettings.current) {
        updateDelivery('settingsChanged');
        return;
      }
      updateDelivery('sending');
      const sent = await syncDraw(result.results, { allowRetry: false, showNotice: false });
      updateDelivery(sent ? 'sent' : 'failed');
    }).catch(() => updateDelivery('failed'));
  }, [isHost, result, discordSettings, syncDraw, onRecordDraw]);
  useEffect(() => {
    if (!result || !ownName || autoAttempt.current === result.id || applying) return;
    autoAttempt.current = result.id;
    setApplying(true);
    setApplication(null);
    void window.lolDesktop.applyRoles(result.results, ownName, result.id).then(reply => {
      if (!reply.ok) throw new Error(reply.message || '無法套用分路');
      setApplication({ id: result.id, message: reply.simulated ? '已模擬套用我的 LoL 分路' : '已更新我的 LoL 分路' });
    }).catch(error => {
      setApplication({ id: result.id, error: true, message: `${error.message || '無法套用分路'}。請在 LoL 手動確認分路。` });
    }).finally(() => setApplying(false));
  }, [result, ownName, applying]);
  const copy = async (text, message) => {
    setLocalError(''); setNotice('');
    try { await navigator.clipboard.writeText(text); setNotice(message); }
    catch { setLocalError('無法複製，請手動選取文字複製'); }
  };
  const withLobby = async (operation) => {
    setReading(true);
    setLocalError(''); setNotice('');
    try { await operation(await readLobby()); }
    catch (error) { setLocalError(error.message || '無法讀取 LoL 大廳'); }
    finally { setReading(false); }
  };
  const connect = (event) => {
    event.preventDefault();
    if (busy) return;
    let options = { url: url.trim(), action };
    if (action === 'join') {
      const entry = invitation.trim();
      try {
        const fields = /^[a-z0-9]{6,16}$/i.test(entry)
          ? { url: options.url, roomId: entry.toUpperCase() }
          : parseRoomInvitation(entry);
        options = { ...fields, action };
        setUrl(fields.url);
      } catch (error) {
        setNotice('');
        setLocalError(error.message);
        return;
      }
    }
    void withLobby(async (lobby) => {
      const joined = await sync.connect({ ...options, name: lobby.name });
      if (!joined) return;
      if (action === 'create') await sync.command({ type: 'sync-lobby', names: lobby.names });
      else setInvitation('');
    });
  };
  const joinCurrentTeam = () => {
    if (busy || !url.trim()) return;
    void withLobby(async lobby => {
      const endpoint = url.trim();
      const reply = await window.lolDesktop.syncRoom.discover({ url: endpoint, names: lobby.names });
      if (reply.ok && reply.match.status === 'found') {
        const { roomId, teamKey } = reply.match;
        if (await sync.connect({ url: endpoint, action: 'join', roomId, teamKey, name: lobby.name })) return;
        setNotice('房間狀態已變更，請改用邀請加入。');
      } else if (reply.ok) {
        setNotice(reply.match.status === 'ambiguous'
          ? '目前隊伍有多個房間，請貼上房主的邀請。'
          : '找不到目前隊伍的房間，請確認房主已開房，或改用邀請。');
      } else setNotice(reply.message);
      setAction('join');
    });
  };
  const copyInvitation = () => {
    try { void copy(formatRoomInvitation({ url: sync.serviceUrl || url, roomId: room.roomId }), '已複製邀請，可傳給朋友貼上加入'); }
    catch (error) { setLocalError(error.message); }
  };
  const command = async (value) => {
    setLocalError(''); setNotice('');
    await sync.command(value);
  };
  const saveSettings = (mode, values) => sync.command({
    type: 'draw-settings', drawMode: mode, preferences: values, revision: room.revision
  });
  const readPreferences = (lobby) => {
    const { names, preferences: values } = createClientRoster(lobby, true);
    try { validatePreferredRoles(names, values); }
    catch (error) { throw new Error(`${error.message}。請改用「指定」調整或切回「隨機」。`); }
    return values;
  };
  const changeMode = async (mode) => {
    setLocalError(''); setNotice('');
    if (mode !== 'client') return saveSettings(mode, mode === 'custom' && drawMode === 'client' ? preferences : {});
    await withLobby(async (snapshot) => {
      if (snapshot.name !== ownName || !matchesLobby(snapshot.names)) throw new Error('LoL 大廳已變更，請先重新讀取名單');
      await saveSettings(mode, readPreferences(snapshot.lobby));
    });
  };
  const matchesLobby = (names) => names.length === room.members.length && room.members.every(member => names.includes(member.name));
  const leave = async () => {
    setLocalError(''); setNotice('');
    if (connected && !await sync.command({ type: 'leave' })) return;
    await sync.disconnect();
  };
  const updateLobby = (draw) => {
    void withLobby(async (lobby) => {
      if (lobby.name !== ownName) throw new Error('目前登入的 Riot ID 與房主帳號不同');
      const matches = matchesLobby(lobby.names);
      if (!matches || !room.lobbySynced) {
        if (await sync.command({ type: 'sync-lobby', names: lobby.names })) {
          setRoomPage(null);
          setNotice('LoL 大廳名單已更新，請重新準備後再抽籤。');
        }
        return;
      }
      if (drawMode === 'client') {
        const latestPreferences = readPreferences(lobby.lobby);

        if (room.members.some(member => preferences[member.name] !== latestPreferences[member.name])) {
          if (await saveSettings(drawMode, latestPreferences)) {
            setRoomPage(null);
            setNotice('LoL 第一偏好已更新，請重新準備後再抽籤。');
          }
          return;
        }
      }
      if (!draw) { setNotice('已讀取 LoL 大廳名單'); return; }
      const resultId = `${room.roomId}:${room.resultVersion + 1}`;
      pendingDraw.current = resultId;
      if (!await sync.command({ type: 'draw', revision: room.revision }) && pendingDraw.current === resultId) {
        pendingDraw.current = null;
      }
    });
  };

  if (!visible) return null;
  const labels = createPlayerLabels((room?.members ?? []).map(member => member.name));
  const roomSummary = activeRoom && <div className="sync-room-summary">
    <span className="sync-room-code">房碼 <strong>{room.roomId}</strong></span>
    <span className={connected ? 'sync-ready' : ''} role="status">{connectionLabels[sync.connection]}</span>
    {room.result && <span>第 {room.result.version} 次</span>}
  </div>;
  const teamCount = activeRoom && `${room.members.length} / 5`;
  const preparationHeader = activeRoom && <header className="draw-heading sync-room-toolbar">
    <div className="sync-room-heading-details">
      <h1 id="sync-room-title" className="draw-screen-title">準備抽籤</h1>
      {!isHost && <>{roomSummary}
        <p className="sync-guest-status" role="status">{!connected || !room.lobbySynced ? waitingReason : !self.approved ? '等待主持人核准加入' : self.ready ? '已準備，等候主持人抽籤' : '確認名單與分路後，就可以準備。'}</p>
      </>}
    </div>
    <div className="sync-toolbar-actions">
      {isHost && <button className="btn btn-secondary" type="button" onClick={copyInvitation}>複製邀請</button>}
      <button className="btn btn-return" type="button" disabled={busy} onClick={leave}>{isHost ? connected ? '關閉房間' : '離開本機連線' : '離開房間'}</button>
      {!isHost && self.approved && room.lobbySynced && <button className={`btn sync-guest-ready ${self.ready ? 'btn-secondary is-ready' : 'btn-primary'}`} type="button" disabled={busy || !connected} onClick={() => command({ type: 'ready', ready: !self.ready })}>{self.ready ? '取消準備' : '我準備好了'}</button>}
    </div>
  </header>;
  const renderMemberStatus = (member) => {
    if (member.manual) return null;
    if (member.id === room.hostId && member.connected) return <div className="sync-member-state"><span><UiIcon name="monitor" />主持人</span></div>;
    const status = !member.connected ? '離線' : !member.approved ? '待核准' : member.ready ? '已準備' : '尚未準備';
    return <div className="sync-member-state">
      {member.id === room.hostId && <span>主持人</span>}
      <span className={member.ready ? 'sync-ready' : ''}><UiIcon name={member.ready ? 'check' : 'monitor'} />{status}</span>
    </div>;
  };
  const copyResults = () => copy(formatCopyText(room.result.results), '已複製分路結果');
  const resultFeedback = <div className="sync-room-feedback">
    {applying && <p role="status">正在套用我的 LoL 分路…</p>}
    {room?.result && application?.id === room.result.id && <p className={application.error ? 'sync-room-error' : 'sync-room-notice'} role={application.error ? 'alert' : 'status'}>{application.message}</p>}
    {room?.result && isHost && delivery?.id === room.result.id && <p className={delivery.status === 'failed' ? 'sync-room-error' : 'sync-room-notice'} role="status">
      {{
        queued: '等待傳送到 Discord…',
        sending: '正在傳送到 Discord…',
        sent: '已傳送整隊結果到 Discord',
        failed: 'Discord 傳送未完成，可複製結果手動分享。',
        settingsChanged: 'Discord 設定已變更，可複製結果手動分享。'
      }[delivery.status]}
    </p>}
  </div>;
  const showingDraw = activeRoom && page !== 'setup';
  return <section className="sync-room-panel" aria-labelledby={showingDraw ? 'draw-result-title' : 'sync-room-title'} aria-busy={busy}>
    {!activeRoom && <header className="sync-room-heading">
      <h1 id="sync-room-title">多人房間</h1>
      <button className="btn btn-secondary" type="button" disabled={busy} onClick={onBack}><UiIcon name="back" />返回抽分路</button>
    </header>}
    {(localError || sync.error) && <p className="sync-room-error" role="alert">{localError || sync.error}</p>}
    {notice && <p className="sync-room-notice" role="status">{notice}</p>}
    {!sync.available ? <p>多人同步房間僅提供 Windows App 使用，請更新 App 後再試。</p> : !activeRoom ? <form className="sync-connect-form" onSubmit={connect}>
      {room?.closed && <p className="sync-room-closed" role="status">房間已關閉，可以建立或加入另一個房間。</p>}
      <div className="source-switch" role="group" aria-label="房間操作">
        <button type="button" aria-pressed={action === 'create'} className={action === 'create' ? 'is-selected' : ''} disabled={busy} onClick={() => setAction('create')}>建立房間</button>
        <button type="button" aria-pressed={action === 'join'} className={action === 'join' ? 'is-selected' : ''} disabled={busy} onClick={() => setAction('join')}>加入房間</button>
      </div>
      {action === 'join' && <button className="btn btn-primary" type="button" disabled={busy || !url.trim()} onClick={joinCurrentTeam}>加入目前隊伍</button>}
      {action === 'join' && <label className="sync-field" htmlFor="sync-invitation">
        <span>邀請或房碼</span>
        <textarea id="sync-invitation" value={invitation} onChange={(event) => setInvitation(event.target.value)} placeholder="貼上房主傳給你的邀請或房碼" rows={3} maxLength={4096} autoComplete="off" spellCheck="false" disabled={busy} required />
      </label>}
      <p className="sync-room-help">{action === 'create' ? '從 LoL 讀取大廳名單。' : '加入時會讀取你的 Riot ID。準備後，抽籤會自動套用你的分路。'}</p>
      <button className={`btn ${action === 'create' ? 'btn-primary' : 'btn-secondary'}`} type="submit" disabled={busy || (action === 'create' ? !url.trim() : !invitation.trim())}>{sync.initializing ? '正在讀取房間…' : busy ? '處理中…' : action === 'create' ? '建立房間' : '申請加入'}</button>
      {sync.connection === 'connecting' && <button className="btn btn-secondary" type="button" onClick={() => sync.disconnect()}>取消連線</button>}
      <details className="sync-service-settings" open={!sync.defaultServiceUrl && !sync.serviceUrl}>
        <summary>同步服務設定</summary>
        <label className="sync-field" htmlFor="sync-server-url"><span>同步服務位址</span><input id="sync-server-url" type="text" value={url} onChange={(event) => setUrl(event.target.value)} autoComplete="off" spellCheck="false" placeholder="wss://你的服務.workers.dev/rooms" maxLength={2048} disabled={busy} /><small>使用房碼加入時，請確認你和主持人使用同一服務。完整邀請已包含服務位址。</small></label>
      </details>
      <p className="sync-room-help">請使用信任的同步服務。服務會暫存房間成員名稱與抽籤結果。</p>
    </form> : showingDraw ? <RoleWorkspace
      revealId={revealId === resultId ? revealId : null}
      players={room.result ? resultPlayers : room.members}
      results={room.result?.results ?? []}
      assignedPreferences={room.result?.preferences}
      localPlayerId={self.id}
      archived={room.result?.archived}
      busy={busy}
      drawDisabled={!canDraw}
      onReturn={() => showRoomPage('setup')}
      onDraw={isHost && page === 'draw' ? () => updateLobby(true) : undefined}
      onCopy={copyResults}
      summary={roomSummary}
      status={isHost && page === 'draw' ? <span role="status">{waitingReason}</span> : null}
    >
      {resultFeedback}
    </RoleWorkspace> : <div className={`role-setup sync-room-preparation${isHost ? '' : ' sync-guest-preparation'}`}>
      {!isHost && <div className="sync-guest-header">{preparationHeader}</div>}
      <div className="workspace-scroll">
        {isHost && <>{preparationHeader}{roomSummary}</>}
        <div className="preparation-grid">
          <section className="preparation-panel roster-preparation">
            <header className="preparation-panel-title">
              <div className="sync-roster-title"><h3><UiIcon name="users" />參加玩家</h3>{!isHost && <span className="visual-summary">{teamCount}</span>}</div>
              {isHost && <button className="text-button" type="button" disabled={busy || !connected} onClick={() => updateLobby(false)}>重新讀取 LoL 大廳</button>}
              {!isHost && <span className="sync-guest-mode">分路方式 · {{ random: '隨機', client: '沿用 LoL 第一偏好', custom: '指定主位' }[drawMode]}</span>}
            </header>
            <div className="preparation-player-list" role="list" aria-label="參加玩家名單">
              {room.members.map(member => <div className="sync-preparation-member" role="listitem" key={member.id}>
                <div className={`preparation-player-row${drawMode === 'custom' ? ' has-preference' : ''}`}>
                  <div className="sync-member-identity">
                    <div className="preparation-player-name"><span className="player-label" title={member.name}>{labels[member.name]}</span>{member.id === self.id && <span className="self-badge">你</span>}</div>
                    {renderMemberStatus(member)}
                  </div>
                  {drawMode === 'custom' && isHost ? <SelectMenu
                    className="inline-preference"
                    label={`${labels[member.name]} 的主位偏好`}
                    value={preferences[member.name] ?? ''}
                    disabled={busy || !connected}
                    options={[{ value: '', label: '隨機', icon: <UiIcon name="shuffle" /> }, ...positions.map(role => ({
                      value: role, label: role, icon: <RoleIcon role={role} />,
                      disabled: room.members.some(other => other.id !== member.id && preferences[other.name] === role)
                    }))]}
                    onChange={role => {
                      const values = { ...preferences };
                      if (role) values[member.name] = role;
                      else delete values[member.name];
                      return saveSettings('custom', values);
                    }}
                  /> : drawMode !== 'random' && <span className="client-preference-label">{preferences[member.name] ?? '隨機'}</span>}
                  {isHost && !member.manual && member.approved && member.id !== self.id &&
                    <button className="remove-player" type="button" title="移除玩家" aria-label={`移除 ${member.name}`} disabled={busy || !connected} onClick={() => command({ type: 'remove', memberId: member.id })}><UiIcon name="close" /></button>}
                </div>
                {isHost && !member.approved && <div className="sync-member-actions">
                  <button className="btn btn-primary" type="button" disabled={busy || !connected || !member.connected} onClick={() => command({ type: 'approve', memberId: member.id })} aria-label={`核准 ${member.name}`}>核准</button>
                  <button className="btn btn-secondary" type="button" disabled={busy || !connected} onClick={() => command({ type: 'remove', memberId: member.id })} aria-label={`拒絕加入 ${member.name}`}>拒絕</button>
                </div>}
              </div>)}
            </div>
          </section>
          {isHost && <div className="preparation-settings">
            <section className="preparation-panel draw-preparation">
              <div className="preparation-group">
                <h2><UiIcon name="shuffle" />分路</h2>
                <DrawModeControl source="client" drawMode={drawMode} onChange={changeMode} disabled={busy || !connected || !room.lobbySynced} />
              </div>
            </section>
            <section className="preparation-panel discord-preparation" aria-label="Discord 設定">
              <header className="setting-section-heading discord-section-heading">
                <h2><UiIcon name="discord" />Discord</h2>
                <DiscordDestinationPicker settings={discordSync.settings} disabled={busy || discordBusy} onSelect={discordSync.select} />
                <button className="text-button manage-webhook icon-action" type="button" aria-label="設定 Discord" title="管理 Webhook" disabled={busy || discordBusy} onClick={onManageWebhook}><UiIcon name="settings" /></button>
              </header>
              <div className="preparation-group"><DiscordSyncPanel showDestination={false} label="自動傳送" settings={discordSync.settings} status={discordSync.status} onToggle={discordSync.toggle} disabled={busy || discordBusy} /></div>
            </section>
          </div>}
        </div>
      </div>
      {(isHost || room.result) && <footer className="preparation-actions">
        {isHost && <div className="sync-room-footer-info">
          <span className="visual-summary"><UiIcon name="users" />{teamCount}</span>
          <span role="status">{waitingReason}</span>
        </div>}
        {isHost && <button className="btn btn-primary finish-setup" type="button" disabled={!canDraw} onClick={() => showRoomPage('draw')}>進入抽籤 <UiIcon name="arrow" /></button>}
        {room.result && <button className={`btn btn-secondary${isHost ? ' room-previous-result' : ''}`} type="button" onClick={() => showRoomPage('previous')}>{room.result.archived ? '查看上次結果' : '查看結果'}</button>}
      </footer>}
    </div>}
  </section>;
}
