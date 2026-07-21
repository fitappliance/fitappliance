const COMPLETION_STATES = new Set(['complete', 'truncated', 'timed_out', 'failed', 'unknown']);
const LANE_COMPLETION_STATES = new Set(['complete', 'retryable', 'unsupported']);
const AUTHORITY_MODES = new Set(['official', 'reference']);
export const OFFICIAL_SOURCE_LANE_IDS = Object.freeze([
  'current_product',
  'discontinued_archive',
  'support_search_api',
  'official_document_cdn',
  'official_product_detail',
]);
const OFFICIAL_SOURCE_LANE_ID_SET = new Set(OFFICIAL_SOURCE_LANE_IDS);
const CANDIDATE_KEYS = new Set([
  'sourceUrl',
  'resolverId',
  'resolverVersion',
  'discoveryMethod',
  'documentType',
  'sourceModelHint',
  'authorityMode',
  'sourceRole',
  'requiredAttempt',
  'batchJobId',
  'discoveryProvenance',
  'sourceLaneId',
]);
const RESULT_KEYS = new Set([
  'schemaVersion',
  'resolverId',
  'version',
  'scope',
  'required',
  'completion',
  'candidates',
  'failures',
  'sourceLanes',
]);
const FAILURE_KEYS = new Set(['code', 'sourceUrl', 'message']);
const SOURCE_LANE_DESCRIPTOR_KEYS = new Set(['laneId', 'required', 'supported']);
const SOURCE_LANE_KEYS = new Set([
  ...SOURCE_LANE_DESCRIPTOR_KEYS,
  'status',
  'candidateCount',
  'provenance',
  'reason',
]);
const SOURCE_LANE_PROVENANCE_KEYS = new Set([
  'schemaVersion',
  'method',
  'market',
  'discoveryUrl',
  'requestedModel',
  'contentType',
  'contentSha256',
  'objectPath',
  'byteSize',
]);
const SOURCE_LANE_CONTENT_EXTENSIONS = new Map([
  ['application/json', 'json'],
  ['application/xml', 'xml'],
  ['text/xml', 'xml'],
  ['text/html', 'html'],
]);

function sourceLaneOrder(left, right) {
  return OFFICIAL_SOURCE_LANE_IDS.indexOf(left.laneId) - OFFICIAL_SOURCE_LANE_IDS.indexOf(right.laneId);
}

function requiredText(value, label) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function rejectUnknownKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new TypeError(`${label} contains unknown or parsed fields: ${unknown.sort().join(', ')}`);
  }
}

function canonicalHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(requiredText(value, label));
  } catch {
    throw new TypeError(`${label} must be an absolute URL`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError(`${label} must use trusted HTTPS`);
  }
  url.hash = '';
  return url.toString();
}

function optionalText(value, label) {
  if (value === null || value === undefined) return null;
  return requiredText(value, label);
}

