import React, { useEffect, useMemo, useState } from 'react';
import championData from './data/champions.json';
import { drawAssignments } from './domain/draw.js';
import { formatCopyText } from './domain/copyFormat.js';
import { getResultShortcutAction } from './domain/resultShortcuts.js';
import { applyDrawToStats, ensurePlayerStats, sortPlayerNames } from './domain/stats.js';
import { clearStats, loadStats, saveStats } from './storage/localStats.js';
import { loadTheme, saveTheme } from './storage/theme.js';
import { KnownPlayers } from './components/KnownPlayers.jsx';
import { ChampionDrawPanel } from './components/ChampionDrawPanel.jsx';
import { PlayerCard } from './components/PlayerCard.jsx';
import { PlayerInput } from './components/PlayerInput.jsx';
import { StatsModal } from './components/StatsModal.jsx';
import { ThemeToggle } from './components/ThemeToggle.jsx';
import { ToastHost } from './components/ToastHost.jsx';
import './styles.css';

const steps = [
  { id: 'roster', label: '組隊', description: '選擇這次要一起玩的玩家' },
  { id: 'preferences', label: '偏好', description: '設定想玩的主位，也可以略過' },
  { id: 'result', label: '揭曉', description: '查看這次的分路結果' }
];

const toolModes = [
  { id: 'roles', label: '抽分路' },
  { id: 'champions', label: '抽英雄' }
];

function getInitialTheme() {
  const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return loadTheme(undefined, prefersDark);
}

