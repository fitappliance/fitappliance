import assert from 'node:assert/strict';
import test from 'node:test';

import { createDimensionUnitObservation } from '../../src/domain/dimension-unit-observation.mjs';

const SHA = 'a'.repeat(64);
const FRAGMENT_SHA = 'b'.repeat(64);

function input(overrides = {}) {
  return {
    source: {
      contentSha256: SHA,
      rawText: 'Product dimensions H 850 mm x W 600 mm x D 635 mm',
      authority: 'OFFICIAL',
      market: 'AU',
      page: 3,
      fragmentSha256: FRAGMENT_SHA,
      bbox: [10, 20, 300, 80],
    },
    target: {
      referenceId: 'fa_ref_whirlpool_wweb9602iw',
      brand: 'Whirlpool',
      model: 'WWEB9602IW',
      category: 'washing_machine',
      market: 'AU',
      identityScope: 'EXACT_MODEL',
    },
    rawLabel: 'Product dimensions',
    rawTuple: 'H 850 mm x W 600 mm x D 635 mm',
    scope: 'product_closed_candidate',
    policyVersion: 'dimension-unit-observation-v1',
    ...overrides,
  };
}

test('explicit millimetres produce a bound, deterministic eligible observation', () => {
  const first = createDimensionUnitObservation(input());
  const second = createDimensionUnitObservation(input());

  assert.deepEqual(second, first);
  assert.match(first.observationId, /^dimension_unit_observation_[a-f0-9]{24}$/);
  assert.equal(first.unitState, 'EXPLICIT_METRIC');
  assert.equal(first.axisState, 'EXPLICIT_DEPTH');
  assert.equal(first.receiptEligible, true);
  assert.deepEqual(first.dimensionsMm, {
    height: { min: 850, max: 850 },
    width: { min: 600, max: 600 },
    depth: { min: 635, max: 635 },
  });
  assert.deepEqual(first.source.bbox, [10, 20, 300, 80]);
  assert.equal(first.source.rawText, input().source.rawText);
  assert.equal(first.rawTuple, input().rawTuple);
  assert.equal(first.rawLabel, input().rawLabel);
});

test('explicit adjustable height remains eligible because claim v2 represents ranges without flattening', () => {
  const scalar = createDimensionUnitObservation(input({
    source: { ...input().source, rawText: 'H 85 cm x W 60 cm x D 63.5 cm' },
    rawTuple: 'H 85 cm x W 60 cm x D 63.5 cm',
  }));
  assert.equal(scalar.unitState, 'EXPLICIT_METRIC');
  assert.deepEqual(scalar.dimensionsMm.depth, { min: 635, max: 635 });
  assert.equal(scalar.receiptEligible, true);

  const adjustable = createDimensionUnitObservation(input({
    source: { ...input().source, rawText: 'H 85-89.5 cm x W 60 cm x D 63.5 cm' },
    rawTuple: 'H 85-89.5 cm x W 60 cm x D 63.5 cm',
  }));
  assert.deepEqual(adjustable.dimensionsMm.height, { min: 850, max: 895 });
  assert.equal(adjustable.hasRange, true);
  assert.equal(adjustable.receiptEligible, true);
});

test('same-document metric context remains shadow-only', () => {
  const context = {
    rawText: 'All dimensions are in millimetres (mm).',
    contentSha256: SHA,
    fragmentSha256: 'c'.repeat(64),
    page: 2,
    bbox: [10, 10, 300, 40],
  };
  const observation = createDimensionUnitObservation(input({
    source: { ...input().source, rawText: 'All dimensions are in millimetres. Product H 850 x W 600 x D 635' },
    rawTuple: 'H 850 x W 600 x D 635',
    documentMetricContext: context,
  }));

  assert.equal(observation.unitState, 'DOCUMENT_METRIC_CONTEXT');
  assert.equal(observation.axisState, 'EXPLICIT_DEPTH');
  assert.equal(observation.receiptEligible, false);
  assert.deepEqual(observation.dimensionsMm.depth, { min: 635, max: 635 });
  assert.deepEqual(observation.documentMetricContext, context);

  const tampered = createDimensionUnitObservation(input({
    source: { ...input().source, rawText: 'All dimensions are in millimetres. Product H 850 x W 600 x D 635' },
    rawTuple: 'H 850 x W 600 x D 635',
    documentMetricContext: { ...context, rawText: 'Dimensions use centimetres (cm).' },
  }));
  assert.notEqual(tampered.observationId, observation.observationId);
  assert.throws(() => createDimensionUnitObservation(input({
    rawTuple: 'H 850 x W 600 x D 635',
    documentMetricContext: { rawText: context.rawText, contentSha256: SHA },
  })), /metric context.*fragment.*SHA-256|metric context.*provenance/i);
  assert.throws(() => createDimensionUnitObservation(input({
    rawTuple: 'H 850 x W 600 x D 635',
    documentMetricContext: { ...context, contentSha256: 'd'.repeat(64) },
  })), /metric context.*different artifact|content.*mismatch/i);
});

