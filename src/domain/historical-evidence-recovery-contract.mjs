import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const AUTHORITY_MODES = Object.freeze(['official', 'reference']);
const LIFECYCLE_STATES = Object.freeze([
  'CURRENT_RETAIL',
  'CATALOG_ARCHIVED',
  'REGISTRY_ONLY',
  'UNKNOWN_RETAIL',
]);
const CATEGORIES = Object.freeze(['fridge', 'dishwasher', 'dryer', 'washing_machine']);
const REQUESTED_FIELDS = Object.freeze([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
]);
const ROUTES = Object.freeze([
  'OFFICIAL_RECEIPT_REBUILD',
  'OFFICIAL_HOST_AUTHORITY_VALIDATION',
  'MIRROR_PARSE_AND_OFFICIAL_REDISCOVERY',
  'OFFICIAL_SOURCE_DISCOVERY_REQUIRED',
]);
const PRIORITIES = Object.freeze([
  'P0_CURRENT_MISSING_DIMENSIONS',
  'P1_HISTORICAL_MISSING_DIMENSIONS',
  'P2_CURRENT_CONFIRMATION',
  'P3_HISTORICAL_CONFIRMATION',
  'P4_CONFLICT_RESOLUTION',
]);
const OUTCOME_STATUSES = Object.freeze([
  'accepted',
  'receipt_accepted_non_scalar',
  'identity_rejected',
  'claims_incomplete',
  'conflict_quarantined',
  'retryable_failure',
  'terminal_failure',
]);
const FAILURE_CODES = Object.freeze([
  'environment',
  'queue_drift',
  'discovery',
  'discovery_incomplete',
  'transport',
  'payload',
  'mineru',
  'identity',
  'claim_semantics',
  'source_authority',
  'conflict',
  'receipt',
]);

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError(`${label} must be a plain object`);
  }
  return value;
}

function exactKeys(value, label, required, optional = []) {
  object(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label} unknown key: ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`${label} missing key: ${key}`);
  }
  return value;
}

function text(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function integer(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) throw new TypeError(`${label} must be an integer >= ${minimum}`);
  return value;
}

function sha256(value, label) {
  const normalized = text(value, label).toLowerCase();
  if (!SHA256.test(normalized)) throw new TypeError(`${label} must be a SHA-256 hash`);
  return normalized;
}

function timestamp(value, label) {
  const normalized = text(value, label);
  if (!RFC3339_UTC.test(normalized) || Number.isNaN(Date.parse(normalized))) {
    throw new TypeError(`${label} must be RFC 3339 UTC`);
  }
  return normalized;
}

function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw new TypeError(`${label} unsupported: ${value}`);
  return value;
}

function strings(value, label, { nonEmpty = false } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) throw new TypeError(`${label} must be an array`);
  const normalized = value.map((item, index) => text(item, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) throw new TypeError(`${label} contains duplicates`);
  return normalized;
}

function exactArray(value, expected, label) {
  const normalized = strings(value, label, { nonEmpty: true });
  if (normalized.length !== expected.length || normalized.some((item, index) => item !== expected[index])) {
    throw new TypeError(`${label} must equal ${expected.join(', ')}`);
  }
}

