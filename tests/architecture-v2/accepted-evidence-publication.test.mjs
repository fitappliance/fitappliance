import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  applyReceiptBoundAcceptance,
  buildReceiptBoundAcceptanceProjection,
  mergeReceiptBoundAcceptanceProjections,
} from '../../src/domain/accepted-evidence-publication.mjs';
import { classifyGeometryPublication } from '../../src/domain/geometry-publication.mjs';
import { projectEvidenceGeometry } from '../../src/domain/evidence-geometry-projector.mjs';

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

test('HTML marketing aliases cannot publish without every explicit alias-binding signal', () => {
  const weakResults = structuredClone(recoveryResults);
  const alias = weakResults.outcomes.find((outcome) => (
    outcome.identity === 'official_marketing_alias'
      && outcome.source?.contentType === 'text/html'
  ));
  assert.ok(alias);
  alias.source.identitySignals = alias.source.identitySignals.filter(
    (signal) => signal.type !== 'official_alias_binding',
  );

  assert.throws(() => buildReceiptBoundAcceptanceProjection({
    batch: recoveryBatch,
    results: weakResults,
    products: catalog.products,
  }, { verifyReceipt: () => true }), /HTML marketing alias.*binding signals/i);
});

test('official model-variant PDF publishes only dimensions when every receipt-bound identity signal is present', () => {
  const model = 'W4104C.W';
  const sourceModel = `${model}.AU`;
  const source = structuredClone(
    recoveryResults.outcomes.find((outcome) => outcome.identity === 'official_marketing_alias').source,
  );
  source.contentType = 'application/pdf';
  source.sourceType = 'official_model_variant_pdf';
  source.identity = {
    brand: 'ASKO', model, category: 'washing_machine',
    outcome: 'official_marketing_alias', sourceModel,
  };
  source.identitySignals = [
    { type: 'mineru_bound_exact_cover_model', value: `${sourceModel}:exact-cover:${sourceModel}:page:1:${'b'.repeat(64)}` },
    { type: 'canonical_source_model', value: sourceModel },
    { type: 'official_market_api_model', value: `${model}:${'a'.repeat(64)}:https://api-storefront.asko.com/` },
    { type: 'official_market_api_dimensions', value: `${model}:817x1776x715:${'a'.repeat(64)}` },
    { type: 'official_market_api_variant_binding', value: `${model} -> ${sourceModel} (AU)` },
  ];
  source.discoveryProvenance = {
    method: 'official_market_api',
    requestedModel: model,
    matchedModel: sourceModel,
    discoveryUrl: 'https://api-storefront.asko.com/',
    discoveryContentSha256: 'a'.repeat(64),
  };
  source.claims = [
    ['closedEnvelope.depthMm', 715, 'depth'],
    ['closedEnvelope.heightMm', 1776, 'height'],
    ['closedEnvelope.widthMm', 817, 'width'],
  ].map(([field, mm, axis]) => ({
    field,
    value: { kind: 'fixed', mm },
    sourceLabel: axis[0].toUpperCase() + axis.slice(1),
    sourceAxisOrder: [axis],
    sourceUnit: 'mm',
    measurementScope: 'product_closed_external',
    includesDoor: null,
    includesHandle: null,
    page: 2,
    fragmentSha256: 'c'.repeat(64),
    bbox: [0, 0, 100, 20],
  }));
  const geometryProjection = projectEvidenceGeometry({
    brand: 'ASKO', model, category: 'washing_machine', sources: [source],
  }, { verifyReceipt: () => true });
  const variantBatch = {
    batchId: 'asko-variant-publication',
    entries: [{
      id: 'asko-w4104c-w', legacyRuntimeId: 'washing-machine-asko-w4104c-w',
      brand: 'ASKO', model, category: 'washing_machine',
    }],
  };
  const variantResults = {
    batchId: variantBatch.batchId,
    outcomes: [{
      id: 'asko-w4104c-w', brand: 'ASKO', model, category: 'washing_machine',
      legacyRuntimeId: 'washing-machine-asko-w4104c-w', outcome: 'accepted',
      identity: 'official_marketing_alias', artifactType: 'PDF_FRAGMENT', source,
      geometryProjection,
    }],
  };
  const products = [{
    id: 'washing-machine-asko-w4104c-w', brand: 'ASKO', model,
    category: 'washing_machine', cat: 'washing_machine',
  }];
  const accepted = buildReceiptBoundAcceptanceProjection({
    batch: variantBatch,
    results: variantResults,
    products,
  }, { verifyReceipt: () => true });
  const published = accepted.get('washing-machine-asko-w4104c-w');

  assert.equal(published.sourceType, 'official_model_variant_pdf');
  assert.equal(published.geometry_v2_provenance.evidenceLevel, 'dimensions');
  assert.equal(published.geometry_v2_provenance.verifiedFitEligible, false);

  const weak = structuredClone(variantResults);
  weak.outcomes[0].source.identitySignals.pop();
  assert.throws(() => buildReceiptBoundAcceptanceProjection({
    batch: variantBatch,
    results: weak,
    products,
  }, { verifyReceipt: () => true }), /model variant.*binding signals/i);
});

