import { createHash } from 'node:crypto';

import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';

const COMPLETION_STATES = new Set(['complete', 'truncated', 'timed_out', 'failed', 'unknown']);
const AUTHORITY_MODES = new Set(['official', 'reference']);

function requiredText(value, label) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function normalizedUrl(value) {
  const url = new URL(requiredText(value, 'candidate source URL'));
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError('candidate source URL must use trusted HTTPS');
  }
  url.hash = '';
  return url.toString();
}

function candidateKey(candidate) {
  return `${candidate.authorityMode}\0${candidate.sourceUrl}`;
}

function candidateId(candidate) {
  return `candidate_${createHash('sha256').update([
    'evidence-candidate-v1', candidate.authorityMode, candidate.sourceUrl,
  ].join('\0')).digest('hex').slice(0, 24)}`;
}

function resolverDescriptor(resolver, index) {
  if (typeof resolver === 'function') {
    return {
      resolve: resolver,
      resolverId: resolver.resolverId ?? resolver.id ?? resolver.name ?? `resolver-${index + 1}`,
      version: resolver.version ?? null,
      scope: resolver.scope ?? null,
      required: resolver.required ?? true,
    };
  }
  if (!resolver || typeof resolver !== 'object' || typeof resolver.resolve !== 'function') {
    throw new TypeError(`resolver ${index + 1} must be a function or resolver object`);
  }
  return {
    resolve: resolver.resolve.bind(resolver),
    resolverId: resolver.resolverId ?? resolver.id ?? `resolver-${index + 1}`,
    version: resolver.version ?? null,
    scope: resolver.scope ?? null,
    required: resolver.required ?? true,
  };
}

function normalizeResolverResult(result, descriptor) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new TypeError(`${descriptor.resolverId} resolver result must be an object`);
  }
  const resolverId = requiredText(result.resolverId, 'resolver ID');
  const version = requiredText(result.version, `${resolverId} resolver version`);
  const scope = requiredText(result.scope, `${resolverId} resolver scope`);
  if (resolverId !== descriptor.resolverId && descriptor.resolverId) {
    throw new TypeError(`${resolverId} resolver ID does not match declared descriptor`);
  }
  if (typeof result.required !== 'boolean') throw new TypeError(`${resolverId} resolver required flag invalid`);
  const completion = String(result.completion ?? 'unknown');
  if (!COMPLETION_STATES.has(completion)) {
    return { resolverId, version, scope, required: result.required, completion: 'unknown', candidates: [] };
  }
  if (!Array.isArray(result.candidates)) throw new TypeError(`${resolverId} candidates must be an array`);
  const candidates = result.candidates.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(`${resolverId} candidate ${index + 1} must be an object`);
    }
    const authorityMode = requiredText(value.authorityMode, 'candidate authority mode');
    if (!AUTHORITY_MODES.has(authorityMode)) throw new TypeError('candidate authority mode invalid');
    if (typeof value.requiredAttempt !== 'boolean') throw new TypeError('candidate requiredAttempt flag invalid');
    const batchJobId = value.batchJobId === null || value.batchJobId === undefined
      ? null
      : requiredText(value.batchJobId, 'candidate batch job ID');
    return {
      sourceUrl: normalizedUrl(value.sourceUrl),
      authorityMode,
      sourceRole: requiredText(value.sourceRole, 'candidate source role'),
      discoveryMethod: requiredText(value.discoveryMethod, 'candidate discovery method'),
      requiredAttempt: value.requiredAttempt,
      batchJobId,
      discoveryProvenance: value.discoveryProvenance ? structuredClone(value.discoveryProvenance) : null,
      order: index,
    };
  });
  return { resolverId, version, scope, required: result.required, completion, candidates };
}

