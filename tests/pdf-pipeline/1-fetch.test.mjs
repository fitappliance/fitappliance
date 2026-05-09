import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_TIMEOUT_MS,
  fetchPdf,
  findManualEvidenceSourceUrl,
  resolvePdfSourceUrl
} from '../../scripts/pdf-pipeline/1-fetch.js';

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

test('pdf pipeline fetch: defaults to a 60 second timeout for slow manufacturer PDFs', () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 60_000);
});

test('pdf pipeline fetch: accepts LG octet-stream downloads when bytes are a PDF', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-pdf-fetch-'));
  const dest = path.join(tmp, 'lg-manual.pdf');

  await fetchPdf('https://example.test/lg-download', dest, {
    fetchImpl: async () => new Response(Buffer.from('%PDF-1.4 lg fixture'), {
      status: 200,
      headers: { 'content-type': 'application/octet-stream;charset=utf-8' }
    })
  });

  assert.equal(fs.readFileSync(dest, 'utf8'), '%PDF-1.4 lg fixture');
});

test('pdf pipeline fetch: rejects octet-stream downloads without PDF magic bytes', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-pdf-fetch-'));
  const dest = path.join(tmp, 'not-pdf.pdf');

  await assert.rejects(() => fetchPdf('https://example.test/lg-bad-download', dest, {
    fetchImpl: async () => new Response(Buffer.from('<html>not a pdf</html>'), {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' }
    })
  }), /pdf magic/i);

  assert.equal(fs.existsSync(dest), false);
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

test('pdf pipeline fetch: rejects PDFs larger than the configured byte limit from content-length', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-pdf-fetch-'));
  const dest = path.join(tmp, 'manual.pdf');

  await assert.rejects(() => fetchPdf('https://example.test/huge.pdf', dest, {
    maxBytes: 12,
    fetchImpl: async () => new Response(Buffer.from('%PDF too large'), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': '4096'
      }
    })
  }), /exceeds.*12 bytes/i);

  assert.equal(fs.existsSync(dest), false);
});

test('pdf pipeline fetch: rejects PDFs larger than the configured byte limit while streaming', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-pdf-fetch-'));
  const dest = path.join(tmp, 'manual.pdf');

  await assert.rejects(() => fetchPdf('https://example.test/large-stream.pdf', dest, {
    maxBytes: 8,
    fetchImpl: async () => new Response(Buffer.from('%PDF stream exceeds limit'), {
      status: 200,
      headers: { 'content-type': 'application/pdf' }
    })
  }), /exceeds.*8 bytes/i);

  assert.equal(fs.existsSync(dest), false);
});

test('pdf pipeline fetch: aborts when the request exceeds timeoutMs', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-pdf-fetch-'));
  const dest = path.join(tmp, 'manual.pdf');

  await assert.rejects(() => fetchPdf('https://example.test/slow.pdf', dest, {
    retries: 1,
    timeoutMs: 5,
    fetchImpl: async (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('fetch aborted by timeout')));
    })
  }), /timeout/i);
});

test('pdf pipeline fetch: resolves manual-evidence source_url by product id before search', async () => {
  const target = { id: 'fridge-arf2887', brand: 'Fisher & Paykel', sku: 'RF605QDVX2' };
  const manualEvidence = {
    products: {
      'fridge-arf2887': {
        evidence: [
          {
            type: 'spec_sheet',
            status: 'candidate',
            source_url: 'https://example.com/RF605QDVX2.pdf'
          }
        ]
      }
    }
  };

  assert.equal(
    findManualEvidenceSourceUrl(target, manualEvidence),
    'https://example.com/RF605QDVX2.pdf'
  );

  const result = await resolvePdfSourceUrl(target, {
    manualEvidence,
    searchPdf: async () => {
      throw new Error('search should not be called for manual evidence');
    }
  });

  assert.deepEqual(result, {
    sourceUrl: 'https://example.com/RF605QDVX2.pdf',
    source: 'manual-evidence'
  });
});

test('pdf pipeline fetch: resolves manual-evidence source_url by SKU when product id is unavailable', async () => {
  const target = { brand: 'Fisher & Paykel', sku: 'RF522ADX6' };
  const manualEvidence = {
    products: {
      'fridge-arf3570': {
        brand: 'Fisher & Paykel',
        model: 'RF522ADX6',
        evidence: [
          {
            type: 'installation_manual',
            status: 'candidate',
            source_url: 'https://example.com/RF522ADX6-install.pdf'
          }
        ]
      }
    }
  };

  assert.equal(
    findManualEvidenceSourceUrl(target, manualEvidence),
    'https://example.com/RF522ADX6-install.pdf'
  );
});

test('pdf pipeline fetch: ignores rejected manual evidence and falls back to search', async () => {
  const target = { id: 'fridge-arf3548', brand: 'Fisher & Paykel', sku: 'RF610ADX5' };
  const manualEvidence = {
    products: {
      'fridge-arf3548': {
        evidence: [
          {
            type: 'spec_sheet',
            status: 'rejected',
            source_url: 'https://example.com/rejected.pdf'
          }
        ]
      }
    }
  };

  const result = await resolvePdfSourceUrl(target, {
    manualEvidence,
    searchPdf: async (searchTarget) => {
      assert.equal(searchTarget.sku, 'RF610ADX5');
      return 'https://example.com/search-result.pdf';
    }
  });

  assert.deepEqual(result, {
    sourceUrl: 'https://example.com/search-result.pdf',
    source: 'search'
  });
});

test('pdf pipeline fetch: accepts official quick reference guide evidence as a usable PDF source', async () => {
  const target = { id: 'fridge-arf3548', brand: 'Fisher & Paykel', sku: 'RF610ADX5' };
  const manualEvidence = {
    products: {
      'fridge-arf3548': {
        evidence: [
          {
            type: 'quick_reference_guide',
            status: 'candidate',
            source_url: 'https://example.com/QRG-AU-26504.pdf'
          }
        ]
      }
    }
  };

  const result = await resolvePdfSourceUrl(target, {
    manualEvidence,
    searchPdf: async () => {
      throw new Error('search should not run for a seeded QRG source');
    }
  });

  assert.deepEqual(result, {
    sourceUrl: 'https://example.com/QRG-AU-26504.pdf',
    source: 'manual-evidence'
  });
});
