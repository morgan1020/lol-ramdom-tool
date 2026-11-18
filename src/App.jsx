import React, { useEffect, useMemo, useRef, useState } from 'react';
import championData from './data/champions.json';
import championPositionData from './data/champion-positions.json';
import { drawAssignments } from './domain/draw.js';
import { formatCopyText } from './domain/copyFormat.js';
import { getResultShortcutAction } from './domain/resultShortcuts.js';
import { applyDrawToStats, ensurePlayerStats, groupStatsByPlayerName, sortPlayerNames } from './domain/stats.js';
import { rosterKey } from './domain/rosterView.js';

import { clearStats, loadStats, saveStats } from './storage/localStats.js';
import { loadTheme, saveTheme } from './storage/theme.js';
import { ChampionDrawPanel } from './components/ChampionDrawPanel.jsx';
import { ChampionPoolModal } from './components/ChampionPoolModal.jsx';
import { StatsModal } from './components/StatsModal.jsx';
import { ThemeToggle } from './components/ThemeToggle.jsx';
import { ToolbarIcon } from './components/ToolbarIcon.jsx';
import { navigateTabs } from './components/ModalFrame.jsx';
import { ToastHost } from './components/ToastHost.jsx';
import { RoleDraw } from './components/RoleSetup.jsx';
import { SyncRoomPanel } from './components/SyncRoomPanel.jsx';
import { SettingsDialog } from './components/SettingsDialog.jsx';
import { ProjectLinks } from './components/ProjectLinks.jsx';
import { useDiscordSync } from './hooks/useDiscordSync.js';
import { hasDesktopData, saveDesktopPreferences, importDesktopStats } from './storage/desktopData.js';
import { importStats, parseStatsBackup } from './domain/statsBackup.js';
import { notify as toast, dismissNotice, dismissNoticeGroup } from './notifications.js';
import './styles.css';
import './workspace.css';
import './flow.css';
import './refined.css';

function getInitialTheme() {
  try { return loadTheme(undefined); }
  catch { return 'light'; }
}

