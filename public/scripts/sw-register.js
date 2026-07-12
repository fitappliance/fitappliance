'use strict';

const hadServiceWorkerControllerAtBoot = 'serviceWorker' in navigator
  && Boolean(navigator.serviceWorker.controller);

function handleServiceWorkerUpdated() {
  window.__fitApplianceServiceWorkerUpdated = true;
  if (!hadServiceWorkerControllerAtBoot || window.__fitApplianceServiceWorkerReloading) return;
  window.__fitApplianceServiceWorkerReloading = true;
  if (typeof window.__fitApplianceReload === 'function') {
    window.__fitApplianceReload();
    return;
  }
  window.location.reload();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', handleServiceWorkerUpdated);
  window.addEventListener('load', () => {
    if (!navigator.onLine) return;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData) return;
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }, { once: true });
}
