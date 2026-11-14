import React, { useEffect, useRef, useState } from 'react';
import { UiIcon } from './UiIcon.jsx';

export function CopyResultButton({ onCopy, resetKey, disabled = false, label = '複製結果' }) {
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

  return <button className="btn btn-secondary copy-results icon-action" type="button" title={label}
    aria-label={copied ? '已複製結果' : label} disabled={disabled} onClick={handleClick}>
    <UiIcon name={copied ? 'check' : 'copy'} />
  </button>;
}
