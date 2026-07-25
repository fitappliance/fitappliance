import { createHash } from 'node:crypto';

import {
  validateEvidenceSourceResolverResult,
  validateOfficialSourceLaneDescriptors,
} from './evidence-source-adapter-contract.mjs';
import {
  isOfficialBrandArtifactUrl,
  isOfficialBrandMarketUrl,
} from './evidence-source-verifier.mjs';
import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';

const MANIFEST_STATES = new Set([
  'CANDIDATES_READY',
  'DISCOVERY_RETRYABLE',
  'RESEARCH_REQUIRED',
  'NO_CANDIDATE_COMPLETE',
]);
const ACQUISITION_SEED_STRATEGY_ID = 'acquisition-queue-seed@1:classified_document_link';
const RESOLVER_CONTRACT_KEYS = new Set([
  'schemaVersion',
  'resolverId',
  'version',
  'scope',
  'required',
  'sourceLanes',
]);

function requiredText(value, label) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function sha256(value, label) {
  const normalized = requiredText(value, label).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new TypeError(`${label} invalid`);
  return normalized;
}

function activeReleaseSourceBindings(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('candidate manifest active-release source bindings invalid');
  }
  return {
    releaseCandidateId: requiredText(
      value.releaseCandidateId,
      'candidate manifest release candidate ID',
    ),
    publicProjectionSha256: sha256(
      value.publicProjectionSha256,
      'candidate manifest public projection SHA-256',
    ),
    historicalReferenceSha256: sha256(
      value.historicalReferenceSha256,
      'candidate manifest historical reference SHA-256',
    ),
    authorizationManifestSha256: sha256(
      value.authorizationManifestSha256,
      'candidate manifest authorization SHA-256',
    ),
  };
}

function timestamp(value, label) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new TypeError(`${label} invalid`);
  return parsed.toISOString();
}

function normalizedBrand(value) {
  return requiredText(value, 'candidate authority brand').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function modelKey(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function candidateId(brand, sourceUrl) {
  return `official_candidate_${createHash('sha256')
    .update(['historical-official-candidate-v1', normalizedBrand(brand), sourceUrl].join('\0'))
    .digest('hex').slice(0, 24)}`;
}

export function normalizeHistoricalCandidateUrl(value) {
  let url;
  try {
    url = new URL(requiredText(value, 'historical candidate URL'));
  } catch {
    throw new TypeError('historical candidate URL must be absolute');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError('historical candidate URL must use trusted HTTPS');
  }
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  return url.toString();
}

export function urlHasExactModelSignal(value, model) {
  const target = modelKey(model);
  if (!target) return false;
  let url;
  try { url = new URL(value); } catch { return false; }
  const segments = url.pathname.split('/').filter(Boolean);
  for (const segment of segments) {
    let decoded;
    try { decoded = decodeURIComponent(segment); } catch { decoded = segment; }
    const withoutExtension = decoded.replace(/\.(?:pdf|html?|aspx?)$/i, '');
    if (modelKey(decoded) === target || modelKey(withoutExtension) === target) return true;
  }
  return [...url.searchParams.values()].some((entry) => modelKey(entry) === target);
}

function expectedContentType(documentType, sourceUrl) {
  const normalized = String(documentType ?? '').toLowerCase();
  if (normalized === 'product_page') return 'text/html';
  if (normalized === 'structured_product_data') return 'application/json';
  if (/manual|guide|sheet|document|catalog/.test(normalized)
    || /\.pdf$/i.test(new URL(sourceUrl).pathname)) return 'application/pdf';
  return 'application/octet-stream';
}

function inferDocumentType(sourceUrl) {
  return /\.pdf$/i.test(new URL(sourceUrl).pathname) ? 'unknown_pdf_document' : 'unknown_official_artifact';
}

function defaultOfficialCandidateValidator(candidate, target) {
  return candidate.discoveryProvenance
    ? isOfficialBrandArtifactUrl(candidate.sourceUrl, target.brand, {
      model: target.model,
      category: target.category,
      discoveryProvenance: candidate.discoveryProvenance,
    })
    : isOfficialBrandMarketUrl(candidate.sourceUrl, target.brand);
}

function uniqueMap(rows, key, label) {
  if (!Array.isArray(rows)) throw new TypeError(`${label} rows required`);
  const result = new Map();
  for (const row of rows) {
    const value = requiredText(row?.[key], `${label} ${key}`);
    if (result.has(value)) throw new Error(`duplicate ${label} ${key}: ${value}`);
    result.set(value, row);
  }
  return result;
}

function rejectUnknownKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new TypeError(`${label} contains unknown fields: ${unknown.sort().join(', ')}`);
  }
}

