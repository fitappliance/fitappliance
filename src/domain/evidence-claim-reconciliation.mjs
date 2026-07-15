import { claimV2GeometryValue, validateDimensionEvidenceClaimV2 } from './dimension-evidence-claim.mjs';
import { computeCandidateInventorySha256 } from './evidence-candidate-inventory.mjs';
import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';
import { verifyVerificationReceipt } from './evidence-source-verifier.mjs';

const DEFAULT_FIELDS = Object.freeze([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
]);

function normalizeHintDimensions(value) {
  return {
    widthMm: value?.widthMm ?? value?.width ?? null,
    heightMm: value?.heightMm ?? value?.height ?? null,
    depthMm: value?.depthMm ?? value?.depth ?? null,
  };
}

export function buildLowerAuthorityHints(target) {
  return [
    ...(target?.reconciliationContext?.registryHints ?? []).map((hint) => ({
      sourceRole: 'registry_hint',
      sourceId: hint.sourceId,
      dimensionsMm: normalizeHintDimensions(hint.dimensionsMm),
    })),
    ...(target?.reconciliationContext?.legacyHints ?? []).map((hint) => ({
      sourceRole: 'legacy_hint',
      sourceId: hint.sourceDocumentId,
      dimensionsMm: normalizeHintDimensions(hint.dimensionsMm),
    })),
  ];
}

