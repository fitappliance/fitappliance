import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { buildHistoricalModelPdfAcquisitionQueue } from '../../src/domain/historical-model-pdf-acquisition.mjs';

function classified(referenceId, operationalClass, overrides = {}) {
  return {
    referenceId,
    category: 'fridge',
    canonicalBrand: 'Example',
    model: referenceId.toUpperCase(),
    lifecycleState: 'CURRENT_RETAIL',
    priority: 'P0_CURRENT_RETAIL',
    groupType: 'document_family',
    groupName: 'Example family',
    operationalClass,
    documentLinks: [],
    ...overrides,
  };
}

function reference(referenceId) {
  return { referenceId, catalogProductIds: [`product-${referenceId}`] };
}

function catalogProducts(records) {
  return records.map((record) => ({
    id: `product-${record.referenceId}`,
    canonicalProductId: `fa_prod_${record.referenceId}`,
  }));
}

test('acquisition queue accounts for every nonterminal model exactly once', () => {
  const records = [
    classified('complete', 'COMPLETE_RECEIPT'),
    classified('discover', 'OFFICIAL_DISCOVERY'),
    classified('terminal-html', 'OFFICIAL_HTML_ONLY'),
    classified('terminal-none', 'NO_OFFICIAL_SOURCE'),
  ];
  const queue = buildHistoricalModelPdfAcquisitionQueue({
    classification: { schemaVersion: 1, semanticClassificationSha256: 'a'.repeat(64), records },
    historicalReference: { records: records.map((record) => reference(record.referenceId)) },
    catalogProducts: catalogProducts(records),
    recoveryQueue: { targets: [] },
    resolverIdsByBrand: new Map([['example', ['example-resolver']]]),
    generatedAt: '2026-07-14T00:00:00.000Z',
  });

  assert.equal(queue.summary.classificationRecords, 4);
  assert.equal(queue.summary.queuedModels, 1);
  assert.equal(queue.records[0].referenceId, 'discover');
  assert.equal(queue.records[0].executionReadiness, 'DISCOVERY_READY');
  assert.deepEqual(queue.records[0].canonicalProductIds, ['fa_prod_discover']);
  assert.deepEqual(queue.summary.excluded, {
    COMPLETE_RECEIPT: 1, OFFICIAL_HTML_ONLY: 1, NO_OFFICIAL_SOURCE: 1,
  });
});

test('shared source is deduplicated without losing model edges or explicit authority', () => {
  const sourceUrl = 'https://manufacturer.example/family.pdf#page=1';
  const records = ['one', 'two'].map((referenceId) => classified(referenceId, 'OFFICIAL_REACQUIRE', {
    documentLinks: [{
      documentId: `doc-${referenceId}`, sourceUrl, sourceAuthority: 'REFERENCE',
    }],
  }));
  const queue = buildHistoricalModelPdfAcquisitionQueue({
    classification: { schemaVersion: 1, semanticClassificationSha256: 'a'.repeat(64), records },
    historicalReference: { records: records.map((record) => reference(record.referenceId)) },
    catalogProducts: catalogProducts(records),
    recoveryQueue: { targets: [] },
    generatedAt: '2026-07-14T00:00:00.000Z',
  });

  assert.equal(queue.sources.length, 1);
  assert.deepEqual(queue.sources[0].referenceIds, ['one', 'two']);
  assert.deepEqual(queue.sources[0].documentIds, ['doc-one', 'doc-two']);
  assert.equal(queue.sources[0].sourceAuthority, 'REFERENCE');
  assert.equal(queue.sources[0].receiptEligible, false);
});

