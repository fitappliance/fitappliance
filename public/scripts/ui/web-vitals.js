const STORAGE_KEY = 'fitappliance-vitals-v1';
const MAX_STORED_SESSIONS = 10;

function getStorage() {
  return globalThis.localStorage ?? null;
}

function safeParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toNumberOrNull(value, digits = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  if (digits <= 0) return Math.round(value);
  return Number(value.toFixed(digits));
}

export function getStoredVitals() {
  const storage = getStorage();
  if (!storage) return [];
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const parsed = safeParse(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function storeSession(session) {
  const storage = getStorage();
  if (!storage) return [];
  const entries = [session, ...getStoredVitals()].slice(0, MAX_STORED_SESSIONS);
  storage.setItem(STORAGE_KEY, JSON.stringify(entries));
  return entries;
}

export function getSummary() {
  const sessions = getStoredVitals();
  if (sessions.length === 0) return null;

  const average = (key) => {
    const values = sessions
      .map((session) => session?.vitals?.[key])
      .filter((value) => typeof value === 'number' && Number.isFinite(value));
    if (values.length === 0) return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  };

  const clsValues = sessions
    .map((session) => session?.vitals?.cls)
    .filter((value) => typeof value === 'number' && Number.isFinite(value));
  const avgCls = clsValues.length === 0
    ? 0
    : Number((clsValues.reduce((sum, value) => sum + value, 0) / clsValues.length).toFixed(4));

  return {
    sessions: sessions.length,
    avgLcp: average('lcp'),
    avgCls,
    avgTtfb: average('ttfb'),
    avgDomLoad: average('domLoad'),
    lastUpdated: new Date(sessions[0]?.ts ?? 0).toISOString()
  };
}

export function collectVitals({ beaconUrl = null } = {}) {
  const session = {
    ts: Date.now(),
    url: globalThis.location?.pathname ?? '/',
    vitals: {}
  };

  const onLoad = () => {
    const nav = globalThis.performance?.getEntriesByType?.('navigation')?.[0];
    if (nav) {
      session.vitals.ttfb = toNumberOrNull(nav.responseStart - nav.requestStart);
      session.vitals.domLoad = toNumberOrNull(nav.domContentLoadedEventEnd - nav.startTime);
    }
    const paints = globalThis.performance?.getEntriesByType?.('paint') ?? [];
    const firstContentfulPaint = paints.find((entry) => entry.name === 'first-contentful-paint');
    if (firstContentfulPaint) {
      session.vitals.fcp = toNumberOrNull(firstContentfulPaint.startTime);
    }
  };

  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('load', onLoad, { once: true });
  }

  if (typeof globalThis.PerformanceObserver === 'function') {
    try {
      const lcpObserver = new globalThis.PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          session.vitals.lcp = toNumberOrNull(lastEntry.startTime);
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

      let clsValue = 0;
      const clsObserver = new globalThis.PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
        session.vitals.cls = toNumberOrNull(clsValue, 4);
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch {
      // ignore unsupported browsers
    }
  }

  const onPageHide = () => {
    storeSession(session);
    if (beaconUrl && typeof globalThis.navigator?.sendBeacon === 'function') {
      globalThis.navigator.sendBeacon(beaconUrl, JSON.stringify(session));
    }
  };

  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('pagehide', onPageHide, { once: true });
  }
}

export { MAX_STORED_SESSIONS, STORAGE_KEY };
