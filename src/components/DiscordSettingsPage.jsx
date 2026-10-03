import React, { useState } from 'react';
import { getDiscordDestinationLabel } from '../domain/discordDestinations.js';

export function DiscordSettingsPage({ settings, status, onConfigure, onRemove, onClear, onBack }) {
  const [editingId, setEditingId] = useState('');
  const [label, setLabel] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sending = status.state === 'sending';
  const resetEditor = () => { setEditingId(''); setLabel(''); setWebhookUrl(''); };
  const runAction = (action) => {
    try { action(); setError(''); }
    catch (actionError) { setError(actionError.message); }
  };
  const edit = (destination) => {
    setEditingId(destination.id); setLabel(destination.label); setWebhookUrl(''); setError(''); setNotice('');
  };
  return <section className="discord-settings-page" aria-labelledby="settings-title">
    <div className="flow-heading"><span>設定</span><h2 id="settings-title">Discord 連動設定</h2><p>替不同伺服器的 Webhook 取名，抽籤前選擇要同步的位置。</p></div>
    <div className="flow-panel discord-settings-content">
      <p className="discord-local-note">設定只保存在這個瀏覽器。新增與編輯不會查詢 Discord，也不會傳送訊息。</p>
      <h3>{editingId ? '編輯 Webhook' : '新增 Webhook'}</h3>
      <form onSubmit={(event) => {
        event.preventDefault();
        runAction(() => {
          const previous = settings.destinations.find((destination) => destination.id === editingId);
          onConfigure({ label, webhookUrl: webhookUrl.trim() || previous?.webhookUrl || '', previousId: editingId || undefined });
          setNotice('設定已儲存，可返回抽籤頁選擇使用。'); resetEditor();
        });
      }}>
        <label htmlFor="discord-label">自訂名稱</label>
        <input id="discord-label" type="text" required maxLength={80} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如：朋友群／抽籤頻道" disabled={sending} />
        <label htmlFor="discord-webhook">Webhook 網址{editingId ? '（留空保留原網址）' : ''}</label>
        <input id="discord-webhook" type="password" required={!editingId} autoComplete="off" spellCheck={false} value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder={editingId ? '貼上新網址可更換' : '貼上 Discord Webhook 網址'} disabled={sending} />
        <div className="discord-sync-actions"><button className="btn btn-primary" type="submit" disabled={sending || !label.trim()}>儲存設定</button>{editingId && <button className="btn btn-secondary" type="button" disabled={sending} onClick={resetEditor}>取消編輯</button>}</div>
      </form>
      {error && <p className="discord-sync-error" role="alert">{error}</p>}
      {notice && <p className="discord-settings-notice" role="status">{notice}</p>}
      <h3>已儲存的 Webhook</h3>
      {settings.destinations.length === 0 ? <p className="discord-local-note">尚未新增 Webhook。</p> : <ul className="discord-destination-list">{settings.destinations.map((destination) => <li key={destination.id}>
        <div><strong>{getDiscordDestinationLabel(destination)}</strong>{settings.activeDestinationId === destination.id && <span>目前選取</span>}</div>
        <div className="discord-sync-actions"><button className="btn btn-secondary" type="button" disabled={sending} aria-label={`編輯 ${getDiscordDestinationLabel(destination)}`} onClick={() => edit(destination)}>編輯</button><button className="btn btn-secondary btn-danger-text" type="button" disabled={sending} aria-label={`刪除 ${getDiscordDestinationLabel(destination)}`} onClick={() => runAction(() => { onRemove(destination.id); if (editingId === destination.id) resetEditor(); setNotice('已刪除設定。'); })}>刪除</button></div>
      </li>)}</ul>}
      <div className="flow-actions split-actions"><button className="btn btn-secondary" type="button" disabled={sending || !settings.destinations.length} onClick={() => runAction(() => { onClear(); resetEditor(); setNotice('已清除全部連動設定。'); })}>清除全部設定</button><button className="btn btn-primary" type="button" onClick={onBack}>返回抽籤</button></div>
      <a className="discord-help-link" href="https://support.discord.com/hc/zh-tw/articles/228383668" target="_blank" rel="noreferrer">如何建立 Discord Webhook</a>
    </div>
  </section>;
}
