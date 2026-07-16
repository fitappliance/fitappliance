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

test('identity closure is discovery-ready only with a brand resolver while conflicts stay research-only', () => {
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
