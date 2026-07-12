import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEnergyRatingRows,
  reconcileCatalogWithEnergy,
} from '../../src/domain/energy-rating-registry.mjs';
import {
  selectInstallationKnowledgePilot,
  validateFrozenInstallationKnowledgePilot,
} from '../../src/domain/installation-knowledge-pilot.mjs';
import { normalizeWelsRows, reconcileCatalogWithWels } from '../../src/domain/wels-registry.mjs';
import { buildInstallationResearchQueue } from '../../src/domain/installation-research-queue.mjs';

function energyRow(overrides = {}) {
  return {
    Brand: 'Electrolux',
    'Model No': 'EQE6160BA',
    Width: '1782',
    Height: '913',
    Depth: '749',
    Sold_in: 'Australia,New Zealand',
    SubmitStatus: 'Approved',
    'Availability Status': 'Available',
    'Registration Number': 'ARF1234',
    ...overrides,
  };
}

function product(overrides = {}) {
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
    priorityScore: 80,
    retailers: [{ n: 'Retailer', url: 'https://retailer.example/p', verified_at: '2026-07-01' }],
    ...overrides,
  };
}

test('Energy Rating normalization preserves raw axes and exact model suffixes', () => {
  const [observation] = normalizeEnergyRatingRows([{ record: energyRow(), sourceLine: 2 }], {
    category: 'fridge',
    sourceId: 'energy-rating:fridge',
    snapshotSha256: 'a'.repeat(64),
  });

  assert.equal(observation.identity.modelRaw, 'EQE6160BA');
  assert.equal(observation.identity.modelKey, 'EQE6160BA');
  assert.deepEqual(observation.dimensionsMm, { width: 1782, height: 913, depth: 749 });
  assert.equal(observation.activeInAustralia, true);

  const [sibling] = normalizeEnergyRatingRows([{ record: energyRow({ 'Model No': 'EQE6160BAB' }), sourceLine: 3 }], {
    category: 'fridge',
    sourceId: 'energy-rating:fridge',
    snapshotSha256: 'a'.repeat(64),
  });
  assert.notEqual(observation.identity.modelKey, sibling.identity.modelKey);
});

test('known W/H inversion is AXIS_SUSPECT and never accepted as consistent', () => {
  const observations = normalizeEnergyRatingRows([{ record: energyRow(), sourceLine: 2 }], {
    category: 'fridge',
    sourceId: 'energy-rating:fridge',
    snapshotSha256: 'a'.repeat(64),
  });
  const [result] = reconcileCatalogWithEnergy({ products: [product()], observations, toleranceMm: 2 });

  assert.equal(result.state, 'AXIS_SUSPECT');
  assert.deepEqual(result.axisPermutation, { width: 'height', height: 'width', depth: 'depth' });
  assert.equal(result.canPromoteDimensions, false);
  assert.deepEqual(result.catalogDimensionsMm, { width: 913, height: 1782, depth: 749 });
});

test('duplicate exact model rows with different dimensions are quarantined', () => {
  const observations = normalizeEnergyRatingRows([
    { record: energyRow(), sourceLine: 2 },
    { record: energyRow({ Width: '910', Height: '1780' }), sourceLine: 3 },
  ], {
    category: 'fridge',
    sourceId: 'energy-rating:fridge',
    snapshotSha256: 'b'.repeat(64),
  });
  const [result] = reconcileCatalogWithEnergy({ products: [product()], observations });

  assert.equal(result.state, 'REGISTRY_INTERNAL_CONFLICT');
  assert.equal(result.canPromoteDimensions, false);
  assert.equal(result.registryObservations.length, 2);
});

test('exact suffix mismatch remains NO_EXACT_REGISTRY_MATCH', () => {
  const observations = normalizeEnergyRatingRows([{ record: energyRow({ 'Model No': 'EQE6160BAB' }), sourceLine: 2 }], {
    category: 'fridge',
    sourceId: 'energy-rating:fridge',
    snapshotSha256: 'c'.repeat(64),
  });
  const [result] = reconcileCatalogWithEnergy({ products: [product()], observations });
  assert.equal(result.state, 'NO_EXACT_REGISTRY_MATCH');
  assert.equal(result.canPromoteDimensions, false);
});

test('exact registry identity does not misclassify a catalog with missing dimensions as a numeric conflict', () => {
  const observations = normalizeEnergyRatingRows([{ record: energyRow(), sourceLine: 2 }], {
    category: 'fridge',
    sourceId: 'energy-rating:fridge',
    snapshotSha256: 'f'.repeat(64),
  });
  const [result] = reconcileCatalogWithEnergy({ products: [product({ w: null, h: null, d: null })], observations });
  assert.equal(result.state, 'CATALOG_DIMENSIONS_MISSING');
  assert.equal(result.canPromoteDimensions, false);
  assert.equal('deltasMm' in result, false);
});