function normalizeResolverContract(values, referenceId) {
  if (!Array.isArray(values)) throw new TypeError(`resolver contract array required: ${referenceId}`);
  const seen = new Set();
  return values.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(`resolver contract object required: ${referenceId}`);
    }
    rejectUnknownKeys(value, RESOLVER_CONTRACT_KEYS, 'resolver contract');
    const resolverId = requiredText(value.resolverId, 'resolver contract ID');
    if (seen.has(resolverId)) throw new Error(`duplicate resolver contract: ${referenceId} ${resolverId}`);
    seen.add(resolverId);
    if (typeof value.required !== 'boolean') throw new TypeError('resolver contract required flag invalid');
    const schemaVersion = value.schemaVersion ?? 1;
    if (![1, 2].includes(schemaVersion)) throw new TypeError('resolver contract schema invalid');
    const sourceLanes = schemaVersion === 2
      ? validateOfficialSourceLaneDescriptors(value.sourceLanes)
      : null;
    if (schemaVersion === 1 && value.sourceLanes != null) {
      throw new TypeError('schema-v1 resolver contract cannot declare source lanes');
    }
    return {
      schemaVersion,
      resolverId,
      version: requiredText(value.version, 'resolver contract version'),
      scope: requiredText(value.scope, 'resolver contract scope'),
      required: value.required,
      ...(sourceLanes ? { sourceLanes } : {}),
    };
  }).sort((left, right) => left.resolverId.localeCompare(right.resolverId));
}

function normalizeStorageObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('discovery run storage object required');
  }
  const contentSha256 = sha256(value.contentSha256, 'discovery run content SHA-256');
  const expected = `evidence/discovery/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.json`;
  const objectPath = requiredText(value.objectPath, 'discovery run object path');
  if (objectPath !== expected) throw new TypeError('discovery run object path invalid');
  if (!Number.isInteger(value.byteSize) || value.byteSize < 1) {
    throw new TypeError('discovery run byte size invalid');
  }
  return {
    contentSha256,
    byteSize: value.byteSize,
    objectPath,
    markerSha256: sha256(value.markerSha256, 'discovery run storage marker SHA-256'),
  };
}