function Stepper({ current }) {
  const currentIndex = steps.findIndex((item) => item.id === current);
  return <ol className="stepper" aria-label="抽籤流程">{steps.map((item, index) => <li key={item.id} className={index < currentIndex ? 'is-complete' : index === currentIndex ? 'is-active' : ''}><span>{index + 1}</span><strong>{item.label}</strong></li>)}</ol>;
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [toolMode, setToolMode] = useState('roles');
  const [step, setStep] = useState('roster');
  const [inputValue, setInputValue] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [preferredRoles, setPreferredRoles] = useState({});
  const [drawResults, setDrawResults] = useState({});
  const [stats, setStats] = useState(() => loadStats());
  const [isStatsOpen, setStatsOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [isDrawing, setDrawing] = useState(false);
  const [revealVersion, setRevealVersion] = useState(0);
  const [drawCompletedAt, setDrawCompletedAt] = useState(null);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); saveTheme(theme); }, [theme]);
  const toast = (message) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 2500);
  };
  const addPlayerName = (rawName) => {
    const name = rawName.trim();
    if (!name) return;
    if (selectedPlayers.includes(name)) return toast('玩家已存在');
    if (selectedPlayers.length >= 5) return toast('已達 5 人上限');
    const nextStats = ensurePlayerStats(stats, name);
    setStats(nextStats); saveStats(nextStats);
    setSelectedPlayers((current) => [...current, name]); setInputValue(''); setDrawResults({});
  };
  const removePlayer = (name) => {
    setSelectedPlayers((current) => current.filter((player) => player !== name));
    setPreferredRoles((current) => { const next = { ...current }; delete next[name]; return next; });
    setDrawResults({});
  };
  const updatePreferredRole = (player, role) => setPreferredRoles((current) => {
    const next = { ...current };
    if (role) next[player] = role; else delete next[player];
    return next;
  });
  const handleDraw = () => {
    setDrawing(true);
    window.setTimeout(() => {
      try {
        const results = drawAssignments(selectedPlayers, preferredRoles);
        const nextStats = applyDrawToStats(stats, results);
        setDrawResults(Object.fromEntries(results.map((result) => [result.name, result])));
        setStats(nextStats); saveStats(nextStats); setDrawCompletedAt(new Date()); setRevealVersion((version) => version + 1); setStep('result'); toast('抽籤完成！');
      } catch (error) { toast(error.message || '抽籤失敗，請重試'); } finally { setDrawing(false); }
    }, 620);
  };
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(formatCopyText(Object.values(drawResults))); toast('抽籤結果已複製！'); }
    catch { toast('無法複製到剪貼簿'); }
  };
  useEffect(() => {
    const handleKeyDown = (event) => {
      const isInteractiveTarget = event.target instanceof Element && Boolean(event.target.closest('button, input, select, textarea, [contenteditable="true"]'));
      const action = getResultShortcutAction({
        key: event.key,
        step,
        isStatsOpen,
        isDrawing,
        hasModifier: event.ctrlKey || event.metaKey || event.altKey || event.shiftKey,
        isInteractiveTarget
      });
      if (!action) return;

      event.preventDefault();
      if (action === 'roster') setStep('roster');
      if (action === 'preferences') setStep('preferences');
      if (action === 'copy') handleCopy();
      if (action === 'draw') handleDraw();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [step, isStatsOpen, isDrawing, handleCopy, handleDraw]);
  const knownNames = useMemo(() => {
    const names = sortPlayerNames(stats);
    return [...selectedPlayers.filter((name) => names.includes(name)), ...selectedPlayers.filter((name) => !names.includes(name)), ...names.filter((name) => !selectedPlayers.includes(name))];
  }, [selectedPlayers, stats]);
  const current = steps.find((item) => item.id === step);
  const changeToolMode = (nextMode) => {
    setToolMode(nextMode);
    if (nextMode === 'champions') setStatsOpen(false);
  };

  return <div className={`app step-${step}`}><main className="container">
    <header className="app-header"><div className="page-title"><span className="eyebrow">League of Legends</span><h1>英雄聯盟抽籤</h1></div><div className="header-actions">{toolMode === 'roles' && <button className="icon-button" type="button" title="歷史統計" aria-label="歷史統計" onClick={() => setStatsOpen(true)}>⌁</button>}<ThemeToggle theme={theme} onToggle={() => setTheme((value) => value === 'light' ? 'dark' : 'light')} /></div></header>
    <nav className="tool-mode-toggle" aria-label="工具模式" role="tablist">{toolModes.map((mode) => <button key={mode.id} className={toolMode === mode.id ? 'mode-choice is-selected' : 'mode-choice'} type="button" role="tab" aria-selected={toolMode === mode.id} onClick={() => changeToolMode(mode.id)}>{mode.label}</button>)}</nav>
    {toolMode === 'roles' && <><Stepper current={step} />
    <section className="flow-heading"><span>步驟 {steps.findIndex((item) => item.id === step) + 1} / 3</span><h2>{current.label}</h2><p>{current.description}</p></section>
    {step === 'roster' && <section className="flow-panel roster-flow"><PlayerInput value={inputValue} playerCount={selectedPlayers.length} disabled={selectedPlayers.length >= 5} onChange={setInputValue} onAdd={() => addPlayerName(inputValue)} /><div className="known-section"><h3>最近使用的玩家</h3><KnownPlayers names={knownNames} selectedPlayers={selectedPlayers} onToggle={(name) => selectedPlayers.includes(name) ? removePlayer(name) : addPlayerName(name)} /></div><div className="roster-summary"><div><span>本次隊伍</span><strong>{selectedPlayers.length} <small>/ 5 人</small></strong></div>{selectedPlayers.length === 0 ? <p>先加入至少一位玩家，即可繼續。</p> : <div className="roster-names">{selectedPlayers.map((name) => <button key={name} type="button" onClick={() => removePlayer(name)}>{name}<span>×</span></button>)}</div>}</div><div className="flow-actions"><button className="btn btn-primary btn-large" type="button" disabled={selectedPlayers.length === 0} onClick={() => setStep('preferences')}>下一步：設定偏好</button></div></section>}
    {step === 'preferences' && <section className="flow-panel preferences-flow" aria-busy={isDrawing}><div className={isDrawing ? 'cards-grid is-drawing' : 'cards-grid'}>{selectedPlayers.map((name) => <PlayerCard key={name} player={name} preferredRole={preferredRoles[name]} unavailableRoles={Object.values(preferredRoles)} hasDrawn={false} onPreferredRoleChange={updatePreferredRole} />)}</div>{isDrawing && <p className="draw-status" role="status">正在為隊伍安排最佳分路…</p>}<div className="flow-actions split-actions"><button className="btn btn-secondary" type="button" disabled={isDrawing} onClick={() => setStep('roster')}>返回修改名單</button><button className="btn btn-primary btn-large" type="button" disabled={isDrawing} onClick={handleDraw}>{isDrawing ? '抽籤中…' : '開始抽籤'}</button></div></section>}
    {step === 'result' && <section className="flow-panel result-flow" key={revealVersion}>{drawCompletedAt && <p className="draw-completed-at">抽籤時間：{drawCompletedAt.toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' })}</p>}<div className="cards-grid result-grid">{selectedPlayers.map((name) => <PlayerCard key={name} player={name} result={drawResults[name]} hasDrawn />)}</div><div className="flow-actions result-actions"><button className="btn btn-secondary" type="button" onClick={() => setStep('roster')}>修改名單</button><button className="btn btn-secondary" type="button" onClick={() => setStep('preferences')}>修改偏好</button><button className="btn btn-secondary" type="button" onClick={handleCopy}>複製結果</button><button className="btn btn-primary btn-large" type="button" onClick={handleDraw}>再抽一次</button></div></section>}</>}
    {toolMode === 'champions' && <ChampionDrawPanel championData={championData} />}
  </main><footer className="app-footer"><a href="https://developer.riotgames.com/docs/lol#data_dragon" target="_blank" rel="noreferrer">資料來源：Riot Data Dragon</a></footer><StatsModal open={isStatsOpen} stats={stats} onClose={() => setStatsOpen(false)} onClear={() => { if (window.confirm('清空紀錄？')) { clearStats(); setStats({}); setStatsOpen(false); toast('統計紀錄已清空'); } }} /><ToastHost toasts={toasts} /></div>;
}
