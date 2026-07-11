import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { extractClaimsFromHtml, verifyAndAttestResolutionArtifact } from '../../src/domain/evidence-artifact-verifier.mjs';
import { buildCanonicalRegistry } from '../../src/domain/canonical-registry.mjs';
import { adjudicateResolutionCase } from '../../src/domain/evidence-resolution-loop.mjs';
import { createVerificationReceipt, validateTrustedSourceMetadata } from '../../src/domain/evidence-source-verifier.mjs';

test('global manufacturer hosts cannot silently supply a different national market', () => {
  const base = {
    authority: 'manufacturer', finalUrl: 'https://www.samsung.com/us/refrigerators/model-x/',
    sourceUrl: 'https://www.samsung.com/us/refrigerators/model-x/', redirectChain: [],
    retrievedAt: '2026-07-11T12:00:00.000Z', contentSha256: 'a'.repeat(64),
    objectPath: `evidence/web/sha256/aa/aa/${'a'.repeat(64)}.html`, contentType: 'text/html', byteSize: 100,
    identity: { brand: 'Samsung', model: 'MODEL-X', outcome: 'exact' },
    identitySignals: [{ type: 'canonical_url', value: 'x' }, { type: 'product_model', value: 'MODEL-X' }],
    claims: [{
      field: 'closedEnvelope.widthMm', value: 600, unit: 'mm',
      label: 'Total width (mm)', quote: 'Total width (mm) 600 mm',
    }],
  };
  assert.throws(() => validateTrustedSourceMetadata(base, {
    brand: 'Samsung', model: 'MODEL-X', category: 'fridge',
  }, { asOf: '2026-07-11T13:00:00.000Z' }), /market/i);
  assert.equal(validateTrustedSourceMetadata({
    ...base,
    sourceUrl: 'https://www.samsung.com/au/refrigerators/model-x/',
    finalUrl: 'https://www.samsung.com/au/refrigerators/model-x/',
  }, { brand: 'Samsung', model: 'MODEL-X', category: 'fridge' }, {
    asOf: '2026-07-11T13:00:00.000Z',
  }), true);
});

test('hidden script text cannot become visible product evidence', () => {
  const html = Buffer.from(`<!doctype html><html><head><title>M1</title>
    <link rel="canonical" href="https://www.westinghouse.com.au/fridges/m1/"></head>
    <body data-product-model="M1"><script>Total width (mm) 600 mm</script></body></html>`);
  assert.deepEqual(extractClaimsFromHtml(html, {
    category: 'fridge', fields: ['closedEnvelope.widthMm'],
  }), []);
});

test('HTML identity requires a product model signal, not canonical URL plus marketing title', () => {
  const bytes = Buffer.from(`<!doctype html><html><head><title>Accessories for M1</title>
    <link rel="canonical" href="https://www.westinghouse.com.au/fridges/m1/"></head>
    <body>Total width (mm) 600 mm</body></html>`);
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: {
      authority: 'manufacturer', sourceUrl: 'https://www.westinghouse.com.au/fridges/m1/',
      finalUrl: 'https://www.westinghouse.com.au/fridges/m1/', redirectChain: [],
      retrievedAt: '2026-07-11T12:00:00.000Z', contentSha256: hash,
      objectPath: `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.html`,
      contentType: 'text/html', byteSize: bytes.length,
      identity: { brand: 'Westinghouse', model: 'M1', outcome: 'exact' },
      claims: [{ field: 'closedEnvelope.widthMm', value: 600, unit: 'mm', label: 'Total width (mm)', quote: 'Total width (mm) 600 mm' }],
    },
    caseIdentity: { brand: 'Westinghouse', model: 'M1', category: 'fridge' },
    bytes, verifiedAt: '2026-07-11T12:05:00.000Z',
  }), /product model/i);
});

test('duplicate source hashes cannot vote twice in one case', () => {
  const source = {
    authority: 'manufacturer', sourceUrl: 'https://www.westinghouse.com.au/fridges/m1/',
    finalUrl: 'https://www.westinghouse.com.au/fridges/m1/', redirectChain: [],
    retrievedAt: '2026-07-11T12:00:00.000Z', contentSha256: 'a'.repeat(64),
    objectPath: `evidence/web/sha256/aa/aa/${'a'.repeat(64)}.html`, contentType: 'text/html', byteSize: 100,
    identity: { brand: 'Westinghouse', model: 'M1', outcome: 'exact' },
    identitySignals: [{ type: 'canonical_url', value: 'x' }, { type: 'product_model', value: 'M1' }],
    claims: [
      { field: 'closedEnvelope.widthMm', value: 600, unit: 'mm', label: 'Total width (mm)', quote: 'Total width (mm) 600 mm' },
      { field: 'closedEnvelope.heightMm', value: 1700, unit: 'mm', label: 'Total height (mm)', quote: 'Total height (mm) 1700 mm' },
      { field: 'closedEnvelope.depthMm', value: 650, unit: 'mm', label: 'Total depth (mm)', quote: 'Total depth (mm) 650 mm' },
    ],
  };
  source.verificationReceipt = createVerificationReceipt(source, {
    brand: 'Westinghouse', model: 'M1', category: 'fridge',
  }, { verifiedAt: '2026-07-11T12:05:00.000Z' });
  assert.throws(() => adjudicateResolutionCase({
    id: 'case-1', legacyRuntimeId: 'fridge-1', brand: 'Westinghouse', model: 'M1', category: 'fridge',
    releasableQuarantineReasons: ['evidence_projection_hold'],
    initialFailure: { code: 'x', conflictingFields: [] }, attempt: 1, maxAttempts: 3,
    sources: [source, structuredClone(source)],
  }), /duplicate source hash/i);
});

test('release grants must use policy-approved evidence reasons', () => {
  assert.throws(() => buildCanonicalRegistry({ products: [
    { id: 'fridge-1', cat: 'fridge', brand: 'A', model: 'M1' },
  ] }, {
    quarantineEntries: [{ legacyRuntimeId: 'fridge-1', reason: 'commercial_hold' }],
    releaseGrants: [{ legacyRuntimeId: 'fridge-1', caseId: 'case-1', reason: 'commercial_hold' }],
  }), /not approved for automated release/i);
});