async function runResolver(descriptor, caseRecord, timeoutMs, index) {
  const task = Promise.resolve().then(() => descriptor.resolve(structuredClone(caseRecord)));
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return normalizeResolverResult(await task, descriptor);
  }
  let timer;
  try {
    const result = await Promise.race([
      task,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(Symbol.for('resolver_timeout')), timeoutMs);
      }),
    ]);
    if (result === Symbol.for('resolver_timeout')) {
      return {
        resolverId: requiredText(descriptor.resolverId, `resolver ${index + 1} ID`),
        version: descriptor.version ? requiredText(descriptor.version, 'resolver version') : 'unknown',
        scope: descriptor.scope ? requiredText(descriptor.scope, 'resolver scope') : 'unknown',
        required: descriptor.required,
        completion: 'timed_out',
        candidates: [],
      };
    }
    return normalizeResolverResult(result, descriptor);
  } catch (error) {
    return {
      resolverId: requiredText(descriptor.resolverId, `resolver ${index + 1} ID`),
      version: descriptor.version ? requiredText(descriptor.version, 'resolver version') : 'unknown',
      scope: descriptor.scope ? requiredText(descriptor.scope, 'resolver scope') : 'unknown',
      required: descriptor.required,
      completion: 'failed',
      candidates: [],
      failure: String(error?.message ?? error),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function classifyAcquisitionFailure(error) {
  const message = String(error?.message ?? error);
  const code = String(error?.code ?? '').toLowerCase();
  const haystack = `${code} ${message}`.toLowerCase();
  if (/identity|exact model|sibling|family manual/.test(haystack)) {
    return { status: 'identity_rejected', failureCode: 'identity', reason: message };
  }
  if (/claim|field coverage|supported evidence/.test(haystack)) {
    return { status: 'claims_incomplete', failureCode: 'claim_semantics', reason: message };
  }
  if (/authority|official host/.test(haystack)) {
    return { status: 'source_authority_rejected', failureCode: 'source_authority', reason: message };
  }
  if (/mineru|conversion|parser/.test(haystack)) {
    return { status: 'mineru_failure', failureCode: 'mineru', reason: message };
  }
  if (/payload|magic byte|content type|maximum bytes/.test(haystack)) {
    return { status: 'payload_rejected', failureCode: 'payload', reason: message };
  }
  if (/receipt|attestation/.test(haystack)) {
    return { status: 'receipt_rejected', failureCode: 'receipt', reason: message };
  }
  return { status: 'transport_failure', failureCode: 'transport', reason: message };
}

function sourceSemanticView(source) {
  if (!source || typeof source !== 'object') return null;
  return {
    authority: source.authority ?? null,
    sourceType: source.sourceType ?? null,
    sourceUrl: source.sourceUrl ?? null,
    finalUrl: source.finalUrl ?? null,
    contentSha256: source.contentSha256 ?? null,
    supersedesContentSha256: [...(source.supersedesContentSha256 ?? [])].sort(),
    identity: source.identity ?? null,
    claims: source.claims ?? [],
    verificationReceipt: source.verificationReceipt ? {
      schemaVersion: source.verificationReceipt.schemaVersion ?? null,
      bindingSha256: source.verificationReceipt.bindingSha256 ?? null,
      policyVersion: source.verificationReceipt.policyVersion ?? null,
      claimSemanticsVersion: source.verificationReceipt.claimSemanticsVersion ?? null,
    } : null,
  };
}

function outcomeSemanticView(outcome) {
  if (!outcome) return null;
  return {
    status: outcome.status,
    failureCode: outcome.failureCode ?? null,
    source: sourceSemanticView(outcome.source),
  };
}

function inventorySemanticView(inventory) {
  return {
    schemaVersion: inventory.schemaVersion,
    targetId: inventory.targetId,
    identity: inventory.identity,
    completionStatus: inventory.completionStatus,
    incompleteResolvers: [...inventory.incompleteResolvers].sort(),
    missingBatchCandidateJobIds: [...inventory.missingBatchCandidateJobIds].sort(),
    resolvers: inventory.resolvers.map((resolver) => ({
      resolverId: resolver.resolverId,
      version: resolver.version,
      scope: resolver.scope,
      required: resolver.required,
      completion: resolver.completion,
      candidateCount: resolver.candidateCount,
    })).sort((left, right) => left.resolverId.localeCompare(right.resolverId)),
    activeReceiptSources: inventory.activeReceiptSources.map(sourceSemanticView)
      .sort((left, right) => String(left.contentSha256).localeCompare(String(right.contentSha256))),
    candidates: inventory.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      sourceUrl: candidate.sourceUrl,
      authorityMode: candidate.authorityMode,
      sourceRole: candidate.sourceRole,
      requiredAttempt: candidate.requiredAttempt,
      discoveryProvenance: candidate.discoveryProvenance ?? null,
      batchJobIds: [...candidate.batchJobIds].sort(),
      resolverRefs: candidate.resolverRefs.map((reference) => ({ ...reference }))
        .sort((left, right) => left.resolverId.localeCompare(right.resolverId)
          || left.order - right.order),
      outcome: outcomeSemanticView(candidate.outcome),
    })).sort((left, right) => left.candidateId.localeCompare(right.candidateId)),
  };
}

export function computeCandidateInventorySha256(inventory) {
  return canonicalJsonSha256(inventorySemanticView(inventory));
}

