import test from 'node:test';
import assert from 'node:assert/strict';

import { auditCatalog } from '../../scripts/architecture-v2/shadow-audit.mjs';

const baseProduct = {
  id: 'dishwasher-valid',
  cat: 'dishwasher',
  brand: 'Miele',
  model: 'G5000',
  w: 598,
  h: 845,
  d: 600,
  door_swing_mm: 0,
  features: ['Built-in'],
};

const catalogFixture = {
  schema_version: 1,
  products: [
    baseProduct,
    {
      ...baseProduct,
      id: 'fridge-chest',
      cat: 'fridge',
      brand: 'CHiQ',
      model: 'CCF500DW',
      w: 1650,
      h: 835,
      d: 735,
      features: ['Chest'],
    },
    {
      ...baseProduct,
      id: 'fridge-inverted',
      cat: 'fridge',
      brand: 'Electrolux',
      model: 'EBE5367BC',
      w: 1725,
      h: 796,
      d: 773,
      features: ['Upright'],
    },
    {
      ...baseProduct,
      id: 'dryer-incomplete',
      cat: 'dryer',
      brand: 'LG',
      model: 'DVH5-08W',
      d: null,
      features: ['Heat pump'],
    },
  ],
};

const evidenceFixture = {
  products: {
    'dishwasher-valid': {
      product_id: 'dishwasher-valid',
      trust_level: 'retailer_spec',
      source_type: 'retailer_spec',
    },
  },
};

test('audits a catalog deterministically without mutating either document', () => {
  const catalog = structuredClone(catalogFixture);
  const evidence = structuredClone(evidenceFixture);
  const catalogSnapshot = structuredClone(catalog);
  const evidenceSnapshot = structuredClone(evidence);

  const first = auditCatalog(catalog, evidence);
  const second = auditCatalog(structuredClone(catalog), structuredClone(evidence));

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(catalog, catalogSnapshot);
  assert.deepEqual(evidence, evidenceSnapshot);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.categories), true);
});

test('reports stable category, quarantine, warning, and evidence counts', () => {
  const summary = auditCatalog(catalogFixture, evidenceFixture);

  assert.equal(summary.totalProducts, 4);
  assert.deepEqual(summary.statusCounts, { adapted: 3, quarantined: 1 });
  assert.deepEqual(summary.categories, {
    dishwasher: { total: 1, adapted: 1, quarantined: 0 },
    dryer: { total: 1, adapted: 1, quarantined: 0 },
    fridge: { total: 2, adapted: 1, quarantined: 1 },
  });
  assert.equal(summary.warningCounts.retailer_evidence_not_promoted, 1);
  assert.equal(summary.warningCounts.legacy_dimensions_incomplete, 1);
  assert.deepEqual(summary.errorCounts, {
    suspected_upright_width_height_inversion: 1,
  });
  assert.deepEqual(summary.evidenceCounts, { matched: 1, missing: 3 });
  assert.deepEqual(summary.quarantinedProducts, [{
    legacyId: 'fridge-inverted',
    category: 'fridge',
    errors: ['suspected_upright_width_height_inversion'],
  }]);
});

test('reports duplicate legacy IDs as product-level quarantine problems', () => {
  const summary = auditCatalog({
    products: [baseProduct, { ...baseProduct }],
  });

  assert.deepEqual(summary.statusCounts, { adapted: 0, quarantined: 2 });
  assert.deepEqual(summary.errorCounts, { duplicate_legacy_id: 2 });
  assert.equal(summary.quarantinedProducts.length, 2);
});

test('reports an inverted legacy row as adapted when exact official dimensions are available', () => {
  const evidence = {
    products: {
      'fridge-inverted': {
        product_id: 'fridge-inverted',
        status: 'verified',
        brand: 'Electrolux',
        model: 'EBE5367BC',
        has_pdf_evidence: true,
        trust_level: 'dimensions_verified',
        verified_fields: ['dimensions'],
        confidence_score: 0.9,
        dimensions_mm: { width: 796, height: 1725, depth: 773 },
      },
    },
  };
  const summary = auditCatalog({ products: [catalogFixture.products[2]] }, evidence);

  assert.deepEqual(summary.statusCounts, { adapted: 1, quarantined: 0 });
  assert.equal(summary.warningCounts.verified_evidence_dimensions_applied, 1);
  assert.deepEqual(summary.errorCounts, {});
});

test('rejects malformed top-level catalog and evidence documents', () => {
  for (const catalog of [null, [], {}, { products: {} }]) {
    assert.throws(() => auditCatalog(catalog), /catalog.*products/i);
  }
  assert.throws(
    () => auditCatalog(catalogFixture, { products: [] }),
    /evidence.*products/i,
  );
});