test('official model-variant API publishes only dimensions when self-source and binding signals are complete', () => {
  const model = 'DBI243IBS';
  const sourceModel = 'DBI243IB.S.AU';
  const hash = 'd'.repeat(64);
  const sourceUrl = 'https://api-storefront.asko.com/ggcommercewebservices/v2/asko-au/products/000000000000732485?fields=FULL&lang=en_AU&curr=AUD';
  const source = structuredClone(recoveryResults.outcomes[0].source);
  source.contentSha256 = hash;
  source.contentType = 'application/json';
  source.sourceType = 'official_model_variant_api';
  source.sourceUrl = sourceUrl;
  source.finalUrl = sourceUrl;
  source.identity = { brand: 'ASKO', model, category: 'dishwasher', outcome: 'official_marketing_alias', sourceModel };
  source.identitySignals = [
    { type: 'canonical_source_model', value: sourceModel },
    { type: 'official_market_api_model', value: `${model}:${hash}:${sourceUrl}` },
    { type: 'official_market_api_dimensions', value: `${model}:596x819x559:${hash}` },
    { type: 'official_market_api_variant_binding', value: `${model} -> ${sourceModel} (AU)` },
  ];
  source.discoveryProvenance = {
    method: 'official_market_api', requestedModel: model, matchedModel: sourceModel,
    discoveryUrl: sourceUrl, artifactUrl: sourceUrl, discoveryContentSha256: hash,
  };
  source.claims = [
    ['closedEnvelope.widthMm', 596, 'width'],
    ['closedEnvelope.heightMm', 819, 'height'],
    ['closedEnvelope.depthMm', 559, 'depth'],
  ].map(([field, mm, axis]) => ({
    field, value: { kind: 'fixed', mm }, sourceLabel: `Official PIM ${axis}`,
    sourceAxisOrder: [axis], sourceUnit: 'mm', measurementScope: 'product_closed_external',
    includesDoor: null, includesHandle: null, page: null, fragmentSha256: null, bbox: null,
  }));
  const geometryProjection = projectEvidenceGeometry({
    brand: 'ASKO', model, category: 'dishwasher', sources: [source],
  }, { verifyReceipt: () => true });
  const apiBatch = { batchId: 'asko-api-publication', entries: [{
    id: 'asko-dbi243ibs', legacyRuntimeId: 'dishwasher-asko-dbi243ibs',
    brand: 'ASKO', model, category: 'dishwasher',
  }] };
  const apiResults = { batchId: apiBatch.batchId, outcomes: [{
    ...apiBatch.entries[0], outcome: 'accepted', identity: 'official_marketing_alias',
    artifactType: 'STRUCTURED_PRODUCT_DATA', source, geometryProjection,
  }] };
  const products = [{
    id: 'dishwasher-asko-dbi243ibs', brand: 'ASKO', model,
    category: 'dishwasher', cat: 'dishwasher',
  }];
  const accepted = buildReceiptBoundAcceptanceProjection({ batch: apiBatch, results: apiResults, products }, {
    verifyReceipt: () => true,
  });
  const published = accepted.get('dishwasher-asko-dbi243ibs');
  assert.equal(published.sourceType, 'official_model_variant_api');
  assert.equal(published.geometry_v2_provenance.evidenceLevel, 'dimensions');
  assert.equal(published.geometry_v2_provenance.verifiedFitEligible, false);
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

test('a newer receipt may replace an older lane only when publication semantics are equivalent', () => {
  const original = buildReceiptBoundAcceptanceProjection({
    batch: recoveryBatch, results: recoveryResults, products: catalog.products,
  }).get('ao-97642');
  const refreshed = structuredClone(original);
  refreshed.acceptanceId = 'historical-samsung-srf5300sd';
  refreshed.sourceModel = 'RF44A5202SL/SA';
  refreshed.artifactType = 'html';
  refreshed.contentSha256 = 'e'.repeat(64);
  refreshed.receiptBindingSha256 = 'f'.repeat(64);
  refreshed.verifiedAt = '2026-07-16T00:00:00.000Z';

  const merged = mergeReceiptBoundAcceptanceProjections(
    new Map([['ao-97642', original]]),
    new Map([['ao-97642', refreshed]]),
  );

  assert.equal(merged.get('ao-97642').acceptanceId, refreshed.acceptanceId);
  assert.equal(merged.get('ao-97642').receiptBindingSha256, refreshed.receiptBindingSha256);
});

test('receipt refresh rejects geometry drift and stale or same-age replacements', () => {
  const original = buildReceiptBoundAcceptanceProjection({
    batch: recoveryBatch, results: recoveryResults, products: catalog.products,
  }).get('ao-97642');
  const refreshed = structuredClone(original);
  refreshed.acceptanceId = 'historical-samsung-srf5300sd';
  refreshed.sourceModel = 'RF44A5202SL/SA';
  refreshed.contentSha256 = 'e'.repeat(64);
  refreshed.receiptBindingSha256 = 'f'.repeat(64);
  refreshed.verifiedAt = '2026-07-16T00:00:00.000Z';

  const changedGeometry = structuredClone(refreshed);
  changedGeometry.geometry_v2.closedEnvelope.widthMm += 1;
  assert.throws(
    () => mergeReceiptBoundAcceptanceProjections(
      new Map([['ao-97642', original]]),
      new Map([['ao-97642', changedGeometry]]),
    ),
    /duplicate.*semantic|geometry/i,
  );

  const stale = structuredClone(refreshed);
  stale.verifiedAt = original.verifiedAt;
  assert.throws(
    () => mergeReceiptBoundAcceptanceProjections(
      new Map([['ao-97642', original]]),
      new Map([['ao-97642', stale]]),
    ),
    /duplicate.*newer|timestamp/i,
  );
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

test('dimensions-only acceptance removes unrelated legacy fit semantics and is idempotent', () => {
  const accepted = buildReceiptBoundAcceptanceProjection({ batch, results, products: catalog.products });
  const entry = accepted.get(batch.entries[0].legacyRuntimeId);
  const source = catalog.products.find((product) => product.id === batch.entries[0].legacyRuntimeId);
  const polluted = {
    ...source,
    inferred_door_swing: true,
    door_swing_mm: 600,
    clearance_top: 20,
    clearance_left: 5,
    clearance_right: 5,
    clearance_rear: 10,
    requires_plumbing: true,
    flags: {
      ...(source.flags ?? {}),
      requires_plumbing: true,
      ventilation_required: true,
      reversible_door: true,
    },
  };

  const once = applyReceiptBoundAcceptance(polluted, entry);
  const twice = applyReceiptBoundAcceptance(once, entry);

  assert.equal(Object.hasOwn(once, 'inferred_door_swing'), false);
  assert.equal(once.door_swing_mm, null);
  assert.equal(once.flags.requires_plumbing, null);
  assert.equal(once.flags.ventilation_required, null);
  assert.equal(once.flags.reversible_door, null);
  assert.deepEqual(twice, once);
});
