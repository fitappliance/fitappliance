import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { reduceRetailLifecycle } from '../../src/domain/retailer-observation.mjs';
import { createRetailerObservationsFromSnapshot } from '../../src/domain/retailer-source-adapter.mjs';

const require = createRequire(import.meta.url);
const {
  buildAoFailedRetailerSnapshot,
  buildAoRetailerSnapshot,
  buildProductStubFromAo,
  fetchJsonWithBytes,
} = require('../../scripts/discovery-pipeline/lib/appliances-online-product-api.js');

const adapter = {
  id: 'appliances-online-product-api-v1',
  retailer: 'Appliances Online',
  sourceType: 'public_retailer_api',
  allowedHosts: ['www.appliancesonline.com.au'],
  minimumIntervalMs: 1000,
  robotsReviewedAt: '2026-07-11',
  termsReviewedAt: '2026-07-11',
  policyVersion: 'retailer-source-policy-v2:appliances-online-product-api-v1',
  expectedCadenceHours: 24,
  maximumCurrentAgeHours: 72,
};

function fixture(name) {
  const bytes = readFileSync(new URL(`../fixtures/architecture-v2/retailer-observation/${name}`, import.meta.url));
  return { bytes, payload: JSON.parse(bytes) };
}

const cases = [
  ['ao-sms6hci02a-available.json', 'SMS6HCI02A', 'available', 'current'],
  ['ao-dw42cs-unavailable.json', 'DW42CS', 'unavailable', 'unavailable'],
  ['ao-edw6sl-unavailable.json', 'EDW6SL', 'unavailable', 'unavailable'],
  ['ao-status-unknown.json', 'UNKNOWN-STATUS-1', 'unknown', 'current'],
];

test('AO exact-product responses map only explicit availability and bind the raw response bytes', async () => {
  for (const [name, expectedModel, availability, listingState] of cases) {
    const { bytes, payload } = fixture(name);
    const snapshot = await buildAoRetailerSnapshot({
      adapter,
      canonicalProductId: `fa_prod_${expectedModel.toLowerCase()}`,
      expectedModel,
      productPayload: payload,
      productRawBytes: bytes,
      productUrl: `https://www.appliancesonline.com.au${payload.uri}`,
      observedAt: '2026-07-20T00:00:00.000Z',
      rawSourceReference: `ao-api-fixture:${payload.productId}`,
    });
    assert.equal(snapshot.rows.length, 1, name);
    assert.equal(snapshot.rows[0].availability, availability, name);
    assert.equal(snapshot.rows[0].listingState, listingState, name);
    assert.equal(snapshot.rows[0].retailerProductId, String(payload.productId), name);
    assert.equal(snapshot.rawPayloadSha256, createHash('sha256').update(bytes).digest('hex'), name);
    assert.equal(snapshot.complete, false, name);
  }
});

test('AO snapshot refuses model or URI drift instead of attaching another product status', async () => {
  const { bytes, payload } = fixture('ao-dw42cs-unavailable.json');
  await assert.rejects(() => buildAoRetailerSnapshot({
    adapter,
    canonicalProductId: 'fa_prod_wrong',
    expectedModel: 'EDW6SL',
    productPayload: payload,
    productRawBytes: bytes,
    productUrl: `https://www.appliancesonline.com.au${payload.uri}`,
    observedAt: '2026-07-20T00:00:00.000Z',
    rawSourceReference: 'ao-api-fixture:wrong-model',
  }), /model mismatch/i);
  await assert.rejects(() => buildAoRetailerSnapshot({
    adapter,
    canonicalProductId: 'fa_prod_dw42cs',
    expectedModel: 'DW42CS',
    productPayload: payload,
    productRawBytes: bytes,
    productUrl: 'https://www.appliancesonline.com.au/product/a-different-product',
    observedAt: '2026-07-20T00:00:00.000Z',
    rawSourceReference: 'ao-api-fixture:wrong-uri',
  }), /URI mismatch/i);
});

test('AO collection failure is an empty failed snapshot, never synthesized unavailability', async () => {
  const snapshot = await buildAoFailedRetailerSnapshot({
    adapter,
    canonicalProductId: 'fa_prod_dw42cs',
    observedAt: '2026-07-20T00:00:00.000Z',
    rawSourceReference: 'ao-api-attempt:timeout',
    collectionError: 'timeout',
  });
  assert.equal(snapshot.collectionStatus, 'failed');
  assert.equal(snapshot.complete, false);
  assert.deepEqual(snapshot.rows, []);
  assert.deepEqual(snapshot.canonicalProductIds, ['fa_prod_dw42cs']);
  assert.equal(snapshot.rawPayloadSha256, null);
});

