import { useCallback, useRef, useState } from 'react';
import { clearDiscordSync, loadDiscordSync, saveDiscordSync } from '../storage/discordSync.js';
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
  const configure = (destination) => applySettings(saveDiscordSync(upsertDiscordDestination(settingsRef.current, destination)));
  const select = (id) => applySettings(saveDiscordSync(selectDiscordDestination(settingsRef.current, id)));
  const remove = (id) => applySettings(saveDiscordSync(removeDiscordDestination(settingsRef.current, id)));
  const toggle = () => applySettings(saveDiscordSync({ ...settingsRef.current, enabled: !settingsRef.current.enabled }));
  const clear = () => applySettings(clearDiscordSync());

  const syncDraw = useCallback(async (results) => {
    const currentSettings = settingsRef.current;
    const destination = getActiveDiscordDestination(currentSettings);
    if (!currentSettings.enabled || !destination) return;
    const label = getDiscordDestinationLabel(destination);
    const currentRequest = ++requestId.current;
    isSending.current = true;
    lastDraw.current = { results };
    setStatus({ state: 'sending', message: `正在傳送本次結果到 ${label}…` });
    try {
      await sendActiveDiscordDraw(currentSettings, results);
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

  return { settings, status, configure, select, remove, toggle, clear, syncDraw, retry };
}
