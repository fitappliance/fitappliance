import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createRateLimiter,
  createSubscribeHandler
} = require('../api/subscribe.js');

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end(payload = null) {
      this.body = payload;
      return this;
    }
  };
}

function buildRequest(overrides = {}) {
  return {
    method: 'POST',
    headers: {
      origin: 'https://www.fitappliance.com.au',
      referer: 'https://www.fitappliance.com.au/guides/fridge-clearance-requirements',
      'x-forwarded-for': '203.0.113.9'
    },
    body: {
      email: 'alex@example.com',
      hp_company: ''
    },
    ...overrides
  };
}

test('phase 32 subscribe: non-POST method returns 405', async () => {
  const handler = createSubscribeHandler({
    provider: async () => ({ ok: true })
  });
  const req = buildRequest({ method: 'GET' });
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.body?.error, 'method_not_allowed');
});

test('phase 32 subscribe: cross-origin request returns 403', async () => {
  const handler = createSubscribeHandler({
    provider: async () => ({ ok: true })
  });
  const req = buildRequest({
    headers: {
      origin: 'https://evil.example.com',
      'x-forwarded-for': '203.0.113.9'
    }
  });
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.error, 'forbidden_origin');
});

test('phase 32 subscribe: missing email returns 422', async () => {
  const handler = createSubscribeHandler({
    provider: async () => ({ ok: true })
  });
  const req = buildRequest({
    body: { hp_company: '' }
  });
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 422);
  assert.equal(res.body?.error, 'invalid_email');
});

test('phase 32 subscribe: missing BUTTONDOWN_API_KEY returns 500 without leaking payload', async () => {
  const handler = createSubscribeHandler({
    env: {},
    provider: async () => ({ ok: true })
  });
  const req = buildRequest();
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body?.error, 'subscription_unavailable');
  assert.ok(!JSON.stringify(res.body).includes('alex@example.com'));
});

test('phase 32 subscribe: rate limit exceeded returns 429', async () => {
  let now = 10_000;
  const rateLimiter = createRateLimiter({
    limit: 10,
    windowMs: 60_000,
    nowFn: () => now
  });
  const handler = createSubscribeHandler({
    env: { BUTTONDOWN_API_KEY: 'bd-secret' },
    rateLimiter,
    provider: async () => ({ ok: true })
  });

  for (let index = 0; index < 10; index += 1) {
    const res = createMockResponse();
    await handler(buildRequest(), res);
    assert.equal(res.statusCode, 200);
  }

  const overflowRes = createMockResponse();
  await handler(buildRequest(), overflowRes);
  assert.equal(overflowRes.statusCode, 429);
  assert.equal(overflowRes.body?.error, 'rate_limited');
});

test('phase 32 subscribe: success path returns 200 and does not echo email', async () => {
  const calls = [];
  const handler = createSubscribeHandler({
    env: { BUTTONDOWN_API_KEY: 'bd-secret' },
    provider: async ({ email, apiKey }) => {
      calls.push({ email, apiKey });
      return { ok: true };
    }
  });
  const req = buildRequest();
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.deepEqual(calls, [{ email: 'alex@example.com', apiKey: 'bd-secret' }]);
});
