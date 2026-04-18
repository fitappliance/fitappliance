'use strict';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (!navigator.onLine) return;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData) return;
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }, { once: true });
}
