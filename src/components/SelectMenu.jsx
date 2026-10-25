import { notify, dismissNotice } from '../notifications.js';
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { UiIcon } from './UiIcon.jsx';

export function SelectMenu({ value, options, onChange, disabled, label, id, className = '', triggerClassName = '', menuClassName = '', placeholder = '未設定' }) {
  const root = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const setError = message => { if (message) notify(message, { id: 'select-error', type: 'error' }); else dismissNotice('select-error'); };
  const active = options.find(option => option.value === value);
  const selectedLabel = active?.label || placeholder;
  const close = (restoreFocus = false) => { setOpen(false); if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus()); };
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!root.current?.contains(event.target)) close(); };
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); } };
    const resize = () => close();
    const scroll = event => { if (!menu.current?.contains(event.target)) close(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', resize); };
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !menu.current) return;
    if (menu.current.showPopover && !menu.current.matches(':popover-open')) menu.current.showPopover();
    const anchor = trigger.current.getBoundingClientRect();
    const bounds = menu.current.getBoundingClientRect();
    const left = Math.max(16, Math.min(anchor.right - bounds.width, innerWidth - bounds.width - 16));
    const candidate = anchor.bottom + bounds.height + 8 <= innerHeight - 16 ? anchor.bottom + 8 : anchor.top - bounds.height - 8;
    const top = Math.max(16, Math.min(candidate, innerHeight - bounds.height - 16));
    menu.current.style.left = `${left}px`;
    menu.current.style.top = `${top}px`;
    (menu.current.querySelector('[aria-selected="true"]') || menu.current.querySelector('[role="option"]'))?.focus({ preventScroll: true });
  }, [open]);
  const select = async id => {
    if (disabled || pending) return;
    if (id === value) { close(true); return; }
    setPending(true); setError('');
    try { await onChange(id); close(true); }
    catch (failure) { setError(failure.message || '無法變更選項'); }
    finally { setPending(false); }
  };
  const navigate = event => {
    const options = [...menu.current.querySelectorAll('[role="option"]:not(:disabled)')];
    const index = options.indexOf(document.activeElement);
    const key = event.key;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return;
    event.preventDefault();
    const next = key === 'Home' ? 0 : key === 'End' ? options.length - 1 : (index + (key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[next]?.focus({ preventScroll: true });
  };
  return <div className={`app-select ${className}`} ref={root} data-value={value}>
    <button ref={trigger} id={id} className={`app-select-trigger ${triggerClassName}`} role="combobox" type="button" aria-label={label + '：' + selectedLabel} title={selectedLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? menuId : undefined} disabled={disabled || pending} onClick={() => setOpen(!open)} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}><span className="app-select-option-label">{active?.icon}<span>{selectedLabel}</span></span><UiIcon name="chevron" /></button>
    {open && <div ref={menu} id={menuId} className={`app-select-menu ${menuClassName}`} popover="manual" role="listbox" aria-label={label} aria-busy={pending} onKeyDown={navigate}>
      {options.map(option => <button key={option.value} type="button" role="option" data-value={option.value} aria-selected={option.value === value} tabIndex={option.value === value ? 0 : -1} disabled={disabled || pending || option.disabled} title={option.label} onClick={() => select(option.value)}><span className="app-select-option-label">{option.icon}<span>{option.label}</span></span>{option.value === value && <UiIcon name="check" />}</button>)}
    </div>}
  </div>;
}