test('official classification does not make an unscoped global artifact receipt eligible', () => {
  const record = classified('samsung', 'IDENTITY_RESEARCH', {
    canonicalBrand: 'Samsung', model: 'SRF5300SD', category: 'fridge',
    documentLinks: [{
      documentId: 'pdf:family',
      sourceUrl: 'https://downloadcenter.samsung.com/content/UM/family-manual.pdf',
      sourceAuthority: 'OFFICIAL',
    }, {
      documentId: 'html:product',
      sourceUrl: 'https://www.samsung.com/au/refrigerators/french-door/example/',
      sourceAuthority: 'OFFICIAL',
    }],
  });
  const queue = buildHistoricalModelPdfAcquisitionQueue({
    classification: { schemaVersion: 1, semanticClassificationSha256: 'a'.repeat(64), records: [record] },
    historicalReference: { records: [reference('samsung')] },
    catalogProducts: catalogProducts([record]),
    recoveryQueue: { targets: [] },
    generatedAt: '2026-07-14T00:00:00.000Z',
  });
  const byUrl = new Map(queue.sources.map((source) => [source.sourceUrl, source]));

  assert.equal(byUrl.get('https://downloadcenter.samsung.com/content/UM/family-manual.pdf').sourceAuthority, 'OFFICIAL');
  assert.equal(byUrl.get('https://downloadcenter.samsung.com/content/UM/family-manual.pdf').receiptEligible, false);
  assert.equal(byUrl.get('https://www.samsung.com/au/refrigerators/french-door/example/').receiptEligible, true);
});

test('offline replay conflict is routed to corroboration instead of repeated replay', () => {
  const record = classified('conflict', 'OFFLINE_REPLAY');
  const queue = buildHistoricalModelPdfAcquisitionQueue({
    classification: { schemaVersion: 1, semanticClassificationSha256: 'a'.repeat(64), records: [record] },
    historicalReference: { records: [reference('conflict')] },
    catalogProducts: catalogProducts([record]),
    recoveryQueue: { targets: [] },
    offlineReplayQueue: { targets: [{ targetId: 'target-1', referenceId: 'conflict' }] },
    offlineReplayResults: { outcomes: [{
      targetId: 'target-1', status: 'conflict_quarantined', failureCode: 'conflict',
      semanticOutcomeSha256: 'b'.repeat(64),
    }] },
    generatedAt: '2026-07-14T00:00:00.000Z',
  });

  assert.equal(queue.records[0].route, 'CONFLICT_CLOSURE');
  assert.equal(queue.records[0].executionReadiness, 'RESEARCH_REQUIRED');
});

test('identity closure is discovery-ready only with a brand resolver while unmaterialized conflicts stay research-only', () => {
  const records = [
    classified('identity-resolved', 'IDENTITY_RESEARCH'),
    classified('identity-unresolved', 'IDENTITY_RESEARCH', { canonicalBrand: 'No Resolver' }),
    classified('conflict-resolved', 'CONFLICT_QUARANTINE'),
  ];
  const queue = buildHistoricalModelPdfAcquisitionQueue({
    classification: { schemaVersion: 1, semanticClassificationSha256: 'a'.repeat(64), records },
    historicalReference: { records: records.map((record) => reference(record.referenceId)) },
    catalogProducts: catalogProducts(records),
    recoveryQueue: { targets: [] },
    resolverIdsByBrand: new Map([['example', ['example-resolver']]]),
    generatedAt: '2026-07-14T00:00:00.000Z',
  });

  const byReference = new Map(queue.records.map((record) => [record.referenceId, record]));
  assert.equal(byReference.get('identity-resolved').route, 'IDENTITY_CLOSURE');
  assert.equal(byReference.get('identity-resolved').executionReadiness, 'DISCOVERY_READY');
  assert.equal(byReference.get('identity-unresolved').executionReadiness, 'RESEARCH_REQUIRED');
  assert.equal(byReference.get('conflict-resolved').route, 'CONFLICT_CLOSURE');
  assert.equal(byReference.get('conflict-resolved').executionReadiness, 'RESEARCH_REQUIRED');
});

