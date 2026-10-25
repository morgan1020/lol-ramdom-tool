import React from 'react';

export function ToolbarIcon({ name }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {name === 'stats' ? <><path d="M4 4v16h16" /><path d="M8 15v-4m5 4V7m5 8v-6" /></> : name === 'pool' ? <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> : <><path d="M9.5 2h5l.5 2.5 2 1.2 2.4-.8 2.5 4.3-1.9 1.7v2.2l1.9 1.7-2.5 4.3-2.4-.8-2 1.2-.5 2.5h-5L9 19.5l-2-1.2-2.4.8-2.5-4.3L4 13.1v-2.2L2.1 9.2l2.5-4.3 2.4.8 2-1.2Z" /><circle cx="12" cy="12" r="3" /></>}
  </svg>;
}
