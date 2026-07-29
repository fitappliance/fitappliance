import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  buildBrandDataProgramStatus,
  evaluateDay14Decision,
  evaluateOutreachThread,
  hasComparablePdfMetrics,
} from '../../src/domain/brand-data-program-status.mjs';

const QUEUE_PATH = 'data/architecture-v2/reviews/automated/brand-data-outreach-queue.json';
const MATRIX_PATH = 'data/architecture-v2/policies/brand-data-contact-matrix.json';
const LEDGER_PATH = 'data/architecture-v2/reviews/automated/brand-data-outreach-ledger.json';
const FROZEN_QUEUE_SHA256 = '148fad5da8dce61e44f420c35d97b0f27419ce831bbaee6301cbc842428ac20d';

async function inputs() {
  const [queueBytes, matrixBytes, ledgerBytes] = await Promise.all([
    readFile(QUEUE_PATH),
    readFile(MATRIX_PATH),
    readFile(LEDGER_PATH),
  ]);
  return {
    queueBytes,
    queue: JSON.parse(queueBytes),
    matrix: JSON.parse(matrixBytes),
    ledger: JSON.parse(ledgerBytes),
  };
}

test('the original 100-model outreach queue remains byte-for-byte frozen', async () => {
  const { queueBytes } = await inputs();
  assert.equal(createHash('sha256').update(queueBytes).digest('hex'), FROZEN_QUEUE_SHA256);
});

test('current program status separates the comparison cohort from exploratory outreach', async () => {
  const { queue, matrix, ledger } = await inputs();
  const status = buildBrandDataProgramStatus({
    queue,
    matrix,
    ledger,
    frozenQueueSha256: FROZEN_QUEUE_SHA256,
    asOf: '2026-07-29',
  });

  assert.deepEqual(status.summary, {
    frozenModels: 100,
    frozenBrands: 12,
    sentComparisonModels: 100,
    sentComparisonBrands: 12,
    routeVerifiedComparisonModels: 0,
    routeVerifiedComparisonBrands: 0,
    missingRouteModels: 0,
    missingRouteBrands: 0,
    exploratorySentBrands: 7,
    exploratorySentThreads: 4,
    sentThreads: 14,
  });
  assert.deepEqual(status.comparison.missingBrands, []);
  assert.deepEqual(status.comparison.routeVerifiedBrands, []);
  assert.deepEqual(status.exploratory.sentBrands, [
    'CHiQ', 'Esatto', 'InAlto', 'Miele', 'MyKin', 'Smeg', 'Sôlt',
  ]);
  assert.equal(status.frozenQueueSha256, FROZEN_QUEUE_SHA256);
  assert.equal(status.publicationEligible, false);
  assert.equal(status.fitEligible, false);
});

test('every frozen brand has exactly one official organization route', async () => {
  const { queue, matrix, ledger } = await inputs();
  const status = buildBrandDataProgramStatus({
    queue,
    matrix,
    ledger,
    frozenQueueSha256: FROZEN_QUEUE_SHA256,
    asOf: '2026-07-29',
  });

  assert.equal(status.comparison.sentBrands.length + status.comparison.routeVerifiedBrands.length, 12);
  assert.equal(new Set([
    ...status.comparison.sentBrands,
    ...status.comparison.routeVerifiedBrands,
  ]).size, 12);
});

test('follow-ups are date-gated and suppressed after a response', () => {
  const thread = {
    id: 'lg-australia',
    state: 'sent',
    sentOn: '2026-07-27',
    firstFollowUpDueOn: '2026-08-01',
    finalFollowUpDueOn: '2026-08-06',
    responseClass: null,
  };

  assert.equal(evaluateOutreachThread(thread, '2026-07-31').action, 'WAIT_FOR_FIRST_FOLLOW_UP');
  assert.equal(evaluateOutreachThread(thread, '2026-08-01').action, 'FIRST_FOLLOW_UP_DUE');
  assert.equal(evaluateOutreachThread({
    ...thread,
    firstFollowUpSentOn: '2026-08-01',
  }, '2026-08-05').action, 'WAIT_FOR_FINAL_FOLLOW_UP');
  assert.equal(evaluateOutreachThread({
    ...thread,
    firstFollowUpSentOn: '2026-08-01',
  }, '2026-08-06').action, 'FINAL_FOLLOW_UP_DUE');
  assert.equal(evaluateOutreachThread({
    ...thread,
    responseClass: 'DATA_TEAM_ROUTED',
  }, '2026-08-10').action, 'RESPONSE_RECEIVED');
  assert.equal(evaluateOutreachThread({
    ...thread,
    firstFollowUpSentOn: '2026-08-01',
    finalFollowUpSentOn: '2026-08-06',
  }, '2026-08-10').action, 'NO_RESPONSE_TERMINAL');
  assert.throws(() => evaluateOutreachThread({
    ...thread,
    firstFollowUpSentOn: '2026-08-10',
    finalFollowUpSentOn: '2026-08-06',
  }, '2026-08-10'), /sequence/i);
  assert.throws(() => evaluateOutreachThread({
    ...thread,
    responseClass: 'DATA_TEAM_ROUTED',
    finalFollowUpSentOn: '2026-08-06',
  }, '2026-08-10'), /requires the first/i);
});

test('PDF comparison requires yield, coverage, conflict, time, and cost metrics', () => {
  assert.equal(hasComparablePdfMetrics({ summary: { total: 100 } }), false);
  assert.equal(hasComparablePdfMetrics({
    sourceRerunSha256: 'a'.repeat(64),
    summary: { total: 100 },
    comparisonMetrics: {
      exactModelReceiptsGained: 4,
      requestedFieldCoverageRate: 0.33,
      conflictRate: 0,
      engineeringHours: 12.5,
      recurringCostAud: 0,
    },
  }), true);
  assert.equal(hasComparablePdfMetrics({
    sourceRerunSha256: 'a'.repeat(64),
    summary: { total: 100 },
    comparisonMetrics: {
      exactModelReceiptsGained: 4,
      requestedFieldCoverageRate: 0.33,
      conflictRate: 0,
      engineeringHours: 0,
      recurringCostAud: 0,
    },
  }), false);
});

test('Day-14 decision never runs early or on incomparable evidence', () => {
  assert.deepEqual(evaluateDay14Decision({
    asOf: '2026-08-09',
    gateOn: '2026-08-10',
    providerComparable: false,
    pdfComparable: true,
  }), {
    state: 'NOT_DUE',
    gateOn: '2026-08-10',
  });
  assert.deepEqual(evaluateDay14Decision({
    asOf: '2026-08-10',
    gateOn: '2026-08-10',
    providerComparable: false,
    pdfComparable: true,
  }), {
    state: 'INSUFFICIENT_COMPARABLE_EVIDENCE',
    gateOn: '2026-08-10',
  });
  assert.deepEqual(evaluateDay14Decision({
    asOf: '2026-08-10',
    gateOn: '2026-08-10',
    providerComparable: true,
    pdfComparable: true,
  }), {
    state: 'READY_FOR_ALLOCATION_REVIEW',
    gateOn: '2026-08-10',
  });
});
