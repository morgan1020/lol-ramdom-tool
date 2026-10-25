import React, { useEffect, useMemo, useRef, useState } from 'react';
import championData from './data/champions.json';
import championPositionData from './data/champion-positions.json';
import { drawAssignments } from './domain/draw.js';
import { formatCopyText } from './domain/copyFormat.js';
import { getResultShortcutAction } from './domain/resultShortcuts.js';
import { applyDrawToStats, ensurePlayerStats, sortPlayerNames } from './domain/stats.js';
import { prepareRoster, matchesPreparedRoster, rosterKey } from './domain/rosterView.js';
import { getActiveDiscordDestination } from './domain/discordDestinations.js';
import { createClientRoster, describeClientPosition } from './domain/clientRoster.js';
import { displayPlayerName } from './domain/playerNames.js';
import { clearStats, loadStats, saveStats } from './storage/localStats.js';
import { loadTheme, saveTheme } from './storage/theme.js';
import { ChampionDrawPanel } from './components/ChampionDrawPanel.jsx';
import { ChampionPoolModal } from './components/ChampionPoolModal.jsx';
import { StatsModal } from './components/StatsModal.jsx';
import { ThemeToggle } from './components/ThemeToggle.jsx';
import { ToolbarIcon } from './components/ToolbarIcon.jsx';
import { ToastHost } from './components/ToastHost.jsx';
import { RoleWorkspace } from './components/RoleWorkspace.jsx';
import { RoleSetup } from './components/RoleSetup.jsx';
import { SettingsDialog } from './components/SettingsDialog.jsx';
import { useDiscordSync } from './hooks/useDiscordSync.js';
import { hasDesktopData, saveDesktopPreferences, importDesktopStats } from './storage/desktopData.js';
import { importStats, parseStatsBackup } from './domain/statsBackup.js';
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
  const [theme, setTheme] = useState(getInitialTheme);
  const [toolMode, setToolMode] = useState('roles');
  const [source, setSource] = useState(isDesktop ? 'client' : 'manual');
  const [phase, setPhase] = useState('setup');
  const [prepared, setPrepared] = useState(null);
  const [manualPlayers, setManualPlayers] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [preferredRoles, setPreferredRoles] = useState({});
  const [drawMode, setDrawMode] = useState(initialData?.preferences.drawMode || 'random');
  const [snapshot, setSnapshot] = useState(null);
  const [completedAt, setCompletedAt] = useState(null);
  const [stats, setStats] = useState(loadStats);
  const statsRef = useRef(stats);
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
  const [error, setError] = useState('');
  const [applyStatus, setApplyStatus] = useState({ state: 'idle', message: '' });
  const [autoApplyRoles, setAutoApplyRoles] = useState(() => {
    if (initialData) return initialData.preferences.autoApplyRoles;
    try { return window.localStorage.getItem('lolAutoApplyRoles') === 'true'; }
    catch { return false; }
  });
  const [toasts, setToasts] = useState([]);
  const operationInProgress = useRef(false);
  const discordSync = useDiscordSync();
  const busy = operationBusy || discordSync.pending || preferencesBusy || discordSync.status.state === 'sending';

  const players = source === 'client' ? clientLobby?.players || [] : manualPlayers.map((name) => ({ name }));
  const names = players.map((player) => player.name);
  const visiblePlayers = phase === 'draw' && prepared ? prepared.players : players;
  const results = snapshot?.source === source && snapshot.key === rosterKey(visiblePlayers.map((player) => player.name)) ? snapshot.results : [];
  const hasResults = results.length > 0;
  const knownNames = useMemo(() => sortPlayerNames(stats), [stats]);

  const toast = (message) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 2500);
  };
  const updateStats = async (next) => {
    const saved = await saveStats(next);
    statsRef.current = saved || next;
    setStats(saved || next);
  };
  const clearResult = () => {
    setSnapshot(null); setCompletedAt(null); setError('');
    setApplyStatus({ state: 'idle', message: '' });
  };
  const fetchClientLobby = async () => {
    const reply = await window.lolDesktop.readLobby();
    if (!reply.ok) throw new Error(reply.message || '讀取客戶端失敗，請重試');
    setClientLobby(reply.lobby);
    return reply.lobby;
  };
  const refreshClient = async () => {
    if (!isDesktop || operationInProgress.current) return;
    operationInProgress.current = true;
    setBusy(true); setClientLoading(true); setError('');
    try {
      const lobby = await fetchClientLobby();
      if (snapshot?.source === 'client' && snapshot.key !== rosterKey(lobby.players.map((player) => player.name))) clearResult();
    } catch (refreshError) {
      setClientLobby(null);
      setApplyStatus({ state: 'idle', message: '' });
      setError(refreshError.message || '讀取客戶端失敗，請重試');
    } finally {
      operationInProgress.current = false;
      setBusy(false); setClientLoading(false);
    }
  };
  useEffect(() => { if (isDesktop) void refreshClient(); }, [isDesktop]);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  const toggleTheme = async () => {
    if (preferencesInProgress.current) return;
    preferencesInProgress.current = true; setPreferencesBusy(true);
    try { const next = theme === 'light' ? 'dark' : 'light'; await saveTheme(next); setTheme(next); }
    catch (saveError) { toast(saveError.message || '無法儲存主題設定'); }
    finally { preferencesInProgress.current = false; setPreferencesBusy(false); }
  };

  const changeSource = (next) => {
    if (operationInProgress.current || next === source) return;
    setSource(next); clearResult();
    if (drawMode === 'client' && next === 'manual') setDrawMode('random');
    if (next === 'client') void refreshClient();
  };
  const changeDrawMode = async (next) => {
    if (busy || operationInProgress.current || preferencesInProgress.current) return;
    preferencesInProgress.current = true; setPreferencesBusy(true);
    try {
      if (hasDesktopData()) await saveDesktopPreferences({ drawMode: next });
      if (next === 'custom' && drawMode === 'client' && clientLobby?.players.length) {
        setPreferredRoles((current) => ({ ...current, ...createClientRoster(clientLobby, true).preferences }));
      }
      setDrawMode(next); clearResult();
    } catch (saveError) { toast(saveError.message || '無法儲存抽籤偏好'); }
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
  const addPlayer = async (rawName = inputValue) => {
    if (busy || operationInProgress.current) return;
    const name = rawName.trim();
    if (!name) return;
    if (manualPlayers.includes(name)) return toast('玩家已存在');
    if (manualPlayers.length >= 5) return toast('已達 5 人上限');
    operationInProgress.current = true; setBusy(true);
    try {
      await updateStats(ensurePlayerStats(statsRef.current, name));
      setManualPlayers((current) => [...current, name]); setInputValue(''); clearResult();
    } catch (saveError) { toast(saveError.message || '無法儲存玩家資料'); }
    finally { operationInProgress.current = false; setBusy(false); }
  };
  const removePlayer = (name) => {
    if (busy || operationInProgress.current) return;
    setManualPlayers((current) => current.filter((player) => player !== name));
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
    } catch (saveError) { toast(saveError.message || '無法儲存客戶端設定'); }
    finally { preferencesInProgress.current = false; setPreferencesBusy(false); }
  };
  const finishSetup = () => {
    if (busy || operationInProgress.current) return;
    try {
      const roster = prepareRoster({ source, lobby: clientLobby, manualPlayers, drawMode, preferredRoles });
      if (discordSync.settings.enabled && !getActiveDiscordDestination(discordSync.settings)) throw new Error('請選擇 Discord 傳送位置，或關閉同步');
      setPrepared({ ...roster, players: players.map((player) => ({ ...player })) });
      setError(''); setPhase('draw');
      window.scrollTo(0, 0);
    } catch (setupError) { setError(setupError.message || '請確認玩家與抽籤設定'); }
  };
  const returnToSetup = () => {
    if (busy || operationInProgress.current) return;
    setPhase('setup'); window.scrollTo(0, 0);
  };
  const handleDraw = async () => {
    if (phase !== 'draw' || !prepared || busy || operationInProgress.current) return;
    operationInProgress.current = true;
    setBusy(true); setError(''); setApplyStatus({ state: 'idle', message: '' });
    try {
      let lobby = clientLobby;
      if (source === 'client') {
        setClientLoading(true);
        try { lobby = await fetchClientLobby(); }
        catch (readError) { setClientLobby(null); throw readError; }
        finally { setClientLoading(false); }
      }
      const roster = prepareRoster({ source, lobby, manualPlayers, drawMode, preferredRoles });
      if (!matchesPreparedRoster(prepared, roster)) {
        setPhase('setup');
        throw new Error('隊伍或主位偏好已變動，請重新確認設定後再抽籤');
      }
      const drawn = drawAssignments(roster.names, roster.preferences);
      await new Promise((resolve) => window.setTimeout(resolve, 320));
      await updateStats(applyDrawToStats(statsRef.current, drawn));
      setSnapshot({ source, key: rosterKey(roster.names), results: drawn }); setCompletedAt(new Date());
      void discordSync.syncDraw(drawn);
      if (isDesktop && source === 'client' && autoApplyRoles) {
        setApplyStatus({ state: 'applying', message: '正在更新我的 LoL 分路…' });
        try {
          const reply = await window.lolDesktop.applyRoles(drawn);
          if (!reply.ok) throw new Error(reply.message);
          const applied = reply.applied;
          setClientLobby((current) => current ? {
            ...current, fetchedAt: applied.fetchedAt,
            players: current.players.map((player) => player.name === applied.name ? { ...player, firstPosition: applied.firstPosition, secondPosition: applied.secondPosition } : player)
          } : current);
          setApplyStatus({ state: 'success', message: `我的分路已更新 · ${displayPlayerName(applied.name)}　${describeClientPosition(applied.firstPosition)}／${describeClientPosition(applied.secondPosition)}` });
        } catch (applyError) {
          setApplyStatus({ state: 'error', message: `抽籤結果已保留。${applyError.message || '套用結果無法確認，請查看客戶端'}` });
        }
      }
    } catch (drawError) {
      setError(drawError.message || '抽籤失敗，請重試');
    } finally {
      operationInProgress.current = false;
      setBusy(false); setClientLoading(false);
    }
  };
  const handleCopy = async () => {
    if (!hasResults || operationInProgress.current) return;
    try { await navigator.clipboard.writeText(formatCopyText(results)); toast('抽籤結果已複製'); }
    catch { toast('無法複製到剪貼簿'); }
  };
  const handleImportStats = async (text, mode) => {
    if (busy || operationInProgress.current) throw new Error('正在處理抽籤或設定，請稍候');
    operationInProgress.current = true; setBusy(true);
    try {
      if (hasDesktopData()) {
        const next = await importDesktopStats(text, mode);
        statsRef.current = next; setStats(next);
      } else await updateStats(importStats(statsRef.current, parseStatsBackup(text), mode));
    } finally { operationInProgress.current = false; setBusy(false); }
  };
  const handleClearStats = async () => {
    if (busy || operationInProgress.current || !window.confirm('清空紀錄？')) return;
    operationInProgress.current = true; setBusy(true);
    try { await clearStats(); statsRef.current = {}; setStats({}); setStatsOpen(false); toast('統計紀錄已清空'); }
    catch (saveError) { toast(saveError.message || '無法清空統計'); }
    finally { operationInProgress.current = false; setBusy(false); }
  };
  useEffect(() => {
    const onKeyDown = (event) => {
      const interactive = event.target instanceof Element && Boolean(event.target.closest('button, input, select, textarea, summary, [contenteditable="true"]'));
      if (interactive || operationInProgress.current) return;
      const action = getResultShortcutAction({ key: event.key, step: phase === 'draw' && hasResults ? 'result' : 'roster', isStatsOpen: statsOpen || settingsOpen || championPoolOpen || toolMode !== 'roles' || busy, isDrawing: busy, hasModifier: event.ctrlKey || event.metaKey || event.altKey || event.shiftKey, isInteractiveTarget: interactive });
      if (!action || event.repeat) return;
      event.preventDefault();
      if (action === 'roster') returnToSetup();
      if (action === 'preferences') { returnToSetup(); void changeDrawMode('custom'); }
      if (action === 'copy') void handleCopy();
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
    setToolMode(next); setStatsOpen(false); setChampionPoolOpen(false);
  };
  const drawingView = toolMode === 'roles' && phase === 'draw';
  useEffect(() => {
    document.querySelector('.workspace-scroll')?.scrollTo(0, 0);
  }, [phase, toolMode]);
  return <div className={`app compact-app refined-app${drawingView ? ' is-draw-view' : ''}`}>
    <main className="container">
    <header className="compact-header">
      <div className="app-brand"><img src="/favicon-dice.png" alt="" /><span>英雄聯盟抽籤</span></div>
      <div className="compact-header-actions">
        <button className="toolbar-button" type="button" disabled={busy} onClick={() => toolMode === 'roles' ? setStatsOpen(true) : setChampionPoolOpen(true)} aria-label={toolMode === 'roles' ? '歷史統計' : '英雄池一覽'} title={toolMode === 'roles' ? '歷史統計' : '英雄池一覽'}><ToolbarIcon name={toolMode === 'roles' ? 'stats' : 'pool'} /></button>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <button className="toolbar-icon" type="button" aria-label="設定" title="設定" disabled={busy} onClick={() => openSettings('data')}><ToolbarIcon name="settings" /></button>
      </div>
    </header>
    {!drawingView && <div className="compact-navigation"><nav className="compact-tabs" role="tablist" aria-label="工具模式">{[['roles', '抽分路'], ['champions', '抽英雄']].map(([value, label]) => <button key={value} role="tab" type="button" disabled={busy} aria-selected={toolMode === value} onClick={() => changeToolMode(value)}>{label}</button>)}</nav></div>}
    <div className="tool-content">
    {toolMode === 'roles' ? phase === 'setup' ? <RoleSetup isDesktop={isDesktop} source={source} onSourceChange={changeSource} lobby={clientLobby} players={players} busy={busy} loading={clientLoading} error={error} drawMode={drawMode} onDrawModeChange={changeDrawMode} preferredRoles={preferredRoles} onPreferredRoleChange={changePreferredRole} autoApplyRoles={autoApplyRoles} onAutoApplyRolesChange={toggleAutoApplyRoles} onRefresh={refreshClient} onPrepare={finishSetup} onRemove={removePlayer} inputValue={inputValue} onInputChange={setInputValue} onAdd={() => addPlayer()} knownNames={knownNames} onToggleKnown={(name) => manualPlayers.includes(name) ? removePlayer(name) : addPlayer(name)} discordSync={discordSync} onManageWebhook={() => openSettings('discord')} /> : <RoleWorkspace lobby={{ localPlayerId: prepared?.localPlayerId }} players={visiblePlayers} results={results} busy={busy} loading={clientLoading} error={error} applyStatus={applyStatus} onReturn={returnToSetup} onDraw={handleDraw} onCopy={handleCopy} discordStatus={hasResults ? discordSync.status : { state: 'idle', message: '' }} onRetryDiscord={discordSync.retry} /> : <ChampionDrawPanel championData={championData} positionData={championPositionData} selectedPosition={championPosition} onPositionChange={setChampionPosition} />}
    </div>
    <footer className="compact-footer"><span>資料來源：<a href="https://developer.riotgames.com/docs/lol#data_dragon" target="_blank" rel="noreferrer">Riot Data Dragon</a> · <a href="https://www.communitydragon.org/" target="_blank" rel="noreferrer">CommunityDragon</a></span></footer>
  </main><SettingsDialog open={settingsOpen} tab={settingsTab} onTabChange={setSettingsTab} onClose={() => setSettingsOpen(false)} isDesktop={isDesktop} discordSync={discordSync} stats={stats} dataInfo={initialData?.info} dataNotice={initialData?.notice} onImportStats={handleImportStats} /><StatsModal open={statsOpen} stats={stats} onClose={() => setStatsOpen(false)} onClear={handleClearStats} /><ChampionPoolModal open={championPoolOpen} championData={championData} positionData={championPositionData} initialPosition={championPosition} onClose={() => setChampionPoolOpen(false)} /><ToastHost toasts={toasts} /></div>;
}