function brandKey(value) {
  return text(value, 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function dimensions(value, label) {
  exactKeys(value, label, ['width', 'height', 'depth']);
  for (const axis of ['width', 'height', 'depth']) integer(value[axis], `${label}.${axis}`, 1);
}

function canonicalJson(value, path = '$') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} is not a valid JSON value`);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => canonicalJson(entry, `${path}[${index}]`));
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError(`${path} is not a valid JSON value`);
  }
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) throw new TypeError(`${path}.${key} is not a valid JSON value`);
    result[key] = canonicalJson(value[key], `${path}.${key}`);
  }
  return result;
}

export function canonicalJsonSha256(value) {
  return createHash('sha256').update(JSON.stringify(canonicalJson(value))).digest('hex');
}

export function validateHistoricalEvidenceRecoveryPolicy(value) {
  exactKeys(value, 'recovery policy', [
    'schemaVersion', 'policyVersion', 'queueSchemaVersion',
    'supportedReceiptSchemaVersions', 'supportedClaimSemanticsVersions',
    'requestedFields', 'authorityModes', 'lifecycleStates', 'concurrency',
    'retry', 'limits', 'lock', 'parser', 'reconciliation',
  ]);
  if (value.schemaVersion !== 1) throw new TypeError('recovery policy schemaVersion 1 required');
  text(value.policyVersion, 'recovery policy version');
  if (value.queueSchemaVersion !== 2) throw new TypeError('recovery policy queueSchemaVersion 2 required');
  if (JSON.stringify(value.supportedReceiptSchemaVersions) !== JSON.stringify([2, 3])) {
    throw new TypeError('supported receipt schema versions must be 2 and 3');
  }
  if (JSON.stringify(value.supportedClaimSemanticsVersions) !== JSON.stringify([1, 2])) {
    throw new TypeError('supported claim semantics versions must be 1 and 2');
  }
  exactArray(value.requestedFields, REQUESTED_FIELDS, 'recovery policy requestedFields');
  exactArray(value.authorityModes, AUTHORITY_MODES, 'recovery policy authorityModes');
  const lifecycleStates = strings(value.lifecycleStates, 'recovery policy lifecycleStates', { nonEmpty: true });
  const legacyLifecycleStates = LIFECYCLE_STATES.slice(0, 2);
  if (JSON.stringify(lifecycleStates) !== JSON.stringify(LIFECYCLE_STATES)
    && JSON.stringify(lifecycleStates) !== JSON.stringify(legacyLifecycleStates)) {
    throw new TypeError('recovery policy lifecycleStates unsupported');
  }

  exactKeys(value.concurrency, 'recovery policy concurrency', ['network', 'perHost', 'mineru']);
  integer(value.concurrency.network, 'concurrency.network', 1);
  integer(value.concurrency.perHost, 'concurrency.perHost', 1);
  integer(value.concurrency.mineru, 'concurrency.mineru', 1);
  if (value.concurrency.perHost > value.concurrency.network) {
    throw new TypeError('concurrency.perHost cannot exceed network');
  }

  exactKeys(value.retry, 'recovery policy retry', ['fetchAttempts', 'mineruAttempts', 'baseDelayMs']);
  integer(value.retry.fetchAttempts, 'retry.fetchAttempts', 1);
  integer(value.retry.mineruAttempts, 'retry.mineruAttempts', 1);
  integer(value.retry.baseDelayMs, 'retry.baseDelayMs', 0);

  exactKeys(value.limits, 'recovery policy limits', [
    'timeoutMs', 'resolverTimeoutMs', 'maximumBytes', 'maximumRedirects',
  ]);
  integer(value.limits.timeoutMs, 'limits.timeoutMs', 1);
  integer(value.limits.resolverTimeoutMs, 'limits.resolverTimeoutMs', 1);
  if (value.limits.resolverTimeoutMs <= value.limits.timeoutMs) {
    throw new TypeError('limits.resolverTimeoutMs must exceed limits.timeoutMs');
  }
  integer(value.limits.maximumBytes, 'limits.maximumBytes', 1);
  integer(value.limits.maximumRedirects, 'limits.maximumRedirects', 0);

  exactKeys(value.lock, 'recovery policy lock', ['heartbeatMs', 'staleAfterMs']);
  integer(value.lock.heartbeatMs, 'lock.heartbeatMs', 1);
  integer(value.lock.staleAfterMs, 'lock.staleAfterMs', 1);
  if (value.lock.staleAfterMs < value.lock.heartbeatMs * 3) {
    throw new TypeError('lock.staleAfterMs must allow at least three heartbeats');
  }

  exactKeys(value.reconciliation, 'recovery policy reconciliation', [
    'registryAxisPermutationToleranceMm', 'officialSemanticResolutionVersion',
  ]);
  integer(
    value.reconciliation.registryAxisPermutationToleranceMm,
    'reconciliation.registryAxisPermutationToleranceMm',
    0,
  );
  if (value.reconciliation.officialSemanticResolutionVersion !== 1) {
    throw new TypeError('reconciliation.officialSemanticResolutionVersion 1 required');
  }

  exactKeys(value.parser, 'recovery policy parser', [
    'format', 'name', 'version', 'modelRevision', 'claimParserRevision', 'backend', 'method',
    'tableEnabled', 'formulaEnabled',
  ]);
  if (value.parser.format !== 'content_list_v2' || value.parser.name !== 'MinerU') {
    throw new TypeError('MinerU content_list_v2 parser required');
  }
  text(value.parser.version, 'parser.version');
  if (!/^[a-f0-9]{40}$/.test(value.parser.modelRevision)) throw new TypeError('parser.modelRevision invalid');
  if (!/^\d{4}-\d{2}-\d{2}\.\d+$/.test(value.parser.claimParserRevision)) {
    throw new TypeError('parser.claimParserRevision invalid');
  }
  if (value.parser.backend !== 'pipeline' || value.parser.method !== 'auto'
    || value.parser.tableEnabled !== true || value.parser.formulaEnabled !== false) {
    throw new TypeError('parser execution contract invalid');
  }
  return value;
}

function validateSelection(value) {
  exactKeys(value, 'batch selection', [
    'jobIds', 'routes', 'priorities', 'brands', 'targetIds', 'limit',
  ]);
  strings(value.jobIds, 'selection.jobIds');
  for (const route of strings(value.routes, 'selection.routes')) oneOf(route, ROUTES, 'selection route');
  for (const priority of strings(value.priorities, 'selection.priorities')) oneOf(priority, PRIORITIES, 'selection priority');
  strings(value.brands, 'selection.brands');
  strings(value.targetIds, 'selection.targetIds');
  if (value.limit !== null) integer(value.limit, 'selection.limit', 1);
}

function validateArtifactJob(value) {
  exactKeys(value, 'artifact job', [
    'jobId', 'sourceUrl', 'authorityBrand', 'authorityMode', 'acquisitionRoute',
    'priorityClass', 'targetIds',
  ]);
  text(value.jobId, 'artifact job ID');
  const sourceUrl = new URL(text(value.sourceUrl, 'artifact source URL'));
  if (sourceUrl.protocol !== 'https:' || sourceUrl.username || sourceUrl.password) {
    throw new TypeError('artifact source URL must be trusted HTTPS');
  }
  text(value.authorityBrand, 'artifact authority brand');
  oneOf(value.authorityMode, AUTHORITY_MODES, 'artifact authority mode');
  oneOf(value.acquisitionRoute, ROUTES, 'artifact acquisition route');
  oneOf(value.priorityClass, PRIORITIES, 'artifact priority');
  strings(value.targetIds, 'artifact targetIds', { nonEmpty: true });
}

function validateActiveReceiptSource(value) {
  object(value, 'active receipt source');
  const sourceUrl = new URL(text(value.sourceUrl, 'active receipt source URL'));
  if (sourceUrl.protocol !== 'https:' || sourceUrl.username || sourceUrl.password) {
    throw new TypeError('active receipt source URL must be trusted HTTPS');
  }
  sha256(value.contentSha256, 'active receipt content SHA');

  object(value.identity, 'active receipt source identity');
  text(value.identity.brand, 'active receipt source identity brand');
  text(value.identity.model, 'active receipt source identity model');
  text(value.identity.outcome, 'active receipt source identity outcome');
  if (value.identity.category !== undefined) {
    oneOf(value.identity.category, CATEGORIES, 'active receipt source identity category');
  }
  if (value.identity.sourceModel !== undefined) {
    text(value.identity.sourceModel, 'active receipt source identity sourceModel');
  }

  if (!Array.isArray(value.claims) || value.claims.length === 0) {
    throw new TypeError('active receipt source must contain replayable claims');
  }
  for (const [index, claim] of value.claims.entries()) {
    object(claim, `active receipt source claim[${index}]`);
    text(claim.field, `active receipt source claim[${index}].field`);
    if (!Object.hasOwn(claim, 'value')) {
      throw new TypeError(`active receipt source claim[${index}].value required`);
    }
  }

  object(value.verificationReceipt, 'active receipt verification receipt');
  integer(value.verificationReceipt.schemaVersion, 'active receipt schemaVersion', 1);
  sha256(value.verificationReceipt.bindingSha256, 'active receipt binding SHA');
  text(value.verificationReceipt.policyVersion, 'active receipt policyVersion');
  timestamp(value.verificationReceipt.verifiedAt, 'active receipt verifiedAt');
}

function validateReconciliationContext(value) {
  exactKeys(
    value,
    'reconciliation context',
    ['activeReceiptSources', 'registryHints', 'legacyHints'],
    ['priorAttemptSuppressions', 'evidenceEpoch'],
  );
  if (!Array.isArray(value.activeReceiptSources) || !Array.isArray(value.registryHints) || !Array.isArray(value.legacyHints)) {
    throw new TypeError('reconciliation context arrays required');
  }
  for (const source of value.activeReceiptSources) {
    validateActiveReceiptSource(source);
  }
  for (const prior of value.priorAttemptSuppressions ?? []) {
    exactKeys(prior, 'prior attempt suppression', [
      'attemptId', 'sourceUrl', 'contentSha256', 'status', 'failureCode', 'policySha256',
    ]);
    text(prior.attemptId, 'prior attempt ID');
    const url = new URL(text(prior.sourceUrl, 'prior attempt source URL'));
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new TypeError('prior attempt source URL must be trusted HTTPS');
    }
    if (prior.contentSha256 !== null) sha256(prior.contentSha256, 'prior attempt content SHA');
    text(prior.status, 'prior attempt status');
    text(prior.failureCode, 'prior attempt failure code');
    sha256(prior.policySha256, 'prior attempt policy SHA');
  }
  if (value.evidenceEpoch !== undefined) {
    exactKeys(value.evidenceEpoch, 'evidence epoch binding', [
      'epochId', 'descriptorSha256',
    ]);
    const descriptorSha256 = sha256(
      value.evidenceEpoch.descriptorSha256,
      'evidence epoch descriptor SHA',
    );
    const epochId = text(value.evidenceEpoch.epochId, 'evidence epoch ID');
    if (epochId !== `evidence_epoch_${descriptorSha256.slice(0, 24)}`) {
      throw new TypeError('evidence epoch ID must match its descriptor SHA-256');
    }
  }
  for (const hint of value.registryHints) {
    exactKeys(hint, 'registry hint', ['sourceId', 'snapshotSha256', 'dimensionsMm']);
    text(hint.sourceId, 'registry hint sourceId');
    sha256(hint.snapshotSha256, 'registry hint snapshot SHA');
    dimensions(hint.dimensionsMm, 'registry hint dimensionsMm');
  }
  for (const hint of value.legacyHints) {
    exactKeys(hint, 'legacy hint', ['sourceDocumentId', 'dimensionsMm']);
    text(hint.sourceDocumentId, 'legacy hint sourceDocumentId');
    dimensions(hint.dimensionsMm, 'legacy hint dimensionsMm');
  }
}

function validateTarget(value) {
  exactKeys(value, 'recovery target', [
    'targetId', 'referenceId', 'legacyRuntimeId', 'canonicalProductId', 'brand',
    'model', 'category', 'lifecycleState', 'requestedFields', 'primaryJobId',
    'candidateJobIds', 'publicationEligible', 'reconciliationContext',
  ], ['repairExistingReceipt']);
  text(value.targetId, 'targetId');
  text(value.referenceId, 'referenceId');
  text(value.legacyRuntimeId, 'legacyRuntimeId');
  if (value.canonicalProductId !== null) text(value.canonicalProductId, 'canonicalProductId');
  text(value.brand, 'target brand');
  text(value.model, 'target model');
  oneOf(value.category, CATEGORIES, 'target category');
  oneOf(value.lifecycleState, LIFECYCLE_STATES, 'target lifecycle');
  exactArray(value.requestedFields, REQUESTED_FIELDS, 'target requestedFields');
  const candidates = strings(value.candidateJobIds, 'target candidateJobIds');
  if (candidates.length === 0) {
    if (value.primaryJobId !== null) throw new TypeError('resolver-only target primaryJobId must be null');
  } else if (value.primaryJobId !== candidates[0]) {
    throw new TypeError('target primaryJobId must be first candidate job');
  }
  if (value.publicationEligible !== false) throw new TypeError('new recovery target publicationEligible must be false');
  if (value.repairExistingReceipt != null && value.repairExistingReceipt !== true) {
    throw new TypeError('repairExistingReceipt may only be present as true');
  }
  validateReconciliationContext(value.reconciliationContext);
}

export function validateHistoricalEvidenceRecoveryBatch(value) {
  exactKeys(value, 'recovery batch', [
    'schemaVersion', 'batchId', 'generatedAt', 'queue', 'policy', 'selection',
    'artifactJobs', 'targets', 'summary',
  ]);
  if (value.schemaVersion !== 1) throw new TypeError('recovery batch schemaVersion 1 required');
  text(value.batchId, 'batchId');
  timestamp(value.generatedAt, 'batch generatedAt');
  exactKeys(value.queue, 'batch queue binding', ['schemaVersion', 'sha256']);
  if (value.queue.schemaVersion !== 2) throw new TypeError('batch queue schemaVersion 2 required');
  sha256(value.queue.sha256, 'batch queue SHA');
  exactKeys(value.policy, 'batch policy binding', ['version', 'sha256']);
  text(value.policy.version, 'batch policy version');
  sha256(value.policy.sha256, 'batch policy SHA');
  validateSelection(value.selection);
  if (!Array.isArray(value.artifactJobs) || !Array.isArray(value.targets)) {
    throw new TypeError('batch artifactJobs and targets required');
  }
  const jobs = new Map();
  for (const job of value.artifactJobs) {
    validateArtifactJob(job);
    if (jobs.has(job.jobId)) throw new TypeError(`duplicate artifact job ${job.jobId}`);
    jobs.set(job.jobId, job);
  }
  const targets = new Map();
  for (const target of value.targets) {
    validateTarget(target);
    if (targets.has(target.targetId)) throw new TypeError(`duplicate target ${target.targetId}`);
    targets.set(target.targetId, target);
  }
  for (const target of targets.values()) {
    for (const jobId of target.candidateJobIds) {
      const job = jobs.get(jobId);
      if (!job) throw new TypeError(`target candidate job missing: ${jobId}`);
      if (!job.targetIds.includes(target.targetId)) throw new TypeError(`candidate job edge missing target ${target.targetId}`);
      if (brandKey(job.authorityBrand) !== brandKey(target.brand)) {
        throw new TypeError(`candidate job authority brand mismatch for ${target.targetId}`);
      }
    }
  }
  for (const job of jobs.values()) {
    for (const targetId of job.targetIds) {
      const target = targets.get(targetId);
      if (!target) throw new TypeError(`artifact target missing: ${targetId}`);
      if (!target.candidateJobIds.includes(job.jobId)) throw new TypeError(`target candidate edge missing job ${job.jobId}`);
    }
  }
  exactKeys(
    value.summary,
    'batch summary',
    ['artifactJobs', 'targets', 'candidateEdges'],
    ['excludedPriorAcceptedTargets', 'excludedPriorCandidateJobs'],
  );
  integer(value.summary.artifactJobs, 'summary.artifactJobs', 0);
  integer(value.summary.targets, 'summary.targets', 0);
  integer(value.summary.candidateEdges, 'summary.candidateEdges', 0);
  const hasExcludedTargets = Object.hasOwn(value.summary, 'excludedPriorAcceptedTargets');
  const hasExcludedJobs = Object.hasOwn(value.summary, 'excludedPriorCandidateJobs');
  if (hasExcludedTargets !== hasExcludedJobs) {
    throw new TypeError('batch summary prior-acceptance accounting fields must appear together');
  }
  if (hasExcludedTargets) {
    integer(value.summary.excludedPriorAcceptedTargets, 'summary.excludedPriorAcceptedTargets', 0);
    integer(value.summary.excludedPriorCandidateJobs, 'summary.excludedPriorCandidateJobs', 0);
  }
  const edgeCount = value.artifactJobs.reduce((count, job) => count + job.targetIds.length, 0);
  if (value.summary.artifactJobs !== jobs.size || value.summary.targets !== targets.size
    || value.summary.candidateEdges !== edgeCount) {
    throw new TypeError('batch summary does not match graph');
  }
  return value;
}

function validateOutcome(value) {
  exactKeys(value, 'recovery outcome', [
    'targetId', 'status', 'failureCode', 'candidateInventorySha256', 'candidateInventory', 'sources',
    'geometryProjection', 'reconciliation', 'semanticOutcomeSha256',
  ]);
  text(value.targetId, 'outcome targetId');
  oneOf(value.status, OUTCOME_STATUSES, 'outcome status');
  sha256(value.candidateInventorySha256, 'candidate inventory SHA');
  if (value.candidateInventory !== null) object(value.candidateInventory, 'candidate inventory');
  sha256(value.semanticOutcomeSha256, 'outcome semantic SHA');
  if (!Array.isArray(value.sources)) throw new TypeError('outcome sources must be an array');
  for (const source of value.sources) object(source, 'outcome source');
  if (value.geometryProjection !== null) object(value.geometryProjection, 'outcome geometryProjection');
  if (value.reconciliation !== null) validateReconciliationDecision(value.reconciliation);
  if (['accepted', 'receipt_accepted_non_scalar'].includes(value.status)) {
    if (value.failureCode !== null) throw new TypeError('accepted outcome failureCode must be null');
    if (value.candidateInventory === null) throw new TypeError('accepted outcome candidate inventory required');
    if (value.sources.length === 0) throw new TypeError('accepted outcome source required');
    if (value.status === 'accepted' && value.geometryProjection === null) {
      throw new TypeError('accepted outcome geometry projection required');
    }
    if (value.reconciliation === null) throw new TypeError('accepted outcome reconciliation required');
  } else {
    oneOf(value.failureCode, FAILURE_CODES, 'outcome failure code');
  }
}

function validateReconciliationDecision(value) {
  exactKeys(value, 'reconciliation decision', [
    'conflictingFields', 'conflictHints', 'missingFields', 'supersessionViolations',
    'axisPermutationResolution', 'lowerAuthorityResolution', 'conflictReason',
  ], ['officialSemanticResolution']);
  const conflictingFields = strings(value.conflictingFields, 'reconciliation conflictingFields');
  const missingFields = strings(value.missingFields, 'reconciliation missingFields');
  for (const field of [...conflictingFields, ...missingFields]) {
    oneOf(field, REQUESTED_FIELDS, 'reconciliation field');
  }
  if (!Array.isArray(value.conflictHints)) throw new TypeError('reconciliation conflictHints must be an array');
  for (const hint of value.conflictHints) {
    const toleratedPermutation = hint.kind === 'axis_permutation_within_tolerance';
    exactKeys(hint, 'reconciliation conflict hint', [
      'sourceRole', 'sourceId', 'kind', 'fields', 'dimensionsMm',
      ...(toleratedPermutation ? ['maximumDeltaMm'] : []),
    ]);
    text(hint.sourceRole, 'reconciliation conflict hint sourceRole');
    text(hint.sourceId, 'reconciliation conflict hint sourceId');
    oneOf(hint.kind, [
      'axis_permutation', 'axis_permutation_within_tolerance', 'lower_authority_disagreement',
    ], 'reconciliation conflict hint kind');
    const fields = strings(hint.fields, 'reconciliation conflict hint fields', { nonEmpty: true });
    for (const field of fields) oneOf(field, ['widthMm', 'heightMm', 'depthMm'], 'reconciliation conflict hint field');
    exactKeys(hint.dimensionsMm, 'reconciliation conflict hint dimensions', ['widthMm', 'heightMm', 'depthMm']);
    for (const axis of ['widthMm', 'heightMm', 'depthMm']) {
      integer(hint.dimensionsMm[axis], `reconciliation conflict hint dimensions.${axis}`, 1);
    }
    if (toleratedPermutation) {
      integer(hint.maximumDeltaMm, 'reconciliation conflict hint maximumDeltaMm', 1);
    }
  }
  if (!Array.isArray(value.supersessionViolations)) {
    throw new TypeError('reconciliation supersessionViolations must be an array');
  }
  for (const violation of value.supersessionViolations) {
    exactKeys(violation, 'reconciliation supersession violation', ['reason'], ['sourceHash', 'priorHash']);
    oneOf(violation.reason, ['cross_resource_supersession', 'supersession_cycle'], 'supersession violation reason');
    if (violation.reason === 'cross_resource_supersession') {
      sha256(violation.sourceHash, 'supersession source hash');
      sha256(violation.priorHash, 'supersession prior hash');
    }
  }
  if (value.axisPermutationResolution !== null) {
    oneOf(value.axisPermutationResolution, [
      'independent_official_axis_corroboration',
      'exact_official_axis_proof',
      'independent_official_axis_corroboration_with_registry_tolerance',
      'exact_official_axis_proof_with_registry_tolerance',
    ], 'axis permutation resolution');
    if (!value.conflictHints.some((hint) => (
      ['axis_permutation', 'axis_permutation_within_tolerance'].includes(hint.kind)
    ))) {
      throw new TypeError('axis permutation resolution requires an axis conflict hint');
    }
  }
  if (value.lowerAuthorityResolution !== null) {
    oneOf(value.lowerAuthorityResolution, [
      'independent_official_dimension_corroboration',
      'official_market_api_dimension_corroboration',
      'exact_official_axis_proof_over_legacy_hint',
      'exact_official_scoped_depth_over_registry_hint',
    ], 'lower authority resolution');
    if (!value.conflictHints.some((hint) => hint.kind === 'lower_authority_disagreement')) {
      throw new TypeError('lower authority resolution requires a disagreement hint');
    }
  }
  if (value.officialSemanticResolution !== undefined) {
    oneOf(value.officialSemanticResolution, [
      'explicit_appliance_depth_with_exact_product_page_corroboration',
    ], 'official semantic resolution');
    if (conflictingFields.length) {
      throw new TypeError('official semantic resolution cannot retain conflicting fields');
    }
  }
  if (value.conflictReason !== null) text(value.conflictReason, 'reconciliation conflictReason');
}

export function validateHistoricalEvidenceRecoveryResults(value) {
  exactKeys(value, 'recovery results', [
    'schemaVersion', 'runId', 'batchId', 'batchSha256', 'queueSha256', 'policySha256',
    'startedAt', 'completedAt', 'semanticOutcomeSha256', 'outcomes', 'summary',
  ]);
  if (value.schemaVersion !== 1) throw new TypeError('recovery results schemaVersion 1 required');
  text(value.runId, 'results runId');
  text(value.batchId, 'results batchId');
  sha256(value.batchSha256, 'results batch SHA');
  sha256(value.queueSha256, 'results queue SHA');
  sha256(value.policySha256, 'results policy SHA');
  const startedAt = timestamp(value.startedAt, 'results startedAt');
  const completedAt = timestamp(value.completedAt, 'results completedAt');
  if (Date.parse(completedAt) < Date.parse(startedAt)) throw new TypeError('results completedAt precedes startedAt');
  sha256(value.semanticOutcomeSha256, 'results semantic outcome SHA');
  if (!Array.isArray(value.outcomes)) throw new TypeError('results outcomes required');
  const targetIds = new Set();
  for (const outcome of value.outcomes) {
    validateOutcome(outcome);
    if (targetIds.has(outcome.targetId)) throw new TypeError(`duplicate outcome target ${outcome.targetId}`);
    targetIds.add(outcome.targetId);
  }
  exactKeys(value.summary, 'results summary', ['targets', 'accepted', 'nonScalar', 'retryable', 'terminal']);
  const expected = {
    targets: value.outcomes.length,
    accepted: value.outcomes.filter((row) => row.status === 'accepted').length,
    nonScalar: value.outcomes.filter((row) => row.status === 'receipt_accepted_non_scalar').length,
    retryable: value.outcomes.filter((row) => row.status === 'retryable_failure').length,
    terminal: value.outcomes.filter((row) => !['accepted', 'receipt_accepted_non_scalar', 'retryable_failure'].includes(row.status)).length,
  };
  for (const [key, count] of Object.entries(expected)) {
    if (value.summary[key] !== count) throw new TypeError(`results summary ${key} mismatch`);
  }
  return value;
}

export function validateHistoricalEvidenceRecoveryAudit(value) {
  exactKeys(value, 'recovery audit', [
    'schemaVersion', 'auditId', 'generatedAt', 'mode', 'status', 'batchId',
    'batchSha256', 'queueSha256', 'policySha256', 'resultsSha256', 'priorBundleSha256',
    'checkedTargets', 'checkedObjects', 'violations', 'semanticAuditSha256',
  ], ['priorObjectsReplayed', 'repairs']);
  if (value.schemaVersion !== 1) throw new TypeError('recovery audit schemaVersion 1 required');
  text(value.auditId, 'auditId');
  timestamp(value.generatedAt, 'audit generatedAt');
  oneOf(value.mode, ['online', 'offline'], 'audit mode');
  oneOf(value.status, ['passed', 'failed'], 'audit status');
  text(value.batchId, 'audit batchId');
  sha256(value.batchSha256, 'audit batch SHA');
  sha256(value.queueSha256, 'audit queue SHA');
  sha256(value.policySha256, 'audit policy SHA');
  sha256(value.resultsSha256, 'audit results SHA');
  if (value.priorBundleSha256 !== null) sha256(value.priorBundleSha256, 'audit prior bundle SHA');
  integer(value.checkedTargets, 'audit checkedTargets', 0);
  integer(value.checkedObjects, 'audit checkedObjects', 0);
  if (value.priorObjectsReplayed != null && typeof value.priorObjectsReplayed !== 'boolean') {
    throw new TypeError('audit priorObjectsReplayed must be boolean');
  }
  if (value.repairs != null) {
    if (!Array.isArray(value.repairs)) throw new TypeError('audit repairs must be an array');
    const repairedTargets = new Set();
    for (const repair of value.repairs) {
      exactKeys(repair, 'audit repair', [
        'targetId', 'reason', 'priorEntrySha256', 'replacementOutcomeSha256',
      ]);
      const targetId = text(repair.targetId, 'audit repair targetId');
      if (repairedTargets.has(targetId)) throw new TypeError(`duplicate audit repair target ${targetId}`);
      repairedTargets.add(targetId);
      oneOf(repair.reason, [
        'receipt_rederived_from_identical_raw_artifact_with_verified_corroboration',
      ], 'audit repair reason');
      sha256(repair.priorEntrySha256, 'audit repair prior entry SHA');
      sha256(repair.replacementOutcomeSha256, 'audit repair replacement outcome SHA');
    }
  }
  const violations = strings(value.violations, 'audit violations');
  if (value.status === 'passed' && violations.length > 0) throw new TypeError('passed audit cannot contain a violation');
  if (value.status === 'failed' && violations.length === 0) throw new TypeError('failed audit requires a violation');
  sha256(value.semanticAuditSha256, 'audit semantic SHA');
  return value;
}

function validateBundleEntry(value) {
  exactKeys(value, 'acceptance bundle entry', [
    'targetId', 'referenceId', 'legacyRuntimeId', 'canonicalProductId', 'brand',
    'model', 'category', 'lifecycleState', 'acceptanceStatus', 'sourceBatchId',
    'auditSha256', 'sources', 'geometryProjection',
  ], ['reconciliation']);
  text(value.targetId, 'bundle targetId');
  text(value.referenceId, 'bundle referenceId');
  text(value.legacyRuntimeId, 'bundle legacyRuntimeId');
  if (value.canonicalProductId !== null) text(value.canonicalProductId, 'bundle canonicalProductId');
  text(value.brand, 'bundle brand');
  text(value.model, 'bundle model');
  oneOf(value.category, CATEGORIES, 'bundle category');
  oneOf(value.lifecycleState, LIFECYCLE_STATES, 'bundle lifecycle');
  oneOf(value.acceptanceStatus, ['accepted', 'receipt_accepted_non_scalar'], 'bundle acceptance status');
  if (value.lifecycleState === 'CURRENT_RETAIL' && value.canonicalProductId === null) {
    throw new TypeError('current bundle entry canonicalProductId required');
  }
  text(value.sourceBatchId, 'bundle sourceBatchId');
  sha256(value.auditSha256, 'bundle audit SHA');
  if (!Array.isArray(value.sources) || value.sources.length === 0) {
    throw new TypeError('bundle sources required');
  }
  const sourceHashes = new Set();
  for (const source of value.sources) {
    object(source, 'bundle source');
    sha256(source.contentSha256, 'bundle source content SHA');
    if (sourceHashes.has(source.contentSha256)) throw new TypeError('duplicate bundle source content SHA');
    sourceHashes.add(source.contentSha256);
  }
  if (value.geometryProjection !== null) object(value.geometryProjection, 'bundle geometryProjection');
  if (Object.hasOwn(value, 'reconciliation')) {
    validateReconciliationDecision(value.reconciliation);
    if (value.reconciliation.conflictingFields.length
      || value.reconciliation.supersessionViolations.length
      || value.reconciliation.conflictReason !== null) {
      throw new TypeError('accepted bundle entry cannot retain unresolved conflict or supersession state');
    }
  }
  if (value.acceptanceStatus === 'accepted' && value.geometryProjection === null) {
    throw new TypeError('accepted bundle geometry projection required');
  }
}

export function validateHistoricalEvidenceRecoveryAcceptanceBundle(value) {
  exactKeys(value, 'recovery acceptance bundle', [
    'schemaVersion', 'bundleId', 'generatedAt', 'policySha256', 'entries', 'lineage',
  ]);
  if (value.schemaVersion !== 1) throw new TypeError('recovery acceptance bundle schemaVersion 1 required');
  text(value.bundleId, 'bundleId');
  timestamp(value.generatedAt, 'bundle generatedAt');
  sha256(value.policySha256, 'bundle policy SHA');
  if (!Array.isArray(value.entries) || !Array.isArray(value.lineage)) {
    throw new TypeError('bundle entries and lineage required');
  }
  const entries = new Set();
  for (const entry of value.entries) {
    validateBundleEntry(entry);
    if (entries.has(entry.targetId)) throw new TypeError(`duplicate bundle target ${entry.targetId}`);
    entries.add(entry.targetId);
  }
  const lineage = new Map();
  for (const row of value.lineage) {
    exactKeys(row, 'bundle lineage', ['batchId', 'batchSha256', 'queueSha256', 'resultsSha256', 'auditSha256']);
    text(row.batchId, 'lineage batchId');
    sha256(row.batchSha256, 'lineage batch SHA');
    sha256(row.queueSha256, 'lineage queue SHA');
    sha256(row.resultsSha256, 'lineage results SHA');
    sha256(row.auditSha256, 'lineage audit SHA');
    if (lineage.has(row.batchId)) throw new TypeError(`duplicate bundle lineage ${row.batchId}`);
    lineage.set(row.batchId, row);
  }
  for (const entry of value.entries) {
    const row = lineage.get(entry.sourceBatchId);
    if (!row) throw new TypeError(`bundle entry lineage missing: ${entry.sourceBatchId}`);
    if (row.auditSha256 !== entry.auditSha256) throw new TypeError(`bundle entry audit binding mismatch: ${entry.targetId}`);
  }
  return value;
}

export function rollbackHistoricalEvidenceRecoveryBundleBatch(bundle, options = {}) {
  validateHistoricalEvidenceRecoveryAcceptanceBundle(bundle);
  const expectedSha256 = sha256(options.expectedBundleSha256, 'expected bundle SHA');
  if (canonicalJsonSha256(bundle) !== expectedSha256) throw new Error('recovery bundle changed before rollback');
  const batchId = text(options.batchId, 'rollback batch ID');
  const lineageMatches = bundle.lineage.filter((row) => row.batchId === batchId);
  if (lineageMatches.length !== 1) throw new Error(`rollback lineage must exist exactly once: ${batchId}`);
  const removedEntries = bundle.entries.filter((entry) => entry.sourceBatchId === batchId);
  const next = {
    ...structuredClone(bundle),
    entries: bundle.entries.filter((entry) => entry.sourceBatchId !== batchId),
    lineage: bundle.lineage.filter((row) => row.batchId !== batchId),
  };
  validateHistoricalEvidenceRecoveryAcceptanceBundle(next);
  return Object.freeze({
    bundle: next,
    removedBatchId: batchId,
    removedEntries: removedEntries.length,
    previousBundleSha256: expectedSha256,
    nextBundleSha256: canonicalJsonSha256(next),
  });
}
