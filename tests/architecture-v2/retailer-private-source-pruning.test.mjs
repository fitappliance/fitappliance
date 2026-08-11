import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  buildRetailerObservationLedger,
  pruneRetailerSourceFromTrackedLedger,
  resetRetailerIdentityResolutionReplay,
  validateRetailerObservationLedger,
} from '../../src/domain/retailer-observation-ledger.mjs';
import {
  createRetailerSourceAdapter,
  normalizeRetailerSnapshot,
} from '../../src/domain/retailer-source-adapter.mjs';

const privateSourceId = 'the-good-guys-partnerize-feed-v1';
const publicSourceId = 'appliances-online-product-api-v1';
const sourcePolicy = {
  schemaVersion: 2,
  policyVersion: 'retailer-source-policy-v2',
  reviewedAt: '2026-08-10',
  sources: [
    {
      id: publicSourceId,
      retailer: 'Appliances Online',
      host: 'www.appliancesonline.com.au',
      allowedHosts: ['www.appliancesonline.com.au'],
      sourceType: 'public_retailer_api',
      collectionMode: 'bounded_exact_product_api',
      termsReviewState: 'reviewed_bounded_exact_product_api',
      minimumIntervalMs: 1000,
      expectedCadenceHours: 24,
      maximumCurrentAgeHours: 72,
      legacyLinkAction: 'REVALIDATE_AO_PRODUCT_API',
    },
    {
      id: privateSourceId,
      retailer: 'The Good Guys',
      host: 'www.thegoodguys.com.au',
      allowedHosts: ['www.thegoodguys.com.au'],
      acquisitionHosts: ['feeds.performancehorizon.com'],
      sourceType: 'affiliate_feed',
      collectionMode: 'partnerize_feed_only',
      termsReviewState: 'reviewed_private_campaign_use',
      minimumIntervalMs: 1000,
      expectedCadenceHours: 24,
      maximumCurrentAgeHours: 72,
      legacyLinkAction: 'PRIVATE_EVIDENCE_ONLY',
    },
  ],
};

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function canonicalSha256(value) {
  return sha256(JSON.stringify(canonical(value)));
}

function adapter(sourceId) {
  const source = sourcePolicy.sources.find((row) => row.id === sourceId);
  return createRetailerSourceAdapter({
    id: source.id,
    retailer: source.retailer,
    sourceType: source.sourceType,
    allowedHosts: source.allowedHosts,
    minimumIntervalMs: source.minimumIntervalMs,
    robotsReviewedAt: sourcePolicy.reviewedAt,
    termsReviewedAt: sourcePolicy.reviewedAt,
    policyVersion: `${sourcePolicy.policyVersion}:${source.id}`,
    expectedCadenceHours: source.expectedCadenceHours,
    maximumCurrentAgeHours: source.maximumCurrentAgeHours,
  });
}

function snapshot(sourceId, rawPayloadSha256, url) {
  const sourceAdapter = adapter(sourceId);
  return normalizeRetailerSnapshot(sourceAdapter, {
    observedAt: '2026-08-10T00:00:00.000Z',
    complete: false,
    rawPayloadSha256,
    rawSourceReference: `retailer-object:sha256:${rawPayloadSha256}`,
    rows: [{
      canonicalProductId: 'fa_prod_fixture',
      retailerProductId: `${sourceId}-sku`,
      url,
      title: 'Fixture appliance',
      priceAud: 999,
      availability: 'available',
      listingState: 'current',
    }],
  });
}

function fixtureLedger() {
  const projection = {
    products: [{
      canonicalProductId: 'fa_prod_fixture',
      retailers: [
        {
          n: 'Appliances Online',
          url: 'https://www.appliancesonline.com.au/product/fixture',
          verified_at: '2026-08-10',
          source: 'appliances-online-api',
        },
        {
          n: 'The Good Guys',
          url: 'https://www.thegoodguys.com.au/fixture',
          verified_at: '2026-08-10',
          source: 'partnerize-feed',
        },
      ],
    }],
  };
  return buildRetailerObservationLedger({
    existingLedger: { schemaVersion: 1, observations: [] },
    publicProjection: projection,
    publicProjectionSha256: sha256(JSON.stringify(projection)),
    sourcePolicy,
    sourcePolicySha256: sha256(JSON.stringify(sourcePolicy)),
    typedSnapshots: [
      snapshot(publicSourceId, 'a'.repeat(64), 'https://www.appliancesonline.com.au/product/fixture'),
      snapshot(privateSourceId, 'b'.repeat(64), 'https://www.thegoodguys.com.au/fixture'),
    ],
  });
}

