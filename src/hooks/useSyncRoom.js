import { useCallback, useEffect, useRef, useState } from 'react';

const initialState = { connection: 'disconnected', memberId: null, room: null, error: '' };

export function useSyncRoom() {
  const api = window.lolDesktop?.syncRoom;
  const [state, setState] = useState(initialState);
  const [initializing, setInitializing] = useState(Boolean(api));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inProgress = useRef(false);
  const operationId = useRef(0);
  const mounted = useRef(false);
  const updates = useRef(0);

  useEffect(() => {
    mounted.current = true;
    if (!api) return () => { mounted.current = false; };
    let active = true;
    const unsubscribe = api.onState((next) => {
      if (!active) return;
      updates.current += 1;
      setState(next);
      setInitializing(false);
    });
    const before = updates.current;
    Promise.resolve(api.getState()).then((reply) => {
      if (!active) return;
      setInitializing(false);
      if (updates.current !== before) return;
      if (reply.ok && reply.state) setState(reply.state);
      else if (!reply.ok) setError(reply.message || '無法讀取房間狀態');
    }).catch(() => {
      if (active) {
        setInitializing(false);
        setError('無法讀取房間狀態，請重新開啟 App');
      }
    });
    return () => {
      active = false;
      mounted.current = false;
      unsubscribe();
    };
  }, [api]);

  const perform = useCallback(async (method, payload, interrupt = false) => {
    if (!api || (inProgress.current && !interrupt)) return false;
    const currentOperation = ++operationId.current;
    inProgress.current = true;
    setBusy(true);
    setError('');
    const before = updates.current;
    try {
      const reply = await api[method](payload);
      if (!reply?.ok) throw new Error(reply?.message || '房間操作失敗，請再試一次');
      if (mounted.current && currentOperation === operationId.current && reply.state && before === updates.current) setState(reply.state);
      return true;
    } catch (failure) {
      if (mounted.current && currentOperation === operationId.current) setError(failure.message || '房間操作失敗，請再試一次');
      return false;
    } finally {
      if (currentOperation === operationId.current) {
        inProgress.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  }, [api]);

  return {
    ...state,
    available: Boolean(api),
    initializing,
    busy,
    error: error || state.error || '',
    connect: (options) => perform('connect', options),
    command: (command) => perform('command', command),
    disconnect: () => perform('disconnect', undefined, true)
  };
}