test('AO invalid JSON errors retain the exact HTTP response bytes for evidence storage', async () => {
  const bytes = Buffer.from('{"productId":');
  await assert.rejects(async () => {
    await fetchJsonWithBytes('https://www.appliancesonline.com.au/api/v2/product/slug/bad', {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => bytes.toString(),
      }),
    });
  }, (error) => {
    assert.equal(error.code, 'AO_INVALID_JSON');
    assert.deepEqual(error.rawResponseBytes, bytes);
    return true;
  });
});

test('AO typed status drives lifecycle while a later failed collection preserves the prior state', async () => {
  const availableFixture = fixture('ao-sms6hci02a-available.json');
  const unavailableFixture = fixture('ao-dw42cs-unavailable.json');
  const availableSnapshot = await buildAoRetailerSnapshot({
    adapter,
    canonicalProductId: 'fa_prod_sms6hci02a',
    expectedModel: 'SMS6HCI02A',
    productPayload: availableFixture.payload,
    productRawBytes: availableFixture.bytes,
    productUrl: `https://www.appliancesonline.com.au${availableFixture.payload.uri}`,
    observedAt: '2026-07-20T00:00:00.000Z',
    rawSourceReference: 'ao-api-fixture:available',
  });
  const failedSnapshot = await buildAoFailedRetailerSnapshot({
    adapter,
    canonicalProductId: 'fa_prod_sms6hci02a',
    observedAt: '2026-07-20T01:00:00.000Z',
    rawSourceReference: 'ao-api-attempt:after-available',
    collectionError: 'timeout',
  });
  const current = reduceRetailLifecycle({
    canonicalProductId: 'fa_prod_sms6hci02a',
    observations: createRetailerObservationsFromSnapshot(availableSnapshot),
    collectionAttempts: [failedSnapshot],
    asOf: '2026-07-20T02:00:00.000Z',
    policyVersion: 'retail-lifecycle-v1',
    catalogState: 'LISTED_UNVERIFIED',
    registryPresent: true,
  });
  assert.equal(current.lifecycleState, 'CURRENT_RETAIL');
  assert.ok(current.reasonCodes.includes('COLLECTION_FAILURE_RETAINED'));

  const unavailableSnapshot = await buildAoRetailerSnapshot({
    adapter,
    canonicalProductId: 'fa_prod_dw42cs',
    expectedModel: 'DW42CS',
    productPayload: unavailableFixture.payload,
    productRawBytes: unavailableFixture.bytes,
    productUrl: `https://www.appliancesonline.com.au${unavailableFixture.payload.uri}`,
    observedAt: '2026-07-20T00:00:00.000Z',
    rawSourceReference: 'ao-api-fixture:unavailable',
  });
  const unavailable = reduceRetailLifecycle({
    canonicalProductId: 'fa_prod_dw42cs',
    observations: createRetailerObservationsFromSnapshot(unavailableSnapshot),
    collectionAttempts: [],
    asOf: '2026-07-20T02:00:00.000Z',
    policyVersion: 'retail-lifecycle-v1',
    catalogState: 'LISTED_UNVERIFIED',
    registryPresent: true,
  });
  assert.notEqual(unavailable.lifecycleState, 'CURRENT_RETAIL');
});

test('legacy product stub no longer treats a missing AO availability field as current', () => {
  const base = {
    discovery: { brand: 'Fixture', model: 'FIX-1', category: 'dishwasher' },
    specificationsPayload: { groupedAttributes: {} },
    productUrl: 'https://www.appliancesonline.com.au/product/fixture-fix-1',
    observedAt: '2026-07-20T00:00:00.000Z',
  };
  const unknown = buildProductStubFromAo({
    ...base,
    productPayload: { productId: 1, sku: 'FIX-1', uri: '/product/fixture-fix-1' },
  });
  const available = buildProductStubFromAo({
    ...base,
    productPayload: { productId: 1, sku: 'FIX-1', uri: '/product/fixture-fix-1', available: true },
  });
  const unavailable = buildProductStubFromAo({
    ...base,
    productPayload: { productId: 1, sku: 'FIX-1', uri: '/product/fixture-fix-1', available: false },
  });
  assert.equal(unknown.unavailable, true);
  assert.equal(unknown.retailers[0].stock, null);
  assert.equal(available.unavailable, false);
  assert.equal(available.retailers[0].stock, 'Yes');
  assert.equal(unavailable.unavailable, true);
  assert.equal(unavailable.retailers[0].stock, 'No');
});
