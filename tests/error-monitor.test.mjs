import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const repoRoot = '/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2';
const require = createRequire(import.meta.url);

const errorApi = require(path.join(repoRoot, 'api', 'error.js'));
const { aggregateErrorEvents } = require(path.join(repoRoot, 'scripts', 'aggregate-errors.js'));
const { buildIssueActions } = require(path.join(repoRoot, 'scripts', 'open-error-issue.js'));

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

test('phase 36 error monitor: sanitize removes query and fragment from source URL', () => {
  const payload = errorApi.sanitizeErrorPayload({
    message: 'Script failed',
    source: 'https://fitappliance.com.au/tools/fit-checker?token=abc#user=foo',
    line: 41,
    col: 9,
    stack: 'Error: Script failed\n at https://fitappliance.com.au/tools/fit-checker?token=abc#x:41:9'
  });

  assert.equal(payload.source, 'https://fitappliance.com.au/tools/fit-checker');
  assert.equal(payload.stack.includes('?token='), false);
  assert.equal(payload.stack.includes('#user='), false);
});

test('phase 36 error monitor: email and phone-like strings are redacted', () => {
  const payload = errorApi.sanitizeErrorPayload({
    message: 'Contact me at user@example.com or +61 412 345 678',
    source: '/tools/fit-checker',
    line: 12,
    col: 7,
    stack: 'Error: user@example.com +61 412 345 678\n at /tools/fit-checker:12:7'
  });

  assert.equal(payload.message.includes('user@example.com'), false);
  assert.equal(payload.message.includes('[redacted-email]'), true);
  assert.equal(payload.message.includes('[redacted-phone]'), true);
});

test('phase 36 error monitor: same signature repeated 100 times aggregates to one bucket', () => {
  const events = Array.from({ length: 100 }).map((_, index) => ({
    message: 'TypeError: x is undefined',
    source: 'https://fitappliance.com.au/scripts/error-beacon.js',
    line: 55,
    col: 10,
    stack: 'TypeError\n at https://fitappliance.com.au/scripts/error-beacon.js:55:10',
    ts: 1710000000000 + index
  }));

  const report = aggregateErrorEvents(events);
  assert.equal(report.signatures.length, 1);
  assert.equal(report.signatures[0].count, 100);
});

test('phase 36 error monitor: closed issue recurring within 6 days triggers reopen action', () => {
  const signatures = [{
    signature: 'abc123',
    count: 7,
    firstSeen: '2026-04-12T00:00:00.000Z',
    lastSeen: '2026-04-18T00:00:00.000Z',
    sampleStack: 'Error\n at /scripts/error-beacon.js:55:10',
    message: 'TypeError: x is undefined',
    source: 'https://fitappliance.com.au/scripts/error-beacon.js',
    line: 55
  }];

  const actions = buildIssueActions({
    signatures,
    existingIssues: [{
      number: 42,
      state: 'closed',
      title: '[auto-error] abc123 TypeError: x is undefined',
      labels: ['auto-error'],
      closedAt: '2026-04-14T00:00:00.000Z',
      body: 'signature:abc123'
    }],
    nowIso: '2026-04-18T00:00:00.000Z'
  });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'reopen');
  assert.equal(actions[0].issueNumber, 42);
});

test('phase 36 error monitor: api rejects non-POST with 405', async () => {
  const handler = errorApi.createErrorHandler({
    storeEvent: async () => {}
  });
  const req = { method: 'GET', headers: {} };
  const res = createMockResponse();

  await handler(req, res);
  assert.equal(res.statusCode, 405);
});