function optionalDiscoveryProvenance(value) {
  if (value === null || value === undefined) return null;
  assertRecord(value, 'candidate discovery provenance');
  const keys = new Set([
    'schemaVersion', 'method', 'market', 'sourceMarket', 'discoveryUrl', 'requestedModel', 'matchedModel',
    'artifactUrl', 'artifactLinkUrl', 'discoveryContentSha256', 'discoveryObjectPath',
    'discoveryByteSize', 'discoveryRecordType', 'documentId', 'documentTitleKey', 'originalFileName',
  ]);
  rejectUnknownKeys(value, keys, 'candidate discovery provenance');
  if (value.schemaVersion !== 1) throw new TypeError('candidate discovery provenance schema invalid');
  const result = {
    schemaVersion: 1,
    method: requiredText(value.method, 'candidate discovery method'),
    market: requiredText(value.market, 'candidate discovery market'),
    ...(value.sourceMarket ? {
      sourceMarket: requiredText(value.sourceMarket, 'candidate discovery source market'),
    } : {}),
    discoveryUrl: canonicalHttpsUrl(value.discoveryUrl, 'candidate discovery URL'),
    requestedModel: requiredText(value.requestedModel, 'candidate discovery requested model'),
    matchedModel: requiredText(value.matchedModel, 'candidate discovery matched model'),
    artifactUrl: canonicalHttpsUrl(value.artifactUrl, 'candidate discovery artifact URL'),
    ...(value.documentId ? { documentId: requiredText(value.documentId, 'candidate discovery document ID') } : {}),
    ...(value.originalFileName ? { originalFileName: requiredText(value.originalFileName, 'candidate discovery filename') } : {}),
  };
  if (result.method === 'official_product_page') {
    const hash = requiredText(value.discoveryContentSha256, 'candidate discovery content SHA-256');
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new TypeError('candidate discovery content SHA-256 invalid');
    const objectPath = requiredText(value.discoveryObjectPath, 'candidate discovery object path');
    const expectedPath = `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.html`;
    if (objectPath !== expectedPath) throw new TypeError('candidate discovery object path invalid');
    if (!Number.isInteger(value.discoveryByteSize) || value.discoveryByteSize <= 0) {
      throw new TypeError('candidate discovery byte size invalid');
    }
    Object.assign(result, {
      artifactLinkUrl: canonicalHttpsUrl(value.artifactLinkUrl, 'candidate discovery artifact link URL'),
      discoveryContentSha256: hash,
      discoveryObjectPath: objectPath,
      discoveryByteSize: value.discoveryByteSize,
    });
    if (value.discoveryRecordType != null || value.documentTitleKey != null) {
      if (value.discoveryRecordType !== 'serialized_technical_document_manifest') {
        throw new TypeError('candidate product-page discovery record type invalid');
      }
      Object.assign(result, {
        discoveryRecordType: value.discoveryRecordType,
        documentId: requiredText(value.documentId, 'candidate discovery document ID'),
        documentTitleKey: requiredText(value.documentTitleKey, 'candidate discovery document title key'),
        originalFileName: requiredText(value.originalFileName, 'candidate discovery filename'),
      });
    }
  } else if (['official_market_api', 'official_support_api'].includes(result.method)
    && value.discoveryContentSha256) {
    const hash = requiredText(value.discoveryContentSha256, 'candidate discovery content SHA-256');
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new TypeError('candidate discovery content SHA-256 invalid');
    const objectPath = requiredText(value.discoveryObjectPath, 'candidate discovery object path');
    const expectedPath = `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`;
    if (objectPath !== expectedPath) throw new TypeError('candidate discovery object path invalid');
    if (!Number.isInteger(value.discoveryByteSize) || value.discoveryByteSize <= 0) {
      throw new TypeError('candidate discovery byte size invalid');
    }
    Object.assign(result, {
      discoveryContentSha256: hash,
      discoveryObjectPath: objectPath,
      discoveryByteSize: value.discoveryByteSize,
      ...(result.method === 'official_support_api' ? {
        artifactLinkUrl: canonicalHttpsUrl(value.artifactLinkUrl, 'candidate discovery artifact link URL'),
      } : {}),
    });
    if (result.method === 'official_support_api' && value.discoveryRecordType != null) {
      if (value.discoveryRecordType !== 'support_document_resource') {
        throw new TypeError('candidate support API discovery record type invalid');
      }
      Object.assign(result, {
        discoveryRecordType: value.discoveryRecordType,
        documentId: requiredText(value.documentId, 'candidate discovery document ID'),
        documentTitleKey: requiredText(value.documentTitleKey, 'candidate discovery document title key'),
        originalFileName: requiredText(value.originalFileName, 'candidate discovery filename'),
      });
    }
  }
  if (!['official_product_page', 'official_support_api'].includes(result.method)
    && (value.discoveryRecordType != null || value.documentTitleKey != null)) {
    throw new TypeError('candidate serialized manifest record requires product-page discovery');
  }
  return result;
}

function sourceLaneDescriptor(value) {
  assertRecord(value, 'official source lane descriptor');
  rejectUnknownKeys(value, SOURCE_LANE_DESCRIPTOR_KEYS, 'official source lane descriptor');
  const laneId = requiredText(value.laneId, 'official source lane ID');
  if (!OFFICIAL_SOURCE_LANE_ID_SET.has(laneId)) {
    throw new TypeError(`official source lane ID invalid: ${laneId}`);
  }
  if (typeof value.required !== 'boolean' || typeof value.supported !== 'boolean') {
    throw new TypeError('official source lane required/supported flags must be boolean');
  }
  if (value.required && !value.supported) {
    throw new TypeError(`unsupported official source lane cannot be required: ${laneId}`);
  }
  return { laneId, required: value.required, supported: value.supported };
}

export function validateOfficialSourceLaneDescriptors(values) {
  if (!Array.isArray(values)) throw new TypeError('official source lane descriptors must be an array');
  const normalized = values.map(sourceLaneDescriptor)
    .sort(sourceLaneOrder);
  const laneIds = normalized.map((lane) => lane.laneId);
  if (new Set(laneIds).size !== laneIds.length) {
    throw new TypeError('duplicate official source lane descriptor');
  }
  const missing = OFFICIAL_SOURCE_LANE_IDS.filter((laneId) => !laneIds.includes(laneId));
  if (missing.length) {
    throw new TypeError(`official source lane descriptors incomplete: ${missing.join(', ')}`);
  }
  return normalized;
}