test('pilot selection freezes 50 refrigerators and 50 dishwashers deterministically', () => {
  const categories = ['fridge', 'dishwasher'];
  const products = [];
  const reconciliations = [];
  const states = ['EXACT_CONSISTENT', 'EXACT_DIMENSION_CONFLICT', 'NO_EXACT_REGISTRY_MATCH'];
  for (const category of categories) {
    for (let index = 0; index < 90; index += 1) {
      const canonicalProductId = `${category}-${String(index).padStart(3, '0')}`;
      products.push(product({
        id: canonicalProductId,
        canonicalProductId,
        cat: category,
        brand: `Brand ${index % 12}`,
        model: `MODEL-${index}`,
        priorityScore: 100 - index,
      }));
      reconciliations.push({
        canonicalProductId,
        category,
        state: states[index % states.length],
        reasonCodes: [],
      });
    }
  }

  const input = {
    products,
    reconciliations,
    snapshotHashes: ['a'.repeat(64), 'b'.repeat(64)],
    asOf: '2026-07-12T00:00:00.000Z',
    categoryTargets: { fridge: 50, dishwasher: 50 },
    perBrandCap: 8,
  };
  const first = selectInstallationKnowledgePilot(input);
  const second = selectInstallationKnowledgePilot({ ...input, products: [...products].reverse() });

  assert.deepEqual(second, first);
  assert.equal(first.products.length, 100);
  assert.equal(new Set(first.products.map((row) => row.canonicalProductId)).size, 100);
  assert.deepEqual(first.summary.byCategory, { dishwasher: 50, fridge: 50 });
  for (const count of Object.values(first.summary.byCategoryBrand)) assert.ok(count <= 8);
  assert.equal(validateFrozenInstallationKnowledgePilot({
    pilot: first,
    products,
    snapshotHashes: input.snapshotHashes,
    asOf: input.asOf,
    categoryTargets: input.categoryTargets,
    perBrandCap: input.perBrandCap,
    maxRetailerAgeDays: 90,
  }), true);
  assert.throws(
    () => validateFrozenInstallationKnowledgePilot({
      pilot: first,
      products,
      snapshotHashes: ['f'.repeat(64)],
      asOf: input.asOf,
      categoryTargets: input.categoryTargets,
      perBrandCap: input.perBrandCap,
      maxRetailerAgeDays: 90,
    }),
    /snapshot|refresh/i,
  );
});

test('pilot excludes stale or explicitly out-of-stock retailer observations', () => {
  const products = [
    product({ canonicalProductId: 'fresh', id: 'fresh', retailers: [{ url: 'https://retailer.example/fresh', verified_at: '2026-07-01', stock: 'Yes' }] }),
    product({ canonicalProductId: 'stale', id: 'stale', retailers: [{ url: 'https://retailer.example/stale', verified_at: '2025-12-01' }] }),
    product({ canonicalProductId: 'out', id: 'out', retailers: [{ url: 'https://retailer.example/out', verified_at: '2026-07-01', stock: 'No' }] }),
  ];
  const reconciliations = products.map((row) => ({ canonicalProductId: row.canonicalProductId, state: 'EXACT_CONSISTENT', reasonCodes: [] }));
  const pilot = selectInstallationKnowledgePilot({
    products,
    reconciliations,
    asOf: '2026-07-12T00:00:00.000Z',
    categoryTargets: { fridge: 3 },
  });
  assert.deepEqual(pilot.products.map((row) => row.canonicalProductId), ['fresh']);
  assert.deepEqual(pilot.selectionShortfalls.at(-1), { category: 'fridge', stratum: 'category_total', requested: 3, selected: 1 });
});

test('pilot and research queue preserve chest-freezer lid operation semantics', () => {
  const chest = product({
    canonicalProductId: 'chest-1',
    id: 'chest-1',
    model: 'HSA21530',
    readableSpec: '215L Chest Freezer',
  });
  const pilot = selectInstallationKnowledgePilot({
    products: [chest],
    reconciliations: [{ canonicalProductId: 'chest-1', state: 'EXACT_CONSISTENT', reasonCodes: [] }],
    asOf: '2026-07-12T00:00:00.000Z',
    categoryTargets: { fridge: 1 },
  });
  assert.equal(pilot.products[0].formFactor, 'chest');
  const queue = buildInstallationResearchQueue({ pilot, catalogProducts: [chest] });
  assert.ok(queue.cases[0].missingFields.includes('operationEnvelope.lidOpenHeightMm'));
  assert.ok(!queue.cases[0].missingFields.includes('operationEnvelope.doorOpenDepthMm'));
  assert.ok(!queue.cases[0].missingFields.includes('operationEnvelope.hingeSideSpaceMm'));
});

