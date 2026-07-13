import { claimV2GeometryValue, validateDimensionEvidenceClaimV2 } from './dimension-evidence-claim.mjs';
import { computeCandidateInventorySha256 } from './evidence-candidate-inventory.mjs';
import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';
import { verifyVerificationReceipt } from './evidence-source-verifier.mjs';

const DEFAULT_FIELDS = Object.freeze([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
]);

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
    return failure(hadIdentityRejection ? 'identity_rejected' : 'claims_incomplete', hadIdentityRejection ? 'identity' : 'source_authority', inventory);
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
  if (conflictingFields.length || axisConflict || supersession.violations.some((entry) => entry.reason === 'supersession_cycle')) {
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
  };
}

