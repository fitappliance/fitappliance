import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  assertHistoricalPublicationEvidenceCeiling,
  buildHistoricalEvidencePublication,
  scalarHistoricalDimensions,
} from '../../src/domain/historical-evidence-publication.mjs';
import { applyReceiptBoundAcceptance } from '../../src/domain/accepted-evidence-publication.mjs';
import { filterHistoricalAcceptanceBundleByReceiptReplayAudit } from '../../src/domain/historical-evidence-recovery-audit.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';

const rawBundle = JSON.parse(readFileSync(new URL(
  '../../data/architecture-v2/reviews/automated/historical-evidence-recovery-acceptance-bundle.json',
  import.meta.url,
), 'utf8'));
const receiptReplayAudit = JSON.parse(readFileSync(new URL(
  '../../data/architecture-v2/reviews/automated/historical-acceptance-receipt-replay-audit.json',
  import.meta.url,
), 'utf8'));
const bundle = filterHistoricalAcceptanceBundleByReceiptReplayAudit(
  rawBundle,
  receiptReplayAudit,
).bundle;
const catalog = JSON.parse(readFileSync(new URL('../../data/catalog-final.json', import.meta.url), 'utf8'));

function bundleFor(model) {
  const selected = structuredClone(bundle);
  selected.entries = selected.entries.filter((entry) => entry.model === model);
  const batchIds = new Set(selected.entries.map((entry) => entry.sourceBatchId));
  selected.lineage = selected.lineage.filter((lineage) => batchIds.has(lineage.batchId));
  return selected;
}

const currentBundle = bundleFor('WD8560F1');

function wdProduct() {
  return structuredClone(catalog.products.find((product) => product.id === 'ao-62057'));
}

test('current recovery evidence projects to both current and historical lanes', () => {
  const publication = buildHistoricalEvidencePublication({
    bundle: currentBundle,
    products: [wdProduct()],
  });

  assert.equal(publication.currentAcceptanceByLegacyId.size, 1);
  const current = publication.currentAcceptanceByLegacyId.get('ao-62057');
  assert.equal(current.geometry_v2_provenance.evidenceLevel, 'dimensions');
  assert.equal(current.geometry_v2_provenance.verifiedFitEligible, false);
  assert.equal(current.sources.length, 1);
  assert.equal(current.sources[0].contentSha256, currentBundle.entries[0].sources[0].contentSha256);

  assert.equal(publication.historicalEvidenceProjection.records.length, 1);
  const historical = publication.historicalEvidenceProjection.records[0];
  assert.equal(historical.referenceId, currentBundle.entries[0].referenceId);
  assert.equal(historical.lifecycleState, 'CURRENT_RETAIL');
  assert.deepEqual(historical.dimensionsMm, { width: 600, height: 850, depth: 645 });
  assert.equal(historical.modelReceipts[0].fields.height.page, 1);
});

test('current publication restores explicit catalog form factor before calculating Fit requirements', () => {
  const samsungBundle = bundleFor('SRF5300SD');
  const samsungProduct = structuredClone(catalog.products.find((product) => product.id === 'ao-97642'));
  assert.equal(samsungBundle.entries[0].geometryProjection.geometry.formFactor, null);

  const publication = buildHistoricalEvidencePublication({
    bundle: samsungBundle,
    products: [samsungProduct],
  });
  const current = publication.currentAcceptanceByLegacyId.get('ao-97642');

  assert.equal(current.geometry_v2.formFactor, 'upright');
  assert.ok(current.geometry_v2_provenance.missingForVerifiedFit.includes('operation.doorOpenDepthMm'));
  assert.equal(current.geometry_v2_provenance.verifiedFitEligible, false);
  assert.equal(current.geometry_v2_provenance.successfulFitOutcome, 'INSUFFICIENT_DATA');
});

test('form-factor safety projection cannot promote a stored dimensions receipt to Verified Fit', () => {
  const stored = {
    evidenceLevel: 'dimensions',
    verifiedFitEligible: false,
    successfulFitOutcome: 'LIKELY_FIT_ESTIMATED',
  };
  const projected = {
    evidenceLevel: 'verified',
    verifiedFitEligible: true,
    successfulFitOutcome: 'VERIFIED_FIT',
  };

  assert.throws(
    () => assertHistoricalPublicationEvidenceCeiling(stored, projected, 'fixture-target'),
    /form-factor restoration cannot promote Fit.*fixture-target/i,
  );
  assert.equal(
    assertHistoricalPublicationEvidenceCeiling(stored, { ...stored }, 'fixture-target').evidenceLevel,
    'dimensions',
  );
});

