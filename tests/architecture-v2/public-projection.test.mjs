import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildLifecycleNeutralSafetyProjection,
  buildPublicProjection,
  normalizePublicProduct,
} from '../../src/domain/public-projection.mjs';

test('public normalization keeps unknown measurements null and fills presentation fields only', () => {
  const result = normalizePublicProduct({
    id: 'fridge-1', cat: 'fridge', brand: 'A', model: 'M', w: 600, h: 1700, d: 650,
    retailers: [], unavailable: true,
  });
  assert.equal(result.kwh_year, null);
  assert.equal(result.stars, null);
  assert.equal(result.door_swing_mm, null);
  assert.equal(result.price, null);
  assert.deepEqual(result.features, []);
  assert.equal(result.sponsored, false);
  assert.match(result.emoji, /\S/);
});

test('public normalization derives door projection only from explicit 90-degree depth evidence', () => {
  const product = normalizePublicProduct({
    id: 'washer-a',
    cat: 'washtower_combo',
    door_swing_mm: null,
    dimensions: { depth_mm: 830, door_open_90_depth_mm: 1460 },
  });

  assert.equal(product.door_swing_mm, 630);

  const ambiguous = normalizePublicProduct({
    id: 'washer-b',
    cat: 'washing_machine',
    door_swing_mm: 250,
  });
  assert.equal(ambiguous.door_swing_mm, null);
});

test('receipt-bound geometry never converts door-open depth into hinge-side swing', () => {
  const evidence = {
    sourceUrl: 'https://www.example.com/spec.pdf',
    contentSha256: 'a'.repeat(64),
    receiptBindingSha256: 'b'.repeat(64),
  };
  const product = normalizePublicProduct({
    id: 'receipt-bound-fridge',
    cat: 'fridge',
    door_swing_mm: null,
    inferred_door_swing: true,
    flags: { reversible_door: true },
    dimensions: { depth_mm: 650, door_open_90_depth_mm: 1100 },
    geometry_v2: {
      category: 'fridge', formFactor: 'upright',
      closedEnvelope: {
        widthMm: 600,
        heightMm: { minimumMm: 1700, maximumMm: 1700 },
        depthMm: 650,
      },
      installation: { leftMm: null, rightMm: null, topMm: null, rearMm: null, frontMm: null },
      operation: { doorOpenDepthMm: 1100, hingeSideSpaceMm: null, lidOpenHeightMm: null },
      service: { plumbingRearMm: null, rearServicesMm: null, rearVentilationMm: null },
      delivery: { widthMm: null, heightMm: null, depthMm: null },
    },
    geometry_v2_provenance: {
      evidenceLevel: 'dimensions',
      fieldEvidence: {
        'closedEnvelope.widthMm': evidence,
        'closedEnvelope.heightMm': evidence,
        'closedEnvelope.depthMm': evidence,
        'operation.doorOpenDepthMm': evidence,
      },
      verifiedFitEligible: false,
      successfulFitOutcome: 'INSUFFICIENT_DATA',
    },
  });

  assert.equal(product.door_swing_mm, null);
  assert.equal(Object.hasOwn(product, 'inferred_door_swing'), false);
  assert.equal(product.flags.reversible_door, null);
});

test('builds a stable projection while retaining legacy URLs as external identifiers', () => {
  const registry = { products: [{ id: 'fa_prod_a', category: 'fridge', brand: 'A', model: 'M', identifiers: [] }], identifierMappings: [{ legacyRuntimeId: 'fridge-1', canonicalProductId: 'fa_prod_a' }] };
  const catalog = { products: [{ id: 'fridge-1', cat: 'fridge', brand: 'A', model: 'M', w: 600 }] };
  const result = buildPublicProjection(registry, catalog);
  assert.equal(result.products[0].id, 'fridge-1');
  assert.equal(result.products[0].canonicalProductId, 'fa_prod_a');
  assert.equal(result.products[0].w, 600);
});