test('Whirlpool missing-unit H W L is inferred only as a shadow depth hint', () => {
  const rawText = 'Whirlpool WWEB9602IW dimensions H 850 x W 600 x L 635';
  const observation = createDimensionUnitObservation(input({
    source: { ...input().source, rawText },
    rawTuple: 'H 850 x W 600 x L 635',
  }));

  assert.equal(observation.unitState, 'DOMAIN_INFERRED_MM');
  assert.equal(observation.axisState, 'ORTHOGONAL_LENGTH_AS_DEPTH_HINT');
  assert.equal(observation.receiptEligible, false);
  assert.equal(observation.source.rawText, rawText);
  assert.deepEqual(observation.dimensionsMm.depth, { min: 635, max: 635 });
});

test('matching retailer hints corroborate without becoming authoritative or changing raw source text', () => {
  const rawText = 'Whirlpool WWEB9602IW dimensions H 850 x W 600 x L 635';
  const base = input({
    source: { ...input().source, rawText },
    rawTuple: 'H 850 x W 600 x L 635',
  });
  const withoutHints = createDimensionUnitObservation(base);
  const withHints = createDimensionUnitObservation({
    ...base,
    retailerHints: [
      {
        retailer: 'Retailer B', market: 'AU', exactModel: true,
        rawText: 'Dimensions (W x H x D): 600 x 850 x 635 mm',
        dimensionsMm: { width: 600, height: 850, depth: 635 },
        assetUrl: 'https://cdn.example.test/whirlpool/specification.pdf',
      },
      {
        retailer: 'Retailer A', market: 'AU', exactModel: true,
        rawText: 'Dimensions (W x H x D): 600 x 850 x 635 mm',
        dimensionsMm: { width: 600, height: 850, depth: 635 },
        assetUrl: 'https://cdn.example.test/whirlpool/specification.pdf',
      },
      {
        retailer: 'Retailer C', market: 'AU', exactModel: true,
        rawText: '600 wide, 850 high and 635 deep',
        dimensionsMm: { width: 600, height: 850, depth: 635 },
      },
    ],
  });

  assert.equal(withHints.unitState, 'RETAILER_HINT_CORROBORATED');
  assert.equal(withHints.axisState, 'ORTHOGONAL_LENGTH_AS_DEPTH_HINT');
  assert.equal(withHints.receiptEligible, false);
  assert.equal(withHints.source.rawText, withoutHints.source.rawText);
  assert.equal(withHints.rawTuple, withoutHints.rawTuple);
  assert.equal(withHints.retailerDiagnostics.hints, 3);
  assert.equal(withHints.retailerDiagnostics.copyFamilies.length, 1);
  assert.ok(withHints.retailerDiagnostics.copyFamilies.every((family) => family.dependent));
  assert.equal(withHints.retailerDiagnostics.authoritativeFamilies, 0);
});

test('retailer hints with unknown lineage remain separate dependent copy families', () => {
  const observation = createDimensionUnitObservation(input({
    retailerHints: [
      {
        retailer: 'Retailer A', market: 'AU', exactModel: true,
        rawText: '600 wide, 850 high and 635 deep',
        dimensionsMm: { width: 600, height: 850, depth: 635 },
      },
      {
        retailer: 'Retailer B', market: 'AU', exactModel: true,
        rawText: 'Width 610 Height 860 Depth 640',
        dimensionsMm: { width: 610, height: 860, depth: 640 },
      },
    ],
  }));

  assert.equal(observation.retailerDiagnostics.copyFamilies.length, 2);
  assert.ok(observation.retailerDiagnostics.copyFamilies.every((family) => (
    family.dependent && family.copyBasis.includes('UNKNOWN_LINEAGE')
  )));
  assert.equal(observation.retailerDiagnostics.authoritativeFamilies, 0);
});

