import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHistoricalCatalogBinding,
  hashHistoricalCatalogBinding,
} from '../../src/domain/historical-catalog-binding.mjs';

function retailLifecycle(canonicalProductId, lifecycleState = 'CURRENT_RETAIL') {
  const authorizingObservation = lifecycleState === 'CURRENT_RETAIL' ? {
    id: `obs_${canonicalProductId}`,
    canonicalProductId,
    adapterId: 'tgg-feed-v1',
    retailer: 'The Good Guys',
    retailerProductId: 'EX-1',
    observedAt: '2026-07-19T00:00:00.000Z',
    url: 'https://www.thegoodguys.com.au/example-fridge-ex-1',
    availability: 'available',
    listingState: 'current',
    freshnessState: 'FRESH',
    rawSourceSha256: 'b'.repeat(64),
    policyVersion: 'tgg-source-v1',
  } : null;
  return {
    schemaVersion: 1,
    policyVersion: 'retail-lifecycle-v1',
    asOf: '2026-07-20T00:00:00.000Z',
    canonicalProductId,
    catalogState: lifecycleState === 'CATALOG_ARCHIVED' ? 'ARCHIVED' : 'LISTED_UNVERIFIED',
    lifecycleState,
    authorizingObservation,
    latestObservations: authorizingObservation ? [authorizingObservation] : [],
    observationConflicts: [],
    collectionAttempts: [],
    reasonCodes: [],
  };
}

function product(overrides = {}) {
  const hash = 'a'.repeat(64);
  const field = { contentSha256: hash, receiptBindingSha256: hash, fragmentSha256: hash };
  const canonicalProductId = overrides.canonicalProductId ?? 'fa_prod_1';
  return {
    id: 'fridge-1',
    canonicalProductId,
    cat: 'fridge',
    brand: 'Example',
    model: 'EX-1',
    unavailable: false,
    price: 1299,
    priorityScore: 80,
    displayName: 'Example fridge',
    retailers: [{
      n: 'The Good Guys',
      url: 'https://www.thegoodguys.com.au/example-fridge-ex-1',
      p: 1299,
      affiliate_url: 'https://prf.hn/click/example',
    }],
    geometry_v2: {
      closedEnvelope: { widthMm: 600, heightMm: 1700, depthMm: 650 },
    },
    geometry_v2_provenance: {
      fieldEvidence: {
        'closedEnvelope.widthMm': field,
        'closedEnvelope.heightMm': field,
        'closedEnvelope.depthMm': field,
      },
    },
    retailLifecycle: retailLifecycle(canonicalProductId),
    ...overrides,
  };
}

test('historical catalog binding ignores commercial and presentation-only drift', () => {
  const base = { products: [product()] };
  const commercialOnly = { products: [product({
    price: 999,
    priorityScore: 12,
    displayName: 'Renamed presentation copy',
    retailers: [{
      n: 'The Good Guys',
      url: 'https://www.thegoodguys.com.au/example-fridge-ex-1',
      p: 999,
      affiliate_url: 'https://prf.hn/click/new-campaign',
      commission_rate_percent: 3,
    }],
  })] };

  assert.equal(hashHistoricalCatalogBinding(base), hashHistoricalCatalogBinding(commercialOnly));
  assert.deepEqual(buildHistoricalCatalogBinding(base), buildHistoricalCatalogBinding(commercialOnly));
});

test('historical catalog binding ignores geometry without three-axis receipt binding', () => {
  const withoutReceipt = product({ geometry_v2_provenance: { fieldEvidence: {} } });
  const changedDraft = {
    ...withoutReceipt,
    geometry_v2: { closedEnvelope: { widthMm: 610, heightMm: 1700, depthMm: 650 } },
  };

  assert.equal(
    hashHistoricalCatalogBinding({ products: [withoutReceipt] }),
    hashHistoricalCatalogBinding({ products: [changedDraft] }),
  );
});

test('historical recovery receipt geometry is bound by its bundle, not duplicated in catalog binding', () => {
  const beforeRecovery = product({
    geometry_v2: null,
    geometry_v2_provenance: null,
  });
  const recovered = product({
    evidence: { acceptance: { id: 'recovery_target_example' } },
  });

  assert.equal(
    hashHistoricalCatalogBinding({ products: [beforeRecovery] }),
    hashHistoricalCatalogBinding({ products: [recovered] }),
  );
});

test('historical catalog binding ignores retailer URL drift for an archived product', () => {
  const archived = product({
    unavailable: true,
    retailLifecycle: retailLifecycle('fa_prod_1', 'CATALOG_ARCHIVED'),
  });
  const changedUrl = product({
    unavailable: true,
    retailLifecycle: retailLifecycle('fa_prod_1', 'CATALOG_ARCHIVED'),
    retailers: [{ n: 'The Good Guys', url: 'https://www.thegoodguys.com.au/example-fridge-ex-2' }],
  });

  assert.equal(
    hashHistoricalCatalogBinding({ products: [archived] }),
    hashHistoricalCatalogBinding({ products: [changedUrl] }),
  );
});

test('historical catalog binding changes for identity, lifecycle, product-page or receipt geometry drift', () => {
  const base = { products: [product()] };
  const baseHash = hashHistoricalCatalogBinding(base);
  const changedAuthorizer = retailLifecycle('fa_prod_1');
  changedAuthorizer.authorizingObservation.url = 'https://www.thegoodguys.com.au/example-fridge-ex-2';
  changedAuthorizer.latestObservations[0].url = changedAuthorizer.authorizingObservation.url;
  const changed = [
    { products: [product({ model: 'EX-2' })] },
    { products: [product({
      unavailable: true,
      retailLifecycle: retailLifecycle('fa_prod_1', 'CATALOG_ARCHIVED'),
    })] },
    { products: [product({ retailLifecycle: changedAuthorizer })] },
    { products: [product({ geometry_v2: { closedEnvelope: { widthMm: 610, heightMm: 1700, depthMm: 650 } } })] },
  ];

  for (const catalog of changed) assert.notEqual(hashHistoricalCatalogBinding(catalog), baseHash);
});

test('historical catalog binding is deterministic across product and retailer order', () => {
  const first = product({
    retailers: [
      { n: 'The Good Guys', url: 'https://www.thegoodguys.com.au/example-fridge-ex-1', p: 1299 },
      { n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/example-fridge-ex-1', p: 1399 },
    ],
  });
  const second = product({ id: 'fridge-2', canonicalProductId: 'fa_prod_2', model: 'EX-2' });
  const left = { products: [first, second] };
  const right = { products: [second, { ...first, retailers: [...first.retailers].reverse() }] };

  assert.equal(hashHistoricalCatalogBinding(left), hashHistoricalCatalogBinding(right));
});
