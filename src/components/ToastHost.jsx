import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { toastStore } from '../notifications.js';
import { UiIcon } from './UiIcon.jsx';

export function ToastHost() {
  const toasts = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot);
  const layer = useRef(null);
  const [target, setTarget] = useState(document.body);
  useEffect(() => {
    const locate = () => setTarget([...document.querySelectorAll('dialog[open]')].at(-1) || document.body);
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
    return () => observer.disconnect();
  }, []);
  const front = toasts.map(toast => `${toast.id}:${toast.version}`).join('|');
  useLayoutEffect(() => {
    if (!layer.current?.showPopover) return;
    if (layer.current.matches(':popover-open')) layer.current.hidePopover();
    layer.current.showPopover();
  }, [front, target]);
  if (!toasts.length) return null;
  return createPortal(<div ref={layer} className="toast-wrap" popover="manual" aria-label="操作通知">
    {toasts.map(toast => <div className={`toast is-${toast.type}`} key={toast.id} data-notice-id={toast.id} role={toast.type === 'error' ? 'alert' : 'status'} aria-atomic="true" onMouseEnter={() => toastStore.pause(toast.id, 'hover')} onMouseLeave={() => toastStore.resume(toast.id, 'hover')} onFocusCapture={() => toastStore.pause(toast.id, 'focus')} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) toastStore.resume(toast.id, 'focus'); }}>
      <span className="toast-mark" aria-hidden="true"><UiIcon name={toast.type === 'success' ? 'check' : toast.type === 'error' ? 'close' : 'warning'} /></span>
      <span className="toast-message">{toast.message}</span>
      {toast.action && <button className="toast-action" type="button" disabled={toast.pending} onClick={() => void toastStore.runAction(toast.id)}>{toast.pending ? '處理中…' : toast.action.label}</button>}
      <button className="toast-close" type="button" aria-label="關閉通知" title="關閉通知" disabled={toast.pending} onClick={() => toastStore.dismiss(toast.id)}><UiIcon name="close" /></button>
    </div>)}
  </div>, target);
}
