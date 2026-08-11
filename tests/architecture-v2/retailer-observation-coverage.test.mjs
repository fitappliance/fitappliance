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
const emptyV1Ledger = Object.freeze({ schemaVersion: 1, observations: [] });

function adapterForPolicy(sourceId) {
  const policy = sourcePolicy.document;
  const source = policy.sources.find((row) => row.id === sourceId);
  assert.ok(source, `missing source policy ${sourceId}`);
  return createRetailerSourceAdapter({
    id: source.id,
    retailer: source.retailer,
    sourceType: source.sourceType,
    allowedHosts: source.allowedHosts,
    minimumIntervalMs: source.minimumIntervalMs,
    robotsReviewedAt: policy.reviewedAt,
    termsReviewedAt: policy.reviewedAt,
    policyVersion: `${policy.policyVersion}:${source.id}`,
    expectedCadenceHours: source.expectedCadenceHours,
    maximumCurrentAgeHours: source.maximumCurrentAgeHours,
  });
}

test('baseline migration accounts for all 1,442 public retailer links without inventing availability', () => {
  const ledger = buildRetailerObservationLedger({
    existingLedger: emptyV1Ledger,
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    typedSnapshots: [],
  });

  assert.equal(ledger.schemaVersion, 2);
  assert.equal(ledger.observations.length, 1442);
  assert.equal(ledger.summary.currentBaselineObservations, 1442);
  assert.equal(ledger.summary.preservedHistoricalObservations, 0);
  assert.equal(ledger.summary.legacyUnknownObservations, 1442);
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

test('cumulative tracked ledger replay preserves typed history and collection attempts', () => {
  const first = buildRetailerObservationLedger({
    existingLedger: existingLedger.document,
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    typedSnapshots: [],
  });
  const replay = buildRetailerObservationLedger({
    existingLedger: first,
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    typedSnapshots: [],
  });
  assert.deepEqual(replay, first);
  assert.equal(
    first.summary.authoritativeTypedObservations,
    existingLedger.document.summary.authoritativeTypedObservations,
  );
  assert.equal(first.summary.collectionAttempts, existingLedger.document.summary.collectionAttempts);
  assert.equal(first.summary.legacyUnknownObservations, existingLedger.document.summary.legacyUnknownObservations);
  assert.ok(first.summary.observations >= first.summary.currentBaselineObservations);
});

test('coverage inventory classifies every baseline link as typed or a specific policy-aware revalidation item', () => {
  const ledger = buildRetailerObservationLedger({
    existingLedger: emptyV1Ledger,
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

  assert.equal(coverage.summary.baselineLinks, 1442);
  assert.equal(coverage.summary.accountedLinks, 1442);
  assert.equal(coverage.summary.typedLinks, 0);
  assert.equal(coverage.summary.revalidationItems, 1442);
  assert.equal(coverage.items.length, 1442);
  assert.equal(new Set(coverage.items.map((item) => item.baselineLinkId)).size, 1442);
  assert.deepEqual(coverage.summary.byOriginSource, {
    'appliances-online-api': 1204,
    sitemap: 91,
    'websearch-appliances-online': 66,
    'websearch-bing-lee': 26,
    'websearch-harvey-norman': 20,
    'websearch-jbhifi': 35,
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
    .every((item) => item.revalidation.executionState === 'RUNNABLE_POLICY_REVIEWED_SOURCE'));
  assert.equal(coverage.items.some((item) => item.sourcePolicyId === 'the-good-guys-partnerize-feed-v1'), false);
});

test('a hash-bound typed snapshot appends once and replaces only its own coverage item', () => {
  const adapter = adapterForPolicy('appliances-online-product-api-v1');
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
    existingLedger: emptyV1Ledger,
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
  const item = coverage.items.find((row) => (
    row.canonicalProductId === product.canonicalProductId && row.url === new URL(retailer.url).toString()
  ));
  assert.equal(item.terminalObservationState, 'TYPED_UNAVAILABLE');
  assert.equal(item.revalidation, null);

  const blockedPolicy = structuredClone(sourcePolicy.document);
  blockedPolicy.sources.find((source) => source.id === 'appliances-online-product-api-v1')
    .termsReviewState = 'collection_blocked';
  const blockedCoverage = buildRetailerObservationCoverage({
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    ledger: first,
    ledgerSha256: createHash('sha256').update(JSON.stringify(first)).digest('hex'),
    sourcePolicy: blockedPolicy,
    sourcePolicySha256: canonicalSha256(blockedPolicy),
  });
  const excluded = blockedCoverage.items.find((row) => (
    row.canonicalProductId === product.canonicalProductId
  ));
  assert.equal(excluded.terminalObservationState, 'TYPED_POLICY_EXCLUDED');
  assert.equal(excluded.revalidation.executionState, 'BLOCKED_BY_SOURCE_POLICY');
  assert.deepEqual(excluded.typedObservation.policyExcludedObservationIds, [
    first.observations.find((row) => row.canonicalProductId === product.canonicalProductId
      && row.sourceType !== 'legacy_catalog').id,
  ]);
});

test('public coverage cannot recreate private Partnerize listings from source policy metadata', () => {
  const ledger = buildRetailerObservationLedger({
    existingLedger: emptyV1Ledger,
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    typedSnapshots: [],
  });
  const coverage = buildRetailerObservationCoverage({
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    ledger,
    ledgerSha256: canonicalSha256(ledger),
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
  });

  assert.equal(coverage.items.some((item) => (
    item.sourcePolicyId === 'the-good-guys-partnerize-feed-v1'
      || item.originSource === 'partnerize-feed'
  )), false);
  assert.equal(ledger.observations.some((row) => row.sourceType === 'affiliate_feed'), false);
});

test('redirected typed listings remain explicit revalidation work rather than terminal coverage', () => {
  const adapter = adapterForPolicy('appliances-online-product-api-v1');
  const product = publicProjection.document.products.find((row) => (
    row.retailers?.some((retailer) => retailer.url.includes('appliancesonline.com.au/product/'))
  ));
  const retailer = product.retailers.find((row) => row.url.includes('appliancesonline.com.au/product/'));
  const snapshot = normalizeRetailerSnapshot(adapter, {
    observedAt: '2026-07-20T00:00:00.000Z',
    complete: false,
    rawPayloadSha256: 'd'.repeat(64),
    rawSourceReference: 'fixture:ao:redirected',
    rows: [{
      canonicalProductId: product.canonicalProductId,
      retailerProductId: 'fixture-redirected',
      url: retailer.url,
      redirectUrl: `${retailer.url}-replacement`,
      title: `${product.brand} ${product.model}`,
      priceAud: null,
      availability: 'unknown',
      listingState: 'redirected',
    }],
  });
  const ledger = buildRetailerObservationLedger({
    existingLedger: emptyV1Ledger,
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    typedSnapshots: [snapshot],
  });
  const coverage = buildRetailerObservationCoverage({
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    ledger,
    ledgerSha256: canonicalSha256(ledger),
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
  });
  const item = coverage.items.find((row) => (
    row.canonicalProductId === product.canonicalProductId && row.url === new URL(retailer.url).toString()
  ));

  assert.equal(item.terminalObservationState, 'TYPED_REDIRECTED');
  assert.equal(item.revalidation.action, 'REVALIDATE_TYPED_NON_TERMINAL');
  assert.equal(item.revalidation.executionState, 'RUNNABLE_POLICY_REVIEWED_SOURCE');
});

test('ledger rejects unregistered adapters, policy drift, and collection-blocked source snapshots', () => {
  const aoProduct = publicProjection.document.products.find((row) => (
    row.retailers?.some((retailer) => retailer.url.includes('appliancesonline.com.au/product/'))
  ));
  const aoRetailer = aoProduct.retailers.find((retailer) => (
    retailer.url.includes('appliancesonline.com.au/product/')
  ));
  const fakeAdapter = createRetailerSourceAdapter({
    ...adapterForPolicy('appliances-online-product-api-v1'),
    id: 'unregistered-adapter-v1',
    policyVersion: 'retailer-source-policy-v2:unregistered-adapter-v1',
  });
  const fakeSnapshot = normalizeRetailerSnapshot(fakeAdapter, {
    observedAt: '2026-07-20T00:00:00.000Z',
    complete: false,
    rawPayloadSha256: 'b'.repeat(64),
    rawSourceReference: 'fixture:unregistered',
    rows: [{
      canonicalProductId: aoProduct.canonicalProductId,
      retailerProductId: 'fixture-unregistered',
      url: aoRetailer.url,
      title: `${aoProduct.brand} ${aoProduct.model}`,
      priceAud: null,
      availability: 'available',
      listingState: 'current',
    }],
  });
  assert.throws(() => buildRetailerObservationLedger({
    existingLedger: emptyV1Ledger,
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    typedSnapshots: [fakeSnapshot],
  }), /adapter.*source policy|unregistered/i);

  const policyDrift = structuredClone(fakeSnapshot);
  policyDrift.adapterId = 'appliances-online-product-api-v1';
  assert.throws(() => buildRetailerObservationLedger({
    existingLedger: emptyV1Ledger,
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    typedSnapshots: [policyDrift],
  }), /source policy contract drift.*policyVersion/i);

  const blockedSource = sourcePolicy.document.sources.find((source) => (
    source.termsReviewState === 'collection_blocked'
  ));
  const blockedProduct = publicProjection.document.products.find((row) => (
    row.retailers?.some((retailer) => new URL(retailer.url).hostname === blockedSource.host)
  ));
  const blockedRetailer = blockedProduct.retailers.find((retailer) => (
    new URL(retailer.url).hostname === blockedSource.host
  ));
  const blockedSnapshot = normalizeRetailerSnapshot(adapterForPolicy(blockedSource.id), {
    observedAt: '2026-07-20T00:00:00.000Z',
    complete: false,
    rawPayloadSha256: 'c'.repeat(64),
    rawSourceReference: `fixture:${blockedSource.id}`,
    rows: [{
      canonicalProductId: blockedProduct.canonicalProductId,
      retailerProductId: 'fixture-blocked',
      url: blockedRetailer.url,
      title: `${blockedProduct.brand} ${blockedProduct.model}`,
      priceAud: null,
      availability: 'available',
      listingState: 'current',
    }],
  });
  assert.throws(() => buildRetailerObservationLedger({
    existingLedger: emptyV1Ledger,
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    typedSnapshots: [blockedSnapshot],
  }), /collection.*blocked|source policy.*blocked/i);
});

test('schema-v2 replay freezes its migration baseline across later public projection drift', () => {
  const ledger = buildRetailerObservationLedger({
    existingLedger: emptyV1Ledger,
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
  assert.ok(removedLinks > 0);
  assert.deepEqual(next, ledger);
  assert.equal(next.summary.currentBaselineObservations, 1442);
  assert.equal(next.summary.preservedHistoricalObservations, 0);
  assert.equal(
    next.sourceBindings.filter((binding) => binding.kind === 'LEGACY_MIGRATION_INPUT').length,
    1,
  );

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
    existingLedger: emptyV1Ledger,
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