test('WELS parent and variant codes corroborate identity but never geometry', () => {
  const observations = normalizeWelsRows([{
    record: {
      Brand: 'FISHER & PAYKEL',
      Product: 'Dishwasher',
      'Model name': 'DW60UD4B4',
      'Model code': 'DW60UD4B4',
      'Variant model code': 'DW60UD4X4, DW60UM4G4,',
      'Model status': 'Registered',
      'Registration number': 'D48886',
      'License number': '0355',
    },
    sourceLine: 10,
  }], { sourceId: 'wels', snapshotSha256: 'd'.repeat(64) });

  const [result] = reconcileCatalogWithWels({
    products: [product({
      id: 'dishwasher-dw60um4g4',
      canonicalProductId: 'fa_prod_dw60um4g4',
      cat: 'dishwasher',
      brand: 'Fisher & Paykel',
      model: 'DW60UM4G4',
    })],
    observations,
  });

  assert.equal(result.state, 'WELS_EXACT_REGISTERED');
  assert.equal(result.matchRelationship, 'variant_model_code');
  assert.equal(result.canPromoteDimensions, false);
  assert.equal('dimensionsMm' in result, false);
});

test('research queue names exact missing V3 fields and next source route', () => {
  const pilot = {
    products: [{
      canonicalProductId: 'fa_prod_eqe6160ba',
      legacyRuntimeId: 'fridge-eqe6160ba',
      category: 'fridge',
      brand: 'Electrolux',
      model: 'EQE6160BA',
      reconciliationState: 'AXIS_SUSPECT',
      reasonCodes: ['NON_IDENTITY_AXIS_PERMUTATION_MATCHES_CATALOG'],
    }],
  };
  const catalogProducts = [product({
    geometry_v2_provenance: {
      fieldEvidence: {
        'closedEnvelope.widthMm': { contentSha256: 'd'.repeat(64), receiptBindingSha256: 'e'.repeat(64), fragmentSha256: 'f'.repeat(64), identityOutcome: 'exact', sourceStatus: 'current', applicableModels: ['EQE6160BA'] },
        'closedEnvelope.heightMm': { contentSha256: 'd'.repeat(64), receiptBindingSha256: 'e'.repeat(64), fragmentSha256: 'f'.repeat(64), identityOutcome: 'exact', sourceStatus: 'current', applicableModels: ['EQE6160BA'] },
        'closedEnvelope.depthMm': { contentSha256: 'd'.repeat(64), receiptBindingSha256: 'e'.repeat(64), fragmentSha256: 'f'.repeat(64), identityOutcome: 'exact', sourceStatus: 'current', applicableModels: ['EQE6160BA'] },
      },
    },
  })];
  const queue = buildInstallationResearchQueue({ pilot, catalogProducts, welsReconciliations: [] });

  assert.equal(queue.cases.length, 1);
  assert.ok(queue.cases[0].missingFields.includes('installationClearance.rearMm'));
  assert.ok(!queue.cases[0].missingFields.includes('closedEnvelope.widthMm'));
  assert.equal(queue.cases[0].nextAction.strategy, 'exact_official_installation_document');
  assert.equal(queue.cases[0].publicationState, 'shadow_quarantined');
});

test('legacy V2 receipt fields remain research gaps until V3 exact-model re-attestation', () => {
  const pilot = { frozen: true, products: [{
    canonicalProductId: 'legacy-1', legacyRuntimeId: 'legacy-1', category: 'fridge', brand: 'Example', model: 'MODEL1', formFactor: 'upright', reconciliationState: 'EXACT_CONSISTENT', reasonCodes: [],
  }] };
  const catalogProducts = [{
    canonicalProductId: 'legacy-1', model: 'MODEL1', geometry_v2_provenance: { fieldEvidence: {
      'closedEnvelope.widthMm': { receiptBindingSha256: 'e'.repeat(64) },
    } },
  }];
  const queue = buildInstallationResearchQueue({ pilot, catalogProducts });
  assert.ok(queue.cases[0].legacyReceiptBoundFields.includes('closedEnvelope.widthMm'));
  assert.ok(queue.cases[0].missingFields.includes('closedEnvelope.widthMm'));
  assert.ok(!queue.cases[0].acceptedV3Fields.includes('closedEnvelope.widthMm'));
});
