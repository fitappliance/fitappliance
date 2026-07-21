const NOT_FETCHED = new Set(['transport_failure', 'reference_only', 'not_attempted_optional']);
const PARSED = new Set([
  'accepted', 'identity_rejected', 'claims_incomplete', 'claim_rejected',
  'claim_semantics_rejected', 'conflict_quarantined',
]);
const AXIS_FIELDS = new Set([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
]);

function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function brandKey(value) {
  return requiredText(value, 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function sortedRecord(entries) {
  return Object.fromEntries([...entries].sort(([left], [right]) => left.localeCompare(right)));
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function preferredBrandLabel(labels) {
  return [...labels].sort((left, right) => {
    const leftLetters = left.replace(/[^a-z]/gi, '');
    const rightLetters = right.replace(/[^a-z]/gi, '');
    const leftAllCaps = leftLetters && leftLetters === leftLetters.toUpperCase();
    const rightAllCaps = rightLetters && rightLetters === rightLetters.toUpperCase();
    return Number(leftAllCaps) - Number(rightAllCaps) || left.localeCompare(right);
  })[0];
}

function resolverOrigins(candidate) {
  const ids = (candidate.resolverRefs ?? []).map((reference) => reference.resolverId);
  return {
    batch: ids.includes('batch-candidates'),
    core: ids.includes('architecture-v2-core-official-discovery'),
    adapter: ids.some((id) => !['batch-candidates', 'architecture-v2-core-official-discovery'].includes(id)),
  };
}

function acceptedSource(candidate) {
  return candidate?.outcome?.status === 'accepted' ? candidate.outcome.source : null;
}

function sourceHasAllAxes(source) {
  const fields = new Set((source?.claims ?? []).map((claim) => claim.field));
  return [...AXIS_FIELDS].every((field) => fields.has(field));
}

function sourceHasReceipt(source) {
  return Boolean(source?.verificationReceipt?.bindingSha256);
}

function createBrandAccumulator(key) {
  return {
    brandKey: key,
    labels: new Set(),
    targets: 0,
    completedTargets: 0,
    targetStatuses: new Map(),
    quarantinedByReason: new Map(),
    candidates: {
      total: 0,
      official: 0,
      reference: 0,
      fromBatch: 0,
      fromCoreDiscovery: 0,
      fromBrandAdapter: 0,
      brandAdapterOfficial: 0,
      brandAdapterReference: 0,
    },
    candidateOutcomes: new Map(),
    funnel: {
      targetsWithOfficialCandidate: 0,
      officialCandidatesFetched: 0,
      officialCandidatesParsed: 0,
      identityAccepted: 0,
      allAxisAccepted: 0,
      receiptAccepted: 0,
    },
  };
}

export function buildHistoricalEvidenceBrandFunnel(state) {
  if (!state || typeof state !== 'object' || state.status !== 'completed') {
    throw new TypeError('completed recovery state required for brand funnel');
  }
  const targetRows = Object.values(state.targets ?? {});
  if (!targetRows.length || targetRows.some((row) => row?.state !== 'completed' || !row.outcome)) {
    throw new TypeError('every recovery target requires one terminal outcome');
  }

  const groups = new Map();
  let referenceCandidatesAccepted = 0;
  let acceptedTargetsWithoutAllAxisReceipt = 0;
  for (const targetRow of targetRows) {
    const outcome = targetRow.outcome;
    const identity = outcome.candidateInventory?.identity;
    const key = brandKey(identity?.brand);
    if (!groups.has(key)) groups.set(key, createBrandAccumulator(key));
    const group = groups.get(key);
    group.labels.add(requiredText(identity.brand, 'candidate inventory brand'));
    group.targets += 1;
    group.completedTargets += 1;
    increment(group.targetStatuses, requiredText(outcome.status, 'target outcome status'));
    if (!['accepted', 'receipt_accepted_non_scalar'].includes(outcome.status)) {
      increment(group.quarantinedByReason, `${outcome.status}:${outcome.failureCode ?? 'none'}`);
    }

    const candidates = outcome.candidateInventory?.candidates ?? [];
    let targetHasOfficial = false;
    let targetIdentityAccepted = false;
    let targetAllAxisAccepted = false;
    let targetReceiptAccepted = false;
    for (const candidate of candidates) {
      const authority = requiredText(candidate.authorityMode, 'candidate authority mode');
      const status = requiredText(candidate.outcome?.status, 'candidate outcome status');
      const origins = resolverOrigins(candidate);
      group.candidates.total += 1;
      group.candidates[authority] += 1;
      if (origins.batch) group.candidates.fromBatch += 1;
      if (origins.core) group.candidates.fromCoreDiscovery += 1;
      if (origins.adapter) {
        group.candidates.fromBrandAdapter += 1;
        group.candidates[authority === 'official' ? 'brandAdapterOfficial' : 'brandAdapterReference'] += 1;
      }
      increment(group.candidateOutcomes, status);

      const source = acceptedSource(candidate);
      if (authority === 'reference' && (status === 'accepted' || source || sourceHasReceipt(candidate.outcome?.source))) {
        referenceCandidatesAccepted += 1;
        continue;
      }
      if (authority !== 'official') continue;
      targetHasOfficial = true;
      if (!NOT_FETCHED.has(status)) group.funnel.officialCandidatesFetched += 1;
      if (PARSED.has(status)) group.funnel.officialCandidatesParsed += 1;
      if (!source) continue;
      targetIdentityAccepted = true;
      const allAxes = sourceHasAllAxes(source);
      const receipt = sourceHasReceipt(source);
      if (allAxes) targetAllAxisAccepted = true;
      if (receipt) targetReceiptAccepted = true;
    }
    if (targetHasOfficial) group.funnel.targetsWithOfficialCandidate += 1;
    if (targetIdentityAccepted) group.funnel.identityAccepted += 1;
    if (targetAllAxisAccepted) group.funnel.allAxisAccepted += 1;
    if (targetReceiptAccepted) group.funnel.receiptAccepted += 1;
    if (outcome.status === 'accepted' && !(targetAllAxisAccepted && targetReceiptAccepted)) {
      acceptedTargetsWithoutAllAxisReceipt += 1;
    }
  }

  if (referenceCandidatesAccepted) {
    throw new Error(`reference candidate carried accepted evidence: ${referenceCandidatesAccepted}`);
  }
  if (acceptedTargetsWithoutAllAxisReceipt) {
    throw new Error(`accepted target missing all-axis receipt proof: ${acceptedTargetsWithoutAllAxisReceipt}`);
  }

  const brands = [...groups.values()].sort((left, right) => left.brandKey.localeCompare(right.brandKey))
    .map((group) => ({
      brandKey: group.brandKey,
      brand: preferredBrandLabel(group.labels),
      targets: group.targets,
      completedTargets: group.completedTargets,
      targetStatuses: sortedRecord(group.targetStatuses),
      candidateCounts: { ...group.candidates },
      candidateOutcomes: sortedRecord(group.candidateOutcomes),
      funnel: { ...group.funnel },
      quarantinedByReason: sortedRecord(group.quarantinedByReason),
      officialHostCoverage: Number((group.funnel.targetsWithOfficialCandidate / group.targets).toFixed(4)),
    }));

  const total = (field) => brands.reduce((sum, brand) => sum + brand[field], 0);
  const funnelTotal = (field) => brands.reduce((sum, brand) => sum + brand.funnel[field], 0);
  return Object.freeze({
    schemaVersion: 1,
    generatedAt: requiredText(state.completedAt, 'recovery completion time'),
    run: {
      runId: requiredText(state.runId, 'recovery run ID'),
      batchId: requiredText(state.batchId, 'recovery batch ID'),
      semanticOutcomeSha256: requiredText(state.semanticOutcomeSha256, 'recovery semantic outcome SHA-256'),
      batchSha256: requiredText(state.input?.batchSha256, 'recovery input batch SHA-256'),
      queueSha256: requiredText(state.input?.queueSha256, 'recovery input queue SHA-256'),
      policySha256: requiredText(state.input?.policySha256, 'recovery input policy SHA-256'),
      toolchainSha256: requiredText(state.input?.toolchainSha256, 'recovery input toolchain SHA-256'),
    },
    definitions: {
      fetched: 'Official candidate reached payload or parser processing; transport failures and optional product pages are excluded.',
      parsed: 'Official candidate reached claim or identity evaluation after MinerU processing.',
      identityAccepted: 'Target has at least one accepted official candidate source.',
      allAxisAccepted: 'Target has an accepted official source with width, height and depth claims.',
      receiptAccepted: 'Target has an accepted official source with a verification receipt binding.',
      officialHostCoverage: 'Targets with at least one official candidate divided by attempted targets.',
    },
    summary: {
      brands: brands.length,
      targets: total('targets'),
      completedTargets: total('completedTargets'),
      targetsWithOfficialCandidate: funnelTotal('targetsWithOfficialCandidate'),
      officialCandidatesFetched: funnelTotal('officialCandidatesFetched'),
      officialCandidatesParsed: funnelTotal('officialCandidatesParsed'),
      identityAccepted: funnelTotal('identityAccepted'),
      allAxisAccepted: funnelTotal('allAxisAccepted'),
      receiptAccepted: funnelTotal('receiptAccepted'),
    },
    safety: {
      referenceCandidatesAccepted,
      acceptedTargetsWithoutAllAxisReceipt,
      zeroUnsafePromotion: referenceCandidatesAccepted === 0 && acceptedTargetsWithoutAllAxisReceipt === 0,
    },
    brands,
  });
}