function sourceLaneProvenance(value) {
  assertRecord(value, 'official source lane provenance');
  rejectUnknownKeys(value, SOURCE_LANE_PROVENANCE_KEYS, 'official source lane provenance');
  if (value.schemaVersion !== 1) throw new TypeError('official source lane provenance schema invalid');
  const contentType = requiredText(value.contentType, 'official source lane content type').toLowerCase();
  const extension = SOURCE_LANE_CONTENT_EXTENSIONS.get(contentType);
  if (!extension) throw new TypeError(`official source lane content type unsupported: ${contentType}`);
  const contentSha256 = requiredText(value.contentSha256, 'official source lane content SHA-256');
  if (!/^[a-f0-9]{64}$/.test(contentSha256)) {
    throw new TypeError('official source lane content SHA-256 invalid');
  }
  const objectPath = requiredText(value.objectPath, 'official source lane object path');
  const expectedPath = `evidence/web/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.${extension}`;
  if (objectPath !== expectedPath) throw new TypeError('official source lane object path invalid');
  if (!Number.isInteger(value.byteSize) || value.byteSize <= 0) {
    throw new TypeError('official source lane byte size invalid');
  }
  return {
    schemaVersion: 1,
    method: requiredText(value.method, 'official source lane method'),
    market: requiredText(value.market, 'official source lane market'),
    discoveryUrl: canonicalHttpsUrl(value.discoveryUrl, 'official source lane discovery URL'),
    requestedModel: requiredText(value.requestedModel, 'official source lane requested model'),
    contentType,
    contentSha256,
    objectPath,
    byteSize: value.byteSize,
  };
}

function validateSourceLaneResult(value) {
  assertRecord(value, 'official source lane result');
  rejectUnknownKeys(value, SOURCE_LANE_KEYS, 'official source lane result');
  const descriptor = sourceLaneDescriptor({
    laneId: value.laneId,
    required: value.required,
    supported: value.supported,
  });
  const status = requiredText(value.status, 'official source lane status');
  if (!LANE_COMPLETION_STATES.has(status)) {
    throw new TypeError(`official source lane status invalid: ${status}`);
  }
  if (!Number.isInteger(value.candidateCount) || value.candidateCount < 0) {
    throw new TypeError('official source lane candidate count must be a non-negative integer');
  }
  if (!Array.isArray(value.provenance)) {
    throw new TypeError('official source lane provenance must be an array');
  }
  const provenance = value.provenance.map(sourceLaneProvenance)
    .sort((left, right) => left.discoveryUrl.localeCompare(right.discoveryUrl)
      || left.contentSha256.localeCompare(right.contentSha256));
  const provenanceKeys = provenance.map((entry) => (
    `${entry.method}\0${entry.discoveryUrl}\0${entry.contentSha256}`
  ));
  if (new Set(provenanceKeys).size !== provenanceKeys.length) {
    throw new TypeError(`duplicate official source lane provenance: ${descriptor.laneId}`);
  }
  const reason = value.reason == null ? null : requiredText(value.reason, 'official source lane reason');
  if (!descriptor.supported) {
    if (status !== 'unsupported') {
      throw new TypeError(`unsupported official source lane must report unsupported: ${descriptor.laneId}`);
    }
    if (descriptor.required) {
      throw new TypeError(`unsupported official source lane cannot be required: ${descriptor.laneId}`);
    }
    if (value.candidateCount !== 0 || provenance.length || !reason) {
      throw new TypeError(`unsupported official source lane must have zero candidates, no provenance, and a reason: ${descriptor.laneId}`);
    }
  } else {
    if (status === 'unsupported') {
      throw new TypeError(`supported official source lane cannot report unsupported: ${descriptor.laneId}`);
    }
    if (status === 'complete' && provenance.length === 0) {
      throw new TypeError(`complete official source lane requires immutable provenance: ${descriptor.laneId}`);
    }
    if (status === 'complete' && reason !== null) {
      throw new TypeError(`complete official source lane cannot carry a failure reason: ${descriptor.laneId}`);
    }
    if (status === 'retryable' && !reason) {
      throw new TypeError(`retryable official source lane requires a reason: ${descriptor.laneId}`);
    }
  }
  return {
    ...descriptor,
    status,
    candidateCount: value.candidateCount,
    provenance,
    reason,
  };
}

