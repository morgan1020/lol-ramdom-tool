import { useCallback, useRef, useState } from 'react';
import { clearDiscordSync, loadDiscordSync, saveDiscordSync } from '../storage/discordSync.js';
import { changeDesktopDiscord, desktopRequest, hasDesktopData } from '../storage/desktopData.js';
import {
  getActiveDiscordDestination,
  getDiscordDestinationLabel,
  removeDiscordDestination,
  sendActiveDiscordDraw,
  selectDiscordDestination,
  upsertDiscordDestination
} from '../domain/discordDestinations.js';

export function useDiscordSync() {
  const [settings, setSettings] = useState(loadDiscordSync);
  const [status, setStatus] = useState({ state: 'idle', message: '' });
  const [pending, setPending] = useState(false);
  const mutationInProgress = useRef(false);
  const settingsRef = useRef(settings);
  const requestId = useRef(0);
  const isSending = useRef(false);
  const lastDraw = useRef(null);

  const applySettings = (next) => {
    settingsRef.current = next;
    requestId.current += 1;
    isSending.current = false;
    setSettings(next);
    setStatus({ state: 'idle', message: '' });
    lastDraw.current = null;
  };
  const mutate = async (action, payload, webAction) => {
    if (mutationInProgress.current || isSending.current) throw new Error('正在處理 Discord 設定，請稍候');
    mutationInProgress.current = true; setPending(true);
    try { applySettings(hasDesktopData() ? await changeDesktopDiscord(action, payload) : webAction()); }
    finally { mutationInProgress.current = false; setPending(false); }
  };
  const configure = (destination) => mutate('configure', destination, () => saveDiscordSync(upsertDiscordDestination(settingsRef.current, destination)));
  const select = (id) => mutate('select', id, () => saveDiscordSync(selectDiscordDestination(settingsRef.current, id)));
  const remove = (id) => mutate('remove', id, () => saveDiscordSync(removeDiscordDestination(settingsRef.current, id)));
  const toggle = () => mutate('toggle', null, () => saveDiscordSync({ ...settingsRef.current, enabled: !settingsRef.current.enabled }));
  const clear = () => mutate('clear', null, clearDiscordSync);

  const syncDraw = useCallback(async (results) => {
    if (mutationInProgress.current) return;
    const currentSettings = settingsRef.current;
    const destination = getActiveDiscordDestination(currentSettings);
    if (!currentSettings.enabled || !destination) return;
    const label = getDiscordDestinationLabel(destination);
    const currentRequest = ++requestId.current;
    isSending.current = true;
    lastDraw.current = { results };
    setStatus({ state: 'sending', message: `正在傳送本次結果到 ${label}…` });
    try {
      if (hasDesktopData()) await desktopRequest('sendDataDiscord', results);
      else await sendActiveDiscordDraw(currentSettings, results);
      if (currentRequest === requestId.current) setStatus({ state: 'sent', message: `本次分路結果已傳送到 ${label}` });
    } catch (error) {
      if (currentRequest === requestId.current) setStatus({ state: 'error', message: error.message });
    } finally {
      if (currentRequest === requestId.current) isSending.current = false;
    }
  }, []);

  const retry = () => {
    if (status.state === 'error' && !isSending.current && lastDraw.current) {
      void syncDraw(lastDraw.current.results);
    }
  };

  return { settings, status, pending, configure, select, remove, toggle, clear, syncDraw, retry };
}