function identityKey(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function exactIdentity(source, identity) {
  return source?.identity?.outcome === 'exact'
    && identityKey(source.identity.brand) === identityKey(identity.brand)
    && identityKey(source.identity.model) === identityKey(identity.model)
    && String(source.identity.category ?? identity.category) === String(identity.category);
}

function sameResource(left, right) {
  try {
    const a = new URL(left); const b = new URL(right);
    for (const url of [a, b]) {
      url.hash = '';
      url.search = '';
      url.pathname = url.pathname.replace(/\/+$/, '');
    }
    return a.toString() === b.toString();
  } catch {
    return false;
  }
}

function normalizedClaimValue(claim) {
  if (claim?.value?.kind === 'fixed') return { kind: 'fixed', mm: claim.value.mm };
  if (claim?.value?.kind === 'range') {
    return { kind: 'range', minMm: claim.value.minMm, maxMm: claim.value.maxMm };
  }
  if (Number.isFinite(claim?.value)) return { kind: 'fixed', mm: claim.value };
  if (Number.isFinite(claim?.value?.minimumMm) && Number.isFinite(claim?.value?.maximumMm)) {
    return { kind: 'range', minMm: claim.value.minimumMm, maxMm: claim.value.maximumMm };
  }
  throw new TypeError(`unsupported claim value for ${claim?.field ?? 'unknown field'}`);
}

function sourceClaimDigest(source) {
  return canonicalJsonSha256((source.claims ?? []).map((claim) => ({
    field: claim.field,
    value: normalizedClaimValue(claim),
  })).sort((left, right) => left.field.localeCompare(right.field)));
}

function failure(status, failureCode, inventory, extras = {}) {
  return {
    status,
    failureCode,
    candidateInventorySha256: inventory.candidateInventorySha256,
    sources: [],
    conflictingFields: [],
    conflictHints: [],
    ...extras,
  };
}

function strongestOfficialCandidateFailure(candidates) {
  const codes = new Set((candidates ?? [])
    .filter((candidate) => candidate.authorityMode === 'official')
    .map((candidate) => candidate.outcome?.failureCode)
    .filter(Boolean));
  return [
    'receipt', 'payload', 'mineru', 'claim_semantics', 'transport', 'source_authority',
  ].find((code) => codes.has(code)) ?? 'source_authority';
}

function deduplicateSources(sources) {
  const byHash = new Map();
  for (const source of sources) {
    const hash = String(source?.contentSha256 ?? '');
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new TypeError('official source content SHA-256 invalid');
    const existing = byHash.get(hash);
    if (existing && sourceClaimDigest(existing) !== sourceClaimDigest(source)) {
      return { conflict: `same content hash ${hash} has different claims`, sources: [] };
    }
    if (!existing || String(source.sourceUrl).localeCompare(String(existing.sourceUrl)) < 0) byHash.set(hash, source);
  }
  return { conflict: null, sources: [...byHash.values()].sort((a, b) => a.contentSha256.localeCompare(b.contentSha256)) };
}

function applyAttestedSupersession(sources) {
  const byHash = new Map(sources.map((source) => [source.contentSha256, source]));
  const superseded = new Set();
  const violations = [];
  for (const source of sources) {
    for (const priorHash of source.supersedesContentSha256 ?? []) {
      const prior = byHash.get(priorHash);
      if (!prior || prior === source) continue;
      if (!sameResource(source.finalUrl ?? source.sourceUrl, prior.finalUrl ?? prior.sourceUrl)) {
        violations.push({ sourceHash: source.contentSha256, priorHash, reason: 'cross_resource_supersession' });
        continue;
      }
      superseded.add(priorHash);
    }
  }
  const active = sources.filter((source) => !superseded.has(source.contentSha256));
  if (!active.length && sources.length) {
    return { active: sources, violations: [...violations, { reason: 'supersession_cycle' }] };
  }
  return { active, violations };
}

function claimMatrix(sources, requestedFields) {
  const matrix = new Map(requestedFields.map((field) => [field, []]));
  for (const source of sources) {
    const seen = new Set();
    for (const claim of source.claims ?? []) {
      if (!matrix.has(claim.field)) continue;
      if (seen.has(claim.field)) throw new TypeError(`duplicate claim field ${claim.field} in one source`);
      seen.add(claim.field);
      if (claim?.value?.kind) validateDimensionEvidenceClaimV2(claim);
      matrix.get(claim.field).push({ source, claim, value: normalizedClaimValue(claim) });
    }
  }
  return matrix;
}

function scalarDimensions(matrix) {
  const dimensions = {};
  for (const [field, rows] of matrix) {
    const fixed = rows.map((row) => row.value).find((value) => value.kind === 'fixed');
    if (fixed) dimensions[field.split('.').at(-1)] = fixed.mm;
  }
  return dimensions;
}

function analyzeHints(hints, matrix) {
  const official = scalarDimensions(matrix);
  const conflictHints = [];
  for (const hint of hints ?? []) {
    const dimensions = hint?.dimensionsMm;
    if (!dimensions || typeof dimensions !== 'object') continue;
    const keys = ['widthMm', 'heightMm', 'depthMm'];
    const comparable = keys.every((key) => Number.isFinite(dimensions[key]) && Number.isFinite(official[key]));
    if (!comparable) continue;
    const disagreements = keys.filter((key) => dimensions[key] !== official[key]);
    if (!disagreements.length) continue;
    const axisPermutation = String(hint.sourceRole) === 'registry_hint'
      && [...keys.map((key) => dimensions[key])].sort((a, b) => a - b).join(',')
        === [...keys.map((key) => official[key])].sort((a, b) => a - b).join(',');
    conflictHints.push({
      sourceRole: String(hint.sourceRole ?? 'unknown_hint'),
      sourceId: String(hint.sourceId ?? 'unknown'),
      kind: axisPermutation ? 'axis_permutation' : 'lower_authority_disagreement',
      fields: disagreements.sort(),
      dimensionsMm: structuredClone(dimensions),
    });
  }
  return conflictHints.sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

function claimAxis(field) {
  const axis = field.split('.').at(-1)?.replace(/Mm$/, '');
  return ['width', 'height', 'depth'].includes(axis) ? axis : null;
}

function sourceAxisRepresentation(rows) {
  const expectedAxes = rows.map((row) => claimAxis(row.claim.field));
  if (expectedAxes.some((axis) => !axis)) return null;

  const individuallyLabelled = rows.every((row, index) => {
    const order = row.claim.sourceAxisOrder;
    return Array.isArray(order) && order.length === 1 && order[0] === expectedAxes[index];
  });
  if (individuallyLabelled) return 'individually_labelled';

  const orders = rows.map((row) => row.claim.sourceAxisOrder);
  const firstOrder = orders[0];
  const matrixBound = Array.isArray(firstOrder)
    && firstOrder.length === DEFAULT_FIELDS.length
    && new Set(firstOrder).size === DEFAULT_FIELDS.length
    && DEFAULT_FIELDS.every((field) => firstOrder.includes(claimAxis(field)))
    && orders.every((order) => JSON.stringify(order) === JSON.stringify(firstOrder));
  if (matrixBound) return `axis_matrix:${firstOrder.join(',')}`;

  const completeOrders = orders.filter((order) => Array.isArray(order)
    && order.length === DEFAULT_FIELDS.length
    && new Set(order).size === DEFAULT_FIELDS.length
    && DEFAULT_FIELDS.every((field) => order.includes(claimAxis(field))));
  const commonCompleteOrder = completeOrders[0];
  const mixedExplicit = commonCompleteOrder
    && completeOrders.every((order) => JSON.stringify(order) === JSON.stringify(commonCompleteOrder))
    && rows.every((row, index) => {
      const order = row.claim.sourceAxisOrder;
      return JSON.stringify(order) === JSON.stringify(commonCompleteOrder)
        || (Array.isArray(order) && order.length === 1 && order[0] === expectedAxes[index]);
    });
  return mixedExplicit ? `mixed_explicit_axes:${commonCompleteOrder.join(',')}` : null;
}

function completeOfficialDimensionSources(matrix) {
  if (!DEFAULT_FIELDS.every((field) => matrix.has(field))) return [];

  const sourceRows = new Map();
  for (const field of DEFAULT_FIELDS) {
    for (const row of matrix.get(field)) {
      if (row.value.kind !== 'fixed') continue;
      const hash = row.source.contentSha256;
      if (!sourceRows.has(hash)) sourceRows.set(hash, new Map());
      sourceRows.get(hash).set(field, row);
    }
  }

  return [...sourceRows.entries()].flatMap(([hash, rowsByField]) => {
    if (!DEFAULT_FIELDS.every((field) => rowsByField.has(field))) return [];
    const rows = DEFAULT_FIELDS.map((field) => rowsByField.get(field));
    const representation = sourceAxisRepresentation(rows);
    if (!representation) return [];
    return [{
      hash,
      sourceType: rows[0].source.sourceType,
      representation,
      dimensions: DEFAULT_FIELDS.map((field) => rowsByField.get(field).value.mm),
    }];
  });
}

function hasIndependentOfficialAxisCorroboration(matrix) {
  const completeSources = completeOfficialDimensionSources(matrix);

  for (let left = 0; left < completeSources.length; left += 1) {
    for (let right = left + 1; right < completeSources.length; right += 1) {
      const a = completeSources[left];
      const b = completeSources[right];
      if (a.hash === b.hash || a.representation === b.representation) continue;
      if (JSON.stringify(a.dimensions) === JSON.stringify(b.dimensions)) return true;
    }
  }
  return false;
}

function hasExactOfficialAxisProof(matrix) {
  return completeOfficialDimensionSources(matrix).length > 0;
}

function hasIndependentOfficialDimensionCorroboration(matrix) {
  const completeSources = completeOfficialDimensionSources(matrix);
  for (let left = 0; left < completeSources.length; left += 1) {
    for (let right = left + 1; right < completeSources.length; right += 1) {
      const a = completeSources[left];
      const b = completeSources[right];
      if (a.hash === b.hash || JSON.stringify(a.dimensions) !== JSON.stringify(b.dimensions)) continue;
      if (a.sourceType !== b.sourceType || a.representation !== b.representation) return true;
    }
  }
  return false;
}

function hasReceiptBoundMarketApiDimensionCorroboration(matrix) {
  const official = scalarDimensions(matrix);
  if (!['widthMm', 'heightMm', 'depthMm'].every((key) => Number.isFinite(official[key]))) return false;
  const expected = `${official.widthMm}x${official.heightMm}x${official.depthMm}`;
  const sources = new Map();
  for (const rows of matrix.values()) {
    for (const row of rows) sources.set(row.source.contentSha256, row.source);
  }
  return [...sources.values()].some((source) => (source.identitySignals ?? []).some((signal) => (
    signal?.type === 'official_market_api_dimensions'
      && String(signal.value).split(':').at(-2) === expected
      && /^[a-f0-9]{64}$/.test(String(signal.value).split(':').at(-1) ?? '')
  )));
}

export function reconcileEvidenceClaims(identity, inventory, options = {}) {
  if (!inventory || typeof inventory !== 'object') throw new TypeError('candidate inventory required');
  if (options.verifyInventoryHash
    && computeCandidateInventorySha256(inventory) !== inventory.candidateInventorySha256) {
    throw new Error('candidate inventory SHA-256 binding mismatch');
  }
  if (inventory.completionStatus !== 'complete') {
    return failure('retryable_failure', 'discovery_incomplete', inventory, {
      incompleteResolvers: [...(inventory.incompleteResolvers ?? [])],
      missingBatchCandidateJobIds: [...(inventory.missingBatchCandidateJobIds ?? [])],
    });
  }

  const candidateSources = (inventory.candidates ?? [])
    .filter((candidate) => candidate.authorityMode === 'official'
      && ['accepted', 'unchanged'].includes(candidate.outcome?.status)
      && candidate.outcome.source)
    .map((candidate) => candidate.outcome.source);
  const supplied = [...(inventory.activeReceiptSources ?? []), ...candidateSources];
  const exact = supplied.filter((source) => source.authority === 'manufacturer' && exactIdentity(source, identity));
  if (!exact.length) {
    const hadIdentityRejection = (inventory.candidates ?? []).some((candidate) => candidate.outcome?.status === 'identity_rejected');
    return failure(
      hadIdentityRejection ? 'identity_rejected' : 'claims_incomplete',
      hadIdentityRejection ? 'identity' : strongestOfficialCandidateFailure(inventory.candidates),
      inventory,
    );
  }

  const verifyReceipt = options.verifyReceipt ?? verifyVerificationReceipt;
  try {
    for (const source of exact) {
      verifyReceipt(source, identity, { asOf: source?.verificationReceipt?.verifiedAt });
    }
  } catch (error) {
    return failure('terminal_failure', 'receipt', inventory, { receiptError: String(error?.message ?? error) });
  }

  const deduplicated = deduplicateSources(exact);
  if (deduplicated.conflict) {
    return failure('conflict_quarantined', 'conflict', inventory, { conflictReason: deduplicated.conflict });
  }
  const supersession = applyAttestedSupersession(deduplicated.sources);
  const requestedFields = options.requestedFields ?? DEFAULT_FIELDS;
  const matrix = claimMatrix(supersession.active, requestedFields);
  const conflictingFields = [];
  const missingFields = [];
  let hasNonScalar = false;
  for (const [field, rows] of matrix) {
    if (!rows.length) {
      missingFields.push(field);
      continue;
    }
    const values = new Set(rows.map((row) => JSON.stringify(row.value)));
    if (values.size > 1) conflictingFields.push(field);
    for (const row of rows) {
      if (row.claim?.value?.kind === 'range' && claimV2GeometryValue(row.claim) === null) hasNonScalar = true;
    }
  }
  const conflictHints = analyzeHints(options.lowerAuthorityHints ?? [], matrix);
  const axisConflict = conflictHints.some((hint) => hint.kind === 'axis_permutation');
  const independentAxisCorroboration = axisConflict && hasIndependentOfficialAxisCorroboration(matrix);
  const exactOfficialAxisProof = axisConflict && hasExactOfficialAxisProof(matrix);
  const axisCorroborated = independentAxisCorroboration || exactOfficialAxisProof;
  const lowerAuthorityConflict = conflictHints.some((hint) => hint.kind === 'lower_authority_disagreement');
  const independentDimensionCorroboration = hasIndependentOfficialDimensionCorroboration(matrix);
  const marketApiDimensionCorroboration = hasReceiptBoundMarketApiDimensionCorroboration(matrix);
  const exactOfficialLegacyProof = lowerAuthorityConflict
    && conflictHints.filter((hint) => hint.kind === 'lower_authority_disagreement')
      .every((hint) => hint.sourceRole === 'legacy_hint')
    && hasExactOfficialAxisProof(matrix);
  const lowerAuthorityCorroborated = lowerAuthorityConflict
    && (independentDimensionCorroboration || marketApiDimensionCorroboration || exactOfficialLegacyProof);
  if (conflictingFields.length || (axisConflict && !axisCorroborated)
    || (lowerAuthorityConflict && !lowerAuthorityCorroborated)
    || supersession.violations.some((entry) => entry.reason === 'supersession_cycle')) {
    return {
      status: 'conflict_quarantined',
      failureCode: 'conflict',
      candidateInventorySha256: inventory.candidateInventorySha256,
      sources: supersession.active,
      conflictingFields: conflictingFields.sort(),
      conflictHints,
      supersessionViolations: supersession.violations,
    };
  }
  if (missingFields.length) {
    return {
      status: 'claims_incomplete',
      failureCode: 'claim_semantics',
      candidateInventorySha256: inventory.candidateInventorySha256,
      sources: supersession.active,
      conflictingFields: [],
      conflictHints,
      missingFields: missingFields.sort(),
      supersessionViolations: supersession.violations,
    };
  }
  return {
    status: hasNonScalar ? 'receipt_accepted_non_scalar' : 'accepted',
    failureCode: null,
    candidateInventorySha256: inventory.candidateInventorySha256,
    sources: supersession.active,
    conflictingFields: [],
    conflictHints,
    supersessionViolations: supersession.violations,
    ...(axisCorroborated
      ? {
        axisPermutationResolution: independentAxisCorroboration
          ? 'independent_official_axis_corroboration'
          : 'exact_official_axis_proof',
      }
      : {}),
    ...(lowerAuthorityCorroborated
      ? {
        lowerAuthorityResolution: marketApiDimensionCorroboration
          ? 'official_market_api_dimension_corroboration'
          : independentDimensionCorroboration
            ? 'independent_official_dimension_corroboration'
            : 'exact_official_axis_proof_over_legacy_hint',
      }
      : {}),
  };
}
