import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  applyReceiptBoundAcceptance,
  buildReceiptBoundAcceptanceProjection,
  mergeReceiptBoundAcceptanceProjections,
} from '../../src/domain/accepted-evidence-publication.mjs';
import { classifyGeometryPublication } from '../../src/domain/geometry-publication.mjs';

const batch = JSON.parse(readFileSync(
  new URL('../../data/architecture-v2/reviews/automated/pdf-brand-acceptance-batch.json', import.meta.url),
  'utf8',
));
const results = JSON.parse(readFileSync(
  new URL('../../data/architecture-v2/reviews/automated/pdf-brand-acceptance-results.json', import.meta.url),
  'utf8',
));
const recoveryBatch = JSON.parse(readFileSync(
  new URL('../../data/architecture-v2/reviews/automated/identity-range-recovery-acceptance-batch.json', import.meta.url),
  'utf8',
));
const recoveryResults = JSON.parse(readFileSync(
  new URL('../../data/architecture-v2/reviews/automated/identity-range-recovery-acceptance-results.json', import.meta.url),
  'utf8',
));
const catalog = JSON.parse(readFileSync(
  new URL('../../data/catalog-final.json', import.meta.url),
  'utf8',
));

test('ten accepted brand receipts replay into exact catalog products without fit promotion', () => {
  const accepted = buildReceiptBoundAcceptanceProjection({ batch, results, products: catalog.products });
  assert.equal(accepted.size, 10);
  const haier = accepted.get('dishwasher-adw1276');
  assert.deepEqual(haier.geometry_v2.closedEnvelope.heightMm, { minimumMm: 850, maximumMm: 895 });
  assert.equal(haier.geometry_v2_provenance.evidenceLevel, 'dimensions');
  assert.equal(haier.geometry_v2_provenance.verifiedFitEligible, false);
  assert.ok(haier.geometry_v2_provenance.missingForVerifiedFit.includes('operation.doorOpenDepthMm'));

  for (const [legacyRuntimeId, projection] of accepted) {
    const source = catalog.products.find((product) => product.id === legacyRuntimeId);
    const published = applyReceiptBoundAcceptance(source, projection);
    const height = projection.geometry_v2.closedEnvelope.heightMm;
    assert.equal(classifyGeometryPublication(published), 'dimensions');
    assert.equal(published.w, projection.geometry_v2.closedEnvelope.widthMm);
    assert.equal(published.h, height.maximumMm);
    assert.equal(published.d, projection.geometry_v2.closedEnvelope.depthMm);
    assert.equal(published.dimensions.width_mm, published.w);
    assert.equal(published.dimensions.height_mm, published.h);
    assert.equal(published.dimensions.depth_mm, published.d);
    assert.equal(
      published.dimensions.door_open_90_depth_mm,
      projection.geometry_v2.operation.doorOpenDepthMm,
    );
    assert.deepEqual(published.clearance_requirements, {
      top_mm: projection.geometry_v2.installation.topMm,
      left_mm: projection.geometry_v2.installation.leftMm,
      right_mm: projection.geometry_v2.installation.rightMm,
      rear_mm: projection.geometry_v2.installation.rearMm,
    });
    assert.equal(published.flags.requires_plumbing, null);
    assert.equal(published.flags.ventilation_required, null);
    assert.equal(published.evidence.clearance_verified, false);
    assert.equal(published.evidence.acceptance.outcome, 'accepted');
  }

  const electrolux = accepted.get('fridge-arf2944');
  const legacyElectrolux = catalog.products.find((product) => product.id === 'fridge-arf2944');
  assert.equal(legacyElectrolux.w, 1782);
  assert.equal(legacyElectrolux.h, 913);
  const publishedElectrolux = applyReceiptBoundAcceptance(legacyElectrolux, electrolux);
  assert.equal(publishedElectrolux.w, 913);
  assert.equal(publishedElectrolux.h, 1782);
});

