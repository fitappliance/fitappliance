'use strict';

function markServiceWorkerUpdated() {
  window.__fitApplianceServiceWorkerUpdated = true;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (!navigator.onLine) return;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData) return;
    navigator.serviceWorker.register('/service-worker.js').then(() => {
      navigator.serviceWorker.addEventListener('controllerchange', markServiceWorkerUpdated);
    }).catch(() => {});
  }, { once: true });
}