test('conflict closure with a receipt-eligible official artifact is bounded-ready without changing its conflict route', () => {
  const record = classified('conflict-official', 'CONFLICT_QUARANTINE', {
    canonicalBrand: 'Samsung',
    model: 'SRF5300SD',
    documentLinks: [{
      documentId: 'html:samsung-srf5300sd',
      sourceUrl: 'https://www.samsung.com/au/refrigerators/french-door/srf5300sd/',
      sourceAuthority: 'OFFICIAL',
    }],
  });
  const queue = buildHistoricalModelPdfAcquisitionQueue({
    classification: { schemaVersion: 1, semanticClassificationSha256: 'a'.repeat(64), records: [record] },
    historicalReference: { records: [reference(record.referenceId)] },
    catalogProducts: catalogProducts([record]),
    recoveryQueue: { targets: [] },
    generatedAt: '2026-07-19T00:00:00.000Z',
  });

  assert.equal(queue.records[0].route, 'CONFLICT_CLOSURE');
  assert.equal(queue.records[0].executionReadiness, 'BOUNDED_READY');
  assert.equal(queue.sources[0].receiptEligible, true);
});

test('resolved autonomous identity research contributes only a replayable official URL hint', () => {
  const record = classified('identity-alias', 'IDENTITY_RESEARCH', {
    canonicalBrand: 'Samsung', model: 'SRF5300SD', category: 'fridge',
  });
  const productUrl = 'https://www.samsung.com/au/refrigerators/french-door/rf5000a-498l-silver-rf44a5202sl-sa/';
  const queue = buildHistoricalModelPdfAcquisitionQueue({
    classification: { schemaVersion: 1, semanticClassificationSha256: 'a'.repeat(64), records: [record] },
    historicalReference: { records: [reference('identity-alias')] },
    catalogProducts: catalogProducts([record]),
    recoveryQueue: { targets: [] },
    identityResearchQueue: {
      schemaVersion: 1,
      cases: [{
        id: 'identity-samsung-srf5300sd',
        legacyRuntimeId: 'product-identity-alias',
        canonicalProductId: 'fa_prod_identity-alias',
        brand: 'Samsung', category: 'fridge', targetModel: 'SRF5300SD',
        status: 'resolved', requiresHumanReview: false,
        approvedFields: [
          'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
        ],
        publication: { release: true },
        resolution: {
          identityOutcome: 'official_marketing_alias', sourceUrl: productUrl,
          receiptBindingSha256: 'b'.repeat(64),
        },
      }],
    },
    resolverIdsByBrand: new Map([['samsung', ['samsung-official-discovery']]]),
    generatedAt: '2026-07-14T00:00:00.000Z',
  });

  assert.equal(queue.sources.length, 1);
  assert.equal(queue.sources[0].sourceUrl, productUrl);
  assert.equal(queue.sources[0].sourceAuthority, 'OFFICIAL');
  assert.equal(queue.sources[0].receiptEligible, true);
  assert.deepEqual(queue.sources[0].documentIds, ['identity-research:identity-samsung-srf5300sd']);
  assert.deepEqual(queue.records[0].candidateSourceIds, [queue.sources[0].sourceId]);
  assert.equal(queue.records[0].route, 'IDENTITY_CLOSURE');
});

test('identity research hints fail closed on unresolved, human, field, receipt, or identity drift', () => {
  const record = classified('identity-alias', 'IDENTITY_RESEARCH', {
    canonicalBrand: 'Samsung', model: 'SRF5300SD', category: 'fridge',
  });
  const base = {
    legacyRuntimeId: 'product-identity-alias',
    canonicalProductId: 'fa_prod_identity-alias',
    brand: 'Samsung', category: 'fridge', targetModel: 'SRF5300SD',
    status: 'resolved', requiresHumanReview: false,
    approvedFields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    ],
    publication: { release: true },
    resolution: {
      identityOutcome: 'official_marketing_alias',
      sourceUrl: 'https://www.samsung.com/au/refrigerators/french-door/example/',
      receiptBindingSha256: 'b'.repeat(64),
    },
  };
  const cases = [
    { ...base, id: 'unresolved', status: 'needs_research' },
    { ...base, id: 'human', requiresHumanReview: true },
    { ...base, id: 'held', publication: { release: false } },
    { ...base, id: 'bad-receipt', resolution: { ...base.resolution, receiptBindingSha256: 'bad' } },
    { ...base, id: 'field-drift', approvedFields: ['installation.rearMm'] },
    { ...base, id: 'model-drift', targetModel: 'SRF5300BD' },
  ];
  const queue = buildHistoricalModelPdfAcquisitionQueue({
    classification: { schemaVersion: 1, semanticClassificationSha256: 'a'.repeat(64), records: [record] },
    historicalReference: { records: [reference('identity-alias')] },
    catalogProducts: catalogProducts([record]),
    recoveryQueue: { targets: [] },
    identityResearchQueue: { schemaVersion: 1, cases },
    resolverIdsByBrand: new Map([['samsung', ['samsung-official-discovery']]]),
    generatedAt: '2026-07-14T00:00:00.000Z',
  });

  assert.deepEqual(queue.sources, []);
  assert.deepEqual(queue.records[0].candidateSourceIds, []);
});

