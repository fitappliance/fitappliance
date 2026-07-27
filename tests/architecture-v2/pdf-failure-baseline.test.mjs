import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  PDF_FAILURE_LAYERS,
  buildPdfFailureBaseline,
  classifyPdfFailure,
} from '../../src/domain/pdf-failure-baseline.mjs';

const INPUTS = Object.freeze({
  queue: 'data/architecture-v2/reviews/automated/historical-evidence-recovery-queue.json',
  sourceDocuments: 'data/architecture-v2/generated/source-documents.json',
  mineruAudit: 'data/architecture-v2/reviews/automated/historical-mineru-backfill-audit.json',
  evidenceObjectIndex: 'data/architecture-v2/generated/evidence-object-index.json',
});

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function passedState() {
  return Object.fromEntries(PDF_FAILURE_LAYERS.map(({ id }) => [id, { status: 'passed' }]));
}

test('failure classifier stops at exactly the first unclosed pipeline layer', () => {
  for (const layer of PDF_FAILURE_LAYERS) {
    const state = passedState();
    state[layer.id] = { status: 'failed', code: `test_${layer.id}`, detail: 'synthetic failure' };
    const failure = classifyPdfFailure(state);
    assert.deepEqual(failure, {
      layer: layer.layer,
      id: layer.id,
      code: `test_${layer.id}`,
      detail: 'synthetic failure',
    });
  }

  assert.throws(() => classifyPdfFailure(passedState()), /no failed layer/i);
});

test('queue graph rejects a job that references an unknown target id', () => {
  assert.throws(() => buildPdfFailureBaseline({
    queue: {
      targets: [],
      jobs: [{
        jobId: 'job-missing-target',
        sourceUrl: 'https://example.com/manual.pdf',
        targetIds: ['target-missing'],
      }],
    },
    sourceDocuments: { documents: [] },
    mineruAudit: { entries: [] },
    evidenceObjectIndex: { documents: [] },
    inputHashes: {
      queue: 'a'.repeat(64),
      sourceDocuments: 'b'.repeat(64),
      mineruAudit: 'c'.repeat(64),
      evidenceObjectIndex: 'd'.repeat(64),
    },
    perCategory: 1,
  }), /unknown target id.*target-missing/i);
});

test('real baseline is deterministic, unique, and stratified to 25 candidates per category', async () => {
  const input = {
    queue: await readJson(INPUTS.queue),
    sourceDocuments: await readJson(INPUTS.sourceDocuments),
    mineruAudit: await readJson(INPUTS.mineruAudit),
    evidenceObjectIndex: await readJson(INPUTS.evidenceObjectIndex),
    inputHashes: {
      queue: 'a'.repeat(64),
      sourceDocuments: 'b'.repeat(64),
      mineruAudit: 'c'.repeat(64),
      evidenceObjectIndex: 'd'.repeat(64),
    },
  };
  const first = buildPdfFailureBaseline(input);
  const second = buildPdfFailureBaseline(input);

  assert.deepEqual(first, second);
  assert.equal(first.summary.total, 100);
  assert.deepEqual(first.summary.byCategory, {
    dishwasher: 25,
    dryer: 25,
    fridge: 25,
    washing_machine: 25,
  });
  assert.equal(new Set(first.samples.map(({ sampleId }) => sampleId)).size, 100);
  assert.equal(new Set(first.samples.map(({ sourceUrl }) => sourceUrl)).size, 100);
  assert.ok(first.summary.distinctBrands >= 20);
  assert.ok(first.summary.acquiredObjects > 0);
  assert.ok(first.summary.acquiredObjects < 100);
});

test('every baseline row has one typed primary failure and no invented document-layout claim', async () => {
  const baseline = JSON.parse(await readFile(
    'data/architecture-v2/reviews/automated/pdf-failure-baseline-100.json',
    'utf8',
  ));
  const allowedLayers = new Set(PDF_FAILURE_LAYERS.map(({ id }) => id));
  for (const sample of baseline.samples) {
    assert.ok(allowedLayers.has(sample.primaryFailure.id));
    assert.equal(
      PDF_FAILURE_LAYERS.find(({ id }) => id === sample.primaryFailure.id).layer,
      sample.primaryFailure.layer,
    );
    assert.equal(sample.documentPattern.basis, 'url_path_hint_not_document_evidence');
    assert.equal(sample.pipelineTrace.at(-1).id, sample.primaryFailure.id);
    assert.equal(sample.pipelineTrace.at(-1).status === 'passed', false);
    const acquisition = sample.pipelineTrace.find(({ id }) => id === 'acquisition');
    if (acquisition.status !== 'passed') {
      assert.equal(sample.documentPattern.confirmed, false);
      assert.equal(sample.primaryFailure.id, 'acquisition');
    }
  }
  assert.equal(baseline.familyBacklog.eligibilityThresholdExactModelReceipts, 10);
  assert.equal(baseline.familyBacklog.topFive.length, 5);
});
