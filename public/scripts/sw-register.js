'use strict';

function ensureSwToastStyles() {
  if (document.getElementById('sw-update-toast-style')) return;
  const style = document.createElement('style');
  style.id = 'sw-update-toast-style';
  style.textContent = `
    .sw-update-toast {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: min(360px, calc(100vw - 32px));
      padding: 12px 14px;
      border-radius: 12px;
      background: #131210;
      color: #fff;
      box-shadow: 0 10px 30px rgba(0,0,0,.2);
      font: 600 13px/1.4 system-ui, sans-serif;
    }
    .sw-update-toast button {
      border: 1px solid rgba(255,255,255,.3);
      border-radius: 999px;
      background: rgba(255,255,255,.12);
      color: #fff;
      cursor: pointer;
      font: inherit;
      padding: 6px 10px;
    }
    .sw-update-toast button:hover { background: rgba(255,255,255,.2); }
  `;
  document.head.appendChild(style);
}

function showSwUpdateToast() {
  document.querySelector('.sw-update-toast')?.remove();
  ensureSwToastStyles();

  const toast = document.createElement('div');
  toast.className = 'sw-update-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = '<span>New version available</span>';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Refresh';
  button.addEventListener('click', () => {
    if (typeof window.__fitApplianceReload === 'function') {
      window.__fitApplianceReload();
    } else {
      window.location.reload();
    }
  });
  toast.appendChild(button);
  document.body.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 5000);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (!navigator.onLine) return;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData) return;
    navigator.serviceWorker.register('/service-worker.js').then(() => {
      navigator.serviceWorker.addEventListener('controllerchange', showSwUpdateToast);
    }).catch(() => {});
  }, { once: true });
}
