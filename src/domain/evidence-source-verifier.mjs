import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validateDimensionEvidenceClaimsV2 } from './dimension-evidence-claim.mjs';

const manufacturerPolicy = JSON.parse(readFileSync(
  new URL('../../data/architecture-v2/policies/manufacturer-source-policy.json', import.meta.url),
  'utf8',
));
const resolutionPolicy = JSON.parse(readFileSync(
  new URL('../../data/architecture-v2/policies/evidence-resolution-policy.json', import.meta.url),
  'utf8',
));

function requiredText(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function brandKey(value) {
  return requiredText(value, 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseTime(value, label) {
  const text = requiredText(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text)) {
    throw new TypeError(`${label} must be RFC 3339 UTC`);
  }
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds)) throw new TypeError(`${label} invalid`);
  return milliseconds;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function trustedUrl(value, brand, label, options = {}) {
  let url;
  try { url = new URL(requiredText(value, label)); } catch { throw new TypeError(`${label} invalid`); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new TypeError(`${label} must use trusted HTTPS`);
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const allowed = manufacturerPolicy.brands[brandKey(brand)];
  if (!Array.isArray(allowed) || !allowed.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    throw new TypeError(`${label} is not an official host for ${brand}`);
  }
  const marketPatterns = manufacturerPolicy.marketPathPatterns?.[brandKey(brand)] ?? [];
  const marketTarget = `${url.pathname}${url.search}`;
  if (!options.hostOnly && marketPatterns.length && !marketPatterns.some((pattern) => new RegExp(pattern, 'i').test(marketTarget))) {
    throw new TypeError(`${label} does not match the Australian market`);
  }
  return url.toString();
}

export function isReleasableQuarantineReason(value) {
  const reason = String(value ?? '').trim().toLowerCase();
  return Boolean(reason) && resolutionPolicy.releasableQuarantineReasonPatterns
    .some((pattern) => new RegExp(pattern).test(reason));
}

export function isOfficialBrandUrl(value, brand) {
  try {
    trustedUrl(value, brand, 'source URL');
    return true;
  } catch {
    return false;
  }
}

export function isOfficialBrandHostUrl(value, brand) {
  try {
    trustedUrl(value, brand, 'source URL', { hostOnly: true });
    return true;
  } catch {
    return false;
  }
}

function normalizedIdentity(caseIdentity) {
  return {
    brand: requiredText(caseIdentity?.brand, 'case brand'),
    model: requiredText(caseIdentity?.model, 'case model'),
    category: requiredText(caseIdentity?.category, 'case category'),
  };
}

function normalizedSignals(signals) {
  if (!Array.isArray(signals) || signals.length < 2) throw new TypeError('two independent identity signals required');
  const result = signals.map((signal) => ({
    type: requiredText(signal?.type, 'identity signal type'),
    value: requiredText(signal?.value, 'identity signal value'),
  })).sort((left, right) => left.type.localeCompare(right.type) || left.value.localeCompare(right.value));
  if (new Set(result.map((signal) => signal.type)).size < 2) throw new TypeError('independent identity signal types required');
  return result;
}

const ALIAS_DIMENSION_FIELDS = new Set([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
]);

function normalizedSourceIdentity(source, caseIdentity, contentType) {
  const identity = normalizedIdentity(caseIdentity);
  const sourceIdentity = source?.identity;
  if (brandKey(sourceIdentity?.brand) !== brandKey(identity.brand)
    || requiredText(sourceIdentity?.model, 'source identity model').toUpperCase() !== identity.model.toUpperCase()) {
    throw new TypeError('source identity does not match case identity');
  }
  const outcome = requiredText(sourceIdentity?.outcome, 'source identity outcome');
  if (outcome === 'exact') return { ...identity, outcome: 'exact' };
  if (outcome !== 'official_marketing_alias') throw new TypeError('unsupported source identity outcome');
  if (contentType !== 'text/html') throw new TypeError('official marketing alias requires HTML evidence');
  const sourceModel = requiredText(sourceIdentity?.sourceModel, 'alias source model');
  if (sourceModel.toUpperCase().replace(/[^A-Z0-9]+/g, '')
    === identity.model.toUpperCase().replace(/[^A-Z0-9]+/g, '')) {
    throw new TypeError('alias source model must differ from target model');
  }
  if (!(source?.claims ?? []).every((claim) => ALIAS_DIMENSION_FIELDS.has(claim?.field))) {
    throw new TypeError('official marketing alias is dimensions only');
  }
  const signalTypes = new Set((source?.identitySignals ?? []).map((signal) => signal?.type));
  for (const required of ['document_title', 'canonical_source_model', 'official_alias_binding']) {
    if (!signalTypes.has(required)) throw new TypeError(`official marketing alias missing ${required}`);
  }
  return { ...identity, outcome, sourceModel };
}

function normalizedBbox(value) {
  if (!Array.isArray(value) || value.length !== 4
    || value.some((coordinate) => !Number.isFinite(coordinate) || coordinate < 0 || coordinate > 1000)
    || value[0] >= value[2] || value[1] >= value[3]) {
    throw new TypeError('claim bbox invalid');
  }
  return value.map(Number);
}

function normalizedClaimsV1(claims, contentType) {
  if (!Array.isArray(claims) || claims.length === 0) throw new TypeError('source claims required');
  return claims.map((claim) => {
    const normalized = {
      field: requiredText(claim?.field, 'claim field'),
      value: claim?.value,
      unit: requiredText(claim?.unit, 'claim unit'),
      label: requiredText(claim?.label, 'claim label'),
      quote: requiredText(claim?.quote, 'claim quote'),
    };
    if (contentType === 'application/pdf') {
      if (!Number.isInteger(claim?.page) || claim.page < 1) throw new TypeError('PDF claim page required');
      const fragmentSha256 = requiredText(claim?.fragmentSha256, 'PDF claim fragment SHA-256');
      if (!/^[a-f0-9]{64}$/.test(fragmentSha256)) throw new TypeError('PDF claim fragment SHA-256 invalid');
      normalized.page = claim.page;
      normalized.bbox = normalizedBbox(claim.bbox);
      normalized.fragmentSha256 = fragmentSha256;
      normalized.semanticBasis = requiredText(claim?.semanticBasis, 'PDF claim semantic basis');
      for (const key of ['axisOrder', 'sourceValues', 'sourceValuesMm']) {
        if (claim[key] != null) {
          if (!Array.isArray(claim[key])) throw new TypeError(`PDF claim ${key} must be an array`);
          normalized[key] = [...claim[key]];
        }
      }
      if (claim.sourceUnit != null) normalized.sourceUnit = requiredText(claim.sourceUnit, 'PDF claim source unit');
    }
    return normalized;
  }).sort((left, right) => left.field.localeCompare(right.field)
    || JSON.stringify(left.value).localeCompare(JSON.stringify(right.value)));
}

function normalizedClaimsV2(claims) {
  validateDimensionEvidenceClaimsV2(claims);
  return claims.map((claim) => ({
    field: claim.field,
    value: { ...claim.value },
    sourceLabel: claim.sourceLabel,
    sourceAxisOrder: [...claim.sourceAxisOrder],
    sourceUnit: claim.sourceUnit,
    measurementScope: claim.measurementScope,
    includesDoor: claim.includesDoor,
    includesHandle: claim.includesHandle,
    page: claim.page,
    fragmentSha256: claim.fragmentSha256,
    bbox: claim.bbox ? [...claim.bbox] : null,
  })).sort((left, right) => left.field.localeCompare(right.field)
    || JSON.stringify(left.value).localeCompare(JSON.stringify(right.value)));
}

function normalizedClaims(claims, contentType, claimSemanticsVersion = 1) {
  if (claimSemanticsVersion === 1) return normalizedClaimsV1(claims, contentType);
  if (claimSemanticsVersion === 2) return normalizedClaimsV2(claims);
  throw new TypeError('unsupported claim semantics version');
}

function normalizedDerivedArtifact(source) {
  const contentType = requiredText(source?.contentType, 'content type').toLowerCase();
  if (contentType !== 'application/pdf') return null;
  const artifact = source?.derivedArtifact;
  const required = resolutionPolicy.pdfEvidence;
  if (!artifact || artifact.schemaVersion !== 1
    || artifact.format !== required.requiredFormat
    || artifact.parserName !== required.parserName
    || artifact.parserVersion !== required.parserVersion
    || artifact.modelRevision !== required.modelRevision
    || artifact.backend !== required.backend
    || artifact.method !== required.method
    || artifact.tableEnabled !== true || artifact.formulaEnabled !== false) {
    throw new TypeError('current MinerU JSON derived artifact required');
  }
  const sourcePdfSha256 = requiredText(artifact.sourcePdfSha256, 'derived source PDF SHA-256');
  const contentSha256 = requiredText(artifact.contentSha256, 'derived JSON SHA-256');
  if (!/^[a-f0-9]{64}$/.test(sourcePdfSha256) || sourcePdfSha256 !== source.contentSha256) {
    throw new TypeError('derived artifact source PDF binding invalid');
  }
  if (!/^[a-f0-9]{64}$/.test(contentSha256)) throw new TypeError('derived JSON SHA-256 invalid');
  const expectedPrefix = `evidence/derived/mineru-json/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/`;
  const objectPath = requiredText(artifact.objectPath, 'derived JSON object path');
  if (objectPath.startsWith('/') || objectPath.split('/').includes('..')
    || !objectPath.startsWith(expectedPrefix) || !objectPath.endsWith(`/${contentSha256}.json`)) {
    throw new TypeError('content-addressed derived JSON path required');
  }
  if (!Number.isInteger(artifact.byteSize) || artifact.byteSize < 2) throw new TypeError('derived JSON byte size invalid');
  if (!Number.isInteger(artifact.pageCount) || artifact.pageCount < 1) throw new TypeError('derived JSON page count invalid');
  return {
    schemaVersion: 1,
    format: artifact.format,
    parserName: artifact.parserName,
    parserVersion: artifact.parserVersion,
    modelRevision: artifact.modelRevision,
    backend: artifact.backend,
    method: artifact.method,
    tableEnabled: true,
    formulaEnabled: false,
    sourcePdfSha256,
    contentSha256,
    objectPath,
    byteSize: artifact.byteSize,
    pageCount: artifact.pageCount,
  };
}

function normalizedSupersededHashes(values) {
  if (values == null) return [];
  if (!Array.isArray(values)) throw new TypeError('superseded source hashes must be an array');
  const hashes = [...new Set(values.map((value) => requiredText(value, 'superseded source hash'))) ].sort();
  if (hashes.some((hash) => !/^[a-f0-9]{64}$/.test(hash))) throw new TypeError('superseded source hash invalid');
  return hashes;
}

function receiptContract(claimSemanticsVersion) {
  if (claimSemanticsVersion === 1) {
    return {
      schemaVersion: resolutionPolicy.receiptSchemaVersion,
      policyVersion: resolutionPolicy.policyVersion,
      claimSemanticsVersion: null,
    };
  }
  if (claimSemanticsVersion === resolutionPolicy.claimSemanticsVersion) {
    return {
      schemaVersion: resolutionPolicy.claimSemanticsReceiptSchemaVersion,
      policyVersion: resolutionPolicy.claimSemanticsPolicyVersion,
      claimSemanticsVersion,
    };
  }
  throw new TypeError('unsupported claim semantics version');
}

function receiptPayload(source, caseIdentity, verifiedAt, claimSemanticsVersion = 1) {
  const identity = normalizedIdentity(caseIdentity);
  const contentType = requiredText(source?.contentType, 'content type').toLowerCase();
  const contract = receiptContract(claimSemanticsVersion);
  return {
    schemaVersion: contract.schemaVersion,
    ...(contract.claimSemanticsVersion === null ? {} : {
      claimSemanticsVersion: contract.claimSemanticsVersion,
    }),
    policyVersion: contract.policyVersion,
    manufacturerPolicyVersion: manufacturerPolicy.policyVersion,
    verifiedAt,
    caseIdentity: identity,
    sourceIdentity: normalizedSourceIdentity(source, identity, contentType),
    source: {
      requestedUrl: trustedUrl(source?.sourceUrl, identity.brand, 'source URL'),
      finalUrl: trustedUrl(source?.finalUrl, identity.brand, 'final URL', { hostOnly: true }),
      redirectChain: (source?.redirectChain ?? []).map((url, index) => trustedUrl(url, identity.brand, `redirect ${index + 1}`, { hostOnly: true })),
      retrievedAt: requiredText(source?.retrievedAt, 'retrieval time'),
      contentSha256: requiredText(source?.contentSha256, 'content SHA-256'),
      objectPath: requiredText(source?.objectPath, 'object path'),
      contentType,
      byteSize: source?.byteSize,
      supersedesContentSha256: normalizedSupersededHashes(source?.supersedesContentSha256),
      derivedArtifact: normalizedDerivedArtifact(source),
    },
    identitySignals: normalizedSignals(source?.identitySignals),
    claims: normalizedClaims(source?.claims, contentType, claimSemanticsVersion),
  };
}

export function validateTrustedSourceMetadata(source, caseIdentity, options = {}) {
  const identity = normalizedIdentity(caseIdentity);
  if (source?.authority !== 'manufacturer') throw new TypeError('manufacturer authority required');
  trustedUrl(source?.sourceUrl, identity.brand, 'source URL');
  trustedUrl(source?.finalUrl, identity.brand, 'final URL', { hostOnly: true });
  const redirects = source?.redirectChain ?? [];
  if (!Array.isArray(redirects) || redirects.length > resolutionPolicy.maximumRedirects) {
    throw new TypeError('redirect chain invalid');
  }
  redirects.forEach((url, index) => trustedUrl(url, identity.brand, `redirect ${index + 1}`, { hostOnly: true }));
  const retrievedAt = parseTime(source?.retrievedAt, 'retrieval time');
  const asOf = parseTime(options.asOf ?? new Date().toISOString(), 'evaluation time');
  const futureSkew = resolutionPolicy.maximumFutureClockSkewMinutes * 60 * 1000;
  if (retrievedAt > asOf + futureSkew) throw new TypeError('retrieval time is in the future');
  const maxAge = manufacturerPolicy.maxEvidenceAgeDays * 24 * 60 * 60 * 1000;
  if (asOf - retrievedAt > maxAge) throw new TypeError('source evidence is stale');
  if (!/^[a-f0-9]{64}$/.test(requiredText(source?.contentSha256, 'content SHA-256'))) {
    throw new TypeError('content SHA-256 invalid');
  }
  const expectedPrefix = `evidence/web/sha256/${source.contentSha256.slice(0, 2)}/${source.contentSha256.slice(2, 4)}/`;
  const objectPath = requiredText(source?.objectPath, 'object path');
  if (objectPath.startsWith('/') || objectPath.split('/').includes('..')
    || !objectPath.startsWith(expectedPrefix) || !objectPath.includes(source.contentSha256)) {
    throw new TypeError('content-addressed object path required');
  }
  if (!Number.isInteger(source?.byteSize) || source.byteSize <= 0) throw new TypeError('positive byte size required');
  if (normalizedSupersededHashes(source?.supersedesContentSha256).includes(source.contentSha256)) {
    throw new TypeError('source cannot supersede itself');
  }
  const contentType = requiredText(source?.contentType, 'content type').toLowerCase();
  if (!['text/html', 'application/pdf'].includes(contentType)) {
    throw new TypeError('unsupported content type');
  }
  normalizedSourceIdentity(source, identity, contentType);
  normalizedSignals(source?.identitySignals);
  const claimSemanticsVersion = options.claimSemanticsVersion
    ?? source?.verificationReceipt?.claimSemanticsVersion
    ?? 1;
  normalizedClaims(source?.claims, contentType, claimSemanticsVersion);
  normalizedDerivedArtifact(source);
  return true;
}

export function isSourceFresh(source, asOf) {
  try {
    const retrievedAt = parseTime(source?.retrievedAt, 'retrieval time');
    const evaluatedAt = parseTime(asOf, 'evaluation time');
    const futureSkew = resolutionPolicy.maximumFutureClockSkewMinutes * 60 * 1000;
    const maxAge = manufacturerPolicy.maxEvidenceAgeDays * 24 * 60 * 60 * 1000;
    return retrievedAt <= evaluatedAt + futureSkew && evaluatedAt - retrievedAt <= maxAge;
  } catch {
    return false;
  }
}

export function createVerificationReceipt(source, caseIdentity, options = {}) {
  const verifiedAt = requiredText(options.verifiedAt, 'verification time');
  const verifiedMilliseconds = parseTime(verifiedAt, 'verification time');
  const claimSemanticsVersion = options.claimSemanticsVersion ?? 1;
  validateTrustedSourceMetadata(source, caseIdentity, { asOf: verifiedAt, claimSemanticsVersion });
  if (verifiedMilliseconds < parseTime(source.retrievedAt, 'retrieval time')) {
    throw new TypeError('verification time precedes retrieval time');
  }
  const payload = receiptPayload(source, caseIdentity, verifiedAt, claimSemanticsVersion);
  return Object.freeze({
    schemaVersion: payload.schemaVersion,
    ...(claimSemanticsVersion === 1 ? {} : { claimSemanticsVersion }),
    policyVersion: payload.policyVersion,
    manufacturerPolicyVersion: payload.manufacturerPolicyVersion,
    verifiedAt,
    bindingSha256: digest(payload),
  });
}

export function verifyVerificationReceipt(source, caseIdentity, options = {}) {
  const receipt = source?.verificationReceipt;
  const claimSemanticsVersion = receipt?.schemaVersion === resolutionPolicy.receiptSchemaVersion
    ? 1
    : receipt?.schemaVersion === resolutionPolicy.claimSemanticsReceiptSchemaVersion
      ? receipt?.claimSemanticsVersion
      : null;
  let contract;
  try { contract = receiptContract(claimSemanticsVersion); } catch { contract = null; }
  if (!receipt || !contract || receipt.schemaVersion !== contract.schemaVersion
    || receipt.policyVersion !== contract.policyVersion
    || receipt.manufacturerPolicyVersion !== manufacturerPolicy.policyVersion) {
    throw new TypeError('current verification receipt required');
  }
  parseTime(receipt.verifiedAt, 'verification time');
  validateTrustedSourceMetadata(source, caseIdentity, {
    asOf: options.asOf ?? receipt.verifiedAt,
    claimSemanticsVersion,
  });
  const expected = digest(receiptPayload(source, caseIdentity, receipt.verifiedAt, claimSemanticsVersion));
  if (receipt.bindingSha256 !== expected) throw new Error('verification receipt digest mismatch');
  return true;
}

export const evidenceSourcePolicy = Object.freeze({
  manufacturerPolicy: Object.freeze(manufacturerPolicy),
  resolutionPolicy: Object.freeze(resolutionPolicy),
});
