import React, { useState } from 'react';
import { createPlayerLabels } from '../domain/playerNames.js';
import { UiIcon } from './UiIcon.jsx';
import { CardRolePicker } from './CardRolePicker.jsx';
import { KnownPlayers } from './KnownPlayers.jsx';
import { AutoApplySwitch, RoleWorkspace } from './RoleWorkspace.jsx';
import { DrawDiscordControls } from './DiscordSyncPanel.jsx';
import { LolRefreshButton } from './LolRefreshButton.jsx';
import { ModalFrame } from './ModalFrame.jsx';

export function RoleDraw({
  isDesktop, localPlayerId, players, busy, loading, preferredRoles, onPreferredRoleChange,
  autoApplyRoles, onAutoApplyRolesChange, canApply, onImportTeam, onRemove, onAdd, knownNames,
  onToggleKnown, discordSync, onManageWebhook, results, resultPreferences, revealId,
  onDraw, onCopy
}) {
  const [adding, setAdding] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const names = players.map(player => player.name);
  const labels = createPlayerLabels(names);
  const closeAdd = () => {
    if (busy) return;
    setAdding(false);
    setInputValue('');
  };
  const add = async event => {
    event.preventDefault();
    if (await onAdd(inputValue)) {
      setAdding(false);
      setInputValue('');
    }
  };
  const controls = <>
    <div className="solo-draw-controls">
      <div className="draw-roster-controls">
        <span className="visual-summary" aria-label={`${players.length} 位玩家`}><UiIcon name="users" />{players.length} / 5</span>
        {isDesktop && <LolRefreshButton disabled={busy} loading={loading} onRefresh={onImportTeam} />}
      </div>
      {isDesktop && <AutoApplySwitch enabled={autoApplyRoles && canApply} disabled={busy || !canApply} onChange={onAutoApplyRolesChange} />}
    </div>
  </>;
  const discord = <DrawDiscordControls discordSync={discordSync} disabled={busy} onManage={onManageWebhook} />;
  return <>
    <RoleWorkspace players={players} results={results} localPlayerId={localPlayerId}
      preferences={preferredRoles} assignedPreferences={resultPreferences} busy={busy} revealId={revealId}
      drawDisabled={!players.length} onDraw={onDraw} onCopy={onCopy}
      controls={controls} status={discord} onAddPlayer={() => setAdding(true)}
      renderRolePicker={player => <CardRolePicker player={player} players={players} labels={labels} preferences={preferredRoles}
        disabled={busy} onChange={value => onPreferredRoleChange(player.name, value)} />}
      renderPlayerActions={player => <button className="btn icon-action solo-remove-player" type="button"
        aria-label={`移除 ${labels[player.name]}`} disabled={busy} onClick={() => onRemove(player.name)}><UiIcon name="close" /></button>}
    />
    {adding && <ModalFrame open onClose={closeAdd} labelId="solo-add-title">
      <div className="solo-add-dialog">
        <header>
          <h2 id="solo-add-title">新增玩家</h2>
          <button className="toolbar-icon" type="button" aria-label="關閉" disabled={busy} onClick={closeAdd}><UiIcon name="close" /></button>
        </header>
        <form className="manual-add-form" onSubmit={add}>
          <label className="sr-only" htmlFor="player-name">玩家名稱</label>
          <input id="player-name" value={inputValue} onChange={event => setInputValue(event.target.value)}
            placeholder="輸入玩家名稱" autoComplete="off" disabled={busy || players.length >= 5} />
          <button className="btn btn-primary" type="submit" disabled={busy || players.length >= 5 || !inputValue.trim()}>加入</button>
        </form>
        <details className="solo-add-history">
          <summary>歷史玩家</summary>
          <KnownPlayers names={knownNames} selectedPlayers={names} disabled={busy} onToggle={onToggleKnown} />
        </details>
      </div>
    </ModalFrame>}
  </>;
}