test('recovery receipts publish exact identities and strict official marketing aliases as dimensions only', () => {
  const accepted = buildReceiptBoundAcceptanceProjection({
    batch: recoveryBatch,
    results: recoveryResults,
    products: catalog.products,
  });
  assert.equal(accepted.size, 10);
  const samsungAlias = accepted.get('ao-97642');
  assert.equal(samsungAlias.identityOutcome, 'official_marketing_alias');
  assert.equal(samsungAlias.sourceModel, 'RF44A5202SL_SA');
  assert.equal(samsungAlias.geometry_v2_provenance.evidenceLevel, 'dimensions');
  assert.equal(samsungAlias.geometry_v2_provenance.verifiedFitEligible, false);
  assert.deepEqual(samsungAlias.geometry_v2.closedEnvelope, {
    widthMm: 817,
    heightMm: { minimumMm: 1776, maximumMm: 1776 },
    depthMm: 715,
  });
  const hisense = accepted.get('washing_machine-acw1520');
  const hisenseSource = catalog.products.find((product) => product.id === 'washing_machine-acw1520');
  const publishedHisense = applyReceiptBoundAcceptance(hisenseSource, hisense);
  assert.equal(publishedHisense.evidence.source_url, hisense.sourceUrl);
  assert.equal(publishedHisense.evidence.source_type, hisense.sourceType);
  assert.equal(publishedHisense.evidence.has_pdf_evidence, false);
  assert.equal(publishedHisense.evidence.raw_json_path, undefined);
  assert.equal(publishedHisense.evidence.confidence_score, undefined);
  assert.equal(publishedHisense.evidence.acceptance.content_sha256.length, 64);
  assert.equal(publishedHisense.evidence.acceptance.receipt_binding_sha256.length, 64);
  assert.equal(publishedHisense.dimensions.door_open_90_depth_mm, null);
  assert.equal(publishedHisense.flags.requires_plumbing, null);
  assert.equal(publishedHisense.flags.ventilation_required, null);
  assert.equal(accepted.has('discovery-washing-machine-samsung-ww12bb944dgb'), false);
});

test('independent acceptance batches merge without silently overwriting a product', () => {
  const original = buildReceiptBoundAcceptanceProjection({ batch, results, products: catalog.products });
  const recovery = buildReceiptBoundAcceptanceProjection({
    batch: recoveryBatch, results: recoveryResults, products: catalog.products,
  });
  const merged = mergeReceiptBoundAcceptanceProjections(original, recovery);
  assert.equal(merged.size, 20);
  assert.throws(() => mergeReceiptBoundAcceptanceProjections(original, original), /duplicate.*product/i);
});

test('accepted evidence requires exact batch, outcome, and catalog identity', () => {
  const mismatchedBatch = structuredClone(batch);
  mismatchedBatch.entries[0].model = `${mismatchedBatch.entries[0].model}B`;
  assert.throws(
    () => buildReceiptBoundAcceptanceProjection({ batch: mismatchedBatch, results, products: catalog.products }),
    /identity mismatch/i,
  );

  const mismatchedCatalog = structuredClone(catalog.products);
  const target = mismatchedCatalog.find((product) => product.id === batch.entries[0].legacyRuntimeId);
  target.model = `${target.model}B`;
  assert.throws(
    () => buildReceiptBoundAcceptanceProjection({ batch, results, products: mismatchedCatalog }),
    /catalog identity mismatch/i,
  );

  const familyOutcome = structuredClone(results);
  familyOutcome.outcomes[0].identity = 'family';
  assert.throws(
    () => buildReceiptBoundAcceptanceProjection({ batch, results: familyOutcome, products: catalog.products }),
    /exact identity required/i,
  );
});

test('accepted evidence replays receipts and detects stored projection drift', () => {
  const tamperedReceipt = structuredClone(results);
  tamperedReceipt.outcomes[0].source.verificationReceipt.bindingSha256 = '0'.repeat(64);
  assert.throws(
    () => buildReceiptBoundAcceptanceProjection({ batch, results: tamperedReceipt, products: catalog.products }),
    /receipt|binding/i,
  );

  const driftedProjection = structuredClone(results);
  driftedProjection.outcomes[0].geometryProjection.geometry.closedEnvelope.widthMm += 1;
  assert.throws(
    () => buildReceiptBoundAcceptanceProjection({ batch, results: driftedProjection, products: catalog.products }),
    /projection drift/i,
  );
});

test('receipt-bound acceptance refuses to overwrite conflicting existing geometry', () => {
  const accepted = buildReceiptBoundAcceptanceProjection({ batch, results, products: catalog.products });
  const entry = accepted.get(batch.entries[0].legacyRuntimeId);
  const source = catalog.products.find((product) => product.id === batch.entries[0].legacyRuntimeId);
  assert.throws(() => applyReceiptBoundAcceptance({
    ...source,
    geometry_v2: {
      ...entry.geometry_v2,
      closedEnvelope: { ...entry.geometry_v2.closedEnvelope, widthMm: 1 },
    },
  }, entry), /conflicting existing geometry/i);
});