test('tracked ledger pruning removes one private source and preserves other evidence', () => {
  const ledger = fixtureLedger();
  const original = structuredClone(ledger);
  const pruned = pruneRetailerSourceFromTrackedLedger(ledger, privateSourceId);

  assert.deepEqual(ledger, original);
  assert.equal(validateRetailerObservationLedger(pruned), pruned);
  assert.equal(pruned.observations.length, 2);
  assert.equal(pruned.collectionAttempts.length, 1);
  assert.equal(pruned.summary.currentBaselineObservations, 1);
  assert.equal(pruned.summary.preservedHistoricalObservations, 1);
  assert.equal(pruned.summary.authoritativeTypedObservations, 1);
  assert.ok(pruned.observations.every((row) => (
    row.adapterId !== privateSourceId
      && row.legacyProjectionBinding?.sourcePolicyId !== privateSourceId
  )));
  assert.ok(pruned.collectionAttempts.every((row) => row.adapterId !== privateSourceId));
  assert.ok(pruned.sourceBindings.every((row) => !row.id.includes(privateSourceId)));
  assert.deepEqual(pruneRetailerSourceFromTrackedLedger(pruned, privateSourceId), pruned);
});

test('identity resolution replay reset returns a ledger to its raw observation baseline', () => {
  const ledger = fixtureLedger();
  const sourceObservation = ledger.observations.find((row) => row.adapterId === publicSourceId);
  const resolutionSemanticSha256 = 'c'.repeat(64);
  const observation = {
    ...structuredClone(sourceObservation),
    id: 'obs_identity_fixture',
    canonicalProductId: 'fa_prod_destination',
  };
  const eventSeed = {
    resolutionTaskId: 'retail_resolution_fixture',
    baselineLinkId: `retail_link_${'d'.repeat(24)}`,
    action: 'REASSIGN_TO_EXISTING_CANONICAL',
    sourceCanonicalProductId: 'fa_prod_fixture',
    destinationCanonicalProductId: 'fa_prod_destination',
    rawSourceSha256: sourceObservation.rawSourceSha256,
  };
  const event = {
    id: `retail_identity_event_${canonicalSha256(eventSeed).slice(0, 24)}`,
    ...eventSeed,
    resolvedAt: '2026-08-10T01:00:00.000Z',
    sourceObservedAt: sourceObservation.observedAt,
    resolutionSemanticSha256,
    reasonCodes: ['FIXTURE_EXACT_PUBLIC_IDENTITY'],
    observation,
  };
  const replayed = structuredClone(ledger);
  replayed.observations.push(observation);
  replayed.observations.sort((left, right) => left.id.localeCompare(right.id));
  replayed.identityResolutionEvents = [event];
  replayed.sourceBindings.push({
    id: `retailer-identity-resolution:${resolutionSemanticSha256}`,
    sha256: resolutionSemanticSha256,
    kind: 'IDENTITY_RESOLUTION',
  });
  replayed.sourceBindings.sort((left, right) => left.id.localeCompare(right.id));
  replayed.summary = {
    ...replayed.summary,
    observations: replayed.observations.length,
    preservedHistoricalObservations: replayed.observations.length
      - replayed.summary.currentBaselineObservations,
    authoritativeTypedObservations: replayed.summary.authoritativeTypedObservations + 1,
    canonicalProducts: 2,
  };
  delete replayed.semanticSha256;
  replayed.semanticSha256 = canonicalSha256(replayed);
  validateRetailerObservationLedger(replayed);

  const reset = resetRetailerIdentityResolutionReplay(replayed);

  assert.deepEqual(reset, ledger);
  assert.deepEqual(resetRetailerIdentityResolutionReplay(reset), reset);
});
