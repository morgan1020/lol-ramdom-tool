import React, { useEffect, useMemo, useState } from 'react';
import { drawAssignments } from './domain/draw.js';
import { applyDrawToStats, ensurePlayerStats, sortPlayerNames } from './domain/stats.js';
import { clearStats, loadStats, saveStats } from './storage/localStats.js';
import { loadTheme, saveTheme } from './storage/theme.js';
import { KnownPlayers } from './components/KnownPlayers.jsx';
import { PlayerCard } from './components/PlayerCard.jsx';
import { PlayerInput } from './components/PlayerInput.jsx';
import { StatsModal } from './components/StatsModal.jsx';
import { ThemeToggle } from './components/ThemeToggle.jsx';
import { ToastHost } from './components/ToastHost.jsx';
import './styles.css';

function getInitialTheme() {
  const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return loadTheme(undefined, prefersDark);
}

function formatCopyText(players, resultMap) {
  return players
    .map((player) => {
      const result = resultMap[player];
      if (!result) return '';
      if (result.secondary) return `${player}：主要 ${result.main}｜次要 ${result.secondary}`;
      return `${player}：${result.main}`;
    })
    .filter(Boolean)
    .join('\n');
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [inputValue, setInputValue] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [preferredRoles, setPreferredRoles] = useState({});
  const [drawResults, setDrawResults] = useState({});
  const [hasDrawn, setHasDrawn] = useState(false);
  const [stats, setStats] = useState(() => loadStats());
  const [isStatsOpen, setStatsOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [isDrawing, setDrawing] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    saveTheme(theme);
  }, [theme]);

  const toast = (message) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 2500);
  };

  const resetDrawState = () => {
    setHasDrawn(false);
    setDrawResults({});
  };

  const addPlayerName = (rawName) => {
    const name = rawName.trim();
    if (!name) return;
    if (selectedPlayers.includes(name)) {
      toast('玩家已存在');
      return;
    }
    if (selectedPlayers.length >= 5) {
      toast('已達 5 人上限');
      return;
    }

    const nextStats = ensurePlayerStats(stats, name);
    setStats(nextStats);
    saveStats(nextStats);
    setSelectedPlayers((current) => [...current, name]);
    setInputValue('');
    resetDrawState();
  };

  const removePlayer = (name) => {
    setSelectedPlayers((current) => current.filter((player) => player !== name));
    setPreferredRoles((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    resetDrawState();
  };

  const updatePreferredRole = (player, role) => {
    setPreferredRoles((current) => {
      const next = { ...current };
      if (role) next[player] = role;
      else delete next[player];
      return next;
    });
    resetDrawState();
  };

  const handleDraw = () => {
    if (selectedPlayers.length === 0) return;
    setDrawing(true);
    window.setTimeout(() => {
      try {
        const results = drawAssignments(selectedPlayers, preferredRoles);
        const nextResults = Object.fromEntries(results.map((result) => [result.name, result]));
        const nextStats = applyDrawToStats(stats, results);
        setDrawResults(nextResults);
        setStats(nextStats);
        saveStats(nextStats);
        setHasDrawn(true);
        toast('抽籤完成！');
      } catch (error) {
        toast(error.message || '抽籤失敗，請重試');
      } finally {
        setDrawing(false);
      }
    }, 200);
  };

  const handleEdit = () => {
    setPreferredRoles({});
    resetDrawState();
  };

  const handleCopy = async () => {
    if (!hasDrawn) return;
    try {
      await navigator.clipboard.writeText(formatCopyText(selectedPlayers, drawResults));
      toast('抽籤結果已複製！');
    } catch {
      toast('無法複製到剪貼簿');
    }
  };

  const handleClearStats = () => {
    if (!window.confirm('清空紀錄？')) return;
    clearStats();
    setStats({});
    setStatsOpen(false);
    toast('統計紀錄已清空');
  };

  const knownNames = useMemo(() => {
    const sortedNames = sortPlayerNames(stats);
    const selectedKnown = selectedPlayers.filter((name) => sortedNames.includes(name));
    const selectedCustom = selectedPlayers.filter((name) => !sortedNames.includes(name));
    const unselected = sortedNames.filter((name) => !selectedPlayers.includes(name));
    return [...selectedKnown, ...selectedCustom, ...unselected];
  }, [selectedPlayers, stats]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const activeElement = document.activeElement;
      const isInputActive = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'SELECT';

      if (event.key === 'Escape' && isStatsOpen) {
        setStatsOpen(false);
        return;
      }

      if (event.key === 'Enter' && !isStatsOpen) {
        if (activeElement?.tagName === 'INPUT' && inputValue.trim() !== '') return;
        event.preventDefault();
        if (selectedPlayers.length > 0) handleDraw();
      }

      if (event.key.toLowerCase() === 'c' && !isInputActive && !isStatsOpen && hasDrawn) {
        event.preventDefault();
        handleCopy();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [hasDrawn, inputValue, isStatsOpen, preferredRoles, selectedPlayers, stats]);

  return (
    <div className={hasDrawn ? 'app is-drawn' : 'app'}>
      <main className="container">
        <header className="app-header">
          <div className="page-title">
            <span className="eyebrow">League of Legends</span>
            <h1>英雄聯盟抽籤</h1>
          </div>
          <div className="header-actions">
            <button className="icon-button fab-stats" type="button" title="歷史統計" aria-label="歷史統計" onClick={() => setStatsOpen(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 3v18h18" />
                <path d="M7 16V9" />
                <path d="M12 16V5" />
                <path d="M17 16v-4" />
              </svg>
            </button>
            <ThemeToggle theme={theme} onToggle={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))} />
          </div>
        </header>

        <section className="control-panel">
          <PlayerInput
            value={inputValue}
            playerCount={selectedPlayers.length}
            hasDrawn={hasDrawn}
            disabled={selectedPlayers.length >= 5}
            onChange={setInputValue}
            onAdd={() => addPlayerName(inputValue)}
            onEdit={handleEdit}
            onDraw={handleDraw}
            onCopy={handleCopy}
          />
          {!hasDrawn && <KnownPlayers names={knownNames} selectedPlayers={selectedPlayers} onToggle={(name) => (selectedPlayers.includes(name) ? removePlayer(name) : addPlayerName(name))} />}
        </section>

        <section className="players-panel" aria-label="玩家名單">
          <div className={isDrawing ? 'cards-grid is-drawing' : 'cards-grid'}>
            {selectedPlayers.map((player) => (
              <PlayerCard
                key={player}
                player={player}
                result={drawResults[player]}
                preferredRole={preferredRoles[player]}
                hasDrawn={hasDrawn}
                onRemove={removePlayer}
                onPreferredRoleChange={updatePreferredRole}
              />
            ))}
          </div>
        </section>
      </main>

      <StatsModal open={isStatsOpen} stats={stats} onClose={() => setStatsOpen(false)} onClear={handleClearStats} />
      <ToastHost toasts={toasts} />
    </div>
  );
}
