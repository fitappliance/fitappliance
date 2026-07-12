import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  DIMENSION_EVIDENCE_STATES,
  LIFECYCLE_STATES,
  LOOKUP_ACTIONS,
  buildHistoricalApplianceReference,
  createHistoricalReferenceRecord,
  isCurrentRetailProduct,
} from '../../src/domain/historical-appliance-reference.mjs';
import { createRegistrySnapshotManifest } from '../../src/domain/official-registry-snapshot.mjs';
import { buildHistoricalReferenceFromOfficialSnapshots } from '../../scripts/architecture-v2/build-historical-appliance-reference.mjs';

const sourceReceipt = {
  sourceId: 'energy-rating:fridge',
  snapshotSha256: 'a'.repeat(64),
  sourceLines: [12],
};

const base = {
  referenceId: 'fa_ref_1234567890abcdef12345678',
  category: 'fridge',
  brand: 'Westinghouse',
  model: 'WTB4600WA',
  brandKey: 'WESTINGHOUSE',
  modelKey: 'WTB4600WA',
  rawIdentityVariants: [{ brand: 'Westinghouse', model: 'WTB4600WA' }],
  lifecycleState: 'REGISTRY_ONLY',
  evidenceState: 'REGISTRY_CONSISTENT',
  lookupAction: 'CONFIRM_REQUIRED',
  dimensionsMm: { width: 699, height: 1725, depth: 723 },
  sources: [sourceReceipt],
};

test('historical reference exposes independent lifecycle, evidence, and lookup enums', () => {
  assert.deepEqual(LIFECYCLE_STATES, [
    'CURRENT_RETAIL', 'CATALOG_ARCHIVED', 'REGISTRY_ONLY', 'UNKNOWN_RETAIL',
  ]);
  assert.deepEqual(DIMENSION_EVIDENCE_STATES, [
    'CATALOG_RECEIPT', 'REGISTRY_CONSISTENT', 'IDENTITY_ONLY',
    'INTERNAL_CONFLICT', 'AXIS_SUSPECT', 'INVALID_DIMENSIONS',
  ]);
  assert.deepEqual(LOOKUP_ACTIONS, [
    'AUTO_FILL', 'CONFIRM_REQUIRED', 'MEASURE_REQUIRED', 'QUARANTINED',
  ]);
});

test('registry-consistent dimensions remain confirmation-required regardless of retail lifecycle', () => {
  for (const lifecycleState of LIFECYCLE_STATES) {
    const record = createHistoricalReferenceRecord({ ...base, lifecycleState });
    assert.equal(record.lifecycleState, lifecycleState);
    assert.equal(record.evidenceState, 'REGISTRY_CONSISTENT');
    assert.equal(record.lookupAction, 'CONFIRM_REQUIRED');
    assert.deepEqual(record.dimensionsMm, { width: 699, height: 1725, depth: 723 });
    assert.equal(Object.isFrozen(record), true);
  }
});

test('receipt agreement can auto-fill while identity-only requires measurement', () => {
  const receiptBacked = createHistoricalReferenceRecord({
    ...base,
    lifecycleState: 'CATALOG_ARCHIVED',
    evidenceState: 'CATALOG_RECEIPT',
    lookupAction: 'AUTO_FILL',
  });
  assert.equal(receiptBacked.lookupAction, 'AUTO_FILL');

  const identityOnly = createHistoricalReferenceRecord({
    ...base,
    evidenceState: 'IDENTITY_ONLY',
    lookupAction: 'MEASURE_REQUIRED',
    dimensionsMm: null,
  });
  assert.equal(identityOnly.lookupAction, 'MEASURE_REQUIRED');
  assert.equal(identityOnly.dimensionsMm, null);
});