export async function collectEvidenceCandidates(caseRecord, options = {}) {
  if (!caseRecord || typeof caseRecord !== 'object') throw new TypeError('evidence target required');
  if (typeof options.acquireAndAttest !== 'function') throw new TypeError('candidate acquisition and attestation function required');
  if (!Array.isArray(options.resolvers)) throw new TypeError('candidate resolvers array required');
  const batchCandidateJobIds = [...new Set((options.batchCandidateJobIds ?? []).map((value) => requiredText(value, 'batch candidate job ID')))].sort();
  const activeReceiptSources = structuredClone(options.activeReceiptSources ?? []);
  if (!Array.isArray(activeReceiptSources)) throw new TypeError('active receipt sources must be an array');

  const descriptors = options.resolvers.map(resolverDescriptor);
  const resolved = await Promise.all(descriptors.map((descriptor, index) => runResolver(
    descriptor,
    caseRecord,
    options.resolverTimeoutMs ?? 30_000,
    index,
  )));
  const resolverResults = resolved.sort((left, right) => left.resolverId.localeCompare(right.resolverId));
  if (new Set(resolverResults.map((resolver) => resolver.resolverId)).size !== resolverResults.length) {
    throw new TypeError('duplicate resolver ID');
  }

  const candidatesByKey = new Map();
  for (const resolver of resolverResults) {
    for (const candidate of resolver.candidates) {
      const key = candidateKey(candidate);
      const current = candidatesByKey.get(key) ?? {
        candidateId: candidateId(candidate),
        sourceUrl: candidate.sourceUrl,
        authorityMode: candidate.authorityMode,
        sourceRoles: new Set(),
        requiredAttempt: false,
        discoveryProvenance: null,
        batchJobIds: new Set(),
        resolverRefs: [],
      };
      current.sourceRoles.add(candidate.sourceRole);
      current.requiredAttempt ||= candidate.requiredAttempt;
      if (candidate.discoveryProvenance) {
        if (current.discoveryProvenance
          && canonicalJsonSha256(current.discoveryProvenance) !== canonicalJsonSha256(candidate.discoveryProvenance)) {
          throw new TypeError('conflicting discovery provenance for duplicate candidate URL');
        }
        current.discoveryProvenance = structuredClone(candidate.discoveryProvenance);
      }
      if (candidate.batchJobId) current.batchJobIds.add(candidate.batchJobId);
      current.resolverRefs.push({
        resolverId: resolver.resolverId,
        version: resolver.version,
        scope: resolver.scope,
        discoveryMethod: candidate.discoveryMethod,
        sourceRole: candidate.sourceRole,
        order: candidate.order,
      });
      candidatesByKey.set(key, current);
    }
  }

  const candidates = [...candidatesByKey.values()].map((candidate) => ({
    candidateId: candidate.candidateId,
    sourceUrl: candidate.sourceUrl,
    authorityMode: candidate.authorityMode,
    sourceRole: [...candidate.sourceRoles].sort()[0],
    requiredAttempt: candidate.requiredAttempt,
    discoveryProvenance: candidate.discoveryProvenance,
    batchJobIds: [...candidate.batchJobIds].sort(),
    resolverRefs: candidate.resolverRefs.sort((left, right) => left.resolverId.localeCompare(right.resolverId)
      || left.order - right.order),
    outcome: null,
  })).sort((left, right) => left.candidateId.localeCompare(right.candidateId));

  for (const candidate of candidates) {
    if (candidate.authorityMode === 'reference') {
      candidate.outcome = { status: 'reference_only', failureCode: 'source_authority', source: null };
      continue;
    }
    if (!candidate.requiredAttempt) {
      candidate.outcome = { status: 'not_attempted_optional', failureCode: null, source: null };
      continue;
    }
    try {
      const acquired = await options.acquireAndAttest(structuredClone(candidate), structuredClone(caseRecord));
      if (!acquired?.source) throw Object.assign(new Error('candidate returned no supported evidence source'), { code: 'claim_semantics' });
      candidate.outcome = {
        status: acquired.unchanged ? 'unchanged' : 'accepted',
        failureCode: null,
        source: structuredClone(acquired.source),
      };
    } catch (error) {
      candidate.outcome = { ...classifyAcquisitionFailure(error), source: null };
    }
  }

  const representedBatchJobs = new Set(candidates.flatMap((candidate) => candidate.batchJobIds));
  const missingBatchCandidateJobIds = batchCandidateJobIds.filter((jobId) => !representedBatchJobs.has(jobId));
  const incompleteResolvers = resolverResults
    .filter((resolver) => resolver.required && resolver.completion !== 'complete')
    .map((resolver) => resolver.resolverId)
    .sort();
  const inventory = {
    schemaVersion: 1,
    targetId: requiredText(caseRecord.id ?? caseRecord.targetId, 'target ID'),
    identity: {
      brand: requiredText(caseRecord.brand, 'target brand'),
      model: requiredText(caseRecord.model, 'target model'),
      category: requiredText(caseRecord.category, 'target category'),
    },
    completionStatus: incompleteResolvers.length || missingBatchCandidateJobIds.length
      ? 'discovery_incomplete'
      : 'complete',
    incompleteResolvers,
    missingBatchCandidateJobIds,
    resolvers: resolverResults.map((resolver) => ({
      resolverId: resolver.resolverId,
      version: resolver.version,
      scope: resolver.scope,
      required: resolver.required,
      completion: resolver.completion,
      candidateCount: resolver.candidates.length,
      ...(resolver.failure ? { failure: resolver.failure } : {}),
    })),
    activeReceiptSources,
    candidates,
    candidateInventorySha256: null,
  };
  inventory.candidateInventorySha256 = computeCandidateInventorySha256(inventory);
  return inventory;
}
