import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  getProductProvenance,
  renderProvenanceBlock,
  loadEvidenceIndex
} = await import(`file://${path.join(repoRoot, 'public', 'scripts', 'ui', 'provenance.js')}`);

test('getProductProvenance returns a matching product entry only', () => {
  const index = {
    'fridge-test': {
      verified: true,
      pdfUrl: 'https://example.com/manual.pdf',
      extractedAt: '2026-05-04',
      source: 'installation_manual'
    }
  };

  assert.equal(getProductProvenance('fridge-test', index).pdfUrl, 'https://example.com/manual.pdf');
  assert.equal(getProductProvenance('missing', index), null);
});

test('renderProvenanceBlock renders verified official PDF provenance', () => {
  const html = renderProvenanceBlock(
    { id: 'fridge-test', brand: 'Hisense', model: 'HRTF206' },
    {
      'fridge-test': {
        verified: true,
        pdfUrl: 'https://example.com/spec.pdf',
        extractedAt: '2026-05-04',
        source: 'spec_sheet'
      }
    }
  );

  assert.match(html, /data-provenance--verified/);
  assert.match(html, /Verified against official PDF/);
  assert.match(html, /href="https:\/\/example\.com\/spec\.pdf"/);
  assert.match(html, /4 May 2026/);
});

test('renderProvenanceBlock renders pending and fallback states without unsafe links', () => {
  const pending = renderProvenanceBlock(
    { id: 'washer-test', brand: '<img onerror=alert(1)>', model: 'X' },
    {
      'washer-test': {
        verified: false,
        pdfUrl: 'javascript:alert(1)',
        extractedAt: '2026-05-04',
        source: 'manual'
      }
    }
  );
  const fallback = renderProvenanceBlock({ id: 'missing', brand: 'LG', model: 'A' }, {});

  assert.match(pending, /data-provenance--pending/);
  assert.doesNotMatch(pending, /onerror|javascript:/);
  assert.match(fallback, /data-provenance--fallback/);
  assert.match(fallback, /Retailer or catalog spec/);
});

test('loadEvidenceIndex caches successful fetches and returns empty object on failure', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => ({ 'fridge-test': { verified: true } })
    };
  };

  const first = await loadEvidenceIndex(fetchImpl, { forceRefresh: true });
  const second = await loadEvidenceIndex(fetchImpl);
  assert.equal(first['fridge-test'].verified, true);
  assert.deepEqual(second, first);
  assert.equal(calls, 1);

  const failed = await loadEvidenceIndex(async () => ({ ok: false }), { forceRefresh: true });
  assert.deepEqual(failed, {});
});
