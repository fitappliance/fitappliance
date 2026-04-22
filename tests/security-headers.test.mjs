import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadRootHeaders() {
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));
  const rule = (config.headers ?? []).find((row) => row.source === '/(.*)');
  assert.ok(rule, 'missing /(.*) headers rule');
  return Object.fromEntries((rule.headers ?? []).map((header) => [header.key, header.value]));
}

test('phase 43a quick wins: root headers include CSP with youtube-nocookie and i.ytimg allowances', () => {
  const headers = loadRootHeaders();
  const csp = headers['Content-Security-Policy'];

  assert.ok(csp, 'missing Content-Security-Policy header');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-src[^;]*https:\/\/www\.youtube-nocookie\.com/);
  assert.match(csp, /img-src[^;]*https:\/\/i\.ytimg\.com/);
  assert.match(csp, /style-src[^;]*'unsafe-inline'/);
});

test('phase 43a quick wins: root headers deny framing and preserve secure sniff/referrer defaults', () => {
  const headers = loadRootHeaders();

  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
});
