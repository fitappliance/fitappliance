import { evaluateFitV4 } from './fit-v4.mjs';

const CAVITY_MARGIN_MM = Object.freeze({ width: 20, height: 20, depth: 30 });
const GEOMETRY_FIELDS = Object.freeze([
  'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
  'installation.leftMm', 'installation.rightMm', 'installation.topMm',
  'installation.rearMm', 'installation.frontMm',
  'operation.doorOpenDepthMm', 'operation.hingeSideSpaceMm', 'operation.lidOpenHeightMm',
  'service.plumbingRearMm', 'service.rearServicesMm', 'service.rearVentilationMm',
]);

function text(value) {
  return String(value ?? '').trim();
}

function setPath(target, path, value) {
  const keys = path.split('.');
  let cursor = target;
  for (const key of keys.slice(0, -1)) cursor = cursor[key];
  cursor[keys.at(-1)] = structuredClone(value);
}

function getPath(target, path) {
  return path.split('.').reduce((value, key) => value?.[key], target);
}

function emptyGeometry(category, formFactor = null) {
  return {
    category,
    formFactor,
    closedEnvelope: { widthMm: null, heightMm: null, depthMm: null },
    installation: { leftMm: null, rightMm: null, topMm: null, rearMm: null, frontMm: null },
    operation: { doorOpenDepthMm: null, hingeSideSpaceMm: null, lidOpenHeightMm: null },
    service: { plumbingRearMm: null, rearServicesMm: null, rearVentilationMm: null },
  };
}

function geometryFromReview(review) {
  if (!text(review?.category)) throw new TypeError(`review category required: ${review?.legacyRuntimeId}`);
  const geometry = emptyGeometry(review.category, review.formFactor ?? null);
  for (const field of review.fields ?? []) {
    if (!GEOMETRY_FIELDS.includes(field.field)) continue;
    setPath(geometry, field.field, field.value);
  }
  const height = geometry.closedEnvelope.heightMm;
  if (typeof height === 'number') {
    geometry.closedEnvelope.heightMm = { minimumMm: height, maximumMm: height };
  }
  if (!geometry.closedEnvelope.widthMm || !geometry.closedEnvelope.heightMm || !geometry.closedEnvelope.depthMm) {
    throw new TypeError(`closed envelope incomplete: ${review.legacyRuntimeId}`);
  }
  return geometry;
}

function replayCavity(geometry) {
  const height = geometry.closedEnvelope.heightMm;
  return {
    widthMm: geometry.closedEnvelope.widthMm + CAVITY_MARGIN_MM.width,
    heightMm: height.maximumMm + CAVITY_MARGIN_MM.height,
    depthMm: geometry.closedEnvelope.depthMm + CAVITY_MARGIN_MM.depth,
  };
}

function categorySummary(rows) {
  const result = {};
  for (const row of rows) {
    const category = text(row.category) || 'unknown';
    result[category] ??= { selected: 0, replayed: 0 };
    result[category].selected += 1;
    if (row.replayed) result[category].replayed += 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

export function buildFitV4Phase10Replay(manifest) {
  const reviews = manifest?.outcomes;
  if (!Array.isArray(reviews)) throw new TypeError('Phase 10 review outcomes required');

  const selectedRows = reviews.map((review) => ({
    category: text(review.category),
    replayed: review.state === 'approved' && review.identityOutcome === 'exact',
  }));
  const records = [];
  const excluded = [];
  const outcomeCounts = {};
  for (const review of reviews) {
    const replayable = review.state === 'approved' && review.identityOutcome === 'exact';
    if (!replayable) {
      excluded.push({
        legacyRuntimeId: text(review.legacyRuntimeId),
        category: text(review.category),
        state: text(review.state),
        identityOutcome: text(review.identityOutcome),
        reason: review.reason ?? null,
      });
      continue;
    }

    const sourcePdfSha256 = text(review.document?.sha256);
    if (!/^[a-f0-9]{64}$/i.test(sourcePdfSha256)) {
      throw new TypeError(`approved review source hash required: ${review.legacyRuntimeId}`);
    }
    const geometry = geometryFromReview(review);
    const cavity = replayCavity(geometry);
    const decision = evaluateFitV4({ geometry, cavity, evidence: null, advisoryChecks: [] });
    outcomeCounts[decision.outcome] = (outcomeCounts[decision.outcome] ?? 0) + 1;
    records.push({
      legacyRuntimeId: text(review.legacyRuntimeId),
      canonicalProductId: text(review.canonicalProductId),
      category: text(review.category),
      model: text(review.model),
      sourcePdfSha256,
      cavity,
      outcome: decision.outcome,
      evidenceLevel: decision.evidenceLevel,
      sizeMatchStatuses: decision.sizeMatch.statuses,
      checks: decision.checks.map((check) => ({
        id: check.id,
        status: check.status,
        applicable: check.applicable ?? true,
      })),
    });
  }

  return {
    schemaVersion: 1,
    replayPolicy: {
      evidenceMode: 'none',
      cavityMarginMm: { ...CAVITY_MARGIN_MM },
      operationAdvisories: 'excluded_from_axis_replay',
    },
    summary: {
      selected: reviews.length,
      approvedExact: records.length,
      replayed: records.length,
      excluded: excluded.length,
      excludedByState: Object.fromEntries(
        [...excluded.reduce((counts, row) => counts.set(row.state, (counts.get(row.state) ?? 0) + 1), new Map())]
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
      categories: categorySummary(selectedRows),
      outcomes: Object.fromEntries(Object.entries(outcomeCounts).sort(([left], [right]) => left.localeCompare(right))),
      verifiedFit: records.filter((record) => record.outcome === 'VERIFIED_FIT').length,
      unknownChecks: records.reduce(
        (count, record) => count + record.checks.filter((check) => check.status === 'UNKNOWN').length,
        0,
      ),
    },
    records,
    excluded,
  };
}