function observation({
  category = 'fridge',
  brand = 'Example',
  model = 'MODEL1',
  dimensions = { width: 600, height: 1700, depth: 650 },
  sourceLine = 2,
  qualityFlags = [],
} = {}) {
  return {
    schemaVersion: 1,
    sourceId: `energy-rating:${category}`,
    snapshotSha256: 'b'.repeat(64),
    sourceLine,
    rowFingerprint: `${sourceLine}`.padStart(64, '0'),
    category,
    identity: {
      brandRaw: brand,
      brandCanonical: brand,
      brandKey: brand.toUpperCase().replace(/[^A-Z0-9]/g, ''),
      modelRaw: model,
      modelKey: model.toUpperCase().replace(/[\s._-]+/g, ''),
      registrationNumber: `REG-${sourceLine}`,
      familyName: null,
    },
    market: { soldInRaw: 'Australia', submitStatus: 'Approved', availabilityStatus: 'Available' },
    activeInAustralia: true,
    dimensionsMm: dimensions,
    rawDimensions: { ...dimensions, unit: 'mm' },
    qualityFlags,
  };
}

function receiptProduct(overrides = {}) {
  const hash = 'c'.repeat(64);
  const field = { contentSha256: hash, receiptBindingSha256: hash, fragmentSha256: hash };
  return {
    id: 'fridge-eqe6160ba',
    canonicalProductId: 'fa_prod_eqe6160ba',
    cat: 'fridge',
    brand: 'Electrolux',
    model: 'EQE6160BA',
    w: 913,
    h: 1782,
    d: 749,
    unavailable: false,
    retailers: [{ n: 'The Good Guys', url: 'https://www.thegoodguys.com.au/electrolux-eqe6160ba' }],
    geometry_v2: {
      closedEnvelope: {
        widthMm: 913,
        heightMm: { minimumMm: 1782, maximumMm: 1782 },
        depthMm: 749,
      },
    },
    geometry_v2_provenance: {
      fieldEvidence: {
        'closedEnvelope.widthMm': field,
        'closedEnvelope.heightMm': field,
        'closedEnvelope.depthMm': field,
      },
    },
    ...overrides,
  };
}

test('current retail classification requires availability and a product-page URL', () => {
  assert.equal(isCurrentRetailProduct(receiptProduct()), true);
  assert.equal(isCurrentRetailProduct(receiptProduct({ unavailable: true })), false);
  assert.equal(isCurrentRetailProduct(receiptProduct({
    retailers: [{ n: 'Retailer', url: 'https://www.thegoodguys.com.au/search?q=eqe6160ba' }],
  })), false);
  assert.equal(isCurrentRetailProduct(receiptProduct({
    retailers: [{ n: 'Unknown', url: 'https://example.com/products/eqe6160ba' }],
  })), false);
  assert.equal(isCurrentRetailProduct(receiptProduct({ retailers: [] })), false);
});

test('exact receipt dimensions outrank an axis-suspect registry observation without hiding the conflict', () => {
  const result = buildHistoricalApplianceReference({
    observations: [observation({
      brand: 'Electrolux', model: 'EQE6160BA', dimensions: { width: 1782, height: 913, depth: 749 },
    })],
    catalogProducts: [receiptProduct()],
    catalogSnapshotSha256: 'd'.repeat(64),
    generatedAt: '2026-07-12T12:40:00.000Z',
  });
  const [record] = result.records;
  assert.equal(record.lifecycleState, 'CURRENT_RETAIL');
  assert.equal(record.evidenceState, 'CATALOG_RECEIPT');
  assert.equal(record.lookupAction, 'AUTO_FILL');
  assert.deepEqual(record.dimensionsMm, { width: 913, height: 1782, depth: 749 });
  assert.equal(record.registryDimensionState, 'AXIS_SUSPECT');
  assert.ok(record.reasonCodes.includes('REGISTRY_AXIS_PERMUTATION_CONFLICT'));
});

