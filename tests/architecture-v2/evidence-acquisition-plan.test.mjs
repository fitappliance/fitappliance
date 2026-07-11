import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceAcquisitionPlan } from '../../src/domain/evidence-acquisition-plan.mjs';

test('uses exact manufacturer candidates and reviewed official overrides only', () => {
  const batch = { products: [{
    legacyRuntimeId: 'fridge-a', canonicalProductId: 'fa_a', brand: 'A', model: 'A1', category: 'fridge',
    sourceCandidates: [{ sourceUrl: 'https://www.fisherpaykel.com/a.pdf', transportHostType: 'manufacturer', identityOutcome: 'exact' }],
  }, {
    legacyRuntimeId: 'fridge-b', canonicalProductId: 'fa_b', brand: 'B', model: 'B1', category: 'fridge',
    sourceCandidates: [{ sourceUrl: 'https://retailer.example/b.pdf', transportHostType: 'retailer', identityOutcome: 'exact' }],
  }] };
  const plan = buildEvidenceAcquisitionPlan(batch, {
    overrides: { 'fridge-b': { sourceUrl: 'https://media3.bosch-home.com/Documents/specsheet/en-AU/B1.pdf' } },
  });
  assert.equal(plan.entries[0].selectionBasis, 'exact_manufacturer_candidate');
  assert.equal(plan.entries[1].selectionBasis, 'reviewed_official_override');
  assert.equal(plan.summary.ready, 2);
});

test('fails closed for retailer overrides and records an explicit missing-source outcome', () => {
  const batch = { products: [{
    legacyRuntimeId: 'dishwasher-a', canonicalProductId: 'fa_a', brand: 'A', model: 'A1', category: 'dishwasher', sourceCandidates: [],
  }] };
  assert.throws(() => buildEvidenceAcquisitionPlan(batch, {
    overrides: { 'dishwasher-a': { sourceUrl: 'https://www.appliancesonline.com.au/a.pdf' } },
  }), /official manufacturer host/i);
  const plan = buildEvidenceAcquisitionPlan(batch, {
    overrides: { 'dishwasher-a': { unavailableReason: 'no_official_pdf_found' } },
  });
  assert.equal(plan.entries[0].status, 'no_source');
  assert.equal(plan.summary.noSource, 1);
});
