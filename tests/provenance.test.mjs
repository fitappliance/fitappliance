import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const provenanceUrl = pathToFileURL(path.join(repoRoot, 'public', 'scripts', 'ui', 'provenance.js')).href;

async function loadModule() {
  return import(`${provenanceUrl}?cacheBust=${Date.now()}`);
}

test('loadEvidenceIndex fetches and normalizes the runtime products map', async () => {
  const { loadEvidenceIndex } = await loadModule();
  const index = await loadEvidenceIndex(async (url) => ({
    ok: true,
    url,
    async json() {
      return { products: { 'fridge-1': { status: 'verified' } } };
    }
  }));

  assert.deepEqual(index, { 'fridge-1': { status: 'verified' } });
});

test('loadEvidenceIndex degrades to an empty object on fetch errors', async () => {
  const { loadEvidenceIndex } = await loadModule();
  const index = await loadEvidenceIndex(async () => {
    throw new Error('network down');
  });

  assert.deepEqual(index, {});
});

test('renderProvenanceBlock renders verified manufacturer PDF state', async () => {
  const { renderProvenanceBlock } = await loadModule();
  const html = renderProvenanceBlock({
    id: 'fridge-1',
    fitDecision: { outcome: 'VERIFIED_FIT' },
    geometry_v2_provenance: { evidenceLevel: 'verified' },
  }, {
    'fridge-1': {
      status: 'verified',
      has_pdf_evidence: true,
      trust_level: 'verified_fit',
      verified_fields: ['dimensions', 'clearance'],
      clearance_verified: true,
      source_url: 'https://example.com/spec.pdf',
      verified_at: '2026-05-07'
    }
  });

  assert.match(html, /provenance-block--verified/);
  assert.match(html, /Verified Fit/);
  assert.match(html, /Official PDF/);
  assert.match(html, /verified 2026-05-07/);
  assert.match(html, /rel="noopener"/);
});

test('renderProvenanceBlock separates dimension-only PDF evidence from Verified Fit', async () => {
  const { renderProvenanceBlock } = await loadModule();
  const html = renderProvenanceBlock({
    id: 'fridge-1', geometry_v2_provenance: { evidenceLevel: 'dimensions' },
  }, {
    'fridge-1': {
      status: 'verified',
      has_pdf_evidence: true,
      trust_level: 'dimensions_verified',
      verified_fields: ['dimensions'],
      clearance_verified: false,
      source_url: 'https://example.com/spec.pdf',
      verified_at: '2026-05-07'
    }
  });

  assert.match(html, /provenance-block--dimensions/);
  assert.match(html, /Dimensions verified/);
  assert.match(html, /clearance estimated/);
  assert.doesNotMatch(html, /Verified Fit/);
});

test('renderProvenanceBlock treats legacy verified labels as pending without geometry receipts', async () => {
  const { renderProvenanceBlock } = await loadModule();
  const html = renderProvenanceBlock({ id: 'legacy' }, {
    legacy: { status: 'verified', has_pdf_evidence: true, trust_level: 'verified_fit' },
  });
  assert.match(html, /Evidence pending/);
  assert.doesNotMatch(html, /Verified Fit/);
});

test('renderProvenanceBlock labels retailer specification evidence explicitly', async () => {
  const { renderProvenanceBlock } = await loadModule();
  const html = renderProvenanceBlock({ id: 'fridge-1' }, {
    'fridge-1': {
      status: 'verified',
      has_pdf_evidence: false,
      trust_level: 'retailer_spec',
      verified_fields: ['dimensions'],
      clearance_verified: false,
      source_url: 'https://www.appliancesonline.com.au/product/example',
      verified_at: '2026-05-07'
    }
  });

  assert.match(html, /provenance-block--retailer/);
  assert.match(html, /Retailer dimensions/);
  assert.doesNotMatch(html, /Verified Fit/);
});

test('renderProvenanceBlock renders pending and fallback states', async () => {
  const { renderProvenanceBlock } = await loadModule();

  assert.match(
    renderProvenanceBlock({ id: 'dryer-1' }, { 'dryer-1': { status: 'pending' } }),
    /field-level receipt verification pending/
  );
  assert.match(
    renderProvenanceBlock({ id: 'unknown' }, {}),
    /Retailer dimensions/
  );
});

test('renderProvenanceBlock escapes unsafe source content', async () => {
  const { renderProvenanceBlock } = await loadModule();
  const html = renderProvenanceBlock({ id: 'x' }, {
    x: {
      status: 'verified',
      has_pdf_evidence: true,
      source_url: 'javascript:alert(1)',
      verified_at: '<img onerror=alert(1)>'
    }
  });

  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /onerror/i);
  assert.match(html, /Evidence pending/);
});
