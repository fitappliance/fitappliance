import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  extractClaimsFromHtml,
  extractClaimsFromPdfText,
  verifyAndAttestResolutionArtifact,
  verifyAttestedResolutionArtifact,
} from '../../src/domain/evidence-artifact-verifier.mjs';
import {
  containsExactModel,
  validateClaimSemantics,
  validateClaimsSemantics,
} from '../../src/domain/evidence-claim-semantics.mjs';

const identity = { brand: 'Westinghouse', model: 'WHE6874BA', category: 'fridge' };

function html(model = 'WHE6874BA') {
  return Buffer.from(`<!doctype html><html><head>
    <title>609L refrigerator - ${model} | Westinghouse Australia</title>
    <link rel="canonical" href="https://www.westinghouse.com.au/fridges/${model.toLowerCase()}/">
  </head><body data-product-model="${model}">
    <dl><dt>Total width (mm)</dt><dd>913 mm</dd>
      <dt>Total height (mm)</dt><dd>1782 mm</dd>
      <dt>Total depth (mm)</dt><dd>803 mm</dd>
      <dt>Depth door open 90 degree (mm)</dt><dd>1189 mm</dd>
      <dt>Air space above cabinet (mm)</dt><dd>25 mm</dd>
      <dt>Plumbed water supply required</dt><dd>Yes</dd></dl>
  </body></html>`);
}

function source(bytes, overrides = {}) {
  const hash = createHash('sha256').update(bytes).digest('hex');
  return {
    authority: 'manufacturer',
    sourceType: 'official_exact_model_product_page',
    sourceUrl: 'https://www.westinghouse.com.au/fridges/whe6874ba/',
    finalUrl: 'https://www.westinghouse.com.au/fridges/whe6874ba/',
    redirectChain: [],
    retrievedAt: '2026-07-11T14:30:00.000Z',
    contentSha256: hash,
    objectPath: `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.html`,
    contentType: 'text/html',
    byteSize: bytes.length,
    identity: { brand: 'Westinghouse', model: 'WHE6874BA', outcome: 'exact' },
    claims: [
      { field: 'closedEnvelope.widthMm', value: 913, unit: 'mm', label: 'Total width (mm)', quote: 'Total width (mm) 913 mm' },
      { field: 'closedEnvelope.heightMm', value: 1782, unit: 'mm', label: 'Total height (mm)', quote: 'Total height (mm) 1782 mm' },
      { field: 'closedEnvelope.depthMm', value: 803, unit: 'mm', label: 'Total depth (mm)', quote: 'Total depth (mm) 803 mm' },
      { field: 'operation.doorOpenDepthMm', value: 1189, unit: 'mm', label: 'Depth door open 90 degree (mm)', quote: 'Depth door open 90 degree (mm) 1189 mm' },
      { field: 'installation.topMm', value: 25, unit: 'mm', label: 'Air space above cabinet (mm)', quote: 'Air space above cabinet (mm) 25 mm' },
      { field: 'flags.requiresPlumbing', value: true, unit: 'boolean', label: 'Plumbed water supply required', quote: 'Plumbed water supply required Yes' },
    ],
    ...overrides,
  };
}

test('exact model matching does not accept longer, prefixed, or suffixed models', () => {
  assert.equal(containsExactModel('Model WHE6874BA', 'WHE6874BA'), true);
  assert.equal(containsExactModel('Model WHE6874BA-R', 'WHE6874BA'), false);
  assert.equal(containsExactModel('Model XWHE6874BA', 'WHE6874BA'), false);
  assert.equal(containsExactModel('Model ABC12', 'ABC1'), false);
});

test('claim values must be parsed from the matching field label and unit', () => {
  assert.equal(validateClaimSemantics({
    field: 'closedEnvelope.widthMm', value: 913, unit: 'mm',
    label: 'Total width (mm)', quote: 'Total width (mm) 913 mm',
  }, { category: 'fridge' }), true);
  assert.throws(() => validateClaimSemantics({
    field: 'closedEnvelope.widthMm', value: 1, unit: 'mm',
    label: 'Total width (mm)', quote: 'Total width (mm) 913 mm',
  }, { category: 'fridge' }), /quoted value/i);
  assert.throws(() => validateClaimSemantics({
    field: 'closedEnvelope.widthMm', value: 1782, unit: 'mm',
    label: 'Total height (mm)', quote: 'Total height (mm) 1782 mm',
  }, { category: 'fridge' }), /field label/i);
  assert.throws(() => validateClaimSemantics({
    field: 'flags.requiresPlumbing', value: true, unit: 'boolean',
    label: 'Water connection', quote: 'Water connection not required',
  }, { category: 'fridge' }), /boolean/i);
});