test('explicit identity migration collapses an old canonical ID into its authorised merge target', async () => {
  const migration = JSON.parse(await readFile(
    'data/architecture-v2/reviews/automated/retailer-identity-migration.json',
    'utf8',
  ));
  const merge = migration.canonicalMerges[0];
  assert.ok(merge, 'tracked identity migration must include a merge fixture');
  const record = classified('authorised-merge', 'IDENTITY_RESEARCH');
  const queue = buildHistoricalModelPdfAcquisitionQueue({
    classification: { schemaVersion: 1, semanticClassificationSha256: 'a'.repeat(64), records: [record] },
    historicalReference: {
      records: [{ referenceId: record.referenceId, catalogProductIds: [merge.sourceLegacyRuntimeId] }],
    },
    catalogProducts: [{
      id: merge.sourceLegacyRuntimeId,
      canonicalProductId: merge.sourceCanonicalProductId,
    }],
    recoveryQueue: { targets: [{
      targetId: 'recovery-authorised-merge',
      referenceId: record.referenceId,
      legacyRuntimeId: merge.sourceLegacyRuntimeId,
      canonicalProductId: merge.targetCanonicalProductId,
    }] },
    identityMigration: migration,
    catalogProjectionSemanticSha256: migration.sourceBindings.publicProjectionSemanticSha256,
    generatedAt: '2026-07-21T00:00:00.000Z',
  });

  assert.deepEqual(queue.records[0].canonicalProductIds, [merge.targetCanonicalProductId]);
  assert.equal(queue.sourceIdentityMigrationSha256, migration.semanticSha256);
});

test('multiple canonical products remain fail-closed without an explicit identity merge', () => {
  const record = classified('unproven-merge', 'IDENTITY_RESEARCH');
  assert.throws(() => buildHistoricalModelPdfAcquisitionQueue({
    classification: { schemaVersion: 1, semanticClassificationSha256: 'a'.repeat(64), records: [record] },
    historicalReference: { records: [reference(record.referenceId)] },
    catalogProducts: catalogProducts([record]),
    recoveryQueue: { targets: [{
      targetId: 'recovery-unproven-merge',
      referenceId: record.referenceId,
      legacyRuntimeId: `product-${record.referenceId}`,
      canonicalProductId: 'fa_prod_unproven_target',
    }] },
    generatedAt: '2026-07-21T00:00:00.000Z',
  }), /historical reference maps to multiple canonical products/);
});

test('committed acquisition queue excludes every complete receipt classification', async () => {
  const [classification, queue] = await Promise.all([
    readFile('data/architecture-v2/generated/historical-model-evidence-classification.json', 'utf8').then(JSON.parse),
    readFile('data/architecture-v2/reviews/automated/historical-model-pdf-acquisition-queue.json', 'utf8').then(JSON.parse),
  ]);
  const completeReferences = new Set(classification.records
    .filter((record) => record.operationalClass === 'COMPLETE_RECEIPT')
    .map((record) => record.referenceId));
  assert.ok(completeReferences.size > 0);
  assert.equal(queue.summary.excluded.COMPLETE_RECEIPT, completeReferences.size);
  assert.ok(queue.records.every((record) => !completeReferences.has(record.referenceId)));
});
