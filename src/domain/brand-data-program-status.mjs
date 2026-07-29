import { assertGitSafeOutreachLedger } from './outreach-evidence-store.mjs';

const HASH_PATTERN = /^[a-f0-9]{64}$/;

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freezeDeep(item);
  }
  return value;
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right, 'en-AU'));
}

function dateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) throw new TypeError('asOf must be YYYY-MM-DD');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TypeError('asOf must be a real date');
  }
  return value;
}

function assertDateOrder(earlier, later, label) {
  if (earlier > later) throw new TypeError(`${label} date order is invalid`);
}

export function evaluateOutreachThread(thread, asOf) {
  const currentDate = dateOnly(asOf);
  if (thread?.state !== 'sent') throw new TypeError('only sent outreach threads have follow-up schedules');
  const sentOn = dateOnly(thread.sentOn);
  const firstDue = dateOnly(thread.firstFollowUpDueOn);
  const finalDue = dateOnly(thread.finalFollowUpDueOn);
  assertDateOrder(sentOn, firstDue, 'first follow-up');
  assertDateOrder(firstDue, finalDue, 'final follow-up');

  let firstSent = null;
  if (thread.firstFollowUpSentOn) {
    firstSent = dateOnly(thread.firstFollowUpSentOn);
    assertDateOrder(firstDue, firstSent, 'first follow-up sent');
  }
  let finalSent = null;
  if (thread.finalFollowUpSentOn) {
    if (!firstSent) throw new TypeError('final follow-up requires the first follow-up');
    finalSent = dateOnly(thread.finalFollowUpSentOn);
    assertDateOrder(finalDue, finalSent, 'final follow-up sent');
    assertDateOrder(firstSent, finalSent, 'follow-up sequence');
  }
  if (thread.responseClass) return Object.freeze({ id: thread.id, action: 'RESPONSE_RECEIVED' });
  if (finalSent) return Object.freeze({ id: thread.id, action: 'NO_RESPONSE_TERMINAL' });
  if (!firstSent) {
    return Object.freeze({
      id: thread.id,
      action: currentDate >= firstDue ? 'FIRST_FOLLOW_UP_DUE' : 'WAIT_FOR_FIRST_FOLLOW_UP',
    });
  }
  return Object.freeze({
    id: thread.id,
    action: currentDate >= finalDue ? 'FINAL_FOLLOW_UP_DUE' : 'WAIT_FOR_FINAL_FOLLOW_UP',
  });
}

export function hasComparablePdfMetrics(report) {
  const metrics = report?.comparisonMetrics;
  const rate = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
  return report?.summary?.total === 100
    && HASH_PATTERN.test(report?.sourceRerunSha256 ?? '')
    && Number.isInteger(metrics?.exactModelReceiptsGained)
    && metrics.exactModelReceiptsGained >= 0
    && rate(metrics?.requestedFieldCoverageRate)
    && rate(metrics?.conflictRate)
    && Number.isFinite(metrics?.engineeringHours)
    && metrics.engineeringHours > 0
    && Number.isFinite(metrics?.recurringCostAud)
    && metrics.recurringCostAud >= 0;
}

export function evaluateDay14Decision({ asOf, gateOn, providerComparable, pdfComparable }) {
  const currentDate = dateOnly(asOf);
  const gateDate = dateOnly(gateOn);
  if (currentDate < gateDate) return Object.freeze({ state: 'NOT_DUE', gateOn: gateDate });
  if (providerComparable !== true || pdfComparable !== true) {
    return Object.freeze({ state: 'INSUFFICIENT_COMPARABLE_EVIDENCE', gateOn: gateDate });
  }
  return Object.freeze({ state: 'READY_FOR_ALLOCATION_REVIEW', gateOn: gateDate });
}

function organizationByBrand(matrix) {
  if (!Array.isArray(matrix?.organizations)) throw new TypeError('contact matrix organizations are required');
  const result = new Map();
  for (const organization of matrix.organizations) {
    for (const brand of organization.coveredBrands ?? []) {
      if (result.has(brand)) throw new TypeError(`brand has multiple contact owners: ${brand}`);
      result.set(brand, organization);
    }
  }
  return result;
}

export function buildBrandDataProgramStatus({ queue, matrix, ledger, frozenQueueSha256, asOf }) {
  if (!Array.isArray(queue?.brands) || queue.sourcePilotProducts !== 100) {
    throw new TypeError('the frozen 100-model outreach queue is required');
  }
  assertGitSafeOutreachLedger(ledger);
  if (!HASH_PATTERN.test(frozenQueueSha256 ?? '')) throw new TypeError('frozen queue SHA-256 is required');

  const ownerByBrand = organizationByBrand(matrix);
  const frozenBrands = new Set(queue.brands.map(({ brand }) => brand));
  const sentThreads = ledger.threads.filter(({ state }) => state === 'sent');
  const sentBrands = new Set(sentThreads.flatMap(({ coveredBrands }) => coveredBrands ?? []));
  const comparisonSent = queue.brands.filter(({ brand }) => sentBrands.has(brand));
  const comparisonRouteVerified = queue.brands.filter(({ brand }) => (
    !sentBrands.has(brand) && ownerByBrand.get(brand)?.state === 'route_verified'
  ));
  const comparisonMissing = queue.brands.filter(({ brand }) => (
    !sentBrands.has(brand) && ownerByBrand.get(brand)?.state !== 'route_verified'
  ));
  const exploratorySentBrands = sorted([...sentBrands].filter((brand) => !frozenBrands.has(brand)));
  const exploratoryThreadIds = sorted(sentThreads
    .filter(({ coveredBrands }) => (coveredBrands ?? []).some((brand) => !frozenBrands.has(brand)))
    .map(({ id }) => id));
  const countModels = (rows) => rows.reduce((total, row) => total + row.pilotModels.length, 0);

  const currentDate = dateOnly(asOf);
  const followUps = sentThreads.map((thread) => evaluateOutreachThread(thread, currentDate));

  return freezeDeep({
    schemaVersion: 1,
    asOf: currentDate,
    classification: 'git_safe_brand_data_program_status',
    frozenQueueSha256,
    comparison: {
      sentBrands: sorted(comparisonSent.map(({ brand }) => brand)),
      routeVerifiedBrands: sorted(comparisonRouteVerified.map(({ brand }) => brand)),
      missingBrands: sorted(comparisonMissing.map(({ brand }) => brand)),
    },
    exploratory: {
      sentBrands: exploratorySentBrands,
      threadIds: exploratoryThreadIds,
    },
    followUps,
    summary: {
      frozenModels: queue.sourcePilotProducts,
      frozenBrands: queue.brands.length,
      sentComparisonModels: countModels(comparisonSent),
      sentComparisonBrands: comparisonSent.length,
      routeVerifiedComparisonModels: countModels(comparisonRouteVerified),
      routeVerifiedComparisonBrands: comparisonRouteVerified.length,
      missingRouteModels: countModels(comparisonMissing),
      missingRouteBrands: comparisonMissing.length,
      exploratorySentBrands: exploratorySentBrands.length,
      exploratorySentThreads: exploratoryThreadIds.length,
      sentThreads: sentThreads.length,
    },
    publicationEligible: false,
    fitEligible: false,
  });
}
