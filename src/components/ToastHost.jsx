import React from 'react';

export function ToastHost({ toasts }) {
  return (
    <div className="toast-wrap" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div className="toast" key={toast.id}>{toast.message}</div>
      ))}
    </div>
  );
}