export default function App({ initialData }) {
  const isDesktop = typeof window.lolDesktop?.readLobby === 'function';
  const [appVersion, setAppVersion] = useState(null);
  useEffect(() => {
    let active = true;
    window.lolDesktop?.getVersion?.().then((version) => {
      if (active) setAppVersion(version);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const [theme, setTheme] = useState(getInitialTheme);
  const [toolMode, setToolMode] = useState('roles');
  const [roomStatus, setRoomStatus] = useState({ active: false, busy: false });
  const [roomEntry, setRoomEntry] = useState(null);
  const [leaveRequest, setLeaveRequest] = useState(false);
  const [players, setPlayers] = useState([]);
  const [preferredRoles, setPreferredRoles] = useState({});
  const [snapshot, setSnapshot] = useState(null);
  const [revealId, setRevealId] = useState(null);
  const drawSequence = useRef(0);
  const [stats, setStats] = useState(loadStats);
  const statsRef = useRef(stats);
  const statsQueue = useRef(Promise.resolve());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('data');
  const [statsOpen, setStatsOpen] = useState(false);
  const [championPosition, setChampionPosition] = useState('TOP');
  const [championPoolOpen, setChampionPoolOpen] = useState(false);
  const [clientLobby, setClientLobby] = useState(null);
  const [operationBusy, setBusy] = useState(false);
  const [preferencesBusy, setPreferencesBusy] = useState(false);
  const preferencesInProgress = useRef(false);
  const [clientLoading, setClientLoading] = useState(false);
  const latest = useRef({});
  const setError = message => message ? toast(message, { id: 'draw-error', type: 'error', group: 'draw', action: { label: '重試', onClick: () => latest.current.draw() } }) : dismissNotice('draw-error');
  const [autoApplyRoles, setAutoApplyRoles] = useState(() => {
    if (initialData) return initialData.preferences.autoApplyRoles;
    try { return window.localStorage.getItem('lolAutoApplyRoles') === 'true'; }
    catch { return false; }
  });
  const operationInProgress = useRef(false);
  const discordSync = useDiscordSync();
  const busy = operationBusy || discordSync.pending || preferencesBusy || discordSync.status.state === 'sending';

  const names = players.map(player => player.name);
  const ownPlayer = clientLobby?.players.find(player => player.id === clientLobby.localPlayerId);
  const localPlayerId = players.some(player => player.id && player.id === ownPlayer?.id && player.name === ownPlayer.name)
    ? ownPlayer.id : null;
  const matchesClientTeam = Boolean(localPlayerId && rosterKey(names) === rosterKey(clientLobby.players.map(player => player.name)));
  const results = snapshot?.results ?? [];
  const hasResults = results.length > 0;
  const roomBlocksClientDraw = matchesClientTeam && (roomStatus.active || roomStatus.busy);
  const drawBlockedMessage = roomBlocksClientDraw ? '多人房間仍在連線。使用 LoL 隊伍抽籤前，請先離開房間。' : '';
  const historyStats = useMemo(() => groupStatsByPlayerName(stats), [stats]);
  const knownNames = useMemo(() => sortPlayerNames(historyStats), [historyStats]);

  const enqueueStats = (operation) => {
    const pending = statsQueue.current.then(async () => {
      const next = await operation(statsRef.current);
      statsRef.current = next;
      setStats(next);
    });
    statsQueue.current = pending.catch(() => {});
    return pending;
  };
  const updateStats = (calculate) => {
    return enqueueStats(async (current) => {
      const next = calculate(current);
      return await saveStats(next) || next;
    });
  };
  const recordRoomDraw = async (drawn) => {
    try { await updateStats(current => applyDrawToStats(current, drawn)); }
    catch (error) { toast(error.message || '無法儲存房間抽籤紀錄', { type: 'error', id: 'room-history' }); }
  };
  const clearResult = () => {
    dismissNoticeGroup('apply');
    setSnapshot(null);
    setRevealId(null); setError('');
  };
  const fetchClientLobby = async () => {
    const reply = await window.lolDesktop.readLobby();
    if (!reply.ok) throw new Error(reply.message || '讀取客戶端失敗，請重試');
    return reply.lobby;
  };
  const importClientTeam = async () => {
    if (!isDesktop || busy || operationInProgress.current) return;
    operationInProgress.current = true;
    setBusy(true); setClientLoading(true);
    try {
      const lobby = await fetchClientLobby();
      setClientLobby(lobby);
      const incoming = new Map(lobby.players.map(player => [player.name, player]));
      const existing = new Set(names);
      const newPlayers = lobby.players.filter(player => !existing.has(player.name));
      const slots = 5 - players.length;
      setPlayers([...players.map(player => incoming.get(player.name) ?? player), ...newPlayers.slice(0, slots)]);
      if (newPlayers.length && slots) clearResult();
      if (newPlayers.length > slots) toast('名單最多 5 人，請移除不需要的玩家後再讀取。', { id: 'lobby-read', type: 'warning' });
      else dismissNotice('lobby-read');
    } catch (error) {
      toast(error.message || '讀取客戶端失敗，請重試', { id: 'lobby-read', type: 'error' });
    } finally {
      operationInProgress.current = false;
      setBusy(false); setClientLoading(false);
    }
  };
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  const toggleTheme = async () => {
    if (preferencesInProgress.current) return;
    preferencesInProgress.current = true; setPreferencesBusy(true);
    try { const next = theme === 'light' ? 'dark' : 'light'; await saveTheme(next); setTheme(next); }
    catch (saveError) { toast(saveError.message || '無法儲存主題設定', { type: 'error' }); }
    finally { preferencesInProgress.current = false; setPreferencesBusy(false); }
  };

  const changePreferredRole = (name, role) => {
    if (operationInProgress.current) return;
    setPreferredRoles((current) => {
      const next = { ...current };
      if (role) next[name] = role; else delete next[name];
      return next;
    });
    clearResult();
  };
  const addPlayer = async rawName => {
    if (busy || operationInProgress.current) return;
    const name = rawName.trim();
    if (!name) return false;
    if (names.includes(name)) { toast('玩家已存在', { type: 'warning' }); return false; }
    if (players.length >= 5) return false;
    operationInProgress.current = true; setBusy(true);
    try {
      await updateStats(current => ensurePlayerStats(current, name));
      setPlayers(current => [...current, { name }]); clearResult();
      return true;
    } catch (saveError) { toast(saveError.message || '無法儲存玩家資料', { type: 'error' }); return false; }
    finally { operationInProgress.current = false; setBusy(false); }
  };
  const removePlayer = (name) => {
    if (busy || operationInProgress.current) return;
    setPlayers(current => current.filter(player => player.name !== name));
    setPreferredRoles((current) => { const next = { ...current }; delete next[name]; return next; });
    clearResult();
  };
  const toggleAutoApplyRoles = async (enabled) => {
    if (busy || operationInProgress.current || preferencesInProgress.current) return;
    preferencesInProgress.current = true; setPreferencesBusy(true);
    try {
      if (hasDesktopData()) await saveDesktopPreferences({ autoApplyRoles: enabled });
      else window.localStorage.setItem('lolAutoApplyRoles', String(enabled));
      setAutoApplyRoles(enabled);
    } catch (saveError) { toast(saveError.message || '無法儲存客戶端設定', { type: 'error' }); }
    finally { preferencesInProgress.current = false; setPreferencesBusy(false); }
  };
  const applyRoles = async (drawn, expectedName) => {
    try {
      const reply = await window.lolDesktop.applyRoles(drawn, expectedName);
      if (!reply.ok) throw new Error(reply.message || '無法套用分路');
      const applied = reply.applied;
      setClientLobby(current => current ? { ...current, fetchedAt: applied.fetchedAt, players: current.players.map(player => player.name === applied.name ? { ...player, firstPosition: applied.firstPosition, secondPosition: applied.secondPosition } : player) } : current);
      toast('分路已套用', { id: 'apply-roles', group: 'apply' });
    } catch (failure) {
      toast(`抽籤結果已保留。${failure.message || '無法套用分路'}`, { id: 'apply-roles', group: 'apply', type: 'error', action: { label: '重新套用', onClick: async () => {
        if (operationInProgress.current || latest.current.busy) return false;
        if (latest.current.results !== drawn || !latest.current.canApply) return false;
        operationInProgress.current = true; setBusy(true);
        try { return await applyRoles(drawn, expectedName); } finally { operationInProgress.current = false; setBusy(false); }
      } } });
      return false;
    }
  };
  const handleDraw = async () => {
    if (busy || operationInProgress.current || roomBlocksClientDraw || !players.length || toolMode !== 'roles') return;
    operationInProgress.current = true;
    setBusy(true); setError('');
    try {
      const shouldApply = autoApplyRoles && matchesClientTeam;
      if (shouldApply) {
        const lobby = await fetchClientLobby();
        const currentPlayer = lobby.players.find(player => player.id === lobby.localPlayerId);
        if (currentPlayer?.id !== ownPlayer.id || currentPlayer?.name !== ownPlayer.name
          || rosterKey(lobby.players.map(player => player.name)) !== rosterKey(names)) {
          throw new Error('LoL 隊伍或登入帳號已變更，請重新讀取 LoL 隊伍並確認名單後再抽籤。');
        }
      }
      const drawn = drawAssignments(names, preferredRoles);
      await updateStats(current => applyDrawToStats(current, drawn));
      setSnapshot({ results: drawn, preferences: { ...preferredRoles } });
      setRevealId(++drawSequence.current);
      void discordSync.syncDraw(drawn);
      if (shouldApply) await applyRoles(drawn, ownPlayer.name);
    } catch (drawError) {
      setError(drawError.message || '抽籤失敗，請重試');
      return false;
    } finally {
      operationInProgress.current = false;
      setBusy(false); setClientLoading(false);
    }
  };
  const handleCopy = async () => {
    const copyable = results;
    if (!copyable.length || operationInProgress.current) return false;
    try { await navigator.clipboard.writeText(formatCopyText(copyable)); return true; }
    catch { toast('無法複製到剪貼簿', { type: 'error', id: 'copy-results', action: { label: '重試', onClick: () => document.querySelector('.solo-draw-workspace .copy-results')?.click() } }); return false; }
  };
  const handleImportStats = async (text, mode) => {
    if (busy || operationInProgress.current) throw new Error('正在處理抽籤或設定，請稍候');
    operationInProgress.current = true; setBusy(true);
    try {
      if (hasDesktopData()) {
        await enqueueStats(() => importDesktopStats(text, mode));
      } else await updateStats(current => importStats(current, parseStatsBackup(text), mode));
    } finally { operationInProgress.current = false; setBusy(false); }
  };
  const handleClearStats = async () => {
    if (busy || operationInProgress.current || !window.confirm('清空紀錄？')) return;
    operationInProgress.current = true; setBusy(true);
    try { await enqueueStats(async () => { await clearStats(); return {}; }); setStatsOpen(false); toast('統計紀錄已清空'); }
    catch (saveError) { toast(saveError.message || '無法清空統計', { type: 'error' }); }
    finally { operationInProgress.current = false; setBusy(false); }
  };
  useEffect(() => {
    const onKeyDown = (event) => {
      const interactive = event.target instanceof Element && Boolean(event.target.closest('button, input, select, textarea, summary, [contenteditable="true"]'));
      if (interactive || operationInProgress.current) return;
      const action = getResultShortcutAction({ key: event.key, step: hasResults ? 'result' : 'roster', isStatsOpen: statsOpen || settingsOpen || championPoolOpen || toolMode !== 'roles' || busy, isDrawing: busy || roomBlocksClientDraw, hasModifier: event.ctrlKey || event.metaKey || event.altKey || event.shiftKey, isInteractiveTarget: interactive });
      if (!action || event.repeat) return;
      event.preventDefault();
      if (action === 'roster') document.querySelector('.solo-draw-workspace .solo-add-trigger, .solo-draw-workspace .solo-remove-player')?.focus();
      if (action === 'preferences') {
        const picker = document.querySelector('.solo-draw-workspace .sync-role-picker button');
        picker?.focus();
        picker?.click();
      }
      if (action === 'copy') document.querySelector('.solo-draw-workspace .copy-results')?.click();
      if (action === 'draw') void handleDraw();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });
  const openSettings = (tab = 'data') => {
    if (busy || operationInProgress.current) return;
    setSettingsTab(tab); setSettingsOpen(true);
  };
  const changeToolMode = (next) => {
    if (busy || operationInProgress.current) return;
    if (next !== toolMode) setRevealId(null);
    setToolMode(next); setStatsOpen(false); setChampionPoolOpen(false);
  };
  const openRoom = () => {
    if (busy || operationInProgress.current) return;
    if (!roomStatus.active) setRoomEntry({});
    changeToolMode('room');
  };
  const roomModeSwitch = isDesktop && toolMode !== 'champions' && <div className="compact-tabs room-mode-switch" role="group" aria-label="分路抽籤模式">
    <button type="button" aria-pressed={!roomStatus.active} disabled={busy || roomStatus.busy}
      onClick={() => { if (roomStatus.active) setLeaveRequest(true); }}>單人</button>
    <button id="open-sync-room" type="button" aria-pressed={roomStatus.active} disabled={busy || roomStatus.busy}
      onClick={() => { if (!roomStatus.active) openRoom(); }}>多人房間</button>
  </div>;
  latest.current = { busy, results, canApply: matchesClientTeam && !roomBlocksClientDraw, draw: handleDraw };
  useEffect(() => {
    document.querySelector('.workspace-scroll')?.scrollTo(0, 0);
  }, [toolMode]);
  const showSolo = toolMode === 'roles' || (toolMode === 'room' && !roomStatus.active);
  const drawingView = toolMode !== 'champions';
  return <div className={`app compact-app refined-app${drawingView ? ' is-draw-view' : ''}`}>
    <main className="container">
    <header className="compact-header">
      <div className="app-brand"><img src="/favicon-dice.png" alt="" /><span>英雄聯盟抽籤</span></div>
      <div className="compact-header-actions">
        <button className="toolbar-button" type="button" disabled={busy} onClick={() => toolMode !== 'champions' ? setStatsOpen(true) : setChampionPoolOpen(true)} aria-label={toolMode !== 'champions' ? '歷史統計' : '英雄池一覽'} title={toolMode !== 'champions' ? '歷史統計' : '英雄池一覽'}><ToolbarIcon name={toolMode !== 'champions' ? 'stats' : 'pool'} /></button>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <button className="toolbar-icon" type="button" aria-label="設定" title="設定" disabled={busy} onClick={() => openSettings('data')}><ToolbarIcon name="settings" /></button>
      </div>
    </header>
    <div className="compact-navigation"><nav className="compact-tabs" role="tablist" aria-label="工具模式" onKeyDown={navigateTabs}>{[['roles', '抽分路'], ['champions', '抽英雄']].map(([value, label]) => <button key={value} id={`tool-tab-${value}`} role="tab" type="button" disabled={busy} aria-selected={(toolMode === 'room' ? 'roles' : toolMode) === value} tabIndex={(toolMode === 'room' ? 'roles' : toolMode) === value ? 0 : -1} onClick={() => changeToolMode(value === 'roles' && (roomStatus.active || toolMode === 'room') ? 'room' : value)}>{label}</button>)}</nav>{roomModeSwitch}{!isDesktop && <ProjectLinks />}</div>
    <div className="tool-content">
      {isDesktop && <SyncRoomPanel
        visible={toolMode === 'room'} entryRequest={roomEntry} onRoomStatusChange={setRoomStatus}
        leaveRequested={leaveRequest} onCancelLeave={() => setLeaveRequest(false)}
        onBack={() => { setLeaveRequest(false); setRevealId(null); setToolMode(current => current === 'room' ? 'roles' : current); }} discordSync={discordSync}
        onManageWebhook={() => openSettings('discord')} onRecordDraw={recordRoomDraw}
      />}
      {showSolo && <RoleDraw
        isDesktop={isDesktop} localPlayerId={localPlayerId} players={players} busy={busy} loading={clientLoading}
        preferredRoles={preferredRoles} onPreferredRoleChange={changePreferredRole}
        autoApplyRoles={autoApplyRoles} onAutoApplyRolesChange={toggleAutoApplyRoles}
        canApply={matchesClientTeam && !roomBlocksClientDraw} onImportTeam={importClientTeam} onRemove={removePlayer}
        onAdd={addPlayer} knownNames={knownNames}
        onToggleKnown={name => names.includes(name) ? removePlayer(name) : addPlayer(name)}
        discordSync={discordSync} onManageWebhook={() => openSettings('discord')}
        results={results} resultPreferences={snapshot?.preferences}
        revealId={revealId} drawBlockedMessage={drawBlockedMessage} onDraw={handleDraw} onCopy={handleCopy}
      />}
      {toolMode === 'champions' && <ChampionDrawPanel championData={championData} positionData={championPositionData}
        selectedPosition={championPosition} onPositionChange={setChampionPosition} />}
    </div>
    <footer className="compact-footer"><span>資料來源：<a href="https://developer.riotgames.com/docs/lol#data_dragon" target="_blank" rel="noreferrer">Riot Data Dragon</a> · <a href="https://www.communitydragon.org/" target="_blank" rel="noreferrer">CommunityDragon</a></span></footer>
  </main><SettingsDialog appVersion={appVersion} open={settingsOpen} tab={settingsTab} onTabChange={setSettingsTab} onClose={() => setSettingsOpen(false)} isDesktop={isDesktop} discordSync={discordSync} stats={stats} dataInfo={initialData?.info} dataNotice={initialData?.notice} onImportStats={handleImportStats} /><StatsModal open={statsOpen} stats={historyStats} onClose={() => setStatsOpen(false)} onClear={handleClearStats} /><ChampionPoolModal open={championPoolOpen} championData={championData} positionData={championPositionData} initialPosition={championPosition} onClose={() => setChampionPoolOpen(false)} /><ToastHost /></div>;
}
