'use strict';

(function initErrorBeacon(globalScope) {
  if (!globalScope || !globalScope.location || !globalScope.navigator) return;
  if (globalScope.location.origin !== 'https://www.fitappliance.com.au') return;

  const ENDPOINT = '/api/error';
  const STORE_KEY = 'fa-error-signatures';
  const MAX_FRAMES = 5;
  const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;

  function redact(value) {
    return String(value ?? '')
      .replace(EMAIL_RE, '[redacted-email]')
      .replace(PHONE_RE, '[redacted-phone]');
  }

  function cleanUrl(value) {
    try {
      const url = new URL(String(value), globalScope.location.origin);
      return `${url.origin}${url.pathname}`;
    } catch {
      return String(value ?? '').split('#')[0].split('?')[0];
    }
  }

  function trimStack(stack) {
    return String(stack ?? '')
      .split('\n')
      .map((line) => redact(cleanUrl(line)))
      .filter(Boolean)
      .slice(0, MAX_FRAMES)
      .join('\n');
  }

  function signature(payload) {
    return `${payload.message}|${payload.source}|${payload.line}`;
  }

  function loadTodaySignatures() {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const parsed = JSON.parse(globalScope.localStorage.getItem(STORE_KEY) || '{}');
      if (parsed.date !== today || !Array.isArray(parsed.signatures)) {
        return { date: today, signatures: [] };
      }
      return { date: today, signatures: parsed.signatures };
    } catch {
      return { date: today, signatures: [] };
    }
  }

  function saveTodaySignatures(state) {
    try {
      globalScope.localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      // no-op
    }
  }

  function send(payload) {
    const state = loadTodaySignatures();
    const sig = signature(payload);
    if (state.signatures.includes(sig)) return;

    state.signatures.push(sig);
    saveTodaySignatures(state);

    const body = JSON.stringify(payload);
    if (typeof globalScope.navigator.sendBeacon === 'function') {
      globalScope.navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
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

  globalScope.addEventListener('error', (event) => {
    send({
      message: redact(event?.message || 'Error'),
      source: cleanUrl(event?.filename || globalScope.location.pathname || '/'),
      line: Number(event?.lineno || 0),
      col: Number(event?.colno || 0),
      stack: trimStack(event?.error?.stack || '')
    });
  });

  globalScope.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const message = typeof reason === 'string' ? reason : (reason?.message || 'Unhandled rejection');
    send({
      message: redact(message),
      source: cleanUrl(globalScope.location.pathname || '/'),
      line: Number(reason?.line || 0),
      col: Number(reason?.col || 0),
      stack: trimStack(reason?.stack || '')
    });
  });
}(typeof window !== 'undefined' ? window : null));
