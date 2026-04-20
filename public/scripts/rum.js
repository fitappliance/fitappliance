'use strict';

(function startRum(globalScope) {
  const SAMPLE_RATE = 0.1;
  const ENDPOINT = '/api/rum';
  const WEB_VITALS_MODULE = 'https://unpkg.com/web-vitals@4/dist/web-vitals.attribution.js?module';

  if (!globalScope || !globalScope.location || globalScope.location.origin !== 'https://www.fitappliance.com.au') {
    return;
  }

  if (Math.random() >= SAMPLE_RATE) {
    return;
  }

  function toMetricValue(metricName, value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (metricName === 'CLS') {
      return Number(value.toFixed(4));
    }
    return Math.round(value);
  }

  function sendRumEvent(metricName, value) {
    const metricValue = toMetricValue(metricName, value);
    if (metricValue == null) return;

    const payload = {
      metric: metricName,
      value: metricValue,
      path: String(globalScope.location.pathname || '/').split('?')[0].split('#')[0],
      ts: Date.now(),
      ua: String(globalScope.navigator?.userAgent || '').slice(0, 120)
    };

    const body = JSON.stringify(payload);
    if (typeof globalScope.navigator?.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      globalScope.navigator.sendBeacon(ENDPOINT, blob);
      return;
    }

    if (typeof globalScope.fetch === 'function') {
      globalScope.fetch(ENDPOINT, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body
      }).catch(() => {});
    }
  }

  async function bindWebVitals() {
    try {
      const webVitals = await import(WEB_VITALS_MODULE);
      webVitals.onLCP((metric) => sendRumEvent('LCP', metric.value));
      webVitals.onINP((metric) => sendRumEvent('INP', metric.value));
      webVitals.onCLS((metric) => sendRumEvent('CLS', metric.value));
      webVitals.onTTFB((metric) => sendRumEvent('TTFB', metric.value));
    } catch {
      // Intentionally silent: RUM must never break the page.
    }
  }

  bindWebVitals();
}(typeof window !== 'undefined' ? window : null));
