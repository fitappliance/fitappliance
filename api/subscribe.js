'use strict';

const crypto = require('node:crypto');

const RATE_LIMIT_PER_MINUTE = 10;
const RATE_WINDOW_MS = 60_000;
const BUTTONDOWN_ENDPOINT = 'https://api.buttondown.email/v1/subscribers';

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

function createRateLimiter({ limit = RATE_LIMIT_PER_MINUTE, windowMs = RATE_WINDOW_MS, nowFn = Date.now } = {}) {
  const windows = new Map();
  return {
    check(key) {
      const now = nowFn();
      const current = windows.get(key);
      if (!current || (now - current.windowStart) >= windowMs) {
        windows.set(key, { windowStart: now, count: 1 });
        return { allowed: true, remaining: limit - 1 };
      }

      if (current.count >= limit) {
        const retryAfter = Math.max(1, Math.ceil((windowMs - (now - current.windowStart)) / 1000));
        return { allowed: false, remaining: 0, retryAfter };
      }

      current.count += 1;
      return { allowed: true, remaining: limit - current.count };
    }
  };
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const normalized = email.trim();
  if (normalized === '' || normalized.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
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

async function subscribeWithButtondown({ email, apiKey, source = 'fitappliance.com.au' } = {}) {
  const response = await fetch(BUTTONDOWN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({
      email,
      tags: ['fitappliance'],
      metadata: {
        source
      }
    })
  });

  if (response.ok || response.status === 201 || response.status === 409) {
    // 409 is "already subscribed" and should still be a success path.
    return { ok: true };
  }

  return { ok: false, status: response.status };
}

function createSubscribeHandler({
  siteOrigin = 'https://fitappliance.com.au',
  env = process.env,
  rateLimiter = createRateLimiter(),
  provider = subscribeWithButtondown
} = {}) {
  return async function subscribeHandler(req, res) {
    if (req?.method !== 'POST') {
      if (typeof res.setHeader === 'function') res.setHeader('Allow', 'POST');
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

    const honeypotValue = String(body?.hp_company ?? '').trim();
    if (honeypotValue !== '') {
      sendJson(res, 200, { ok: true });
      return;
    }

    const email = String(body?.email ?? '').trim().toLowerCase();
    if (!isValidEmail(email)) {
      sendJson(res, 422, { error: 'invalid_email' });
      return;
    }

    const apiKey = String(env?.BUTTONDOWN_API_KEY ?? '').trim();
    if (!apiKey) {
      sendJson(res, 500, { error: 'subscription_unavailable' });
      return;
    }

    const fingerprint = getClientFingerprint(req);
    const gate = rateLimiter.check(fingerprint);
    if (!gate.allowed) {
      if (typeof res.setHeader === 'function') {
        res.setHeader('Retry-After', String(gate.retryAfter ?? 60));
      }
      sendJson(res, 429, { error: 'rate_limited' });
      return;
    }

    let outcome;
    try {
      outcome = await provider({
        email,
        apiKey,
        source: String(body?.source ?? '')
      });
    } catch {
      sendJson(res, 500, { error: 'subscription_failed' });
      return;
    }

    if (!outcome?.ok) {
      sendJson(res, 500, { error: 'subscription_failed' });
      return;
    }

    sendJson(res, 200, { ok: true });
  };
}

const handler = createSubscribeHandler();

module.exports = handler;
module.exports.BUTTONDOWN_ENDPOINT = BUTTONDOWN_ENDPOINT;
module.exports.createRateLimiter = createRateLimiter;
module.exports.createSubscribeHandler = createSubscribeHandler;
module.exports.isSameOriginRequest = isSameOriginRequest;
module.exports.isValidEmail = isValidEmail;
module.exports.subscribeWithButtondown = subscribeWithButtondown;
