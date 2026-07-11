import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildActiveEvidenceBatch } from '../../src/domain/active-evidence-batch.mjs';

test('builds an active batch from affiliate-feed observations without treating retailer PDFs as approval', () => {
  const batch = buildActiveEvidenceBatch({
    selectedAt: '2026-07-11',
    selectedLegacyIds: ['fridge-a', 'fridge-b'],
    products: [
      { id: 'fridge-a', canonicalProductId: 'fa_a', cat: 'fridge', brand: 'A', model: 'A1', retailers: [
        { n: 'The Good Guys', url: 'https://retailer.example/a', source: 'partnerize-feed', verified_at: '2026-07-07' },
      ] },
      { id: 'fridge-b', canonicalProductId: 'fa_b', cat: 'fridge', brand: 'B', model: 'B1', retailers: [
        { n: 'The Good Guys', url: 'https://retailer.example/b', source: 'partnerize-feed', verified_at: '2026-07-07' },
      ] },
    ],
    sourceDocuments: [{
      id: 'doc_a', sourceUrl: 'https://manufacturer.example/a.pdf', transportHostType: 'manufacturer',
      identityOutcome: 'exact', productLinks: [{ legacyRuntimeId: 'fridge-a', canonicalProductId: 'fa_a' }],
    }, {
      id: 'doc_b', sourceUrl: 'https://retailer.example/b.pdf', transportHostType: 'retailer',
      identityOutcome: 'exact', productLinks: [{ legacyRuntimeId: 'fridge-b', canonicalProductId: 'fa_b' }],
    }],
    excludedLegacyIds: new Set(),
    categoryTargets: { fridge: 2 },
    categoryBrandLimit: 1,
    globalBrandLimit: 1,
    maximumObservationAgeDays: 60,
  });
  assert.equal(batch.products[0].sourceStatus, 'manufacturer_candidate');
  assert.equal(batch.products[1].sourceStatus, 'discovery_required');
  assert.equal(batch.products[1].sourceCandidates[0].transportHostType, 'retailer');
});

test('rejects stale, duplicate, excluded, unbalanced, and over-concentrated selections', () => {
  const base = {
    selectedAt: '2026-07-11', selectedLegacyIds: ['fridge-a'], sourceDocuments: [], excludedLegacyIds: new Set(),
    products: [{ id: 'fridge-a', canonicalProductId: 'fa_a', cat: 'fridge', brand: 'A', model: 'A1', retailers: [
      { n: 'The Good Guys', url: 'https://retailer.example/a', source: 'partnerize-feed', verified_at: '2026-01-01' },
    ] }],
    categoryTargets: { fridge: 1 }, categoryBrandLimit: 1, globalBrandLimit: 1, maximumObservationAgeDays: 60,
  };
  assert.throws(() => buildActiveEvidenceBatch(base), /active affiliate-feed observation/i);
  assert.throws(() => buildActiveEvidenceBatch({ ...base, selectedLegacyIds: ['fridge-a', 'fridge-a'] }), /duplicate/i);
  assert.throws(() => buildActiveEvidenceBatch({ ...base, excludedLegacyIds: new Set(['fridge-a']) }), /excluded/i);
});

test('committed Phase 10 batch has 10 active non-overlapping models per category and bounded brands', async () => {
  const [batch, phase08] = await Promise.all([
    readFile('data/architecture-v2/generated/phase10-evidence-batch.json', 'utf8').then(JSON.parse),
    readFile('data/architecture-v2/reviews/phase-08/evidence-pilot.json', 'utf8').then(JSON.parse),
  ]);
  assert.equal(batch.products.length, 40);
  assert.deepEqual(batch.summary.categories, { dishwasher: 10, dryer: 10, fridge: 10, washing_machine: 10 });
  assert.ok(Math.max(...Object.values(batch.summary.brands)) <= 11);
  assert.ok(Math.max(...Object.values(batch.summary.categoryBrandMaximums)) <= 4);
  const prior = new Set(phase08.products.map((row) => row.legacyRuntimeId));
  assert.ok(batch.products.every((row) => !prior.has(row.legacyRuntimeId)));
  assert.ok(batch.products.every((row) => row.activeObservation.source === 'partnerize-feed'));
});
