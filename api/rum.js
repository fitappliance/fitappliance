'use strict';

// Anonymous RUM intake guardrails:
// - 4KB max JSON payload before parsing.
// - 60 requests/IP burst capacity, refilling at 1 request/second.
// - Token buckets are in-memory per edge/runtime instance, so distributed abuse can scale
//   by the number of active edges. Upgrade to Vercel KV if traffic needs global limiting.

const { createTokenBucketLimiter } = require('./_lib/ratelimit.js');

const ALLOWED_METRICS = new Set(['LCP', 'INP', 'CLS', 'TTFB']);
const MAX_BODY_BYTES = 4096;

class PayloadTooLargeError extends Error {
  constructor() {
    super('payload_too_large');
    this.code = 'payload_too_large';
  }
}

function getHeaderValue(headers, key) {
  if (!headers) return '';
  if (typeof headers.get === 'function') {
    return headers.get(key) ?? headers.get(key.toLowerCase()) ?? '';
  }
  return headers[key] ?? headers[key.toLowerCase()] ?? '';
}

function assertBodySizeWithinLimit(byteLength, maxBytes = MAX_BODY_BYTES) {
  if (Number(byteLength) > maxBytes) {
    throw new PayloadTooLargeError();
  }
}

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

function getClientIp(req) {
  const forwarded = String(
    getHeaderValue(req?.headers, 'x-forwarded-for') ||
    getHeaderValue(req?.headers, 'x-real-ip') ||
    'unknown'
  );
  const ipToken = forwarded.split(',')[0].trim() || 'unknown';
  return ipToken;
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

async function parseRequestBody(req) {
  const contentLength = Number(getHeaderValue(req?.headers, 'content-length'));
  if (Number.isFinite(contentLength)) {
    assertBodySizeWithinLimit(contentLength);
  }

  if (req?.body && typeof req.body === 'object') return req.body;
  if (typeof req?.body === 'string' && req.body.trim() !== '') {
    assertBodySizeWithinLimit(Buffer.byteLength(req.body, 'utf8'));
    return JSON.parse(req.body);
  }

  if (!req || typeof req.on !== 'function') return {};
  const chunks = [];
  let totalBytes = 0;
  await new Promise((resolve, reject) => {
    req.on('data', (chunk) => {
      const buffer = Buffer.from(chunk);
      totalBytes += buffer.length;
      try {
        assertBodySizeWithinLimit(totalBytes);
      } catch (error) {
        reject(error);
        return;
      }
      chunks.push(buffer);
    });
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
  nowFn = Date.now,
  rateLimiter = createTokenBucketLimiter({
    capacity: 60,
    refillPerSec: 1,
    maxKeys: 100,
    nowFn
  }),
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
    } catch (error) {
      if (error?.code === 'payload_too_large') {
        sendJson(res, 413, { ok: false, error: 'payload_too_large' });
        return;
      }
      sendJson(res, 400, { error: 'invalid_json' });
      return;
    }

    const payload = sanitizeRumPayload(body);
    if (!payload) {
      sendJson(res, 422, { error: 'invalid_payload' });
      return;
    }

    const clientIp = getClientIp(req);
    const gate = rateLimiter.check(clientIp);
    if (!gate.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil(Number(gate.retryAfterSec ?? 1)));
      if (typeof res.setHeader === 'function') {
        res.setHeader('Retry-After', String(retryAfterSec));
      }
      sendJson(res, 429, { ok: false, error: 'rate_limited', retry_after_sec: retryAfterSec });
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
module.exports.createRateLimiter = createTokenBucketLimiter;
module.exports.createTokenBucketLimiter = createTokenBucketLimiter;
module.exports.createRumHandler = createRumHandler;
module.exports.getClientIp = getClientIp;
module.exports.getHeaderValue = getHeaderValue;
module.exports.isSameOriginRequest = isSameOriginRequest;
module.exports.sanitizeRumPayload = sanitizeRumPayload;