function normalizeDiscoveryRun(value) {
  if (value?.schemaVersion !== 1 || !Array.isArray(value.targets)) {
    throw new TypeError('historical official candidate discovery run schema v1 required');
  }
  const runId = requiredText(value.runId, 'discovery run ID');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId)) throw new TypeError('discovery run ID invalid');
  const targets = value.targets.map((target) => {
    if (!Array.isArray(target?.resolvers)) throw new TypeError('discovery target resolver results required');
    return {
      referenceId: requiredText(target.referenceId, 'discovery target reference ID'),
      brand: requiredText(target.brand, 'discovery target brand'),
      model: requiredText(target.model, 'discovery target model'),
      category: requiredText(target.category, 'discovery target category'),
      resolvers: target.resolvers.map(validateEvidenceSourceResolverResult)
        .sort((left, right) => left.resolverId.localeCompare(right.resolverId)),
    };
  });
  if (new Set(targets.map((target) => target.referenceId)).size !== targets.length) {
    throw new Error(`duplicate target in discovery run: ${runId}`);
  }
  let boundedManifest = null;
  if (value.boundedManifest !== undefined) {
    if (!value.boundedManifest || typeof value.boundedManifest !== 'object'
      || Array.isArray(value.boundedManifest)) {
      throw new TypeError('discovery run bounded manifest required');
    }
    const {
      manifestId,
      semanticManifestSha256,
      ...manifestSemantic
    } = value.boundedManifest;
    const manifestSha256 = canonicalJsonSha256(manifestSemantic);
    if (manifestId !== `historical_batch_${manifestSha256.slice(0, 24)}`
      || semanticManifestSha256 !== manifestSha256
      || value.selection?.manifestId !== manifestId
      || value.selection?.semanticManifestSha256 !== semanticManifestSha256) {
      throw new Error(`discovery run bounded manifest binding mismatch: ${runId}`);
    }
    boundedManifest = structuredClone(value.boundedManifest);
  }
  const payload = {
    schemaVersion: 1,
    runId,
    startedAt: timestamp(value.startedAt, 'discovery run start'),
    completedAt: timestamp(value.completedAt, 'discovery run completion'),
    sourceAcquisitionQueueSha256: sha256(
      value.sourceAcquisitionQueueSha256,
      'discovery run acquisition queue SHA-256',
    ),
    selection: structuredClone(value.selection ?? {}),
    ...(boundedManifest ? { boundedManifest } : {}),
    targets,
  };
  const storageObject = normalizeStorageObject(value.storageObject);
  const bytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`);
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  if (storageObject.contentSha256 !== contentSha256 || storageObject.byteSize !== bytes.length) {
    throw new Error(`discovery run payload binding mismatch: ${runId}`);
  }
  return { ...payload, storageObject };
}

function countBy(rows, key) {
  const counts = new Map();
  for (const row of rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function discoveryKey(value) {
  return [
    value.resolverId,
    value.resolverVersion,
    value.discoveryMethod,
    value.sourceLaneId ?? '',
    value.retrievedAt,
    value.runId ?? '',
    value.discoveryProvenance ? canonicalJsonSha256(value.discoveryProvenance) : '',
  ].join('\0');
}

function normalizePriorDiscoveries(values) {
  const rows = [];
  const acquisitionSeeds = new Map();
  for (const discovery of values) {
    if (discovery.resolverId !== 'acquisition-queue-seed' || discovery.runId != null) {
      rows.push(discovery);
      continue;
    }
    const key = [
      discovery.resolverId,
      discovery.resolverVersion,
      discovery.discoveryMethod,
      discovery.sourceLaneId ?? '',
    ].join('\0');
    const existing = acquisitionSeeds.get(key);
    if (!existing || timestamp(discovery.retrievedAt, 'candidate retrieval time')
      < timestamp(existing.retrievedAt, 'candidate retrieval time')) {
      acquisitionSeeds.set(key, discovery);
    }
  }
  return [...rows, ...acquisitionSeeds.values()];
}

function createAccumulators() {
  return {
    candidates: new Map(),
    edgesByReference: new Map(),
  };
}

function addCandidateObservation({
  accumulators,
  target,
  candidate,
  retrievedAt,
  runId = null,
  runContentSha256 = null,
  officialCandidateValidator,
  discoveriesOverride = null,
  discoveryStrategyIdsOverride = null,
}) {
  if (candidate.authorityMode && candidate.authorityMode !== 'official') return;
  const sourceUrl = normalizeHistoricalCandidateUrl(candidate.sourceUrl);
  const validatedCandidate = { ...candidate, sourceUrl };
  if (!officialCandidateValidator(validatedCandidate, target)) {
    throw new Error(`official candidate host rejected: ${target.brand} ${sourceUrl}`);
  }
  const documentType = requiredText(candidate.documentType ?? inferDocumentType(sourceUrl), 'candidate document type');
  const contentType = expectedContentType(documentType, sourceUrl);
  const key = `${normalizedBrand(target.brand)}\0${sourceUrl}`;
  const id = candidateId(target.brand, sourceUrl);
  const current = accumulators.candidates.get(key) ?? {
    candidateId: id,
    sourceUrl,
    authorityBrand: target.brand,
    expectedContentType: contentType,
    categories: new Set(),
    documentTypes: new Set(),
    sourceRoles: new Set(),
    applicableReferenceIds: new Set(),
    discoveries: new Map(),
  };
  if (current.candidateId !== id || normalizedBrand(current.authorityBrand) !== normalizedBrand(target.brand)) {
    throw new Error(`cross-brand candidate identity collision: ${sourceUrl}`);
  }
  if (current.expectedContentType !== contentType
    && ![current.expectedContentType, contentType].includes('application/octet-stream')) {
    throw new Error(`candidate content-type conflict: ${sourceUrl}`);
  }
  if (current.expectedContentType === 'application/octet-stream') current.expectedContentType = contentType;
  current.categories.add(target.category);
  current.documentTypes.add(documentType);
  current.sourceRoles.add(requiredText(candidate.sourceRole ?? 'manufacturer_document', 'candidate source role'));
  current.applicableReferenceIds.add(target.referenceId);
  const discoveries = discoveriesOverride ?? [{
    resolverId: requiredText(candidate.resolverId, 'candidate resolver ID'),
    resolverVersion: requiredText(candidate.resolverVersion, 'candidate resolver version'),
    discoveryMethod: requiredText(candidate.discoveryMethod, 'candidate discovery method'),
    sourceLaneId: candidate.sourceLaneId ?? null,
    retrievedAt,
    runId,
    runContentSha256,
    discoveryProvenance: candidate.discoveryProvenance
      ? structuredClone(candidate.discoveryProvenance)
      : null,
  }];
  for (const discovery of discoveries) {
    const normalized = {
      resolverId: requiredText(discovery.resolverId, 'candidate discovery resolver ID'),
      resolverVersion: requiredText(discovery.resolverVersion, 'candidate discovery resolver version'),
      discoveryMethod: requiredText(discovery.discoveryMethod, 'candidate discovery method'),
      sourceLaneId: discovery.sourceLaneId == null
        ? null
        : requiredText(discovery.sourceLaneId, 'candidate discovery source lane ID'),
      retrievedAt: timestamp(discovery.retrievedAt, 'candidate retrieval time'),
      runId: discovery.runId == null ? null : requiredText(discovery.runId, 'candidate discovery run ID'),
      runContentSha256: discovery.runContentSha256 == null
        ? null
        : sha256(discovery.runContentSha256, 'candidate discovery run SHA-256'),
      discoveryProvenance: discovery.discoveryProvenance
        ? structuredClone(discovery.discoveryProvenance)
        : null,
    };
    const existing = current.discoveries.get(discoveryKey(normalized));
    if (existing && canonicalJsonSha256(existing) !== canonicalJsonSha256(normalized)) {
      throw new Error(`candidate discovery collision: ${sourceUrl}`);
    }
    current.discoveries.set(discoveryKey(normalized), normalized);
  }
  accumulators.candidates.set(key, current);

  const referenceEdges = accumulators.edgesByReference.get(target.referenceId) ?? new Map();
  const edge = referenceEdges.get(key) ?? {
    candidateKey: key,
    sourceModelHints: new Set(),
    documentTypes: new Set(),
    discoveryStrategyIds: new Set(),
    requiredAttempt: false,
  };
  if (candidate.sourceModelHint) edge.sourceModelHints.add(requiredText(candidate.sourceModelHint, 'candidate source-model hint'));
  edge.documentTypes.add(documentType);
  for (const discovery of discoveries) {
    edge.discoveryStrategyIds.add(discovery.sourceLaneId
      ? `${discovery.resolverId}@${discovery.resolverVersion}:${discovery.sourceLaneId}:${discovery.discoveryMethod}`
      : `${discovery.resolverId}@${discovery.resolverVersion}:${discovery.discoveryMethod}`);
  }
  if (discoveryStrategyIdsOverride != null) {
    if (!Array.isArray(discoveryStrategyIdsOverride) || !discoveryStrategyIdsOverride.length) {
      throw new TypeError('prior target candidate discovery strategies required');
    }
    edge.discoveryStrategyIds = new Set(discoveryStrategyIdsOverride.map((strategyId) => (
      requiredText(strategyId, 'prior target candidate discovery strategy')
    )));
  }
  edge.requiredAttempt ||= candidate.requiredAttempt === true;
  referenceEdges.set(key, edge);
  accumulators.edgesByReference.set(target.referenceId, referenceEdges);
}

function semanticCorrectionsByReference(runs, resolverContractsByReference) {
  const corrections = new Map();
  for (const run of runs) {
    for (const target of run.targets) {
      const currentResolverVersions = new Map(
        (resolverContractsByReference.get(target.referenceId) ?? []).map((contract) => [
          requiredText(contract.resolverId, 'resolver contract ID'),
          requiredText(contract.version, 'resolver contract version'),
        ]),
      );
      const byUrl = corrections.get(target.referenceId) ?? new Map();
      for (const resolver of target.resolvers) {
        if (resolver.completion !== 'complete') continue;
        for (const candidate of resolver.candidates) {
          if (candidate.authorityMode !== 'official') continue;
          if (currentResolverVersions.get(candidate.resolverId) !== candidate.resolverVersion) {
            continue;
          }
          const sourceUrl = normalizeHistoricalCandidateUrl(candidate.sourceUrl);
          const rows = byUrl.get(sourceUrl) ?? [];
          rows.push({
            resolverId: requiredText(candidate.resolverId, 'candidate resolver ID'),
            resolverVersion: requiredText(candidate.resolverVersion, 'candidate resolver version'),
            completedAt: run.completedAt,
            expectedContentType: expectedContentType(
              candidate.documentType ?? inferDocumentType(sourceUrl),
              sourceUrl,
            ),
          });
          byUrl.set(sourceUrl, rows);
        }
      }
      corrections.set(target.referenceId, byUrl);
    }
  }
  return corrections;
}

function isSupersededCandidateSemantic({
  referenceId,
  sourceUrl,
  priorCandidate,
  priorEdge,
  corrections,
}) {
  const rows = corrections.get(referenceId)?.get(sourceUrl) ?? [];
  if (!rows.length) return false;
  const correctedTypes = new Set(rows.map((row) => row.expectedContentType));
  if (correctedTypes.size !== 1) return false;
  const [correctedType] = correctedTypes;
  if (correctedType === priorCandidate.expectedContentType
    || correctedType === 'application/octet-stream'
    || priorCandidate.expectedContentType === 'application/octet-stream') {
    return false;
  }
  return rows.some((row) => {
    const prefix = `${row.resolverId}@`;
    const currentEpoch = `${row.resolverId}@${row.resolverVersion}`;
    const priorEpochs = (priorEdge.discoveryStrategyIds ?? [])
      .filter((strategyId) => strategyId.startsWith(prefix))
      .map((strategyId) => strategyId.split(':', 1)[0]);
    const priorResolverTimes = (priorCandidate.discoveries ?? [])
      .filter((discovery) => discovery.resolverId === row.resolverId)
      .map((discovery) => discovery.retrievedAt)
      .sort();
    const latestPriorTime = priorResolverTimes.at(-1);
    return priorEpochs.length > 0
      && !priorEpochs.includes(currentEpoch)
      && Boolean(latestPriorTime)
      && row.completedAt > latestPriorTime;
  });
}

function loadPriorCandidates(
  priorManifest,
  records,
  accumulators,
  officialCandidateValidator,
  runs,
  resolverContractsByReference,
) {
  if (priorManifest == null) return;
  if (priorManifest.schemaVersion !== 1 || !Array.isArray(priorManifest.targets)
    || !Array.isArray(priorManifest.candidates) || !Array.isArray(priorManifest.runBindings)) {
    throw new TypeError('prior historical official candidate manifest schema v1 required');
  }
  const expectedManifestSha256 = canonicalJsonSha256({
    sourceAcquisitionQueueSha256: priorManifest.sourceAcquisitionQueueSha256,
    ...(priorManifest.sourceBindings ? { sourceBindings: priorManifest.sourceBindings } : {}),
    runBindings: priorManifest.runBindings,
    candidates: priorManifest.candidates,
    targets: priorManifest.targets,
  });
  if (priorManifest.semanticManifestSha256 !== expectedManifestSha256) {
    throw new Error('prior historical official candidate manifest SHA-256 mismatch');
  }
  const currentByReference = new Map(records.map((record) => [record.referenceId, record]));
  const candidateById = uniqueMap(priorManifest.candidates, 'candidateId', 'prior candidate');
  const corrections = semanticCorrectionsByReference(runs, resolverContractsByReference);
  for (const priorTarget of priorManifest.targets) {
    const target = currentByReference.get(priorTarget.referenceId);
    if (!target) continue;
    if (normalizedBrand(priorTarget.brand) !== normalizedBrand(target.brand)
      || modelKey(priorTarget.model) !== modelKey(target.model)
      || priorTarget.category !== target.category) {
      throw new Error(`prior candidate target identity drift: ${target.referenceId}`);
    }
    for (const edge of priorTarget.candidateEdges ?? []) {
      const candidate = candidateById.get(edge.candidateId);
      if (!candidate) throw new Error(`prior target candidate missing: ${edge.candidateId}`);
      const sourceUrl = normalizeHistoricalCandidateUrl(candidate.sourceUrl);
      const priorDiscoveries = normalizePriorDiscoveries(candidate.discoveries ?? []);
      if (candidate.candidateId !== candidateId(target.brand, sourceUrl)
        || normalizedBrand(candidate.authorityBrand) !== normalizedBrand(target.brand)
        || !(candidate.applicableReferenceIds ?? []).includes(target.referenceId)
        || !priorDiscoveries.length) {
        throw new Error(`prior target candidate binding invalid: ${edge.candidateId}`);
      }
      const documentTypes = edge.documentTypes?.length
        ? edge.documentTypes
        : candidate.documentTypes;
      if (isSupersededCandidateSemantic({
        referenceId: target.referenceId,
        sourceUrl,
        priorCandidate: candidate,
        priorEdge: edge,
        corrections,
      })) {
        continue;
      }
      const sourceModelHints = edge.sourceModelHints?.length ? edge.sourceModelHints : [null];
      const sourceRoles = candidate.sourceRoles?.length
        ? candidate.sourceRoles
        : ['manufacturer_document'];
      const discoveryProvenance = priorDiscoveries
        .find((discovery) => discovery.discoveryProvenance)?.discoveryProvenance ?? null;
      if (!documentTypes?.length) {
        throw new Error(`prior target candidate document type missing: ${edge.candidateId}`);
      }
      for (const documentType of documentTypes) {
        for (const sourceModelHint of sourceModelHints) {
          for (const sourceRole of sourceRoles) {
            addCandidateObservation({
              accumulators,
              target,
              candidate: {
                sourceUrl,
                documentType,
                sourceModelHint,
                sourceRole,
                authorityMode: 'official',
                requiredAttempt: edge.requiredAttempt === true,
                discoveryProvenance,
              },
              retrievedAt: priorDiscoveries[0].retrievedAt ?? priorManifest.generatedAt,
              officialCandidateValidator,
              discoveriesOverride: priorDiscoveries,
              discoveryStrategyIdsOverride: edge.discoveryStrategyIds,
            });
          }
        }
      }
      const restored = accumulators.candidates.get(`${normalizedBrand(target.brand)}\0${sourceUrl}`);
      if (restored?.expectedContentType !== candidate.expectedContentType) {
        throw new Error(`prior target candidate content type drift: ${edge.candidateId}`);
      }
    }
  }
}

function normalizeRunBindings(priorManifest, runs) {
  const bindings = new Map();
  for (const binding of priorManifest?.runBindings ?? []) {
    const runId = requiredText(binding.runId, 'prior discovery run binding ID');
    bindings.set(runId, structuredClone(binding));
  }
  for (const run of runs) {
    const binding = {
      runId: run.runId,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      sourceAcquisitionQueueSha256: run.sourceAcquisitionQueueSha256,
      selection: structuredClone(run.selection),
      storageObject: structuredClone(run.storageObject),
      targets: run.targets.length,
    };
    const current = bindings.get(run.runId);
    if (current && canonicalJsonSha256(current) !== canonicalJsonSha256(binding)) {
      throw new Error(`discovery run binding conflict: ${run.runId}`);
    }
    bindings.set(run.runId, binding);
  }
  return [...bindings.values()].sort((left, right) => (
    left.completedAt.localeCompare(right.completedAt) || left.runId.localeCompare(right.runId)
  ));
}

function rankEdges(target, edgeMap, candidateByKey) {
  const rows = [...edgeMap.values()].map((edge) => {
    const candidate = candidateByKey.get(edge.candidateKey);
    const sourceModelHints = [...edge.sourceModelHints].sort();
    const documentTypes = [...edge.documentTypes].sort();
    const exactModelUrlSignal = urlHasExactModelSignal(candidate.sourceUrl, target.model);
    const sourceModelHintExact = sourceModelHints.some((hint) => modelKey(hint) === modelKey(target.model));
    const typeWeight = candidate.expectedContentType === 'application/pdf'
      ? 0
      : candidate.expectedContentType === 'application/json' ? 10 : 20;
    return {
      candidateId: candidate.candidateId,
      exactModelUrlSignal,
      sourceModelHintExact,
      requiredAttempt: edge.requiredAttempt,
      sourceModelHints,
      documentTypes,
      discoveryStrategyIds: [...edge.discoveryStrategyIds].sort(),
      sortWeight: (exactModelUrlSignal ? 0 : 100)
        + (sourceModelHintExact ? 0 : 40)
        + typeWeight
        + (edge.requiredAttempt ? 0 : 5),
      sourceUrl: candidate.sourceUrl,
    };
  }).sort((left, right) => left.sortWeight - right.sortWeight
    || left.sourceUrl.localeCompare(right.sourceUrl)
    || left.candidateId.localeCompare(right.candidateId));
  return rows.map(({ sortWeight, sourceUrl, ...edge }, index) => ({
    ...edge,
    sourceRank: index + 1,
  }));
}

function latestDiscoveryResults({ priorTarget, runTargets }) {
  const values = [];
  if (priorTarget?.lastDiscoveryAt) {
    values.push({
      completedAt: timestamp(priorTarget.lastDiscoveryAt, 'prior target discovery time'),
      runId: priorTarget.lastDiscoveryRunId ?? '',
      resolvers: (priorTarget.resolverResults ?? []).map(validateEvidenceSourceResolverResult),
    });
  }
  values.push(...runTargets);
  return values.sort((left, right) => (
    right.completedAt.localeCompare(left.completedAt) || right.runId.localeCompare(left.runId)
  ))[0] ?? null;
}

function validateSourceLaneTargetBindings(target, latest, officialCandidateValidator) {
  for (const resolver of latest?.resolvers ?? []) {
    if (resolver.schemaVersion !== 2) continue;
    for (const lane of resolver.sourceLanes) {
      for (const provenance of lane.provenance) {
        if (modelKey(provenance.requestedModel) !== modelKey(target.model)) {
          throw new Error(
            `source lane model binding mismatch: ${target.referenceId} ${resolver.resolverId}:${lane.laneId}`,
          );
        }
        if (requiredText(provenance.market, 'source lane market').toUpperCase() !== 'AU') {
          throw new Error(
            `source lane market binding mismatch: ${target.referenceId} ${resolver.resolverId}:${lane.laneId}`,
          );
        }
        if (!officialCandidateValidator({ sourceUrl: provenance.discoveryUrl }, target)) {
          throw new Error(
            `source lane official host binding mismatch: ${target.referenceId} ${resolver.resolverId}:${lane.laneId}`,
          );
        }
      }
    }
  }
}

function resolverOutcome(contract, latest) {
  const results = latest?.resolvers ?? [];
  const byId = new Map(results.map((result) => [result.resolverId, result]));
  const required = contract.filter((entry) => entry.required);
  const incompleteResolverIds = [];
  const incompleteSourceLaneIds = [];
  const legacyAggregateResolverIds = [];
  for (const descriptor of required) {
    const result = byId.get(descriptor.resolverId);
    if (!result || result.version !== descriptor.version || result.scope !== descriptor.scope
      || result.required !== descriptor.required) {
      incompleteResolverIds.push(descriptor.resolverId);
      continue;
    }
    if (descriptor.schemaVersion !== 2 || result.schemaVersion !== 2) {
      incompleteResolverIds.push(descriptor.resolverId);
      legacyAggregateResolverIds.push(descriptor.resolverId);
      continue;
    }
    const expectedLanes = validateOfficialSourceLaneDescriptors(descriptor.sourceLanes);
    const resultLaneById = new Map(result.sourceLanes.map((lane) => [lane.laneId, lane]));
    let resolverIncomplete = false;
    for (const lane of expectedLanes) {
      const actual = resultLaneById.get(lane.laneId);
      if (!actual
        || actual.required !== lane.required
        || actual.supported !== lane.supported
        || (lane.required && lane.supported && actual.status !== 'complete')) {
        if (lane.required && lane.supported) {
          incompleteSourceLaneIds.push(`${descriptor.resolverId}:${lane.laneId}`);
        }
        resolverIncomplete = true;
      }
    }
    if (resolverIncomplete || result.completion !== 'complete') {
      incompleteResolverIds.push(descriptor.resolverId);
    }
  }
  return {
    results,
    requiredResolverCount: required.length,
    requiredResolversComplete: required.length > 0 && incompleteResolverIds.length === 0,
    incompleteResolverIds: incompleteResolverIds.sort(),
    incompleteSourceLaneIds: incompleteSourceLaneIds.sort(),
    legacyAggregateResolverIds: legacyAggregateResolverIds.sort(),
  };
}

function manifestState(record, candidateEdges, outcome) {
  if (record.executionReadiness === 'RESEARCH_REQUIRED'
    || record.executionReadiness === 'RESOLVER_GAP'
    || outcome.requiredResolverCount === 0) return 'RESEARCH_REQUIRED';
  if (!outcome.requiredResolversComplete) return 'DISCOVERY_RETRYABLE';
  if (candidateEdges.length > 0) return 'CANDIDATES_READY';
  return 'NO_CANDIDATE_COMPLETE';
}

export function buildHistoricalOfficialCandidateManifest(input) {
  if (!input || typeof input !== 'object') throw new TypeError('historical official candidate manifest inputs required');
  const acquisitionQueue = input.acquisitionQueue;
  if (acquisitionQueue?.schemaVersion !== 1 || !Array.isArray(acquisitionQueue.records)
    || !Array.isArray(acquisitionQueue.sources)) {
    throw new TypeError('historical acquisition queue schema v1 required');
  }
  const generatedAt = timestamp(input.generatedAt, 'historical official candidate manifest generatedAt');
  const recordsByReference = uniqueMap(acquisitionQueue.records, 'referenceId', 'acquisition record');
  const sourceById = uniqueMap(acquisitionQueue.sources, 'sourceId', 'acquisition source');
  if (acquisitionQueue.summary?.queuedModels !== recordsByReference.size) {
    throw new Error('acquisition queue target count drift');
  }
  const queueSha256 = sha256(acquisitionQueue.semanticQueueSha256, 'acquisition queue semantic SHA-256');
  const sourceBindings = activeReleaseSourceBindings(acquisitionQueue.sourceBindings);
  const priorSourceBindings = activeReleaseSourceBindings(input.priorManifest?.sourceBindings);
  if (priorSourceBindings && sourceBindings
    && canonicalJsonSha256(priorSourceBindings) !== canonicalJsonSha256(sourceBindings)) {
    throw new Error('prior candidate manifest active-release source binding drift');
  }
  if (!(input.resolverContractsByReference instanceof Map)) {
    throw new TypeError('resolver contracts by reference map required');
  }
  const officialCandidateValidator = input.officialCandidateValidator ?? defaultOfficialCandidateValidator;
  if (typeof officialCandidateValidator !== 'function') throw new TypeError('official candidate validator required');
  const runs = (input.discoveryRuns ?? []).map(normalizeDiscoveryRun)
    .sort((left, right) => left.completedAt.localeCompare(right.completedAt) || left.runId.localeCompare(right.runId));
  const runBindings = normalizeRunBindings(input.priorManifest, runs);
  const accumulators = createAccumulators();
  const records = [...recordsByReference.values()];
  loadPriorCandidates(
    input.priorManifest,
    records,
    accumulators,
    officialCandidateValidator,
    runs,
    input.resolverContractsByReference,
  );
  for (const run of runs) {
    if (run.sourceAcquisitionQueueSha256 !== queueSha256) {
      throw new Error(`discovery run acquisition queue binding mismatch: ${run.runId}`);
    }
  }

  const referenceHints = new Map(records.map((record) => [record.referenceId, new Set()]));
  for (const record of records) {
    for (const sourceId of record.candidateSourceIds ?? []) {
      const source = sourceById.get(sourceId);
      if (!source) throw new Error(`acquisition source missing: ${sourceId}`);
      if (!(source.referenceIds ?? []).includes(record.referenceId)) {
        throw new Error(`acquisition source edge missing reference: ${sourceId} ${record.referenceId}`);
      }
      if (source.sourceAuthority !== 'OFFICIAL' || source.receiptEligible !== true) {
        referenceHints.get(record.referenceId).add(sourceId);
        continue;
      }
      const sourceUrl = normalizeHistoricalCandidateUrl(source.sourceUrl);
      const candidateKey = `${normalizedBrand(record.brand)}\0${sourceUrl}`;
      const existingEdge = accumulators.edgesByReference.get(record.referenceId)?.get(candidateKey);
      if (existingEdge?.discoveryStrategyIds.has(ACQUISITION_SEED_STRATEGY_ID)) continue;
      addCandidateObservation({
        accumulators,
        target: record,
        candidate: {
          sourceUrl,
          resolverId: 'acquisition-queue-seed',
          resolverVersion: '1',
          discoveryMethod: 'classified_document_link',
          documentType: inferDocumentType(source.sourceUrl),
          sourceModelHint: record.model,
          authorityMode: 'official',
          sourceRole: 'manufacturer_document',
          requiredAttempt: true,
        },
        retrievedAt: acquisitionQueue.generatedAt,
        officialCandidateValidator,
      });
    }
  }

  const runTargetsByReference = new Map();
  for (const run of runs) {
    for (const runTarget of run.targets) {
      const record = recordsByReference.get(runTarget.referenceId);
      if (!record) throw new Error(`discovery run target missing from acquisition queue: ${runTarget.referenceId}`);
      if (normalizedBrand(record.brand) !== normalizedBrand(runTarget.brand)
        || modelKey(record.model) !== modelKey(runTarget.model)
        || record.category !== runTarget.category) {
        throw new Error(`discovery run target identity drift: ${runTarget.referenceId}`);
      }
      const values = runTargetsByReference.get(runTarget.referenceId) ?? [];
      values.push({ completedAt: run.completedAt, runId: run.runId, resolvers: runTarget.resolvers });
      runTargetsByReference.set(runTarget.referenceId, values);
      for (const resolver of runTarget.resolvers) {
        for (const candidate of resolver.candidates) {
          if (candidate.authorityMode !== 'official') continue;
          addCandidateObservation({
            accumulators,
            target: record,
            candidate,
            retrievedAt: run.completedAt,
            runId: run.runId,
            runContentSha256: run.storageObject.contentSha256,
            officialCandidateValidator,
          });
        }
      }
    }
  }

  const candidateByKey = accumulators.candidates;
  const priorTargetByReference = new Map((input.priorManifest?.targets ?? []).map((target) => [
    target.referenceId, target,
  ]));
  const targets = records.map((record) => {
    const resolverContract = normalizeResolverContract(
      input.resolverContractsByReference.get(record.referenceId) ?? [],
      record.referenceId,
    );
    const latest = latestDiscoveryResults({
      priorTarget: priorTargetByReference.get(record.referenceId),
      runTargets: runTargetsByReference.get(record.referenceId) ?? [],
    });
    validateSourceLaneTargetBindings(record, latest, officialCandidateValidator);
    const outcome = resolverOutcome(resolverContract, latest);
    const candidateEdges = rankEdges(
      record,
      accumulators.edgesByReference.get(record.referenceId) ?? new Map(),
      candidateByKey,
    );
    const state = manifestState(record, candidateEdges, outcome);
    if (!MANIFEST_STATES.has(state)) throw new Error(`unknown candidate manifest state: ${state}`);
    return {
      referenceId: record.referenceId,
      acquisitionId: record.acquisitionId,
      category: record.category,
      brand: record.brand,
      model: record.model,
      lifecycleState: record.lifecycleState,
      priority: record.priority,
      route: record.route,
      executionReadiness: record.executionReadiness,
      state,
      terminal: state === 'NO_CANDIDATE_COMPLETE',
      retryableDiscovery: outcome.incompleteResolverIds.length > 0,
      resolverContract,
      resolverResults: outcome.results,
      incompleteResolverIds: outcome.incompleteResolverIds,
      incompleteSourceLaneIds: outcome.incompleteSourceLaneIds,
      legacyAggregateResolverIds: outcome.legacyAggregateResolverIds,
      lastDiscoveryRunId: latest?.runId || null,
      lastDiscoveryAt: latest?.completedAt ?? null,
      referenceHintSourceIds: [...referenceHints.get(record.referenceId)].sort(),
      candidateEdges,
    };
  }).sort((left, right) => left.priority.localeCompare(right.priority)
    || left.category.localeCompare(right.category)
    || left.brand.localeCompare(right.brand, 'en-AU', { sensitivity: 'base' })
    || left.model.localeCompare(right.model, 'en-AU', { sensitivity: 'base' })
    || left.referenceId.localeCompare(right.referenceId));

  const ranksByCandidate = new Map();
  for (const target of targets) {
    for (const edge of target.candidateEdges) {
      const ranks = ranksByCandidate.get(edge.candidateId) ?? [];
      ranks.push({ referenceId: target.referenceId, sourceRank: edge.sourceRank });
      ranksByCandidate.set(edge.candidateId, ranks);
    }
  }
  const candidates = [...candidateByKey.values()].map((candidate) => ({
    candidateId: candidate.candidateId,
    sourceUrl: candidate.sourceUrl,
    authorityBrand: candidate.authorityBrand,
    expectedContentType: candidate.expectedContentType,
    categories: [...candidate.categories].sort(),
    documentTypes: [...candidate.documentTypes].sort(),
    sourceRoles: [...candidate.sourceRoles].sort(),
    applicableReferenceIds: [...candidate.applicableReferenceIds].sort(),
    sourceRanks: (ranksByCandidate.get(candidate.candidateId) ?? [])
      .sort((left, right) => left.referenceId.localeCompare(right.referenceId)),
    discoveries: [...candidate.discoveries.values()].sort((left, right) => (
      left.retrievedAt.localeCompare(right.retrievedAt)
        || left.resolverId.localeCompare(right.resolverId)
        || left.discoveryMethod.localeCompare(right.discoveryMethod)
    )),
  })).sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  const semanticPayload = {
    sourceAcquisitionQueueSha256: queueSha256,
    ...(sourceBindings ? { sourceBindings } : {}),
    runBindings,
    candidates,
    targets,
  };
  const sourceLaneResults = targets.flatMap((target) => target.resolverResults
    .filter((result) => result.schemaVersion === 2)
    .flatMap((result) => result.sourceLanes));
  return {
    schemaVersion: 1,
    generatedAt,
    semanticManifestSha256: canonicalJsonSha256(semanticPayload),
    policy: {
      discoveryOnly: true,
      candidatesAreNotEvidenceReceipts: true,
      retailerAndRegistryHintsCannotBecomeOfficialCandidates: true,
      completeNoSourceRequiresAllCurrentRequiredResolvers: true,
      terminalZeroSourceRequiresSchemaV2SourceLanes: true,
      candidatesRequireRequiredSourceLanesComplete: true,
      legacyAggregateCompletionCannotAuthorizeTerminal: true,
    },
    ...semanticPayload,
    summary: {
      acquisitionRecords: records.length,
      targets: targets.length,
      candidates: candidates.length,
      candidateEdges: targets.reduce((sum, target) => sum + target.candidateEdges.length, 0),
      runBindings: runBindings.length,
      byState: countBy(targets, 'state'),
      schemaV2Targets: targets.filter((target) => target.resolverResults
        .some((result) => result.schemaVersion === 2)).length,
      legacyAggregateTargets: targets.filter((target) => target.legacyAggregateResolverIds.length > 0).length,
      incompleteRequiredSourceLanes: targets.reduce(
        (sum, target) => sum + target.incompleteSourceLaneIds.length,
        0,
      ),
      sourceLaneProvenanceObjects: sourceLaneResults.reduce(
        (sum, lane) => sum + lane.provenance.length,
        0,
      ),
      bySourceLaneStatus: countBy(sourceLaneResults, 'status'),
    },
  };
}
