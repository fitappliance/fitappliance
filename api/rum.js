'use strict';

const crypto = require('node:crypto');

const ALLOWED_METRICS = new Set(['LCP', 'INP', 'CLS', 'TTFB']);
const RATE_LIMIT_PER_MINUTE = 60;
const RATE_WINDOW_MS = 60_000;

function normalizeOrigin(value) {
  if (typeof value !== 'string' || value.trim() === '') return '';
  return value.replace(/\/+$/, '').toLowerCase();
}

function isSameOriginRequest(req, siteOrigin) {
  const allowed = normalizeOrigin(siteOrigin);
  const origin = normalizeOrigin(req?.headers?.origin);
  const referer = String(req?.headers?.referer ?? '');

  if (origin && origin !== allowed) return false;
  if (!origin && referer) {
    try {
      const parsed = new URL(referer);
      if (normalizeOrigin(parsed.origin) !== allowed) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function getClientFingerprint(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] ?? req?.headers?.['x-real-ip'] ?? 'unknown');
  const ipToken = forwarded.split(',')[0].trim() || 'unknown';
  const uaToken = String(req?.headers?.['user-agent'] ?? '').slice(0, 120);
  return crypto.createHash('sha256').update(`${ipToken}|${uaToken}`).digest('hex').slice(0, 24);
}

function sanitizeRumPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const metric = String(payload.metric ?? '').trim().toUpperCase();
  if (!ALLOWED_METRICS.has(metric)) return null;

  const value = Number(payload.value);
  if (!Number.isFinite(value) || value < 0 || value > 60000) return null;

  const path = String(payload.path ?? '').split('#')[0].split('?')[0];
  if (!path.startsWith('/')) return null;

  const ts = Number(payload.ts ?? Date.now());
  if (!Number.isFinite(ts) || ts <= 0) return null;

  return {
    metric,
    value: metric === 'CLS' ? Number(value.toFixed(4)) : Math.round(value),
    path,
    ts: Math.round(ts),
    ua: String(payload.ua ?? '').slice(0, 120)
  };
}

function createRateLimiter({ limit = RATE_LIMIT_PER_MINUTE, windowMs = RATE_WINDOW_MS, nowFn = Date.now } = {}) {
  const windows = new Map();
  return {
    check(key) {
      const now = nowFn();
      const entry = windows.get(key);
      if (!entry || (now - entry.windowStart) >= windowMs) {
        windows.set(key, { windowStart: now, count: 1 });
        return { allowed: true, remaining: limit - 1 };
      }

      if (entry.count >= limit) {
        const retryAfter = Math.max(1, Math.ceil((windowMs - (now - entry.windowStart)) / 1000));
        return { allowed: false, remaining: 0, retryAfter };
      }

      entry.count += 1;
      return { allowed: true, remaining: limit - entry.count };
    }
  };
}

async function parseRequestBody(req) {
  if (req?.body && typeof req.body === 'object') return req.body;
  if (typeof req?.body === 'string' && req.body.trim() !== '') return JSON.parse(req.body);

  if (!req || typeof req.on !== 'function') return {};
  const chunks = [];
  await new Promise((resolve, reject) => {
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', resolve);
    req.on('error', reject);
  });
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, statusCode, payload) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(statusCode).json(payload);
    return;
  }
  res.statusCode = statusCode;
  if (typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }
  if (typeof res.end === 'function') {
    res.end(JSON.stringify(payload));
  }
}

function sendNoContent(res) {
  if (typeof res.status === 'function' && typeof res.end === 'function') {
    res.status(204).end();
    return;
  }
  res.statusCode = 204;
  if (typeof res.end === 'function') {
    res.end();
  }
}

function createRumHandler({
  siteOrigin = 'https://www.fitappliance.com.au',
  rateLimiter = createRateLimiter(),
  nowFn = Date.now,
  storeEvent = async (event) => {
    console.info(`[rum] ${JSON.stringify(event)}`);
  }
} = {}) {
  return async function rumHandler(req, res) {
    if (req?.method !== 'POST') {
      if (typeof res.setHeader === 'function') {
        res.setHeader('Allow', 'POST');
      }
      sendJson(res, 405, { error: 'method_not_allowed' });
      return;
    }

    if (!isSameOriginRequest(req, siteOrigin)) {
      sendJson(res, 403, { error: 'forbidden_origin' });
      return;
    }

    let body;
    try {
      body = await parseRequestBody(req);
    } catch {
      sendJson(res, 400, { error: 'invalid_json' });
      return;
    }

    const payload = sanitizeRumPayload(body);
    if (!payload) {
      sendJson(res, 422, { error: 'invalid_payload' });
      return;
    }

    const fingerprint = getClientFingerprint(req);
    const gate = rateLimiter.check(fingerprint, nowFn());
    if (!gate.allowed) {
      if (typeof res.setHeader === 'function') {
        res.setHeader('Retry-After', String(gate.retryAfter ?? 60));
      }
      sendJson(res, 429, { error: 'rate_limited' });
      return;
    }

    await storeEvent({
      ...payload,
      received_at: nowFn()
    });
    sendNoContent(res);
  };
}

const handler = createRumHandler();

module.exports = handler;
module.exports.createRateLimiter = createRateLimiter;
module.exports.createRumHandler = createRumHandler;
module.exports.isSameOriginRequest = isSameOriginRequest;
module.exports.sanitizeRumPayload = sanitizeRumPayload;