test('lifecycle-neutral safety projection preserves already-published canonical identities', () => {
  const released = {
    schema_version: 3,
    last_updated: '2026-07-21',
    products: [{
      id: 'legacy-duplicate',
      canonicalProductId: 'fa_prod_pre_merge',
      cat: 'fridge',
      brand: 'A',
      model: 'M',
      evidence: { trust_level: 'verified_fit', clearance_verified: true },
    }],
  };
  const result = buildLifecycleNeutralSafetyProjection(released);

  assert.equal(result.products[0].canonicalProductId, 'fa_prod_pre_merge');
  assert.equal(result.products[0].evidence.trust_level, 'evidence_pending');
});

test('refuses missing and duplicate mappings', () => {
  const catalog = { products: [{ id: 'fridge-1', cat: 'fridge', brand: 'A', model: 'M' }] };
  assert.throws(() => buildPublicProjection({ products: [], identifierMappings: [] }, catalog), /mapping/i);
  assert.throws(() => buildPublicProjection({ products: [], identifierMappings: [
    { legacyRuntimeId: 'fridge-1', canonicalProductId: 'a' }, { legacyRuntimeId: 'fridge-1', canonicalProductId: 'b' },
  ] }, catalog), /duplicate/i);
});

test('legacy verified_fit labels are downgraded without receipt-bound geometry', () => {
  const result = normalizePublicProduct({
    id: 'legacy-fit', cat: 'fridge', brand: 'A', model: 'M', w: 600, h: 1700, d: 650,
    evidence: {
      has_pdf_evidence: true, trust_level: 'verified_fit', clearance_verified: true,
      verified_fields: ['dimensions', 'clearance'],
    },
  });
  assert.equal(result.evidence.trust_level, 'evidence_pending');
  assert.equal(result.evidence.clearance_verified, false);
  assert.deepEqual(result.evidence.verified_fields, []);
  assert.equal(result.evidence.legacy_trust_downgraded, true);
});

test('receipt-bound complete geometry retains verified publication status', () => {
  const fields = [
    'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    'installation.leftMm', 'installation.rightMm', 'installation.topMm', 'installation.rearMm',
  ];
  const fieldEvidence = Object.fromEntries(fields.map((field) => [field, {
    sourceUrl: 'https://www.example.com/spec.pdf',
    contentSha256: 'a'.repeat(64),
    receiptBindingSha256: 'b'.repeat(64),
  }]));
  const result = normalizePublicProduct({
    id: 'verified-fit', cat: 'fridge', brand: 'A', model: 'M',
    geometry_v2: {
      category: 'fridge', formFactor: null,
      closedEnvelope: { widthMm: 600, heightMm: { minimumMm: 1700, maximumMm: 1700 }, depthMm: 650 },
      installation: { leftMm: 5, rightMm: 5, topMm: 20, rearMm: 10, frontMm: null },
      operation: { doorOpenDepthMm: null, hingeSideSpaceMm: null, lidOpenHeightMm: null },
      service: { plumbingRearMm: null, rearServicesMm: null, rearVentilationMm: null },
      delivery: { widthMm: null, heightMm: null, depthMm: null },
    },
    geometry_v2_provenance: { evidenceLevel: 'verified', fieldEvidence },
    evidence: { has_pdf_evidence: true, trust_level: 'verified_fit' },
  });
  assert.equal(result.evidence.trust_level, 'verified_fit');
  assert.equal(result.evidence.clearance_verified, true);
});

test('committed public projection has deterministic display metadata for every product', () => {
  const projection = JSON.parse(readFileSync('data/architecture-v2/generated/public-catalog-projection.json', 'utf8'));
  const missing = projection.products.filter((product) => (
    !String(product.readableSpec ?? '').trim()
    || !Number.isFinite(product.priorityScore)
  ));

  assert.deepEqual(missing.map((product) => product.id), []);
});

test('public display enrichment never replaces an existing canonical product title', () => {
  const catalog = JSON.parse(readFileSync('data/catalog-final.json', 'utf8'));
  const projection = JSON.parse(readFileSync('data/architecture-v2/generated/public-catalog-projection.json', 'utf8'));
  const catalogById = new Map(catalog.products.map((product) => [product.id, product]));
  const changed = projection.products.filter((product) => {
    const source = catalogById.get(product.id);
    return source?.displayName && product.displayName !== source.displayName;
  });

  assert.deepEqual(changed.map((product) => product.id), []);
});