test('registry-only exact identities separate consistent, missing, and conflicting dimensions', () => {
  const rows = [
    observation({ brand: 'Archive', model: 'SAME-1', sourceLine: 2 }),
    observation({ brand: 'Archive', model: 'SAME-1', sourceLine: 3 }),
    observation({ brand: 'Archive', model: 'MISSING-1', dimensions: { width: null, height: null, depth: null }, sourceLine: 4, qualityFlags: ['MISSING_DIMENSIONS'] }),
    observation({ brand: 'Archive', model: 'CONFLICT-1', dimensions: { width: 600, height: 850, depth: 600 }, sourceLine: 5 }),
    observation({ brand: 'Archive', model: 'CONFLICT-1', dimensions: { width: 650, height: 850, depth: 600 }, sourceLine: 6 }),
  ];
  const result = buildHistoricalApplianceReference({
    observations: rows,
    catalogProducts: [],
    catalogSnapshotSha256: 'd'.repeat(64),
    generatedAt: '2026-07-12T12:40:00.000Z',
  });
  const byModel = new Map(result.records.map((record) => [record.model, record]));
  assert.equal(byModel.get('SAME-1').lifecycleState, 'REGISTRY_ONLY');
  assert.equal(byModel.get('SAME-1').lookupAction, 'CONFIRM_REQUIRED');
  assert.equal(byModel.get('MISSING-1').lookupAction, 'MEASURE_REQUIRED');
  assert.equal(byModel.get('CONFLICT-1').evidenceState, 'INTERNAL_CONFLICT');
  assert.equal(byModel.get('CONFLICT-1').lookupAction, 'QUARANTINED');
});

test('historical Australian registry identities remain searchable after official availability ends', () => {
  const historical = observation({ brand: 'Archive', model: 'OLD-1', sourceLine: 8 });
  historical.activeInAustralia = false;
  historical.marketedInAustralia = true;
  historical.market.availabilityStatus = 'Unavailable';
  historical.market.submitStatus = 'Superseded';
  const result = buildHistoricalApplianceReference({
    observations: [historical],
    catalogProducts: [],
    catalogSnapshotSha256: 'd'.repeat(64),
    generatedAt: '2026-07-12T12:40:00.000Z',
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].model, 'OLD-1');
  assert.equal(result.records[0].lifecycleState, 'REGISTRY_ONLY');
  assert.equal(result.records[0].registryMarketState, 'INACTIVE_AU');
  assert.equal(result.records[0].lookupAction, 'CONFIRM_REQUIRED');
});

test('exact grouping preserves suffixes and classifies archived catalog identities independently', () => {
  const result = buildHistoricalApplianceReference({
    observations: [
      observation({ brand: 'Example', model: 'ABC-1', sourceLine: 2 }),
      observation({ brand: 'Example', model: 'ABC-1B', sourceLine: 3 }),
    ],
    catalogProducts: [receiptProduct({
      id: 'fridge-abc1', canonicalProductId: 'fa_prod_abc1', brand: 'Example', model: 'ABC-1',
      w: 600, h: 1700, d: 650, unavailable: true, retailers: [],
      geometry_v2: { closedEnvelope: { widthMm: 600, heightMm: { minimumMm: 1700, maximumMm: 1700 }, depthMm: 650 } },
    })],
    catalogSnapshotSha256: 'd'.repeat(64),
    generatedAt: '2026-07-12T12:40:00.000Z',
  });
  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records.map((record) => record.modelKey), ['ABC1', 'ABC1B']);
  assert.equal(result.records.find((record) => record.modelKey === 'ABC1').lifecycleState, 'CATALOG_ARCHIVED');
});

test('historical reference build is deterministic and reports independent state counts', () => {
  const input = {
    observations: [observation()],
    catalogProducts: [],
    catalogSnapshotSha256: 'd'.repeat(64),
    generatedAt: '2026-07-12T12:40:00.000Z',
  };
  const first = buildHistoricalApplianceReference(input);
  const second = buildHistoricalApplianceReference(structuredClone(input));
  assert.deepEqual(first, second);
  assert.equal(first.summary.records, 1);
  assert.deepEqual(first.summary.byLifecycle, { REGISTRY_ONLY: 1 });
  assert.deepEqual(first.summary.byEvidence, { REGISTRY_CONSISTENT: 1 });
  assert.deepEqual(first.summary.byLookupAction, { CONFIRM_REQUIRED: 1 });
});

