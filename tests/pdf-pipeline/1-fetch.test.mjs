import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fetchPdf } from '../../scripts/pdf-pipeline/1-fetch.js';

test('pdf pipeline fetch: downloads a PDF response to disk', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-pdf-fetch-'));
  const dest = path.join(tmp, 'manual.pdf');
  let called = 0;

  await fetchPdf('https://example.test/manual.pdf', dest, {
    fetchImpl: async (url, init) => {
      called += 1;
      assert.equal(url, 'https://example.test/manual.pdf');
      assert.match(init.headers['User-Agent'], /FitApplianceBot/);
      return new Response(Buffer.from('%PDF-1.4 fixture'), {
        status: 200,
        headers: { 'content-type': 'application/pdf' }
      });
    }
  });

  assert.equal(called, 1);
  assert.equal(fs.readFileSync(dest, 'utf8'), '%PDF-1.4 fixture');
});

test('pdf pipeline fetch: rejects non-PDF content types', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-pdf-fetch-'));
  const dest = path.join(tmp, 'manual.pdf');

  await assert.rejects(() => fetchPdf('https://example.test/not-pdf', dest, {
    fetchImpl: async () => new Response('html', {
      status: 200,
      headers: { 'content-type': 'text/html' }
    })
  }), /content-type/i);
});

test('pdf pipeline fetch: uses cache unless force is enabled', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-pdf-fetch-'));
  const dest = path.join(tmp, 'manual.pdf');
  fs.writeFileSync(dest, 'cached');

  const result = await fetchPdf('https://example.test/manual.pdf', dest, {
    fetchImpl: async () => {
      throw new Error('should not fetch cached file');
    }
  });

  assert.equal(result.cached, true);
  assert.equal(fs.readFileSync(dest, 'utf8'), 'cached');
});

test('pdf pipeline fetch: retries transient server errors', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-pdf-fetch-'));
  const dest = path.join(tmp, 'manual.pdf');
  let attempts = 0;

  await fetchPdf('https://example.test/manual.pdf', dest, {
    retryDelayMs: 1,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts < 3) {
        return new Response('busy', { status: 503, headers: { 'content-type': 'text/plain' } });
      }
      return new Response(Buffer.from('%PDF ok'), {
        status: 200,
        headers: { 'content-type': 'application/pdf' }
      });
    }
  });

  assert.equal(attempts, 3);
});