test('package length and alternate depth labels remain axis ambiguous', () => {
  const packaged = createDimensionUnitObservation(input({
    source: { ...input().source, rawText: 'Packaged dimensions H 900 mm x W 650 mm x L 700 mm' },
    rawLabel: 'Packaged dimensions',
    rawTuple: 'H 900 mm x W 650 mm x L 700 mm',
    scope: 'delivery_package',
  }));
  assert.equal(packaged.unitState, 'EXPLICIT_METRIC');
  assert.equal(packaged.axisState, 'AXIS_AMBIGUOUS');
  assert.equal(packaged.dimensionsMm, null);
  assert.equal(packaged.receiptEligible, false);

  const variants = createDimensionUnitObservation(input({
    source: { ...input().source, rawText: 'W 600 mm H 850 mm D 600 mm D\' 635 mm D" 1100 mm' },
    rawTuple: 'W 600 mm H 850 mm D 600 mm D\' 635 mm D" 1100 mm',
  }));
  assert.equal(variants.unitState, 'EXPLICIT_METRIC');
  assert.equal(variants.axisState, 'AXIS_AMBIGUOUS');
  assert.equal(variants.dimensionsMm, null);
  assert.equal(variants.receiptEligible, false);
});

test('explicit 50 mm installation clearance is plausible but never receipt eligible here', () => {
  const clearance = createDimensionUnitObservation(input({
    source: { ...input().source, rawText: 'Installation clearances H 50 mm x W 50 mm x D 50 mm' },
    rawLabel: 'Installation clearances',
    rawTuple: 'H 50 mm x W 50 mm x D 50 mm',
    scope: 'installation_clearance',
  }));

  assert.equal(clearance.unitState, 'EXPLICIT_METRIC');
  assert.deepEqual(clearance.dimensionsMm.depth, { min: 50, max: 50 });
  assert.equal(clearance.receiptEligible, false);
});

test('explicit retailer or cross-market tuples remain ineligible for an official receipt', () => {
  const retailer = createDimensionUnitObservation(input({
    source: { ...input().source, authority: 'RETAILER' },
  }));
  const crossMarket = createDimensionUnitObservation(input({
    source: { ...input().source, market: 'NZ' },
  }));

  assert.equal(retailer.unitState, 'EXPLICIT_METRIC');
  assert.equal(retailer.receiptEligible, false);
  assert.equal(crossMarket.unitState, 'EXPLICIT_METRIC');
  assert.equal(crossMarket.receiptEligible, false);
});

test('mixed units, impossible values and absent inference authority fail closed', () => {
  const mixed = createDimensionUnitObservation(input({
    source: { ...input().source, rawText: 'H 850 mm x W 60 cm x D 635 mm' },
    rawTuple: 'H 850 mm x W 60 cm x D 635 mm',
  }));
  assert.equal(mixed.unitState, 'UNIT_CONFLICT');
  assert.equal(mixed.receiptEligible, false);

  const impossible = createDimensionUnitObservation(input({
    source: { ...input().source, rawText: 'H 8 mm x W 6 mm x D 6 mm' },
    rawTuple: 'H 8 mm x W 6 mm x D 6 mm',
  }));
  assert.equal(impossible.unitState, 'UNIT_CONFLICT');
  assert.equal(impossible.receiptEligible, false);

  const unknown = createDimensionUnitObservation(input({
    source: { ...input().source, rawText: 'H 850 x W 600 x D 635', authority: 'RETAILER' },
    rawTuple: 'H 850 x W 600 x D 635',
  }));
  assert.equal(unknown.unitState, 'UNIT_UNKNOWN');
  assert.equal(unknown.receiptEligible, false);
});

test('required bindings and locator shapes fail closed', () => {
  assert.throws(() => createDimensionUnitObservation(input({
    source: { ...input().source, contentSha256: 'bad' },
  })), /source content.*SHA-256/i);
  assert.throws(() => createDimensionUnitObservation(input({
    target: { ...input().target, identityScope: 'DOCUMENT_FAMILY' },
  })), /exact target identity/i);
  assert.throws(() => createDimensionUnitObservation(input({
    source: { ...input().source, bbox: [1, 2, 3] },
  })), /bbox/i);
});
