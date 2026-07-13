import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildHistoricalEvidencePublication,
  scalarHistoricalDimensions,
} from '../../src/domain/historical-evidence-publication.mjs';
import { applyReceiptBoundAcceptance } from '../../src/domain/accepted-evidence-publication.mjs';

const bundle = JSON.parse(readFileSync(new URL(
  '../../data/architecture-v2/reviews/automated/historical-evidence-recovery-acceptance-bundle.json',
  import.meta.url,
), 'utf8'));
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

test('committed historical reference contains every cumulative recovery receipt', () => {
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
    assert.equal(historical.evidenceState, 'MODEL_RECEIPT');
    assert.equal(historical.lookupAction, 'AUTO_FILL');
    assert.deepEqual(historical.dimensionsMm, expectedDimensions);
    assert.ok(historical.modelReceipts.some((receipt) => receipt.targetId === entry.targetId));

    const current = publicCatalog.products.find((product) => product.id === entry.legacyRuntimeId);
    if (entry.lifecycleState === 'CURRENT_RETAIL') {
      assert.equal(current?.evidence?.acceptance?.id, entry.targetId);
    } else {
      assert.equal(current?.evidence?.acceptance, undefined);
    }
  }
});