test('mixed HTML and PDF evidence publishes only contributing sources with typed locators', () => {
  const lgBundle = bundleFor('DVH9-09B');
  const lgProduct = structuredClone(catalog.products.find((product) => product.model === 'DVH9-09B'));
  const publication = buildHistoricalEvidencePublication({
    bundle: lgBundle,
    products: [lgProduct],
  });
  const receipts = publication.historicalEvidenceProjection.records[0].modelReceipts;
  const html = receipts.find((receipt) => receipt.contentType === 'text/html');
  const pdf = receipts.find((receipt) => receipt.contentType === 'application/pdf');

  assert.equal(receipts.length, 2);
  assert.equal(html.fields.depth.locatorKind, 'HTML_ARTIFACT');
  assert.equal(html.fields.depth.artifactSha256, html.contentSha256);
  assert.equal(pdf.fields.width.locatorKind, 'PDF_FRAGMENT');
  assert.equal(pdf.fields.width.page, 10);
  assert.match(pdf.fields.width.fragmentSha256, /^[a-f0-9]{64}$/);
  assert.ok(Object.keys(html.fields).length > 0);
  assert.ok(Object.keys(pdf.fields).length > 0);
});

test('official structured product data publishes a JSON artifact locator without fake HTML or PDF provenance', () => {
  const apiBundle = bundleFor('DBI253IBS');
  const product = structuredClone(catalog.products.find((candidate) => candidate.model === 'DBI253IBS'));
  const publication = buildHistoricalEvidencePublication({ bundle: apiBundle, products: [product] });
  const current = publication.currentAcceptanceByLegacyId.get(product.id);
  const [receipt] = publication.historicalEvidenceProjection.records[0].modelReceipts;

  assert.equal(current.artifactType, 'json');
  assert.equal(receipt.contentType, 'application/json');
  assert.equal(receipt.fields.width.locatorKind, 'JSON_ARTIFACT');
  assert.equal(receipt.fields.width.artifactSha256, receipt.contentSha256);
  assert.equal(receipt.fields.width.page, undefined);
});

test('archived recovery evidence remains historical-only and cannot update a current product', () => {
  const archivedBundle = structuredClone(currentBundle);
  archivedBundle.entries[0].lifecycleState = 'CATALOG_ARCHIVED';
  const archivedProduct = wdProduct();
  archivedProduct.unavailable = true;
  archivedProduct.retailers = [];

  const publication = buildHistoricalEvidencePublication({
    bundle: archivedBundle,
    products: [archivedProduct],
  });
  assert.equal(publication.currentAcceptanceByLegacyId.size, 0);
  assert.equal(publication.historicalEvidenceProjection.records[0].lifecycleState, 'CATALOG_ARCHIVED');
  assert.deepEqual(
    publication.historicalEvidenceProjection.records[0].dimensionsMm,
    { width: 600, height: 850, depth: 645 },
  );

  assert.throws(() => buildHistoricalEvidencePublication({
    bundle: archivedBundle,
    products: [wdProduct()],
  }), /lifecycle.*drift|archived.*current/i);
});

test('registry-only recovery publishes only to historical replacement data', () => {
  const registryBundle = structuredClone(currentBundle);
  registryBundle.entries[0].lifecycleState = 'REGISTRY_ONLY';
  registryBundle.entries[0].legacyRuntimeId = `historical-${registryBundle.entries[0].referenceId}`;
  registryBundle.entries[0].canonicalProductId = null;

  const publication = buildHistoricalEvidencePublication({
    bundle: registryBundle,
    products: [],
  });
  assert.equal(publication.currentAcceptanceByLegacyId.size, 0);
  assert.equal(publication.historicalEvidenceProjection.records[0].lifecycleState, 'REGISTRY_ONLY');
});

test('current recovery requires an exact, current catalog identity', () => {
  assert.throws(() => buildHistoricalEvidencePublication({
    bundle: currentBundle, products: [],
  }), /catalog product missing/i);
  const mismatched = wdProduct();
  mismatched.model = 'WD8560F1B';
  assert.throws(
    () => buildHistoricalEvidencePublication({ bundle: currentBundle, products: [mismatched] }),
    /identity mismatch/i,
  );
});

test('only a fixed three-axis envelope becomes scalar historical dimensions', () => {
  const geometryProjection = structuredClone(currentBundle.entries[0].geometryProjection);
  assert.deepEqual(scalarHistoricalDimensions(geometryProjection), {
    width: 600,
    height: 850,
    depth: 645,
  });

  geometryProjection.geometry.closedEnvelope.heightMm.maximumMm = 900;
  assert.equal(scalarHistoricalDimensions(geometryProjection), null);
  geometryProjection.geometry.closedEnvelope.heightMm = { minimumMm: 850, maximumMm: 850 };
  geometryProjection.geometry.closedEnvelope.depthMm = null;
  assert.equal(scalarHistoricalDimensions(geometryProjection), null);
});

test('applying a current recovery preserves every source receipt but never promotes fit', () => {
  const publication = buildHistoricalEvidencePublication({
    bundle: currentBundle, products: [wdProduct()],
  });
  const product = applyReceiptBoundAcceptance(
    wdProduct(),
    publication.currentAcceptanceByLegacyId.get('ao-62057'),
  );

  assert.equal(product.w, 600);
  assert.equal(product.h, 850);
  assert.equal(product.d, 645);
  assert.equal(product.evidence.trust_level, 'dimensions_verified');
  assert.equal(product.evidence.clearance_verified, false);
  assert.equal(product.evidence.acceptance.sources.length, 1);
  assert.equal(product.flags.requires_plumbing, null);
});

