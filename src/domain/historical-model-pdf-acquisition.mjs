import { createHash } from 'node:crypto';

import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';
import { isOfficialBrandArtifactUrl } from './evidence-source-verifier.mjs';
import { validateRetailerIdentityMigration } from './retailer-identity-migration.mjs';

const TERMINAL_CLASSES = new Set(['COMPLETE_RECEIPT', 'OFFICIAL_HTML_ONLY', 'NO_OFFICIAL_SOURCE']);
const ROUTE_BY_CLASS = Object.freeze({
  OFFLINE_REPLAY: 'OFFLINE_REPLAY_REVIEW',
  OFFLINE_PARSER_REPAIR: 'PARSER_REPAIR',
  PDF_RECONVERT: 'PDF_RECONVERT',
  OFFICIAL_REACQUIRE: 'OFFICIAL_REACQUIRE',
  REFERENCE_REDISCOVERY: 'OFFICIAL_REDISCOVERY',
  OFFICIAL_DISCOVERY: 'OFFICIAL_DISCOVERY',
  IDENTITY_RESEARCH: 'IDENTITY_CLOSURE',
  CONFLICT_QUARANTINE: 'CONFLICT_CLOSURE',
});
const PRIORITY_ORDER = Object.freeze({
  P0_CURRENT_RETAIL: 0,
  P1_CATALOG_ARCHIVED: 1,
  P2_REGISTRY_ONLY: 2,
  P3_CONFLICT: 3,
});
const IDENTITY_DISCOVERY_FIELDS = new Set([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
]);

