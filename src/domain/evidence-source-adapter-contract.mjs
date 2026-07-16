const COMPLETION_STATES = new Set(['complete', 'truncated', 'timed_out', 'failed', 'unknown']);
const AUTHORITY_MODES = new Set(['official', 'reference']);
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
]);
const FAILURE_KEYS = new Set(['code', 'sourceUrl', 'message']);

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
  if (value.schemaVersion !== 1) throw new TypeError('resolver schemaVersion must be 1');
  const resolverId = requiredText(value.resolverId, 'resolver ID');
  const version = requiredText(value.version, 'resolver version');
  const completion = requiredText(value.completion, 'resolver completion state');
  if (!COMPLETION_STATES.has(completion)) {
    throw new TypeError(`resolver completion state invalid: ${completion}`);
  }
  if (typeof value.required !== 'boolean') throw new TypeError('resolver required must be boolean');
  if (!Array.isArray(value.candidates)) throw new TypeError('resolver candidates must be an array');
  if (!Array.isArray(value.failures)) throw new TypeError('resolver failures must be an array');
  const candidates = value.candidates.map((candidate) => validateEvidenceSourceCandidate(candidate, {
    resolverId,
    version,
  }));
  const failures = value.failures.map(validateFailure);
  if (completion === 'complete' && failures.length) {
    throw new TypeError('resolver cannot be complete while partial failures remain');
  }
  const candidateKeys = candidates.map((candidate) => `${candidate.authorityMode}\0${candidate.sourceUrl}`);
  if (new Set(candidateKeys).size !== candidateKeys.length) {
    throw new TypeError('duplicate candidate in resolver result');
  }
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

export function createEvidenceSourceResolverAdapter({
  resolverId,
  version,
  scope,
  required = true,
  resolve,
}) {
  const descriptor = {
    resolverId: requiredText(resolverId, 'resolver ID'),
    version: requiredText(version, 'resolver version'),
    scope: requiredText(scope, 'resolver scope'),
    required: Boolean(required),
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
      return validateEvidenceSourceResolverResult({
        schemaVersion: 1,
        ...descriptor,
        completion: raw.completion ?? 'unknown',
        candidates,
        failures: raw.failures ?? [],
      });
    },
  });
}