test('committed publication keeps current and archived canaries in their intended lanes', () => {
  const publicCatalog = JSON.parse(readFileSync(new URL(
    '../../data/architecture-v2/generated/public-catalog-projection.json', import.meta.url,
  ), 'utf8'));
  const historicalReference = JSON.parse(readFileSync(new URL(
    '../../data/architecture-v2/generated/historical-appliance-reference.json', import.meta.url,
  ), 'utf8'));
  const current = publicCatalog.products.find((product) => product.id === 'ao-62057');
  const archived = publicCatalog.products.find((product) => product.id === 'fridge-arf2495');
  assert.equal(current.evidence.acceptance.id, 'recovery_target_b4c27af7c13ba6643cb2cf6a');
  assert.deepEqual(current.geometry_v2.closedEnvelope, {
    widthMm: 600,
    heightMm: { minimumMm: 850, maximumMm: 850 },
    depthMm: 645,
  });
  assert.equal(current.geometry_v2_provenance.verifiedFitEligible, false);
  assert.equal(archived.unavailable, true);
  assert.equal(archived.geometry_v2, undefined);
  assert.equal(archived.evidence?.acceptance, undefined);

  const currentReference = historicalReference.records.find(
    (record) => record.referenceId === 'fa_ref_4b70ff0c230e18316b157fb0',
  );
  const archivedReference = historicalReference.records.find(
    (record) => record.referenceId === 'fa_ref_7b30999b458aecbc9e66e223',
  );
  assert.deepEqual(currentReference.dimensionsMm, { width: 600, height: 850, depth: 645 });
  assert.equal(currentReference.evidenceState, 'MODEL_RECEIPT');
  assert.deepEqual(archivedReference.dimensionsMm, { width: 796, height: 1718, depth: 727 });
  assert.equal(archivedReference.lifecycleState, 'CATALOG_ARCHIVED');
  assert.equal(archivedReference.evidenceState, 'MODEL_RECEIPT');
});

test('committed historical reference contains every cumulative recovery receipt without flattening ranges', () => {
  const publicCatalog = JSON.parse(readFileSync(new URL(
    '../../data/architecture-v2/generated/public-catalog-projection.json', import.meta.url,
  ), 'utf8'));
  const historicalReference = JSON.parse(readFileSync(new URL(
    '../../data/architecture-v2/generated/historical-appliance-reference.json', import.meta.url,
  ), 'utf8'));
  const historicalById = new Map(historicalReference.records.map((record) => [record.referenceId, record]));

  for (const entry of bundle.entries) {
    const expectedDimensions = scalarHistoricalDimensions(entry.geometryProjection);
    const historical = historicalById.get(entry.referenceId);
    assert.ok(historical, `missing historical reference ${entry.referenceId}`);
    assert.ok(historical.modelReceipts.some((receipt) => receipt.targetId === entry.targetId));

    if (expectedDimensions) {
      assert.equal(historical.evidenceState, 'MODEL_RECEIPT');
      assert.equal(historical.lookupAction, 'AUTO_FILL');
      assert.deepEqual(historical.dimensionsMm, expectedDimensions);
    } else {
      assert.ok(
        historical.reasonCodes.includes('MODEL_RECEIPT_NON_SCALAR'),
        `missing range-preservation reason for ${entry.model}`,
      );
      assert.notEqual(historical.lookupAction, 'AUTO_FILL');
    }

    const current = publicCatalog.products.find((product) => product.id === entry.legacyRuntimeId);
    if (entry.lifecycleState === 'CURRENT_RETAIL') {
      assert.equal(current?.evidence?.acceptance?.id, entry.targetId);
    } else {
      assert.equal(current?.evidence?.acceptance, undefined);
    }
  }
});

test('receipt replay failures remain quarantined from current and historical projections', () => {
  const outcomes = structuredClone(receiptReplayAudit.outcomes);
  outcomes[0] = { ...outcomes[0], status: 'failed', failureCode: 'test_replay_failure' };
  const sourceBundleSha256 = canonicalJsonSha256(rawBundle);
  const failedAudit = {
    ...receiptReplayAudit,
    sourceBundleSha256,
    outcomes,
    summary: {
      entries: rawBundle.entries.length,
      sources: outcomes.length,
      passed: outcomes.filter((outcome) => outcome.status === 'passed').length,
      failed: outcomes.filter((outcome) => outcome.status === 'failed').length,
    },
    semanticAuditSha256: canonicalJsonSha256({ sourceBundleSha256, outcomes }),
  };
  const filtered = filterHistoricalAcceptanceBundleByReceiptReplayAudit(rawBundle, failedAudit);
  const failedTarget = outcomes[0].targetId;
  assert.ok(rawBundle.entries.some((entry) => entry.targetId === failedTarget));
  assert.ok(filtered.bundle.entries.every((entry) => entry.targetId !== failedTarget));
  assert.deepEqual(filtered.excludedTargetIds, [failedTarget]);
});