test('conflicting, axis-suspect, and invalid dimensions are always quarantined', () => {
  for (const evidenceState of ['INTERNAL_CONFLICT', 'AXIS_SUSPECT', 'INVALID_DIMENSIONS']) {
    const record = createHistoricalReferenceRecord({
      ...base,
      evidenceState,
      lookupAction: 'QUARANTINED',
      dimensionsMm: null,
    });
    assert.equal(record.lookupAction, 'QUARANTINED');
  }
});

test('historical reference rejects mixed meanings, malformed hashes, and incomplete accepted dimensions', () => {
  assert.throws(
    () => createHistoricalReferenceRecord({ ...base, lookupAction: 'AUTO_FILL' }),
    /REGISTRY_CONSISTENT.*CONFIRM_REQUIRED|lookup/i,
  );
  assert.throws(
    () => createHistoricalReferenceRecord({ ...base, dimensionsMm: { width: 699, height: 1725 } }),
    /dimension/i,
  );
  assert.throws(
    () => createHistoricalReferenceRecord({
      ...base,
      sources: [{ ...sourceReceipt, snapshotSha256: 'not-a-hash' }],
    }),
    /sha256|hash/i,
  );
  assert.throws(
    () => createHistoricalReferenceRecord({ ...base, category: 'oven' }),
    /category/i,
  );
});

test('historical reference build verifies and consumes all four official Energy Rating snapshots', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-historical-reference-'));
  const categories = ['fridge', 'dishwasher', 'dryer', 'washing_machine'];
  const snapshots = [];
  for (const [index, category] of categories.entries()) {
    const bytes = Buffer.from([
      'Brand,Model No,Width,Height,Depth,Sold_in,SubmitStatus,Availability Status',
      `Brand ${index},MODEL-${index},${600 + index},${800 + index},${650 + index},Australia,Approved,Available`,
      '',
    ].join('\n'));
    const manifest = createRegistrySnapshotManifest({
      sourceId: `energy-rating:${category}`,
      sourceUrl: `https://example.gov.au/${category}.csv`,
      retrievedAt: '2026-07-12T12:40:00.000Z',
      mediaType: 'text/csv',
      bytes,
      licence: {
        id: 'CC-BY-3.0-AU',
        name: 'Creative Commons Attribution 3.0 Australia',
        url: 'https://creativecommons.org/licenses/by/3.0/au/',
        attribution: 'Australian Government Energy Rating',
        permitsRepositoryDerivatives: true,
      },
    });
    const objectPath = join(storageRoot, ...manifest.storage.objectPath.split('/'));
    await mkdir(dirname(objectPath), { recursive: true });
    await writeFile(objectPath, bytes);
    snapshots.push({ kind: 'dataset', category, manifest });
  }

  const result = await buildHistoricalReferenceFromOfficialSnapshots({
    snapshotsDocument: {
      schemaVersion: 1,
      acquiredAt: '2026-07-12T12:40:00.000Z',
      snapshots,
    },
    catalog: { products: [] },
    catalogBytes: Buffer.from('{"products":[]}\n'),
    storageRoot,
    canonicalizeBrand: (brand) => brand.replace(/^Brand /, 'Canonical '),
  });

  assert.equal(result.records.length, 4);
  assert.deepEqual(result.records.map((record) => record.category), [
    'dishwasher', 'dryer', 'fridge', 'washing_machine',
  ]);
  assert.deepEqual(result.records.map((record) => record.brand), [
    'Canonical 1', 'Canonical 2', 'Canonical 0', 'Canonical 3',
  ]);
  assert.deepEqual(Object.keys(result.sourceSnapshotHashes), [
    'energy-rating:dishwasher',
    'energy-rating:dryer',
    'energy-rating:fridge',
    'energy-rating:washing_machine',
    'fitappliance:catalog',
  ]);
});