export function validateEvidenceSourceCandidate(value, expected = {}) {
  assertRecord(value, 'evidence source candidate');
  rejectUnknownKeys(value, CANDIDATE_KEYS, 'evidence source candidate');
  const authorityMode = requiredText(value.authorityMode, 'candidate authority mode');
  if (!AUTHORITY_MODES.has(authorityMode)) {
    throw new TypeError(`candidate authority mode invalid: ${authorityMode}`);
  }
  if (typeof value.requiredAttempt !== 'boolean') {
    throw new TypeError('candidate requiredAttempt must be boolean');
  }
  const resolverId = requiredText(value.resolverId, 'candidate resolver ID');
  const resolverVersion = requiredText(value.resolverVersion, 'candidate resolver version');
  if (expected.resolverId && resolverId !== expected.resolverId) {
    throw new TypeError('candidate resolver ID does not match resolver result');
  }
  if (expected.version && resolverVersion !== expected.version) {
    throw new TypeError('candidate resolver version does not match resolver result');
  }
  const sourceLaneId = value.sourceLaneId == null
    ? null
    : requiredText(value.sourceLaneId, 'candidate official source lane ID');
  if (sourceLaneId && !OFFICIAL_SOURCE_LANE_ID_SET.has(sourceLaneId)) {
    throw new TypeError(`candidate official source lane ID invalid: ${sourceLaneId}`);
  }
  if (expected.schemaVersion === 2 && !sourceLaneId) {
    throw new TypeError('schema-v2 candidate official source lane ID required');
  }
  if ((expected.schemaVersion ?? 1) === 1 && sourceLaneId) {
    throw new TypeError('schema-v1 candidate cannot declare an official source lane');
  }
  const discoveryProvenance = optionalDiscoveryProvenance(value.discoveryProvenance);
  return {
    sourceUrl: canonicalHttpsUrl(value.sourceUrl, 'candidate source URL'),
    resolverId,
    resolverVersion,
    discoveryMethod: requiredText(value.discoveryMethod, 'candidate discovery method'),
    documentType: requiredText(value.documentType, 'candidate document type'),
    sourceModelHint: optionalText(value.sourceModelHint, 'candidate source-model hint'),
    authorityMode,
    sourceRole: requiredText(value.sourceRole, 'candidate source role'),
    requiredAttempt: value.requiredAttempt,
    batchJobId: optionalText(value.batchJobId, 'candidate batch job ID'),
    ...(sourceLaneId ? { sourceLaneId } : {}),
    ...(discoveryProvenance ? { discoveryProvenance } : {}),
  };
}

function validateFailure(value) {
  assertRecord(value, 'resolver failure');
  rejectUnknownKeys(value, FAILURE_KEYS, 'resolver failure');
  return {
    code: requiredText(value.code, 'resolver failure code'),
    ...(value.sourceUrl ? { sourceUrl: canonicalHttpsUrl(value.sourceUrl, 'resolver failure URL') } : {}),
    ...(value.message ? { message: requiredText(value.message, 'resolver failure message') } : {}),
  };
}

