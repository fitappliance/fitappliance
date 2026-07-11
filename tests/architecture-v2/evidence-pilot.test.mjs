import test from 'node:test';
import assert from 'node:assert/strict';
import { selectEvidencePilot } from '../../src/domain/evidence-pilot.mjs';

function product(id, cat, brand, priorityScore = 0, retailerCount = 0) {
  return {
    id,
    canonicalProductId: `fa_prod_${id}`,
    cat,
    brand,
    model: id.toUpperCase(),
    priorityScore,
    retailers: Array.from({ length: retailerCount }, (_, index) => ({ n: `R${index}` })),
  };
}

function document(id, productId, overrides = {}) {
  return {
    id,
    sourceUrl: `https://manufacturer.example/${productId}.pdf`,
    transportHostType: 'manufacturer',
    identityOutcome: 'exact',
    productLinks: [{ legacyRuntimeId: productId, canonicalProductId: `fa_prod_${productId}` }],
    ...overrides,
  };
}

test('selects a deterministic category-balanced pilot with bounded brand concentration', () => {
  const categories = ['fridge', 'dishwasher', 'dryer', 'washing_machine'];
  const products = categories.flatMap((cat) => Array.from({ length: 7 }, (_, index) =>
    product(`${cat}-${index}`, cat, index < 2 ? 'Brand A' : `Brand ${cat}-${index}`, 100 - index, 1 + (index % 3))
  ));
  const sourceDocuments = products.map((row, index) => document(`doc-${index}`, row.id));

  const first = selectEvidencePilot({
    products,
    sourceDocuments,
    limit: 20,
    brandLimit: 3,
    categoryTargets: Object.fromEntries(categories.map((cat) => [cat, 5])),
  });
  const second = selectEvidencePilot({
    products: [...products].reverse(),
    sourceDocuments: [...sourceDocuments].reverse(),
    limit: 20,
    brandLimit: 3,
    categoryTargets: Object.fromEntries(categories.map((cat) => [cat, 5])),
  });

  assert.deepEqual(first, second);
  assert.equal(first.length, 20);
  assert.equal(new Set(first.map((row) => row.canonicalProductId)).size, 20);
  for (const category of categories) {
    assert.equal(first.filter((row) => row.category === category).length, 5);
  }
  const brandCounts = Object.groupBy(first, (row) => row.brand);
  assert.ok(Object.values(brandCounts).every((rows) => rows.length <= 3));
});

test('excludes documents without exact canonical identity and prefers manufacturer transport', () => {
  const products = [
    product('official', 'fridge', 'A', 1, 1),
    product('retailer', 'fridge', 'B', 100, 3),
    product('ambiguous', 'fridge', 'C', 1000, 3),
    product('no-retailer', 'fridge', 'D', 2000, 0),
  ];
  const sourceDocuments = [
    document('doc-official', 'official'),
    document('doc-retailer', 'retailer', { transportHostType: 'retailer' }),
    document('doc-ambiguous', 'ambiguous', { identityOutcome: 'ambiguous' }),
    document('doc-no-retailer', 'no-retailer'),
  ];

  const selected = selectEvidencePilot({
    products,
    sourceDocuments,
    limit: 2,
    brandLimit: 2,
    categoryTargets: { fridge: 2 },
  });

  assert.deepEqual(selected.map((row) => row.legacyRuntimeId), ['official', 'retailer']);
  assert.equal(selected[0].sourceDocumentId, 'doc-official');
});

test('fails closed when category targets cannot be satisfied', () => {
  assert.throws(() => selectEvidencePilot({
    products: [product('only', 'fridge', 'A', 0, 1)],
    sourceDocuments: [document('doc-only', 'only')],
    limit: 2,
    brandLimit: 2,
    categoryTargets: { fridge: 2 },
  }), /unable to satisfy evidence pilot target/i);
});
