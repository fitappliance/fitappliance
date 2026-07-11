import test from 'node:test';
import assert from 'node:assert/strict';

import { findIdentifier } from '../../src/domain/identity.mjs';
import { adaptLegacyAppliance } from '../../src/adapters/legacy-appliance.mjs';

const legacyFixture = {
  id: 'fridge-test-rf505',
  cat: 'fridge',
  brand: 'Fisher & Paykel',
  model: 'RF505ANUX1',
  w: 790,
  h: 1715,
  d: 695,
  door_swing_mm: 1200,
  features: ['Upright', '5B', 'Class 6'],
};

test('adapts valid legacy dimensions into an immutable unverified shadow candidate', () => {
  const input = { product: structuredClone(legacyFixture), evidence: null };
  const snapshot = structuredClone(input);

  const result = adaptLegacyAppliance(input);

  assert.equal(result.status, 'adapted');
  assert.equal(result.product.kind, 'shadow_candidate');
  assert.equal(
    findIdentifier(result.product, 'legacy_runtime_id').value,
    legacyFixture.id,
  );
  assert.equal(
    findIdentifier(result.product, 'manufacturer_model', legacyFixture.brand).value,
    legacyFixture.model,
  );
  assert.deepEqual(result.geometry.closedEnvelope, {
    widthMm: 790,
    heightMm: { minimumMm: 1715, maximumMm: 1715 },
    depthMm: 695,
  });
  assert.deepEqual(result.geometry.installation, {
    leftMm: null,
    rightMm: null,
    topMm: null,
    rearMm: null,
    frontMm: null,
  });
  assert.ok(result.warnings.includes('legacy_dimensions_unverified'));
  assert.ok(result.warnings.includes('installation_requirements_unknown'));
  assert.ok(result.warnings.includes('door_swing_not_reinterpreted'));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(input, snapshot);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.warnings), true);
});

test('keeps incomplete legacy dimensions unknown instead of filling or partially promoting them', () => {
  const result = adaptLegacyAppliance({
    product: { ...legacyFixture, d: null },
  });

  assert.equal(result.status, 'adapted');
  assert.deepEqual(result.geometry.closedEnvelope, {
    widthMm: null,
    heightMm: null,
    depthMm: null,
  });
  assert.ok(result.warnings.includes('legacy_dimensions_incomplete'));
});

test('quarantines invalid supplied dimensions', () => {
  for (const patch of [{ w: '790' }, { h: 0 }, { d: -1 }]) {
    const result = adaptLegacyAppliance({
      product: { ...legacyFixture, ...patch },
    });

    assert.equal(result.status, 'quarantined');
    assert.equal(result.product, null);
    assert.equal(result.geometry, null);
    assert.ok(result.errors.includes('invalid_legacy_dimensions'));
  }
});

test('quarantines an obvious upright fridge width-height inversion without auto-swapping', () => {
  const result = adaptLegacyAppliance({
    product: { ...legacyFixture, w: 1725, h: 796, d: 773 },
  });

  assert.equal(result.status, 'quarantined');
  assert.ok(result.errors.includes('suspected_upright_width_height_inversion'));
});

test('replaces inverted legacy axes only with exact field-level official dimension evidence', () => {
  const result = adaptLegacyAppliance({
    product: { ...legacyFixture, w: 1725, h: 796, d: 773 },
    evidence: {
      product_id: legacyFixture.id,
      status: 'verified',
      brand: legacyFixture.brand,
      model: legacyFixture.model,
      has_pdf_evidence: true,
      trust_level: 'dimensions_verified',
      verified_fields: ['dimensions'],
      confidence_score: 0.9,
      dimensions_mm: { width: 796, height: 1725, depth: 773 },
    },
  });

  assert.equal(result.status, 'adapted');
  assert.deepEqual(result.geometry.closedEnvelope, {
    widthMm: 796,
    heightMm: { minimumMm: 1725, maximumMm: 1725 },
    depthMm: 773,
  });
  assert.ok(result.warnings.includes('verified_evidence_dimensions_applied'));
  assert.ok(!result.warnings.includes('legacy_dimensions_unverified'));
  assert.ok(Object.values(result.geometry.installation).every((value) => value === null));
});

test('does not use dimension evidence with a mismatched identity or retailer trust', () => {
  for (const evidence of [
    {
      product_id: 'fridge-other',
      status: 'verified',
      brand: legacyFixture.brand,
      model: legacyFixture.model,
      has_pdf_evidence: true,
      trust_level: 'dimensions_verified',
      verified_fields: ['dimensions'],
      confidence_score: 0.9,
      dimensions_mm: { width: 796, height: 1725, depth: 773 },
    },
    {
      product_id: legacyFixture.id,
      status: 'verified',
      brand: legacyFixture.brand,
      model: legacyFixture.model,
      has_pdf_evidence: false,
      trust_level: 'retailer_spec',
      verified_fields: ['dimensions'],
      confidence_score: 0.9,
      dimensions_mm: { width: 796, height: 1725, depth: 773 },
    },
  ]) {
    const result = adaptLegacyAppliance({
      product: { ...legacyFixture, w: 1725, h: 796, d: 773 },
      evidence,
    });
    assert.equal(result.status, 'quarantined');
    assert.ok(result.errors.includes('suspected_upright_width_height_inversion'));
  }
});

test('does not misclassify legitimate wide chest products as axis inversions', () => {
  const result = adaptLegacyAppliance({
    product: {
      ...legacyFixture,
      model: 'CCF500DW',
      w: 1650,
      h: 835,
      d: 735,
      features: ['Chest', '6C', 'Class 8'],
    },
  });

  assert.equal(result.status, 'adapted');
  assert.equal(result.geometry.closedEnvelope.widthMm, 1650);
});

test('does not promote retailer-only evidence or generic legacy clearance fields', () => {
  const result = adaptLegacyAppliance({
    product: {
      ...legacyFixture,
      clearance: { left: 10, right: 10, top: 20, rear: 50 },
    },
    evidence: {
      product_id: legacyFixture.id,
      status: 'verified',
      trust_level: 'retailer_spec',
      source_type: 'retailer_spec',
      source_url: 'https://www.appliancesonline.com.au/example.pdf',
      clearance_verified: true,
    },
  });

  assert.equal(result.status, 'adapted');
  assert.ok(Object.values(result.geometry.installation).every((value) => value === null));
  assert.ok(result.warnings.includes('retailer_evidence_not_promoted'));
  assert.ok(result.warnings.includes('legacy_clearance_not_promoted'));
});

test('quarantines invalid identity without throwing out of the catalog audit', () => {
  const result = adaptLegacyAppliance({
    product: { ...legacyFixture, id: '', model: '' },
  });

  assert.equal(result.status, 'quarantined');
  assert.equal(result.product, null);
  assert.ok(result.errors.some((error) => error.startsWith('invalid_identity:')));
});