export function validateEvidenceSourceResolverResult(value) {
  assertRecord(value, 'evidence source resolver result');
  rejectUnknownKeys(value, RESULT_KEYS, 'evidence source resolver result');
  if (![1, 2].includes(value.schemaVersion)) throw new TypeError('resolver schemaVersion must be 1 or 2');
  const schemaVersion = value.schemaVersion;
  const resolverId = requiredText(value.resolverId, 'resolver ID');
  const version = requiredText(value.version, 'resolver version');
  const completion = requiredText(value.completion, 'resolver completion state');
  if (schemaVersion === 1 && !COMPLETION_STATES.has(completion)) {
    throw new TypeError(`resolver completion state invalid: ${completion}`);
  }
  if (schemaVersion === 2 && !['complete', 'retryable'].includes(completion)) {
    throw new TypeError(`schema-v2 resolver completion state invalid: ${completion}`);
  }
  if (typeof value.required !== 'boolean') throw new TypeError('resolver required must be boolean');
  if (!Array.isArray(value.candidates)) throw new TypeError('resolver candidates must be an array');
  if (!Array.isArray(value.failures)) throw new TypeError('resolver failures must be an array');
  const candidates = value.candidates.map((candidate) => validateEvidenceSourceCandidate(candidate, {
    resolverId,
    version,
    schemaVersion,
  }));
  const failures = value.failures.map(validateFailure);
  if (schemaVersion === 1 && completion === 'complete' && failures.length) {
    throw new TypeError('resolver cannot be complete while partial failures remain');
  }
  const candidateKeys = candidates.map((candidate) => (
    [
      candidate.authorityMode,
      candidate.sourceLaneId ?? '',
      candidate.sourceUrl,
      candidate.discoveryProvenance?.discoveryUrl ?? '',
      candidate.discoveryProvenance?.discoveryContentSha256 ?? '',
      candidate.discoveryProvenance?.documentId ?? '',
    ].join('\0')
  ));
  if (new Set(candidateKeys).size !== candidateKeys.length) {
    throw new TypeError('duplicate candidate in resolver result');
  }
  if (schemaVersion === 1) {
    if (value.sourceLanes != null) throw new TypeError('schema-v1 resolver cannot declare source lanes');
    return {
      schemaVersion: 1,
      resolverId,
      version,
      scope: requiredText(value.scope, 'resolver scope'),
      required: value.required,
      completion,
      candidates,
      failures,
    };
  }
  const sourceLanes = (value.sourceLanes ?? []).map(validateSourceLaneResult)
    .sort(sourceLaneOrder);
  const descriptors = validateOfficialSourceLaneDescriptors(sourceLanes.map((lane) => ({
    laneId: lane.laneId,
    required: lane.required,
    supported: lane.supported,
  })));
  const laneById = new Map(sourceLanes.map((lane) => [lane.laneId, lane]));
  for (const candidate of candidates) {
    const lane = laneById.get(candidate.sourceLaneId);
    if (!lane || !lane.supported) {
      throw new TypeError(`candidate official source lane is not supported: ${candidate.sourceLaneId}`);
    }
  }
  for (const descriptor of descriptors) {
    const lane = laneById.get(descriptor.laneId);
    const actualCandidateCount = candidates.filter((candidate) => (
      candidate.sourceLaneId === descriptor.laneId
    )).length;
    if (lane.candidateCount !== actualCandidateCount) {
      throw new TypeError(`official source lane candidate count mismatch: ${descriptor.laneId}`);
    }
  }
  const requiredSupported = sourceLanes.filter((lane) => lane.required && lane.supported);
  if (value.required && requiredSupported.length === 0) {
    throw new TypeError('required schema-v2 resolver must have a required supported source lane');
  }
  const expectedCompletion = requiredSupported.every((lane) => lane.status === 'complete')
    ? 'complete'
    : 'retryable';
  if (completion !== expectedCompletion) {
    throw new TypeError(`schema-v2 resolver completion does not match required source lanes: expected ${expectedCompletion}`);
  }
  return {
    schemaVersion: 2,
    resolverId,
    version,
    scope: requiredText(value.scope, 'resolver scope'),
    required: value.required,
    completion,
    sourceLanes,
    candidates,
    failures,
  };
}

export function createEvidenceSourceResolverAdapter({
  resolverId,
  version,
  scope,
  required = true,
  sourceLanes = null,
  resolve,
}) {
  const normalizedSourceLanes = sourceLanes == null
    ? null
    : validateOfficialSourceLaneDescriptors(sourceLanes);
  const descriptor = {
    resolverId: requiredText(resolverId, 'resolver ID'),
    version: requiredText(version, 'resolver version'),
    scope: requiredText(scope, 'resolver scope'),
    required: Boolean(required),
    ...(normalizedSourceLanes ? {
      schemaVersion: 2,
      sourceLanes: normalizedSourceLanes,
    } : {}),
  };
  if (typeof resolve !== 'function') throw new TypeError('resolver implementation required');
  return Object.freeze({
    ...descriptor,
    async resolve(caseRecord) {
      const raw = await resolve(structuredClone(caseRecord));
      assertRecord(raw, `${descriptor.resolverId} resolver output`);
      const candidates = (raw.candidates ?? []).map((candidate) => ({
        ...candidate,
        resolverId: candidate.resolverId ?? descriptor.resolverId,
        resolverVersion: candidate.resolverVersion ?? descriptor.version,
        batchJobId: candidate.batchJobId ?? null,
      }));
      const schemaVersion = normalizedSourceLanes ? 2 : 1;
      return validateEvidenceSourceResolverResult({
        schemaVersion,
        ...descriptor,
        completion: raw.completion ?? 'unknown',
        ...(normalizedSourceLanes ? {
          sourceLanes: raw.sourceLanes,
        } : {}),
        candidates,
        failures: raw.failures ?? [],
      });
    },
  });
}
