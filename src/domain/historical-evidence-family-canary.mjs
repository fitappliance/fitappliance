import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';

export const HISTORICAL_EVIDENCE_FAMILY_CANARY_SCHEMA_VERSION = 2;

const FAMILY_STATES = new Set([
  'UNTESTED',
  'CANARY_READY',
  'PASSED',
  'FAILED_SOURCE',
  'FAILED_IDENTITY',
  'FAILED_PARSER',
  'REOPENED',
]);

const FAILURE_STATE_BY_CODE = new Map([
  ['transport', 'FAILED_SOURCE'],
  ['http', 'FAILED_SOURCE'],
  ['source', 'FAILED_SOURCE'],
  ['content_type', 'FAILED_SOURCE'],
  ['content_validation', 'FAILED_SOURCE'],
  ['identity', 'FAILED_IDENTITY'],
  ['claim_semantics', 'FAILED_PARSER'],
  ['mineru', 'FAILED_PARSER'],
  ['parser', 'FAILED_PARSER'],
]);

const PRIORITY_RANK = new Map([
  ['P0_CURRENT_MISSING_DIMENSIONS', 0],
  ['P0_CURRENT_RECEIPT_REPAIR', 1],
  ['P1_HISTORICAL_MISSING_DIMENSIONS', 2],
  ['P2_HISTORICAL_PDF_REPLAY', 3],
  ['P3_IDENTITY_RESEARCH', 4],
  ['P4_CONFLICT_RESEARCH', 5],
]);

function requiredObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} required`);
  }
  return value;
}

function requiredArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} required`);
  return value;
}

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} required`);
  return value.trim();
}

function requiredSha256(value, label) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new TypeError(`${label} invalid`);
  return normalized;
}

function timestamp(value, label) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new TypeError(`${label} invalid`);
  return parsed.toISOString();
}

function uniqueMap(rows, key, label) {
  const result = new Map();
  for (const row of requiredArray(rows, label)) {
    const id = requiredText(row?.[key], `${label} ${key}`);
    if (result.has(id)) throw new Error(`${label} duplicate ${key}: ${id}`);
    result.set(id, row);
  }
  return result;
}

function normalizedUrl(value) {
  const url = new URL(requiredText(value, 'source URL'));
  url.hash = '';
  return url.href;
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function validateProcessorEpochs(value) {
  requiredObject(value, 'processor epochs');
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([capability, sha256]) => [
      requiredText(capability, 'processor capability'),
      requiredSha256(sha256, `processor epoch ${capability}`),
    ]));
}

function allActionableTargets(queue) {
  const targets = [
    ...requiredArray(queue.targets, 'executable queue targets'),
    ...requiredArray(queue.discoveryTargets, 'executable queue discovery targets'),
  ];
  return [...uniqueMap(targets, 'targetId', 'actionable targets').values()];
}

function familyIdsByReference(graph) {
  const result = new Map();
  for (const family of requiredArray(graph.families, 'document graph families')) {
    const familyId = requiredText(family.familyId, 'family ID');
    for (const referenceId of requiredArray(family.referenceIds, `family ${familyId} references`)) {
      const id = requiredText(referenceId, `family ${familyId} reference ID`);
      if (!result.has(id)) result.set(id, new Set());
      result.get(id).add(familyId);
    }
  }
  return new Map([...result].map(([referenceId, familyIds]) => [
    referenceId,
    [...familyIds].sort((left, right) => left.localeCompare(right)),
  ]));
}

function candidateUrlsForTarget(target, jobsById) {
  const urls = [];
  for (const jobId of target.candidateJobIds ?? []) {
    const job = jobsById.get(jobId);
    if (!job) throw new Error(`target candidate job missing: ${target.targetId}:${jobId}`);
    urls.push(normalizedUrl(job.sourceUrl));
  }
  for (const edge of target.candidateEdges ?? []) {
    if (edge.sourceUrl) urls.push(normalizedUrl(edge.sourceUrl));
  }
  return sortedUnique(urls);
}

function resolverContractForTarget(target) {
  return (target.resolverContract ?? []).map((resolver) => ({
    resolverId: requiredText(resolver.resolverId, 'resolver ID'),
    version: requiredText(resolver.version, 'resolver version'),
    scope: requiredText(resolver.scope, 'resolver scope'),
    required: resolver.required === true,
  })).sort((left, right) => left.resolverId.localeCompare(right.resolverId)
    || left.version.localeCompare(right.version)
    || left.scope.localeCompare(right.scope));
}

function representativeRank(target) {
  return [
    target.executionLane === 'ACQUISITION' ? 0 : 1,
    PRIORITY_RANK.get(target.priorityClass) ?? 99,
    target.targetId,
  ];
}

function compareRepresentatives(left, right) {
  const leftRank = representativeRank(left);
  const rightRank = representativeRank(right);
  return leftRank[0] - rightRank[0]
    || leftRank[1] - rightRank[1]
    || leftRank[2].localeCompare(rightRank[2]);
}

function graphSourceUrlsForFamily(family, documentsById, sourceVersionsById) {
  const urls = [];
  for (const documentId of family.documentIds ?? []) {
    const document = documentsById.get(documentId);
    if (!document) throw new Error(`family document missing: ${family.familyId}:${documentId}`);
    for (const sourceVersionId of document.sourceVersionIds ?? []) {
      const sourceVersion = sourceVersionsById.get(sourceVersionId);
      if (!sourceVersion) {
        throw new Error(`document source version missing: ${documentId}:${sourceVersionId}`);
      }
      urls.push(normalizedUrl(sourceVersion.sourceUrl));
    }
  }
  return sortedUnique(urls);
}

function exactReferencesForFamily(family, documentsById) {
  const references = [];
  for (const documentId of family.documentIds ?? []) {
    const document = documentsById.get(documentId);
    for (const edge of document?.modelEdges ?? []) {
      if (edge.proofLevel === 'EXACT_MODEL_PROVEN') references.push(edge.referenceId);
    }
  }
  return new Set(references);
}

function buildFamilyContract({
  family,
  familyTargets,
  documentsById,
  sourceVersionsById,
  jobsById,
  policySha256,
  parserContractSha256,
  processorEpochs,
}) {
  const graphSourceUrls = graphSourceUrlsForFamily(family, documentsById, sourceVersionsById);
  const candidateSourceUrls = sortedUnique(familyTargets.flatMap(
    (target) => candidateUrlsForTarget(target, jobsById),
  ));
  const resolverContracts = familyTargets
    .map((target) => ({
      targetId: target.targetId,
      resolvers: resolverContractForTarget(target),
    }))
    .filter((entry) => entry.resolvers.length > 0)
    .sort((left, right) => left.targetId.localeCompare(right.targetId));
  const value = {
    schemaVersion: 1,
    family: {
      familyId: family.familyId,
      category: family.category,
      brand: family.brand,
      groupType: family.groupType,
      documentIds: sortedUnique(family.documentIds ?? []),
      pdfSha256s: sortedUnique(family.pdfSha256s ?? []),
      grammarProfileIds: sortedUnique(family.grammarProfileIds ?? []),
    },
    graphSourceUrls,
    candidateSourceUrls,
    resolverContracts,
    policySha256,
    parserContractSha256,
    processorEpochs,
  };
  return { ...value, sha256: canonicalJsonSha256(value) };
}

function initialState({
  familyTargets,
  representativeTargetId,
  exactReferences,
  graphSourceUrls,
  candidateUrlsByTarget,
}) {
  const graphSources = new Set(graphSourceUrls);
  const provenRepresentativeTargetIds = familyTargets
    .filter((target) => exactReferences.has(target.referenceId)
      && candidateUrlsByTarget.get(target.targetId).some((url) => graphSources.has(url)))
    .map((target) => target.targetId)
    .sort((left, right) => left.localeCompare(right));
  if (!representativeTargetId) {
    return {
      state: 'UNTESTED',
      stateReason: 'NO_SINGLE_FAMILY_ACTIONABLE_TARGET',
      provenRepresentativeTargetIds,
    };
  }
  if (provenRepresentativeTargetIds.includes(representativeTargetId)) {
    return {
      state: 'PASSED',
      stateReason: 'CURRENT_SOURCE_EXACT_MODEL_PROOF',
      provenRepresentativeTargetIds,
    };
  }
  return {
    state: 'CANARY_READY',
    stateReason: 'REPRESENTATIVE_EXECUTION_REQUIRED',
    provenRepresentativeTargetIds,
  };
}

function eventTime(value, label) {
  return new Date(timestamp(value, label)).valueOf();
}

function postSnapshotEvents({
  ledger,
  targetIds,
  referenceIds,
  snapshotAt,
  policySha256,
  processorEpochs,
}) {
  const after = eventTime(snapshotAt, 'previous canary generatedAt');
  const matchesTarget = (entry) => targetIds.has(entry.targetId) || referenceIds.has(entry.referenceId);
  const acceptances = (ledger.sourceAcceptances ?? [])
    .filter((entry) => matchesTarget(entry)
      && ['accepted', 'unchanged'].includes(entry.status)
      && entry.policySha256 === policySha256
      && eventTime(entry.acceptedAt, `source acceptance ${entry.sourceAcceptanceId} acceptedAt`) > after)
    .map((entry) => ({
      at: timestamp(entry.acceptedAt, `source acceptance ${entry.sourceAcceptanceId} acceptedAt`),
      id: requiredText(entry.sourceAcceptanceId, 'source acceptance ID'),
      state: 'PASSED',
      stateReason: 'POST_CANARY_SOURCE_ACCEPTANCE',
      evidence: {
        sourceAcceptanceId: entry.sourceAcceptanceId,
        targetId: entry.targetId,
        referenceId: entry.referenceId,
        sourceUrl: entry.sourceUrl,
      },
    }));
  const failures = (ledger.entries ?? []).flatMap((entry) => {
    if (!matchesTarget(entry) || entry.policySha256 !== policySha256) return [];
    const state = FAILURE_STATE_BY_CODE.get(entry.failureCode);
    if (!state || eventTime(entry.attemptedAt, `attempt ${entry.attemptId} attemptedAt`) <= after) return [];
    if (entry.processorCapability
      && processorEpochs[entry.processorCapability] !== entry.evidenceProcessorSha256) return [];
    if (state === 'FAILED_PARSER') {
      if (!entry.processorCapability
        || processorEpochs[entry.processorCapability] !== entry.evidenceProcessorSha256) return [];
    }
    return [{
      at: timestamp(entry.attemptedAt, `attempt ${entry.attemptId} attemptedAt`),
      id: requiredText(entry.attemptId, 'attempt ID'),
      state,
      stateReason: `POST_CANARY_${entry.failureCode.toUpperCase()}_FAILURE`,
      evidence: {
        attemptId: entry.attemptId,
        targetId: entry.targetId,
        referenceId: entry.referenceId,
        sourceUrl: entry.sourceUrl,
        failureCode: entry.failureCode,
        ...(entry.processorCapability ? {
          processorCapability: entry.processorCapability,
          evidenceProcessorSha256: entry.evidenceProcessorSha256,
        } : {}),
      },
    }];
  });
  return [...acceptances, ...failures].sort((left, right) => (
    left.at.localeCompare(right.at) || left.id.localeCompare(right.id)
  ));
}

function stateWithHistory({ initial, previous, contract, events }) {
  let result = initial;
  let consumeEvents = true;
  if (previous) {
    if (!FAMILY_STATES.has(previous.state)) {
      throw new TypeError(`previous family state unsupported: ${previous.state}`);
    }
    const previousContractSha256 = requiredSha256(
      previous.contract?.sha256,
      `previous family ${previous.familyId} contract SHA-256`,
    );
    if (previousContractSha256 !== contract.sha256) {
      consumeEvents = false;
      if (previous.state === 'PASSED' || previous.state === 'REOPENED'
        || previous.state.startsWith('FAILED_')) {
        result = {
          ...initial,
          state: 'REOPENED',
          stateReason: 'FAMILY_CONTRACT_CHANGED',
          stateEvidence: {
            previousState: previous.state,
            previousContractSha256,
            currentContractSha256: contract.sha256,
          },
        };
      }
    } else if (previousContractSha256 === contract.sha256) {
      result = {
        ...initial,
        state: previous.state,
        stateReason: previous.stateReason,
        ...(previous.stateEvidence ? { stateEvidence: structuredClone(previous.stateEvidence) } : {}),
      };
    }
  }
  for (const event of consumeEvents ? events : []) {
    result = {
      ...result,
      state: event.state,
      stateReason: event.stateReason,
      stateEvidence: event.evidence,
    };
  }
  return result;
}

function canarySemantic(value) {
  return {
    schemaVersion: value.schemaVersion,
    generatedAt: timestamp(value.generatedAt, 'family canary generatedAt'),
    documentGraphSha256: value.documentGraphSha256,
    executableQueueSha256: value.executableQueueSha256,
    policySha256: value.policySha256,
    parserContractSha256: value.parserContractSha256,
    processorEpochs: value.processorEpochs,
    families: value.families,
    targetDecisions: value.targetDecisions,
  };
}

function validateCanaryIntegrity(value, label = 'family canary') {
  requiredObject(value, label);
  if (value.schemaVersion !== HISTORICAL_EVIDENCE_FAMILY_CANARY_SCHEMA_VERSION) {
    throw new TypeError(`${label} schemaVersion ${HISTORICAL_EVIDENCE_FAMILY_CANARY_SCHEMA_VERSION} required`);
  }
  const semantic = canarySemantic(value);
  if (canonicalJsonSha256(semantic) !== value.semanticCanarySha256) {
    throw new Error(`${label} semantic hash drift`);
  }
  validateProcessorEpochs(value.processorEpochs);
  const familiesById = uniqueMap(value.families, 'familyId', `${label} families`);
  for (const family of familiesById.values()) {
    if (!FAMILY_STATES.has(family.state)) {
      throw new TypeError(`${label} family state unsupported: ${family.state}`);
    }
    const contract = requiredObject(family.contract, `${label} family contract`);
    const { sha256, ...contractValue } = contract;
    if (canonicalJsonSha256(contractValue) !== requiredSha256(
      sha256,
      `${label} family contract SHA-256`,
    )) throw new Error(`${label} family contract hash drift: ${family.familyId}`);
  }
  const decisionsById = uniqueMap(
    value.targetDecisions,
    'targetId',
    `${label} target decisions`,
  );
  for (const decision of decisionsById.values()) {
    requiredText(decision.referenceId, `${label} target reference ID`);
    if (typeof decision.runnerAllowed !== 'boolean' || typeof decision.fanoutEligible !== 'boolean') {
      throw new TypeError(`${label} target decision booleans required: ${decision.targetId}`);
    }
    const familyIds = requiredArray(decision.familyIds, `${label} target family IDs`);
    if (JSON.stringify(familyIds) !== JSON.stringify(sortedUnique(familyIds))) {
      throw new Error(`${label} target family IDs must be unique and sorted: ${decision.targetId}`);
    }
    if (familyIds.length === 0) {
      if (decision.assignment !== 'UNSCOPED_SINGLETON'
        || !decision.runnerAllowed || decision.fanoutEligible) {
        throw new Error(`${label} unscoped singleton decision invalid: ${decision.targetId}`);
      }
      continue;
    }
    if (familyIds.length > 1) {
      if (decision.assignment !== 'MULTI_FAMILY_SINGLETON'
        || !decision.runnerAllowed || decision.fanoutEligible) {
        throw new Error(`${label} multi-family singleton decision invalid: ${decision.targetId}`);
      }
      for (const familyId of familyIds) {
        if (!familiesById.has(familyId)) throw new Error(`${label} target family missing: ${familyId}`);
      }
      continue;
    }
    const family = familiesById.get(familyIds[0]);
    if (!family || decision.familyState !== family.state
      || decision.representativeTargetId !== family.representativeTargetId) {
      throw new Error(`${label} target family binding drift: ${decision.targetId}`);
    }
    const representative = family.representativeTargetId === decision.targetId;
    const expectedAllowed = family.state === 'PASSED'
      || (['CANARY_READY', 'REOPENED'].includes(family.state) && representative);
    if (decision.runnerAllowed !== expectedAllowed
      || decision.fanoutEligible !== (family.state === 'PASSED')) {
      throw new Error(`${label} target family gate drift: ${decision.targetId}`);
    }
  }
  return { semantic, familiesById, decisionsById };
}

function decisionForTarget(target, familyIds, familiesById) {
  const base = {
    targetId: target.targetId,
    referenceId: target.referenceId,
    executionLane: target.executionLane,
    familyIds,
  };
  if (familyIds.length === 0) {
    return {
      ...base,
      assignment: 'UNSCOPED_SINGLETON',
      runnerAllowed: true,
      fanoutEligible: false,
      reason: 'NO_CANONICAL_DOCUMENT_FAMILY',
    };
  }
  if (familyIds.length > 1) {
    return {
      ...base,
      assignment: 'MULTI_FAMILY_SINGLETON',
      runnerAllowed: true,
      fanoutEligible: false,
      reason: 'AMBIGUOUS_CANONICAL_DOCUMENT_FAMILY',
    };
  }
  const family = familiesById.get(familyIds[0]);
  if (!family) throw new Error(`target family missing: ${target.targetId}:${familyIds[0]}`);
  const representative = family.representativeTargetId === target.targetId;
  const passed = family.state === 'PASSED';
  const canaryRunnable = ['CANARY_READY', 'REOPENED'].includes(family.state) && representative;
  return {
    ...base,
    assignment: representative ? 'FAMILY_CANARY' : 'FAMILY_MEMBER',
    familyState: family.state,
    representativeTargetId: family.representativeTargetId,
    runnerAllowed: passed || canaryRunnable,
    fanoutEligible: passed,
    reason: passed
      ? 'FAMILY_CANARY_PASSED'
      : canaryRunnable
        ? 'FAMILY_CANARY_EXECUTION'
        : `FAMILY_${family.state}`,
  };
}

export function buildHistoricalEvidenceFamilyCanaries({
  generatedAt,
  documentGraph,
  executableQueue,
  policy,
  attemptLedger,
  parserContractSha256,
  processorEpochs,
  previousCanaries = null,
}) {
  const generatedTimestamp = timestamp(generatedAt, 'family canary generatedAt');
  const graph = requiredObject(documentGraph, 'document graph');
  const queue = requiredObject(executableQueue, 'executable queue');
  const ledger = requiredObject(attemptLedger, 'attempt ledger');
  requiredObject(policy, 'recovery policy');
  const parserSha256 = requiredSha256(parserContractSha256, 'parser contract SHA-256');
  const epochs = validateProcessorEpochs(processorEpochs);
  const queueSha256 = canonicalJsonSha256(queue);
  const policySha256 = canonicalJsonSha256(policy);
  const graphSha256 = requiredSha256(graph.semanticGraphSha256, 'document graph SHA-256');
  const targets = allActionableTargets(queue);
  const targetsById = uniqueMap(targets, 'targetId', 'actionable targets');
  const jobsById = uniqueMap(queue.jobs, 'jobId', 'executable queue jobs');
  const documentsById = uniqueMap(graph.documents, 'documentId', 'document graph documents');
  const sourceVersionsById = uniqueMap(
    graph.sourceVersions,
    'sourceVersionId',
    'document graph source versions',
  );
  const familyIdsForReference = familyIdsByReference(graph);
  if (previousCanaries) {
    validateCanaryIntegrity(previousCanaries, 'previous family canary');
    if (eventTime(generatedTimestamp, 'family canary generatedAt')
      < eventTime(previousCanaries.generatedAt, 'previous family canary generatedAt')) {
      throw new Error('family canary generatedAt cannot precede previous snapshot');
    }
  }
  const previousById = previousCanaries
    ? uniqueMap(previousCanaries.families, 'familyId', 'previous canary families')
    : new Map();
  const singletonTargetIds = new Set(targets.filter((target) => (
    (familyIdsForReference.get(target.referenceId) ?? []).length === 1
  )).map((target) => target.targetId));

  const families = requiredArray(graph.families, 'document graph families')
    .map((family) => {
      const familyTargets = targets.filter((target) => singletonTargetIds.has(target.targetId)
        && (familyIdsForReference.get(target.referenceId) ?? [])[0] === family.familyId)
        .sort(compareRepresentatives);
      const representativeTargetId = familyTargets[0]?.targetId ?? null;
      const graphSourceUrls = graphSourceUrlsForFamily(family, documentsById, sourceVersionsById);
      const candidateUrlsByTarget = new Map(familyTargets.map((target) => [
        target.targetId,
        candidateUrlsForTarget(target, jobsById),
      ]));
      const contract = buildFamilyContract({
        family,
        familyTargets,
        documentsById,
        sourceVersionsById,
        jobsById,
        policySha256,
        parserContractSha256: parserSha256,
        processorEpochs: epochs,
      });
      const initial = initialState({
        familyTargets,
        representativeTargetId,
        exactReferences: exactReferencesForFamily(family, documentsById),
        graphSourceUrls,
        candidateUrlsByTarget,
      });
      const previous = previousById.get(family.familyId) ?? null;
      const targetIds = new Set(familyTargets.map((target) => target.targetId));
      const referenceIds = new Set(familyTargets.map((target) => target.referenceId));
      const events = previous ? postSnapshotEvents({
        ledger,
        targetIds,
        referenceIds,
        snapshotAt: previousCanaries.generatedAt,
        policySha256,
        processorEpochs: epochs,
      }) : [];
      const state = stateWithHistory({ initial, previous, contract, events });
      return {
        familyId: family.familyId,
        category: family.category,
        brand: family.brand,
        groupType: family.groupType,
        groupName: family.groupName,
        targetIds: [...targetIds].sort((left, right) => left.localeCompare(right)),
        representativeTargetId,
        provenRepresentativeTargetIds: initial.provenRepresentativeTargetIds,
        contract,
        state: state.state,
        stateReason: state.stateReason,
        ...(state.stateEvidence ? { stateEvidence: state.stateEvidence } : {}),
      };
    })
    .sort((left, right) => left.familyId.localeCompare(right.familyId));
  const familiesById = new Map(families.map((family) => [family.familyId, family]));
  const targetDecisions = targets.map((target) => decisionForTarget(
    target,
    familyIdsForReference.get(target.referenceId) ?? [],
    familiesById,
  )).sort((left, right) => left.targetId.localeCompare(right.targetId));
  const semantic = {
    schemaVersion: HISTORICAL_EVIDENCE_FAMILY_CANARY_SCHEMA_VERSION,
    generatedAt: generatedTimestamp,
    documentGraphSha256: graphSha256,
    executableQueueSha256: queueSha256,
    policySha256,
    parserContractSha256: parserSha256,
    processorEpochs: epochs,
    families,
    targetDecisions,
  };
  return {
    ...semantic,
    semanticCanarySha256: canonicalJsonSha256(semantic),
    summary: {
      families: families.length,
      targets: targetDecisions.length,
      byFamilyState: Object.fromEntries([...FAMILY_STATES].sort().map((state) => [
        state,
        families.filter((family) => family.state === state).length,
      ])),
      unscopedSingletonTargets: targetDecisions.filter(
        (decision) => decision.assignment === 'UNSCOPED_SINGLETON',
      ).length,
      multiFamilySingletonTargets: targetDecisions.filter(
        (decision) => decision.assignment === 'MULTI_FAMILY_SINGLETON',
      ).length,
      runnerAllowedTargets: targetDecisions.filter((decision) => decision.runnerAllowed).length,
      fanoutEligibleTargets: targetDecisions.filter((decision) => decision.fanoutEligible).length,
    },
  };
}

export function validateHistoricalEvidenceFamilyCanarySelection({
  canaries,
  batch,
  parserContractSha256,
  processorEpochs,
}) {
  requiredObject(batch, 'recovery batch');
  const { decisionsById } = validateCanaryIntegrity(canaries);
  if (requiredSha256(batch.queue?.sha256, 'batch queue SHA-256')
    !== requiredSha256(canaries.executableQueueSha256, 'canary queue SHA-256')) {
    throw new Error('recovery queue hash drift against family canary');
  }
  if (requiredSha256(batch.policy?.sha256, 'batch policy SHA-256')
    !== requiredSha256(canaries.policySha256, 'canary policy SHA-256')) {
    throw new Error('recovery policy hash drift against family canary');
  }
  if (requiredSha256(parserContractSha256, 'runner parser contract SHA-256')
    !== requiredSha256(canaries.parserContractSha256, 'canary parser contract SHA-256')) {
    throw new Error('parser contract drift against family canary');
  }
  if (canonicalJsonSha256(validateProcessorEpochs(processorEpochs))
    !== canonicalJsonSha256(validateProcessorEpochs(canaries.processorEpochs))) {
    throw new Error('processor epoch drift against family canary');
  }
  for (const target of requiredArray(batch.targets, 'recovery batch targets')) {
    const targetId = requiredText(target.targetId, 'batch target ID');
    const decision = decisionsById.get(targetId);
    if (!decision) throw new Error(`batch target absent from family canary: ${targetId}`);
    if (requiredText(target.referenceId, 'batch target reference ID') !== decision.referenceId) {
      throw new Error(`batch target reference drift against family canary: ${targetId}`);
    }
    if (decision.runnerAllowed !== true) {
      throw new Error(`batch target blocked by family canary: ${targetId} (${decision.reason})`);
    }
  }
  return true;
}