test('category ranges and cross-field geometry reject plausible-looking bad data', () => {
  const claims = source(html()).claims;
  assert.equal(validateClaimsSemantics(claims, identity), true);
  assert.throws(() => validateClaimsSemantics(claims.map((claim) => (
    claim.field === 'closedEnvelope.widthMm'
      ? { ...claim, value: 20, quote: 'Total width (mm) 20 mm' }
      : claim
  )), identity), /range/i);
  assert.throws(() => validateClaimsSemantics(claims.map((claim) => (
    claim.field === 'operation.doorOpenDepthMm'
      ? { ...claim, value: 700, quote: 'Depth door open 90 degree (mm) 700 mm' }
      : claim
  )), identity), /door-open depth/i);
});

test('HTML artifact needs canonical exact-model scope and independent product identity', () => {
  const bytes = html();
  const attested = verifyAndAttestResolutionArtifact({
    source: source(bytes), caseIdentity: identity, bytes,
    verifiedAt: '2026-07-11T14:35:00.000Z',
  });
  assert.ok(attested.identitySignals.some((signal) => signal.type === 'canonical_url'));
  assert.ok(attested.identitySignals.some((signal) => signal.type === 'product_model'));
  assert.equal(verifyAttestedResolutionArtifact({ source: attested, caseIdentity: identity, bytes }), true);

  const wrongBytes = html('WHE6874BA-R');
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: source(wrongBytes, {
      contentSha256: createHash('sha256').update(wrongBytes).digest('hex'),
      byteSize: wrongBytes.length,
    }),
    caseIdentity: identity, bytes: wrongBytes, verifiedAt: '2026-07-11T14:35:00.000Z',
  }), /canonical.*model|identity/i);
});

test('HTML extractor derives requested claims from source text instead of copied values', () => {
  const claims = extractClaimsFromHtml(html(), {
    category: 'fridge',
    fields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
      'operation.doorOpenDepthMm', 'installation.topMm', 'flags.requiresPlumbing',
    ],
  });
  assert.deepEqual(Object.fromEntries(claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': 913,
    'closedEnvelope.heightMm': 1782,
    'closedEnvelope.depthMm': 803,
    'operation.doorOpenDepthMm': 1189,
    'installation.topMm': 25,
    'flags.requiresPlumbing': true,
  });
});

test('PDF extractor accepts claims only on pages scoped to the exact model', () => {
  const text = `WHE6874BA Installation guide\nTotal width (mm) 913 mm\nTotal height (mm) 1782 mm\nTotal depth (mm) 803 mm\fWHE6874SA\nTotal width (mm) 999 mm`;
  const claims = extractClaimsFromPdfText(text, {
    caseIdentity: identity,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(claims.map((claim) => [claim.field, claim.value, claim.page]), [
    ['closedEnvelope.widthMm', 913, 1],
    ['closedEnvelope.heightMm', 1782, 1],
    ['closedEnvelope.depthMm', 803, 1],
  ]);
  assert.throws(() => extractClaimsFromPdfText('WHE6874SA\nTotal width (mm) 913 mm', {
    caseIdentity: identity, fields: ['closedEnvelope.widthMm'],
  }), /no exact-model PDF evidence/i);
});

test('artifact verification catches hash drift, claim drift, and multi-product quote leakage', () => {
  const bytes = html();
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: source(bytes, { contentSha256: 'b'.repeat(64) }),
    caseIdentity: identity, bytes, verifiedAt: '2026-07-11T14:35:00.000Z',
  }), /hash/i);
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: source(bytes, { claims: [{
      field: 'closedEnvelope.widthMm', value: 1, unit: 'mm',
      label: 'Total width (mm)', quote: 'Total width (mm) 913 mm',
    }] }),
    caseIdentity: identity, bytes, verifiedAt: '2026-07-11T14:35:00.000Z',
  }), /quoted value/i);

  const generic = Buffer.from('<html><head><title>All fridges</title><link rel="canonical" href="https://www.westinghouse.com.au/fridges/"></head><body>WHE6874BA Total width (mm) 913 mm WHE6874SA Total height (mm) 1782 mm</body></html>');
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: source(generic, {
      contentSha256: createHash('sha256').update(generic).digest('hex'), byteSize: generic.length,
    }),
    caseIdentity: identity, bytes: generic, verifiedAt: '2026-07-11T14:35:00.000Z',
  }), /canonical.*model|identity/i);
});
