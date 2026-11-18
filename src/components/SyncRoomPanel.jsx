import React, { useEffect, useRef, useState } from 'react';
import { useSyncRoom } from '../hooks/useSyncRoom.js';
import { formatCopyText } from '../domain/copyFormat.js';
import { formatRoomInvitation, parseRoomInvitation } from '../domain/roomInvitation.js';
import { isRoomPlayerReady } from '../domain/syncRoom.js';
import { getActiveDiscordDestination } from '../domain/discordDestinations.js';
import { notify, dismissNotice } from '../notifications.js';
import { RoleResultCards } from './RoleWorkspace.jsx';
import { DrawDiscordControls } from './DiscordSyncPanel.jsx';
import { LolRefreshButton } from './LolRefreshButton.jsx';
import { createPlayerLabels } from '../domain/playerNames.js';
import { UiIcon } from './UiIcon.jsx';
import { ModalFrame } from './ModalFrame.jsx';
import { CopyResultButton } from './CopyResultButton.jsx';
import { CardRolePicker } from './CardRolePicker.jsx';
import { ToggleSwitch } from './ToggleSwitch.jsx';
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
  return { name: own.name, names: players.map(player => player.name) };
}

export function SyncRoomPanel({ visible, onBack, discordSync, onManageWebhook, onRecordDraw, onRoomStatusChange, entryRequest, leaveRequested, onCancelLeave }) {
  const sync = useSyncRoom();
  const [url, setUrl] = useState('');

  const [action, setAction] = useState('choose');
  const [entryAutoApply, setEntryAutoApply] = useState(true);
  const [usedRolePicker, setUsedRolePicker] = useState(() => {
    try { return localStorage.getItem('lolRoomRolePickerUsed') === 'true'; }
    catch { return false; }
  });
  const markRolePickerUsed = () => {
    if (usedRolePicker) return;
    setUsedRolePicker(true);
    try { localStorage.setItem('lolRoomRolePickerUsed', 'true'); }
    catch { /* Keep the hint dismissed for this session. */ }
  };
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');
  const [removeTarget, setRemoveTarget] = useState(null);
  const [invitation, setInvitation] = useState('');
  const [revealId, setRevealId] = useState(null);
  const seenResultId = useRef(null);
  const [applying, setApplying] = useState(false);
  const autoAttempt = useRef(null);
  const pendingDraw = useRef(null);
  const deliveryQueue = useRef(Promise.resolve());
  useEffect(() => {
    if (sync.serviceUrl) setUrl(sync.serviceUrl);
    else if (sync.defaultServiceUrl) setUrl(current => current || sync.defaultServiceUrl);
  }, [sync.serviceUrl, sync.defaultServiceUrl]);
  const room = sync.room;
  const connected = sync.connection === 'connected';
  useEffect(() => {
    if (entryRequest) {
      setEntryAutoApply(true);
      setAction('choose');
      setLocalError('');
      setNotice('');
    }
  }, [entryRequest]);
  const self = room?.members?.find((member) => member.id === sync.memberId);
  const pendingApproval = room?.pendingApproval === true || self?.approved === false;
  const activeRoom = Boolean(room && !room.closed && (self || pendingApproval));
  const isHost = activeRoom && sync.localIsHost === true && room.hostId === sync.memberId;
  const busy = sync.initializing || sync.busy || reading || applying || sync.connection === 'connecting';
  useEffect(() => {
    onRoomStatusChange?.({ active: activeRoom, busy });
  }, [activeRoom, busy, onRoomStatusChange]);
  useEffect(() => {
    if (!connected || !isHost) setRemoveTarget(null);
  }, [connected, isHost]);
  const wasInRoom = useRef(false);
  useEffect(() => {
    if (visible && wasInRoom.current && !activeRoom) onBack();
    wasInRoom.current = activeRoom;
  }, [activeRoom, visible, onBack]);
  const allReady = activeRoom && !pendingApproval && room.members.every(isRoomPlayerReady);
  const preferences = room?.drawMode === 'custom' ? room.preferences : {};
  const canDraw = connected && isHost && room.lobbySynced && allReady && !busy;
  const result = connected && activeRoom && room.lobbySynced && self?.approved && !room.result?.archived ? room.result : null;
  const resultId = result?.id;
  useEffect(() => {
    if (!resultId || seenResultId.current === resultId) return;
    seenResultId.current = resultId;
    if (visible) setRevealId(resultId);
  }, [resultId, visible]);
  useEffect(() => {
    if (!visible || !resultId) setRevealId(null);
  }, [visible, resultId]);
  const ownName = self?.name;
  const { settings: discordSettings, syncDraw } = discordSync;
  const currentDiscordSettings = useRef(discordSettings);
  useEffect(() => { currentDiscordSettings.current = discordSettings; }, [discordSettings]);
  useEffect(() => {
    const draw = pendingDraw.current;
    if (!isHost || !result || draw?.id !== result.id) return;
    pendingDraw.current = null;
    void onRecordDraw(result.results);
    if (!draw.discord.enabled || !getActiveDiscordDestination(draw.discord)) return;
    deliveryQueue.current = deliveryQueue.current.then(async () => {
      if (draw.discord !== currentDiscordSettings.current) {
        notify('Discord 設定已變更，可複製結果手動分享。', { id: 'room-discord-skipped', type: 'warning' });
        return;
      }
      await syncDraw(result.results, { allowRetry: false });
    }).catch(() => notify('Discord 傳送未完成，可複製結果手動分享。', { id: 'discord-delivery', type: 'error' }));
  }, [isHost, result, syncDraw, onRecordDraw]);
  useEffect(() => {
    if (!result || sync.authorizedResultId !== result.id || !ownName || autoAttempt.current === result.id || applying) return;
    autoAttempt.current = result.id;
    setApplying(true);
    void window.lolDesktop.applyRoles(result.results, ownName, result.id).then(reply => {
      if (!reply.ok) throw new Error(reply.message || '無法套用分路');
      dismissNotice('apply-roles');
    }).catch(error => {
      notify(`${error.message || '無法套用分路'}。請在 LoL 手動確認分路。`, { id: 'apply-roles', type: 'error' });
    }).finally(() => setApplying(false));
  }, [result, ownName, applying, sync.authorizedResultId]);
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
      const joined = await sync.connect({ ...options, autoApply: entryAutoApply, name: lobby.name });
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
        if (await sync.connect({ url: endpoint, action: 'join', roomId, teamKey, autoApply: entryAutoApply, name: lobby.name })) return;
        setNotice('房間狀態已變更，請改用邀請加入。');
      } else if (reply.ok) {
        setNotice(reply.match.status === 'ambiguous'
          ? '目前隊伍有多個房間，請貼上房主的邀請。'
          : '找不到目前隊伍的房間，請確認房主已開房，或改用邀請。');
      } else setNotice(reply.message);
      setAction('join');
    });
  };
  const copyInvitation = async () => {
    try {
      const invitationText = formatRoomInvitation({ url: sync.serviceUrl || url, roomId: room.roomId });
      await navigator.clipboard.writeText(invitationText);
      dismissNotice('copy-room-invitation');
    } catch {
      notify('無法複製邀請，可將房碼提供給使用同一服務的朋友。', { id: 'copy-room-invitation', type: 'error' });
      return false;
    }
  };
  const command = async (value) => {
    setLocalError(''); setNotice('');
    await sync.command(value);
  };
  const saveSettings = values => sync.command({
    type: 'draw-settings', drawMode: Object.keys(values).length ? 'custom' : 'random',
    preferences: values, revision: room.revision
  });
  const matchesLobby = (names) => names.length === room.members.length && room.members.every(member => names.includes(member.name));
  const leave = async () => {
    setLocalError(''); setNotice('');
    if (connected && !await sync.command({ type: 'leave' })) return;
    await sync.disconnect();
    onBack();
  };
  const leaveLabel = isHost ? connected ? '關閉房間' : '離開本機連線' : '退出房間';
  const updateLobby = (draw) => {
    void withLobby(async (lobby) => {
      if (lobby.name !== ownName) throw new Error('目前登入的 Riot ID 與房主帳號不同');
      const matches = matchesLobby(lobby.names);
      if (!matches || !room.lobbySynced) {
        if (await sync.command({ type: 'sync-lobby', names: lobby.names })) {
          setNotice('LoL 大廳名單已更新，請確認後再抽籤。');
        }
        return;
      }
      if (!draw) { setNotice('已讀取 LoL 大廳名單'); return; }
      if (room.drawMode === 'client') {
        if (await saveSettings({})) setNotice('已清除舊房間的 LoL 偏好，請確認後再抽籤。');
        return;
      }
      const resultId = `${room.roomId}:${room.resultVersion + 1}`;
      pendingDraw.current = { id: resultId, discord: discordSettings };
      if (!await sync.command({ type: 'draw', revision: room.revision, consentContext: sync.consentContext }) && pendingDraw.current?.id === resultId) {
        pendingDraw.current = null;
      }
    });
  };

  if (!visible) return null;
  const labels = createPlayerLabels((room?.members ?? []).map(member => member.name));
  const roomSummary = activeRoom && <div className="sync-room-summary">
    <span className="sync-room-identity">
      {connected ? <span className="sync-connection-dot" role="img" aria-label="房間已連線" title="房間已連線" />
        : <span role="status">{connectionLabels[sync.connection]}</span>}
      房碼 {isHost
        ? <CopyResultButton className="sync-room-code sync-copy-invitation" label={`複製邀請（房碼 ${room.roomId}）`}
            copiedLabel="已複製房間邀請" resetKey={room.roomId} onCopy={copyInvitation}><strong>{room.roomId}</strong></CopyResultButton>
        : <strong className="sync-room-code">{room.roomId}</strong>}
    </span>
    <ToggleSwitch enabled={sync.autoApply !== false} disabled={sync.busy || !sync.localSession} label="自動套用我的分路" caption="自動套用我的分路"
      onToggle={() => command({ type: 'auto-apply', enabled: !sync.autoApply, localSession: sync.localSession })} />

  </div>;
  const onlineCount = room?.members?.filter(member => member.approved && !member.manual && member.connected).length;
  const offline = activeRoom && !pendingApproval ? room.members.filter(member => !member.manual && !member.connected) : [];
  const waitingNames = members => members.map(member => labels[member.name]).join('、');
  const pendingByName = new Map((room?.pendingMembers ?? []).map(request => [request.name.toLowerCase(), request]));
  const unmatchedRequests = [...pendingByName.values()].filter(request =>
    !room.members?.some(member => member.name.toLowerCase() === request.name.toLowerCase()));
  const waitingReason = !connected ? '恢復連線後才能操作。'
    : !room?.lobbySynced ? '等待主持人讀取 LoL 大廳。'
      : offline.length ? `等待重新連線：${waitingNames(offline)}` : '';
  const roomHeader = activeRoom && <header className="draw-heading sync-room-toolbar">
    <div className="sync-room-heading-details">
      <h1 id="sync-room-title" className="draw-screen-title">{result ? '本次抽籤結果' : '多人抽分路'}</h1>
      {roomSummary}
      {!isHost && (!connected || pendingApproval || !room.lobbySynced) &&
        <p className="sync-guest-status" role="status">{!connected ? waitingReason : pendingApproval ? '等待主持人核准加入' : waitingReason}</p>
      }
    </div>
  </header>;
  const renderMemberStatus = (member) => {
    if (member.manual || !connected) return null;
    const host = member.id === room.hostId;
    const label = member.connected ? (host ? '主持人在線' : 'App 在線') : (host ? '主持人離線' : 'App 離線');
    return <span className={`sync-member-state${member.connected ? ' is-online' : ''}`} title={label}>
      <UiIcon name="monitor" />{label}
    </span>;
  };
  const copyResults = async () => {
    setLocalError(''); setNotice('');
    try { await navigator.clipboard.writeText(formatCopyText(room.result.results)); return true; }
    catch { setLocalError('無法複製，請手動選取文字複製'); return false; }
  };
  const renderMemberRolePicker = member => <CardRolePicker player={member} players={room.members} labels={labels} preferences={preferences}
    disabled={busy || !connected || !room.lobbySynced} onOpen={markRolePickerUsed}
    onChange={role => {
      setLocalError('');
      setNotice('');
      const values = { ...preferences };
      if (role) values[member.name] = role;
      else delete values[member.name];
      return saveSettings(values);
    }}
  />;
  const renderRequestActions = member => {
    return <div className="sync-member-actions">
      <button className="btn btn-primary" type="button" disabled={busy || !connected || !member.connected} onClick={() => command({ type: 'approve', memberId: member.id })} aria-label={`核准 ${member.name}`}>核准</button>
      <button className="btn btn-secondary" type="button" disabled={busy || !connected} onClick={() => command({ type: 'remove', memberId: member.id })} aria-label={`拒絕加入 ${member.name}`}>拒絕</button>
    </div>;
  };
  const removeMember = connected && isHost && removeTarget?.session === sync.localSession &&
    room.members.find(member => member.id === removeTarget?.id && member.approved && !member.manual && member.id !== self.id);
  const renderMemberCorner = (member, isSelf) => (
    <span className="sync-card-corner">
      {isSelf ? <span className="self-badge">你</span> : isHost && member.approved && !member.manual &&
        <button className="btn icon-action sync-remove-player" type="button"
          title={`將 ${member.name} 移出房間`} aria-label={`移除 ${member.name}`} disabled={busy || !connected}
          onClick={() => setRemoveTarget({ id: member.id, session: sync.localSession })}><UiIcon name="close" /></button>}
    </span>
  );
  if (!activeRoom) return <ModalFrame open={visible} onClose={() => { if (!busy) onBack(); }} labelId="sync-room-title">
    <div className="sync-connect-dialog" aria-busy={busy}>
      <header className="sync-connect-dialog-header">
        <h2 id="sync-room-title">{action === 'choose' ? '多人房間' : action === 'create' ? '建立房間' : '加入房間'}</h2>
        <button className="toolbar-icon" type="button" aria-label="關閉" disabled={busy} onClick={onBack}><UiIcon name="close" /></button>
      </header>
      {(localError || sync.error) && <p className="sync-room-error" role="alert">{localError || sync.error}</p>}
      {notice && <p className="sync-room-notice" role="status">{notice}</p>}
      {!sync.available ? <p>多人同步房間僅提供 Windows App 使用，請更新 App 後再試。</p> : action === 'choose'
      ? <div className="sync-dialog-actions">
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setAction('create')}>建立房間</button>
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setAction('join')}>加入房間</button>
      </div> : <form className="sync-connect-form" onSubmit={connect}>
      {room?.closed && <p className="sync-room-closed" role="status">房間已關閉，可以建立或加入另一個房間。</p>}
      {action === 'join' && <button className="btn btn-primary" type="button" disabled={busy || !url.trim()} onClick={joinCurrentTeam}>加入目前隊伍</button>}
      {action === 'join' && <label className="sync-field" htmlFor="sync-invitation">
        <span>邀請或房碼</span>
        <textarea id="sync-invitation" value={invitation} onChange={(event) => setInvitation(event.target.value)} placeholder="貼上房主傳給你的邀請或房碼" rows={3} maxLength={4096} autoComplete="off" spellCheck="false" disabled={busy} required />
      </label>}
      <ToggleSwitch enabled={entryAutoApply} disabled={busy} label="自動套用我的分路" caption="自動套用我的分路" onToggle={() => setEntryAutoApply(value => !value)} />
      <button className={`btn ${action === 'create' ? 'btn-primary' : 'btn-secondary'}`} type="submit" disabled={busy || (action === 'create' ? !url.trim() : !invitation.trim())}>{sync.initializing ? '正在讀取房間…' : busy ? '處理中…' : action === 'create' ? '建立房間' : '申請加入'}</button>
      {sync.connection === 'connecting' && <button className="btn btn-secondary" type="button" onClick={() => sync.disconnect()}>取消連線</button>}
      <details className="sync-service-settings" open={!sync.defaultServiceUrl && !sync.serviceUrl}>
        <summary>同步服務設定</summary>
        <label className="sync-field" htmlFor="sync-server-url"><span>同步服務位址</span><input id="sync-server-url" type="text" value={url} onChange={(event) => setUrl(event.target.value)} autoComplete="off" spellCheck="false" placeholder="wss://你的服務.workers.dev/rooms" maxLength={2048} disabled={busy} /><small>使用房碼加入時，請確認你和主持人使用同一服務。完整邀請已包含服務位址。</small></label>
      </details>
      <p className="sync-room-help">請使用信任的同步服務。服務會暫存房間成員名稱與抽籤結果。</p>
      <button className="text-button sync-entry-back" type="button" disabled={busy} onClick={() => { setLocalError(''); setNotice(''); setAction('choose'); }}>返回選擇</button>
    </form>}
    </div>
  </ModalFrame>;
  return <section className="sync-room-panel" aria-labelledby="sync-room-title" aria-busy={busy}>
    {(localError || sync.error) && <p className="sync-room-error" role="alert">{localError || sync.error}</p>}
    {notice && <p className="sync-room-notice" role="status">{notice}</p>}
    <section className="role-workspace draw-workspace sync-room-workspace">
      {roomHeader}
      {!pendingApproval && <div className="workspace-scroll">
        <div className="sync-room-card-toolbar">
          <div className="draw-roster-controls">
            <span className="sync-team-count" role="status">
              <UiIcon name="users" /><span>隊伍 <b>{room.members.length}</b> 人</span>
              <span aria-hidden="true">·</span>
              <span>App 在線 <b>{connected ? onlineCount : '—'}</b>{connected && ' 人'}</span>
            </span>
            {isHost && <LolRefreshButton disabled={busy || !connected} loading={reading} onRefresh={() => updateLobby(false)} />}
          </div>
          {isHost && connected && room.lobbySynced && !result && !usedRolePicker && <span className="sync-role-hint">點玩家卡片指定主位</span>}
        </div>
        {isHost && waitingReason && <p className="sync-room-waiting" role="status">{waitingReason}</p>}
        {isHost && unmatchedRequests.length > 0 && <section className="sync-room-waiting" aria-label="待核准申請">
          <ul>
            {unmatchedRequests.map(member => <li key={member.id}>
              <span>{member.name}{member.connected ? '' : '（離線）'}</span>
              {renderRequestActions(member)}
            </li>)}
          </ul>
        </section>}
        <RoleResultCards players={room.members} results={result?.results ?? []} preferences={preferences} assignedPreferences={result?.preferences}
          localPlayerId={self.id} busy={busy} revealId={revealId === resultId ? revealId : null}
          renderPlayerDetails={renderMemberStatus} renderPlayerCorner={renderMemberCorner}
          renderPlayerActions={member => {
            const request = pendingByName.get(member.name.toLowerCase());
            return <div className="sync-card-actions">{isHost && request && renderRequestActions(request)}</div>;
          }}
          renderRolePicker={isHost ? renderMemberRolePicker : undefined} />
      </div>}
      {(isHost || result) && <footer className="draw-screen-actions">
        {isHost && <div className="draw-footer-status sync-room-discord">
          <DrawDiscordControls discordSync={discordSync} disabled={busy} onManage={onManageWebhook} />
        </div>}
        {isHost && <button className="btn btn-primary primary-draw" type="button" disabled={!canDraw} onClick={() => updateLobby(true)}><UiIcon name="shuffle" />{result ? '重新抽籤' : '開始抽籤'}</button>}
        {result && <CopyResultButton onCopy={copyResults} resetKey={result.id} />}
      </footer>}
    </section>
    {removeMember && <ModalFrame open onClose={() => setRemoveTarget(null)} labelId="sync-remove-title">
      <div className="sync-connect-dialog">
        <header className="sync-connect-dialog-header"><h2 id="sync-remove-title">移出房間？</h2></header>
        <p className="sync-room-help">將 <strong>{removeMember.name}</strong> 移出 App 房間？對方仍會留在 LoL 大廳。</p>
        <div className="sync-dialog-actions">
          <button className="btn btn-secondary" type="button" onClick={() => setRemoveTarget(null)}>取消</button>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => {
            setRemoveTarget(null);
            void command({ type: 'remove', memberId: removeMember.id });
          }}>確認移出</button>
        </div>
      </div>
    </ModalFrame>}
    {leaveRequested && <ModalFrame open onClose={() => { if (!busy) onCancelLeave(); }} labelId="sync-leave-title">
      <div className="sync-connect-dialog">
        <header className="sync-connect-dialog-header"><h2 id="sync-leave-title">{leaveLabel}？</h2></header>
        <p className="sync-room-help">{isHost
          ? connected ? '關閉後，所有玩家都會離開房間。' : '目前無法通知同步服務關閉房間，只會中止本機連線。'
          : '退出後，要重新加入才能繼續參加多人抽籤。'}</p>
        <p className="sync-room-help">切換後會保留你的單人名單與結果。</p>
        {(localError || sync.error) && <p className="sync-room-error" role="alert">{localError || sync.error}</p>}
        <div className="sync-dialog-actions">
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={onCancelLeave}>取消</button>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={leave}>{leaveLabel}</button>
        </div>
      </div>
    </ModalFrame>}
  </section>;
}
