import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rumScriptPath = path.join(repoRoot, 'public', 'scripts', 'rum.js');
const apiPath = path.join(repoRoot, 'api', 'rum.js');
const require = createRequire(import.meta.url);

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

function makeRumBodyOfSize(size) {
  const basePayload = {
    metric: 'LCP',
    value: 1234,
    path: '/',
    ts: 1_000_000,
    ua: ''
  };
  const withoutUa = JSON.stringify(basePayload);
  const marker = '"ua":""';
  const markerIndex = withoutUa.indexOf(marker);
  assert.ok(markerIndex > -1, 'test payload should contain ua marker');
  const prefix = withoutUa.slice(0, markerIndex);
  const suffix = withoutUa.slice(markerIndex + marker.length);
  const overhead = Buffer.byteLength(`${prefix}"ua":""${suffix}`);
  const targetUaBytes = size - overhead;
  assert.ok(targetUaBytes >= 0, `payload size ${size} too small for fixture`);
  const body = `${prefix}"ua":"${'a'.repeat(targetUaBytes)}"${suffix}`;
  assert.equal(Buffer.byteLength(body), size);
  return body;
}

test('phase 26 rum: client script uses 10% sampling, sendBeacon, and no cookie/localStorage access', () => {
  const source = fs.readFileSync(rumScriptPath, 'utf8');
  assert.match(source, /SAMPLE_RATE\s*=\s*0\.1/);
  assert.match(source, /sendBeacon/);
  assert.match(source, /['"]\/api\/rum['"]/);
  assert.doesNotMatch(source, /document\.cookie/);
  assert.doesNotMatch(source, /localStorage/);
});

test('phase 26 rum: API rejects non-POST requests', async () => {
  const { createRumHandler } = require(apiPath);
  const handler = createRumHandler();
  const req = { method: 'GET', headers: {} };
  const res = createMockResponse();

  await handler(req, res);
  assert.equal(res.statusCode, 405);
});

test('phase 26 rum: payload validator accepts clean payload and strips query from path', () => {
  const { sanitizeRumPayload } = require(apiPath);
  const payload = sanitizeRumPayload({
    metric: 'LCP',
    value: 1825,
    path: '/cavity/600mm-fridge?utm_source=test',
    ts: Date.now(),
    ua: 'Mozilla/5.0 very-long'
  });

  assert.ok(payload, 'expected payload to be valid');
  assert.equal(payload.metric, 'LCP');
  assert.equal(payload.path, '/cavity/600mm-fridge');
  assert.equal(typeof payload.value, 'number');
  assert.ok(!('ip' in payload));
});

test('phase 26 rum: API rate-limits after 60 requests/minute per client fingerprint', async () => {
  const { createRumHandler } = require(apiPath);
  let now = 1_000_000;
  const handler = createRumHandler({
    nowFn: () => now,
    storeEvent: async () => {}
  });

  for (let index = 0; index < 60; index += 1) {
    const req = {
      method: 'POST',
      headers: {
        origin: 'https://www.fitappliance.com.au',
        'x-forwarded-for': '203.0.113.9'
      },
      body: {
        metric: 'LCP',
        value: 1000 + index,
        path: '/tools/fit-checker',
        ts: now + index,
        ua: 'Mozilla/5.0'
      }
    };
    const res = createMockResponse();
    await handler(req, res);
    assert.equal(res.statusCode, 204, `request ${index + 1} should pass`);
  }

  const overflowReq = {
    method: 'POST',
    headers: {
      origin: 'https://www.fitappliance.com.au',
      'x-forwarded-for': '203.0.113.9'
    },
    body: {
      metric: 'LCP',
      value: 2000,
      path: '/tools/fit-checker',
      ts: now + 61,
      ua: 'Mozilla/5.0'
    }
  };
  const overflowRes = createMockResponse();
  await handler(overflowReq, overflowRes);
  assert.equal(overflowRes.statusCode, 429);
});

test('phase 43a rum: rejects POST bodies larger than 4KB before accepting payload', async () => {
  const { createRumHandler } = require(apiPath);
  const handler = createRumHandler({ storeEvent: async () => {} });
  const req = {
    method: 'POST',
    headers: {
      origin: 'https://www.fitappliance.com.au',
      'x-forwarded-for': '203.0.113.10',
      'content-length': '4097'
    },
    body: makeRumBodyOfSize(4097)
  };
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 413);
  assert.deepEqual(res.body, { ok: false, error: 'payload_too_large' });
});

test('phase 43a rum: accepts POST body at the 4KB boundary', async () => {
  const { createRumHandler } = require(apiPath);
  const handler = createRumHandler({ storeEvent: async () => {} });
  const req = {
    method: 'POST',
    headers: {
      origin: 'https://www.fitappliance.com.au',
      'x-forwarded-for': '203.0.113.11',
      'content-length': '4096'
    },
    body: makeRumBodyOfSize(4096)
  };
  const res = createMockResponse();

  await handler(req, res);

  assert.ok([200, 202, 204].includes(res.statusCode), `expected accepted response, got ${res.statusCode}`);
});

test('phase 43a rum: accepts ordinary 1KB POST body', async () => {
  const { createRumHandler } = require(apiPath);
  const handler = createRumHandler({ storeEvent: async () => {} });
  const req = {
    method: 'POST',
    headers: {
      origin: 'https://www.fitappliance.com.au',
      'x-forwarded-for': '203.0.113.12',
      'content-length': '1024'
    },
    body: makeRumBodyOfSize(1024)
  };
  const res = createMockResponse();

  await handler(req, res);

  assert.ok([200, 202, 204].includes(res.statusCode), `expected accepted response, got ${res.statusCode}`);
});