function text(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function normalizedBrand(value) {
  return text(value, 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeHttpsUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return null;
  }
}

function id(prefix, seed) {
  return `${prefix}_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
}

function countBy(rows, keyFor) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function sourceAuthority(value) {
  return ['OFFICIAL', 'REFERENCE', 'MIXED'].includes(value) ? value : 'NONE';
}

function referenceOrder(left, right) {
  return PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
    || left.category.localeCompare(right.category)
    || left.brand.localeCompare(right.brand, 'en-AU', { sensitivity: 'base' })
    || (left.groupName ?? '').localeCompare(right.groupName ?? '', 'en-AU', { sensitivity: 'base' })
    || left.model.localeCompare(right.model, 'en-AU', { sensitivity: 'base' })
    || left.referenceId.localeCompare(right.referenceId);
}

function offlineOutcomesByReference(queue, results) {
  const targetToReference = new Map((queue?.targets ?? []).map((target) => [
    target.targetId, target.referenceId,
  ]));
  const outcomes = new Map();
  for (const outcome of results?.outcomes ?? []) {
    const referenceId = targetToReference.get(outcome.targetId);
    if (referenceId) outcomes.set(referenceId, outcome);
  }
  return outcomes;
}

function recoveryTargetsByReference(queue) {
  const result = new Map();
  for (const target of queue?.targets ?? []) {
    if (!result.has(target.referenceId)) result.set(target.referenceId, []);
    result.get(target.referenceId).push(target);
  }
  return result;
}

function catalogCanonicalIdsByRuntimeId(catalogProducts) {
  if (!Array.isArray(catalogProducts)) throw new TypeError('catalog products required');
  const result = new Map();
  for (const product of catalogProducts) {
    const runtimeId = String(product?.id ?? '').trim();
    const canonicalProductId = String(product?.canonicalProductId ?? '').trim();
    if (!runtimeId || !canonicalProductId) continue;
    const existing = result.get(runtimeId);
    if (existing && existing !== canonicalProductId) {
      throw new Error(`catalog runtime ID maps to multiple canonical products: ${runtimeId}`);
    }
    result.set(runtimeId, canonicalProductId);
  }
  return result;
}

function canonicalMergeResolver(identityMigration, catalogProjectionSemanticSha256) {
  if (identityMigration == null) {
    return { resolve: (canonicalProductId) => canonicalProductId, semanticSha256: null };
  }
  validateRetailerIdentityMigration(identityMigration);
  const projectionSha256 = text(
    catalogProjectionSemanticSha256,
    'catalog projection semantic SHA-256',
  ).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(projectionSha256)
    || projectionSha256 !== identityMigration.sourceBindings.publicProjectionSemanticSha256) {
    throw new Error('identity migration public projection drift');
  }
  const directTargets = new Map();
  for (const merge of identityMigration.canonicalMerges) {
    const existing = directTargets.get(merge.sourceCanonicalProductId);
    if (existing && existing !== merge.targetCanonicalProductId) {
      throw new Error(`identity migration canonical merge conflict: ${merge.sourceCanonicalProductId}`);
    }
    directTargets.set(merge.sourceCanonicalProductId, merge.targetCanonicalProductId);
  }
  const resolveCanonicalProductId = (canonicalProductId) => {
    let current = canonicalProductId;
    const visited = new Set();
    while (directTargets.has(current)) {
      if (visited.has(current)) throw new Error(`identity migration canonical merge cycle: ${canonicalProductId}`);
      visited.add(current);
      current = directTargets.get(current);
    }
    return current;
  };
  for (const sourceCanonicalProductId of directTargets.keys()) {
    resolveCanonicalProductId(sourceCanonicalProductId);
  }
  return {
    resolve: resolveCanonicalProductId,
    semanticSha256: identityMigration.semanticSha256,
  };
}

function normalizedIdentity(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function activeReleaseSourceBindings(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('acquisition active-release source bindings invalid');
  }
  const releaseCandidateId = text(value.releaseCandidateId, 'acquisition release candidate ID');
  const hashes = Object.fromEntries([
    ['publicProjectionSha256', value.publicProjectionSha256],
    ['historicalReferenceSha256', value.historicalReferenceSha256],
    ['authorizationManifestSha256', value.authorizationManifestSha256],
  ].map(([key, raw]) => {
    const hash = String(raw ?? '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new TypeError(`acquisition ${key} invalid`);
    return [key, hash];
  }));
  return { releaseCandidateId, ...hashes };
}

function autonomousIdentityDiscoveryCases(identityResearchQueue, references, canonicalByRuntimeId) {
  if (identityResearchQueue == null) return new Map();
  if (identityResearchQueue.schemaVersion !== 1 || !Array.isArray(identityResearchQueue.cases)) {
    throw new TypeError('identity research queue schema v1 required');
  }
  const referenceByRuntimeId = new Map();
  const referenceByCanonicalId = new Map();
  for (const reference of references.values()) {
    for (const runtimeId of reference.catalogProductIds ?? []) {
      if (referenceByRuntimeId.has(runtimeId)) throw new Error(`duplicate catalog runtime identity: ${runtimeId}`);
      referenceByRuntimeId.set(runtimeId, reference.referenceId);
      const canonicalProductId = canonicalByRuntimeId.get(runtimeId);
      if (!canonicalProductId) continue;
      const existing = referenceByCanonicalId.get(canonicalProductId);
      if (existing && existing !== reference.referenceId) {
        throw new Error(`canonical product maps to multiple historical references: ${canonicalProductId}`);
      }
      referenceByCanonicalId.set(canonicalProductId, reference.referenceId);
    }
  }
  const result = new Map();
  for (const identityCase of identityResearchQueue.cases) {
    const fields = identityCase?.approvedFields ?? [];
    const resolution = identityCase?.resolution ?? null;
    if (identityCase?.status !== 'resolved' || identityCase.requiresHumanReview !== false
      || identityCase?.publication?.release !== true
      || !['exact', 'official_marketing_alias'].includes(resolution?.identityOutcome)
      || !/^[a-f0-9]{64}$/.test(String(resolution?.receiptBindingSha256 ?? ''))
      || !fields.length || fields.some((field) => !IDENTITY_DISCOVERY_FIELDS.has(field))) continue;
    const sourceUrl = normalizeHttpsUrl(resolution?.sourceUrl);
    if (!sourceUrl) continue;
    const matchedReferences = new Set([
      referenceByRuntimeId.get(String(identityCase.legacyRuntimeId ?? '').trim()),
      referenceByCanonicalId.get(String(identityCase.canonicalProductId ?? '').trim()),
    ].filter(Boolean));
    if (matchedReferences.size !== 1) continue;
    const referenceId = [...matchedReferences][0];
    const cases = result.get(referenceId) ?? [];
    cases.push({ ...identityCase, sourceUrl });
    result.set(referenceId, cases);
  }
  return result;
}

function readiness(route, candidateAuthorities, resolverIds) {
  if (route === 'PARSER_REPAIR' || route === 'PDF_RECONVERT') return 'OFFLINE_REPAIR';
  if (route === 'CONFLICT_CLOSURE') {
    return candidateAuthorities.has('OFFICIAL') ? 'BOUNDED_READY' : 'RESEARCH_REQUIRED';
  }
  if (route === 'IDENTITY_CLOSURE') {
    return resolverIds.length > 0 ? 'DISCOVERY_READY' : 'RESEARCH_REQUIRED';
  }
  if (candidateAuthorities.has('OFFICIAL')) return 'BOUNDED_READY';
  if (resolverIds.length > 0) return 'DISCOVERY_READY';
  return 'RESOLVER_GAP';
}

export function buildHistoricalModelPdfAcquisitionQueue({
  classification,
  historicalReference,
  catalogProducts,
  recoveryQueue,
  offlineReplayQueue = null,
  offlineReplayResults = null,
  identityResearchQueue = null,
  identityMigration = null,
  catalogProjectionSemanticSha256 = null,
  resolverIdsByBrand = new Map(),
  generatedAt,
}) {
  if (classification?.schemaVersion !== 1 || !Array.isArray(classification.records)) {
    throw new TypeError('historical model classification schema v1 required');
  }
  if (!Array.isArray(historicalReference?.records)) throw new TypeError('historical reference records required');
  if (!(resolverIdsByBrand instanceof Map)) throw new TypeError('resolverIdsByBrand map required');
  const timestamp = new Date(generatedAt).toISOString();
  const sourceBindings = activeReleaseSourceBindings(classification.sourceBindings);
  const references = new Map(historicalReference.records.map((record) => [record.referenceId, record]));
  if (references.size !== historicalReference.records.length) throw new Error('duplicate historical reference ID');
  const canonicalByRuntimeId = catalogCanonicalIdsByRuntimeId(catalogProducts);
  const canonicalMerge = canonicalMergeResolver(
    identityMigration,
    catalogProjectionSemanticSha256,
  );
  const identityDiscoveryByReference = autonomousIdentityDiscoveryCases(
    identityResearchQueue, references, canonicalByRuntimeId,
  );
  const recoveryByReference = recoveryTargetsByReference(recoveryQueue);
  const replayOutcomes = offlineOutcomesByReference(offlineReplayQueue, offlineReplayResults);
  const sources = new Map();
  const records = [];
  const excluded = { COMPLETE_RECEIPT: 0, OFFICIAL_HTML_ONLY: 0, NO_OFFICIAL_SOURCE: 0 };

  for (const classified of classification.records) {
    if (TERMINAL_CLASSES.has(classified.operationalClass)) {
      excluded[classified.operationalClass] += 1;
      continue;
    }
    const reference = references.get(classified.referenceId);
    if (!reference) throw new Error(`classification references missing model ${classified.referenceId}`);
    const replayOutcome = replayOutcomes.get(classified.referenceId) ?? null;
    const route = replayOutcome?.status === 'conflict_quarantined'
      ? 'CONFLICT_CLOSURE'
      : ROUTE_BY_CLASS[classified.operationalClass];
    if (!route) throw new Error(`unroutable operational class ${classified.operationalClass}`);

    const candidateSourceIds = [];
    const candidateAuthorities = new Set();
    for (const link of classified.documentLinks ?? []) {
      const sourceUrl = normalizeHttpsUrl(link.sourceUrl);
      if (!sourceUrl) continue;
      const authority = sourceAuthority(link.sourceAuthority);
      const sourceId = id('historical_source', `${authority}\0${sourceUrl}`);
      candidateSourceIds.push(sourceId);
      candidateAuthorities.add(authority);
      const receiptEligible = authority === 'OFFICIAL' && isOfficialBrandArtifactUrl(
        sourceUrl, classified.canonicalBrand, {
          model: classified.model,
          category: classified.category,
        },
      );
      const existing = sources.get(sourceId) ?? {
        sourceId,
        sourceUrl,
        sourceAuthority: authority,
        receiptEligible,
        documentIds: new Set(),
        referenceIds: new Set(),
      };
      existing.documentIds.add(link.documentId);
      existing.referenceIds.add(classified.referenceId);
      sources.set(sourceId, existing);
    }
    for (const identityCase of identityDiscoveryByReference.get(classified.referenceId) ?? []) {
      if (normalizedIdentity(identityCase.brand) !== normalizedIdentity(classified.canonicalBrand)
        || normalizedIdentity(identityCase.category) !== normalizedIdentity(classified.category)
        || normalizedIdentity(identityCase.targetModel) !== normalizedIdentity(classified.model)) continue;
      const authority = 'OFFICIAL';
      const sourceId = id('historical_source', `${authority}\0${identityCase.sourceUrl}`);
      candidateSourceIds.push(sourceId);
      candidateAuthorities.add(authority);
      const existing = sources.get(sourceId) ?? {
        sourceId,
        sourceUrl: identityCase.sourceUrl,
        sourceAuthority: authority,
        receiptEligible: true,
        documentIds: new Set(),
        referenceIds: new Set(),
      };
      existing.documentIds.add(`identity-research:${identityCase.id}`);
      existing.referenceIds.add(classified.referenceId);
      sources.set(sourceId, existing);
    }

    const resolverIds = [...new Set(resolverIdsByBrand.get(normalizedBrand(classified.canonicalBrand)) ?? [])]
      .sort();
    const legacyTargets = recoveryByReference.get(classified.referenceId) ?? [];
    const legacyRuntimeIds = [...new Set([
      ...(reference.catalogProductIds ?? []),
      ...legacyTargets.map((target) => target.legacyRuntimeId).filter(Boolean),
    ])].sort();
    const canonicalProductIds = [...new Set([
      ...legacyTargets.map((target) => target.canonicalProductId).filter(Boolean),
      ...(reference.catalogProductIds ?? []).map((runtimeId) => canonicalByRuntimeId.get(runtimeId)).filter(Boolean),
    ].map(canonicalMerge.resolve))].sort();
    if (canonicalProductIds.length > 1) {
      throw new Error(`historical reference maps to multiple canonical products: ${classified.referenceId}`);
    }
    if (classified.lifecycleState === 'CURRENT_RETAIL' && canonicalProductIds.length !== 1) {
      throw new Error(`current historical reference missing canonical product: ${classified.referenceId}`);
    }
    records.push({
      schemaVersion: 1,
      acquisitionId: id('historical_acquisition', classified.referenceId),
      referenceId: classified.referenceId,
      category: classified.category,
      brand: classified.canonicalBrand,
      model: classified.model,
      lifecycleState: classified.lifecycleState,
      priority: classified.priority,
      groupType: classified.groupType,
      groupName: classified.groupName,
      operationalClass: classified.operationalClass,
      route,
      executionReadiness: readiness(route, candidateAuthorities, resolverIds),
      candidateSourceIds: [...new Set(candidateSourceIds)].sort(),
      resolverIds,
      legacyRecoveryTargetIds: legacyTargets.map((target) => target.targetId).sort(),
      legacyRuntimeIds,
      canonicalProductIds,
      offlineReplayOutcome: replayOutcome ? {
        status: replayOutcome.status,
        failureCode: replayOutcome.failureCode ?? null,
        semanticOutcomeSha256: replayOutcome.semanticOutcomeSha256,
      } : null,
    });
  }

  records.sort(referenceOrder);
  const uniqueReferences = new Set(records.map((record) => record.referenceId));
  if (uniqueReferences.size !== records.length) throw new Error('duplicate acquisition reference');
  if (records.length + Object.values(excluded).reduce((sum, count) => sum + count, 0)
    !== classification.records.length) {
    throw new Error('acquisition queue denominator mismatch');
  }
  const materializedSources = [...sources.values()].map((source) => ({
    ...source,
    documentIds: [...source.documentIds].sort(),
    referenceIds: [...source.referenceIds].sort(),
  })).sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const semanticPayload = {
    sourceClassificationSha256: classification.semanticClassificationSha256,
    sourceIdentityMigrationSha256: canonicalMerge.semanticSha256,
    ...(sourceBindings ? { sourceBindings } : {}),
    records,
    sources: materializedSources,
    excluded,
  };
  return {
    schemaVersion: 1,
    generatedAt: timestamp,
    semanticQueueSha256: canonicalJsonSha256(semanticPayload),
    ...semanticPayload,
    summary: {
      classificationRecords: classification.records.length,
      queuedModels: records.length,
      uniqueReferences: uniqueReferences.size,
      candidateSources: materializedSources.length,
      candidateEdges: records.reduce((sum, record) => sum + record.candidateSourceIds.length, 0),
      byLifecycle: countBy(records, (record) => record.lifecycleState),
      byCategory: countBy(records, (record) => record.category),
      byOperationalClass: countBy(records, (record) => record.operationalClass),
      byRoute: countBy(records, (record) => record.route),
      byExecutionReadiness: countBy(records, (record) => record.executionReadiness),
      excluded,
    },
  };
}
