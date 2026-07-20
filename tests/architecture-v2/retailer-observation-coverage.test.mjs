import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildRetailerObservationCoverage,
  validateRetailerObservationCoverage,
} from '../../src/domain/retailer-observation-coverage.mjs';
import {
  buildRetailerObservationLedger,
  validateRetailerObservationLedger,
} from '../../src/domain/retailer-observation-ledger.mjs';
import {
  createRetailerSourceAdapter,
  normalizeRetailerSnapshot,
} from '../../src/domain/retailer-source-adapter.mjs';

function readJsonWithHash(relativePath) {
  const bytes = readFileSync(new URL(relativePath, import.meta.url));
  return {
    document: JSON.parse(bytes),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function canonicalSha256(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function resignLedger(document) {
  delete document.semanticSha256;
  document.semanticSha256 = canonicalSha256(document);
  return document;
}

function resignCoverage(document) {
  delete document.semanticSha256;
  delete document.coverageId;
  document.coverageId = `retailer_observation_coverage_${canonicalSha256(document).slice(0, 24)}`;
  document.semanticSha256 = canonicalSha256(document);
  return document;
}

const publicProjection = readJsonWithHash(
  '../../data/architecture-v2/generated/public-catalog-projection.json',
);
const existingLedger = readJsonWithHash(
  '../../data/architecture-v2/observations/retailer-observations.json',
);
const sourcePolicy = readJsonWithHash(
  '../../data/architecture-v2/policies/retailer-source-policy.json',
);

test('baseline migration accounts for all 1,614 retailer links without inventing availability', () => {
  const ledger = buildRetailerObservationLedger({
    existingLedger: existingLedger.document,
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    typedSnapshots: [],
  });

  assert.equal(ledger.schemaVersion, 2);
  assert.equal(ledger.observations.length, 1652);
  assert.equal(ledger.summary.currentBaselineObservations, 1614);
  assert.equal(ledger.summary.preservedHistoricalObservations, 38);
  assert.equal(ledger.summary.legacyUnknownObservations, 1652);
  assert.equal(ledger.summary.authoritativeTypedObservations, 0);
  assert.ok(ledger.observations.every((row) => row.sourceType === 'legacy_catalog'));
  assert.ok(ledger.observations.every((row) => row.availability === 'unknown'));
  assert.ok(ledger.observations.every((row) => row.rawSourceSha256 === null));
  assert.ok(ledger.observations.every((row) => row.legacyProjectionBinding?.rowSha256));

  const replay = buildRetailerObservationLedger({
    existingLedger: ledger,
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    typedSnapshots: [],
  });
  assert.deepEqual(replay, ledger);
});

test('coverage inventory classifies every baseline link as typed or a specific policy-aware revalidation item', () => {
  const ledger = buildRetailerObservationLedger({
    existingLedger: existingLedger.document,
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    typedSnapshots: [],
  });
  const ledgerSha256 = createHash('sha256').update(JSON.stringify(ledger)).digest('hex');
  const coverage = buildRetailerObservationCoverage({
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    ledger,
    ledgerSha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
  });

  assert.equal(coverage.summary.baselineLinks, 1614);
  assert.equal(coverage.summary.accountedLinks, 1614);
  assert.equal(coverage.summary.typedLinks, 0);
  assert.equal(coverage.summary.revalidationItems, 1614);
  assert.equal(coverage.items.length, 1614);
  assert.equal(new Set(coverage.items.map((item) => item.baselineLinkId)).size, 1614);
  assert.deepEqual(coverage.summary.byOriginSource, {
    'appliances-online-api': 1204,
    'partnerize-feed': 152,
    sitemap: 100,
    'websearch-appliances-online': 66,
    'websearch-bing-lee': 26,
    'websearch-harvey-norman': 20,
    'websearch-jbhifi': 35,
    'websearch-the-good-guys': 11,
  });
  assert.ok(coverage.items.every((item) => (
    item.terminalObservationState !== 'TYPED_AVAILABLE'
    && item.revalidation?.action
    && item.revalidation?.policyState
  )));
  const pagePolicies = new Set([
    'bing-lee-product-page-v1',
    'harvey-norman-product-page-v1',
    'jb-hi-fi-product-page-v1',
  ]);
  assert.ok(coverage.items
    .filter((item) => pagePolicies.has(item.sourcePolicyId))
    .every((item) => item.revalidation.executionState === 'BLOCKED_BY_SOURCE_POLICY'));
  assert.ok(coverage.items
    .filter((item) => item.sourcePolicyId === 'appliances-online-product-api-v1')
    .every((item) => item.revalidation.executionState === 'BOUNDED_CANARY_ONLY'));
  assert.ok(coverage.items
    .filter((item) => item.sourcePolicyId === 'the-good-guys-partnerize-feed-v1')
    .every((item) => item.revalidation.executionState === 'RUNNABLE_AUTHORIZED_SOURCE'));
});

test('a hash-bound typed snapshot appends once and replaces only its own coverage item', () => {
  const adapter = createRetailerSourceAdapter({
    id: 'ao-product-api-v1',
    retailer: 'Appliances Online',
    sourceType: 'public_retailer_api',
    allowedHosts: ['www.appliancesonline.com.au'],
    minimumIntervalMs: 1000,
    robotsReviewedAt: '2026-07-11',
    termsReviewedAt: '2026-07-11',
    policyVersion: 'ao-product-api-policy-v1',
    expectedCadenceHours: 24,
    maximumCurrentAgeHours: 72,
  });
  const product = publicProjection.document.products.find((row) => row.model === 'DW42CS');
  const retailer = product.retailers.find((row) => row.source === 'appliances-online-api');
  const snapshot = normalizeRetailerSnapshot(adapter, {
    observedAt: '2026-07-20T00:00:00.000Z',
    complete: false,
    rawPayloadSha256: 'a'.repeat(64),
    rawSourceReference: 'fixture:ao:dw42cs',
    rows: [{
      canonicalProductId: product.canonicalProductId,
      retailerProductId: '57863',
      url: retailer.url,
      title: `${product.brand} ${product.model}`,
      priceAud: retailer.p,
      availability: 'unavailable',
      listingState: 'unavailable',
    }],
  });
  const first = buildRetailerObservationLedger({
    existingLedger: existingLedger.document,
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    typedSnapshots: [snapshot],
  });
  const second = buildRetailerObservationLedger({
    existingLedger: first,
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    typedSnapshots: [snapshot],
  });
  assert.deepEqual(second, first);
  assert.equal(first.summary.authoritativeTypedObservations, 1);

  const coverage = buildRetailerObservationCoverage({
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    ledger: first,
    ledgerSha256: createHash('sha256').update(JSON.stringify(first)).digest('hex'),
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
  });
  const item = coverage.items.find((row) => row.canonicalProductId === product.canonicalProductId);
  assert.equal(item.terminalObservationState, 'TYPED_UNAVAILABLE');
  assert.equal(item.revalidation, null);
});

test('schema-v2 replay preserves removed history and rejects conflicting observation reuse', () => {
  const ledger = buildRetailerObservationLedger({
    existingLedger: existingLedger.document,
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    typedSnapshots: [],
  });
  const tamperedProjection = structuredClone(publicProjection.document);
  const changedProduct = tamperedProjection.products.find((row) => row.retailers?.length);
  const removedLinks = changedProduct.retailers.length;
  changedProduct.retailers = [];
  const next = buildRetailerObservationLedger({
    existingLedger: ledger,
    publicProjection: tamperedProjection,
    publicProjectionSha256: 'f'.repeat(64),
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    typedSnapshots: [],
  });
  assert.equal(next.observations.length, ledger.observations.length);
  assert.equal(next.summary.currentBaselineObservations, 1614 - removedLinks);
  assert.equal(next.summary.preservedHistoricalObservations, 38 + removedLinks);

  const conflicting = structuredClone(ledger);
  conflicting.observations[0].url = 'https://www.example.com/conflict';
  assert.throws(() => buildRetailerObservationLedger({
    existingLedger: conflicting,
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    typedSnapshots: [],
  }), /conflicting observation ID|ledger integrity/i);
});

test('ledger and coverage validators reject internally inconsistent artifacts even when re-signed', () => {
  const ledger = buildRetailerObservationLedger({
    existingLedger: existingLedger.document,
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    typedSnapshots: [],
  });
  const badLedger = resignLedger(structuredClone(ledger));
  badLedger.summary.observations += 1;
  resignLedger(badLedger);
  assert.throws(() => validateRetailerObservationLedger(badLedger), /ledger summary/i);

  const coverage = buildRetailerObservationCoverage({
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    ledger,
    ledgerSha256: createHash('sha256').update(JSON.stringify(ledger)).digest('hex'),
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
  });
  const badCoverage = structuredClone(coverage);
  badCoverage.summary.accountedLinks -= 1;
  resignCoverage(badCoverage);
  assert.throws(() => validateRetailerObservationCoverage(badCoverage), /coverage summary/i);
});
