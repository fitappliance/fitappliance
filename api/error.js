'use strict';

const crypto = require('node:crypto');

const RATE_LIMIT_PER_MINUTE = 30;
const RATE_WINDOW_MS = 60_000;
const MAX_STACK_FRAMES = 5;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;

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

function hashClientToken(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] ?? req?.headers?.['x-real-ip'] ?? 'unknown');
  const ipToken = forwarded.split(',')[0].trim() || 'unknown';
  const ua = String(req?.headers?.['user-agent'] ?? '').slice(0, 120);
  return crypto.createHash('sha256').update(`${ipToken}|${ua}`).digest('hex').slice(0, 24);
}

function redactSensitiveText(value) {
  return String(value ?? '')
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(PHONE_RE, '[redacted-phone]');
}

function stripUrlQueryAndHash(value) {
  try {
    const input = String(value ?? '').trim();
    if (!input) return '';
    const url = input.startsWith('http://') || input.startsWith('https://')
      ? new URL(input)
      : new URL(input, 'https://www.fitappliance.com.au');
    return `${url.origin}${url.pathname}`;
  } catch {
    return String(value ?? '').split('#')[0].split('?')[0];
  }
}

function sanitizeStack(stackValue) {
  return String(stackValue ?? '')
    .split('\n')
    .map((line) => redactSensitiveText(stripUrlQueryAndHash(line)))
    .filter(Boolean)
    .slice(0, MAX_STACK_FRAMES)
    .join('\n');
}

function sanitizeErrorPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const message = redactSensitiveText(payload.message || 'Error').slice(0, 500);
  const source = stripUrlQueryAndHash(payload.source || '/').slice(0, 300);
  const line = Number(payload.line ?? 0);
  const col = Number(payload.col ?? 0);
  const stack = sanitizeStack(payload.stack);

  if (!message || !source || !Number.isFinite(line) || line < 0 || !Number.isFinite(col) || col < 0) {
    return null;
  }

  return {
    message,
    source,
    line: Math.floor(line),
    col: Math.floor(col),
    stack,
    ts: Date.now()
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
        return { allowed: false, retryAfter };
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

function createErrorHandler({
  siteOrigin = 'https://www.fitappliance.com.au',
  rateLimiter = createRateLimiter(),
  storeEvent = async (event) => {
    console.info(`[error] ${JSON.stringify(event)}`);
  }
} = {}) {
  return async function errorHandler(req, res) {
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

    const payload = sanitizeErrorPayload(body);
    if (!payload) {
      sendJson(res, 422, { error: 'invalid_payload' });
      return;
    }

    const key = hashClientToken(req);
    const gate = rateLimiter.check(key);
    if (!gate.allowed) {
      if (typeof res.setHeader === 'function') {
        res.setHeader('Retry-After', String(gate.retryAfter ?? 60));
      }
      sendJson(res, 429, { error: 'rate_limited' });
      return;
    }

    await storeEvent(payload);
    sendNoContent(res);
  };
}

const handler = createErrorHandler();

module.exports = handler;
module.exports.createErrorHandler = createErrorHandler;
module.exports.createRateLimiter = createRateLimiter;
module.exports.sanitizeErrorPayload = sanitizeErrorPayload;
module.exports.isSameOriginRequest = isSameOriginRequest;
module.exports.redactSensitiveText = redactSensitiveText;
