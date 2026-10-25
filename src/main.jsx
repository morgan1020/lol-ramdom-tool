import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ToastHost } from './components/ToastHost.jsx';
import { notify, dismissNotice } from './notifications.js';
import { initializeDesktopData } from './storage/desktopData.js';

const root = createRoot(document.getElementById('root'));
async function start() {
  root.render(<div className="data-startup" role="status">正在確認資料與舊版設定…</div>);
  try {
    const data = await initializeDesktopData();
    dismissNotice('startup');
    root.render(<React.StrictMode><App initialData={data} /></React.StrictMode>);
  } catch (error) {
    root.render(<><main className="data-startup"><h1>資料尚未載入</h1><p>暫停操作以保護既有資料。</p></main><ToastHost /></>);
    notify(error.message || '無法讀取桌面資料，原資料已保留', { id: 'startup', type: 'error', action: { label: '重試', onClick: async () => { await start(); return false; } } });
  }
}
void start();
