import React, { useEffect, useRef, useState } from 'react';
import { UiIcon } from './UiIcon.jsx';

export function CopyResultButton({ onCopy, resetKey, disabled = false, label = '複製結果', copiedLabel = '已複製結果', className = 'btn btn-secondary copy-results icon-action', children }) {
  const [copiedKey, setCopiedKey] = useState(null);
  const timer = useRef(null);
  const currentKey = useRef(resetKey);
  currentKey.current = resetKey;
  const copied = copiedKey !== null && Object.is(copiedKey, resetKey);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    clearTimeout(timer.current);
    setCopiedKey(null);
  }, [resetKey]);

  const handleClick = async () => {
    const key = resetKey;
    clearTimeout(timer.current);
    setCopiedKey(null);
    const success = await onCopy();
    if (success === false || !Object.is(currentKey.current, key)) return;
    clearTimeout(timer.current);
    setCopiedKey(key);
    timer.current = setTimeout(() => setCopiedKey(null), 2000);
  };

  return <button className={className} type="button" title={copied ? copiedLabel : label}
    aria-label={copied ? copiedLabel : label} disabled={disabled} onClick={handleClick}>
    {children}<UiIcon name={copied ? 'check' : 'copy'} />
  </button>;
}
