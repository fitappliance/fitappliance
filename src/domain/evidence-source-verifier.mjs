import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

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

function trustedUrl(value, brand, label) {
  let url;
  try { url = new URL(requiredText(value, label)); } catch { throw new TypeError(`${label} invalid`); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new TypeError(`${label} must use trusted HTTPS`);
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const allowed = manufacturerPolicy.brands[brandKey(brand)];
  if (!Array.isArray(allowed) || !allowed.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    throw new TypeError(`${label} is not an official host for ${brand}`);
  }
  const marketPatterns = manufacturerPolicy.marketPathPatterns?.[brandKey(brand)] ?? [];
  if (marketPatterns.length && !marketPatterns.some((pattern) => new RegExp(pattern, 'i').test(url.pathname))) {
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

function normalizedClaims(claims) {
  if (!Array.isArray(claims) || claims.length === 0) throw new TypeError('source claims required');
  return claims.map((claim) => ({
    field: requiredText(claim?.field, 'claim field'),
    value: claim?.value,
    unit: requiredText(claim?.unit, 'claim unit'),
    label: requiredText(claim?.label, 'claim label'),
    quote: requiredText(claim?.quote, 'claim quote'),
  })).sort((left, right) => left.field.localeCompare(right.field)
    || JSON.stringify(left.value).localeCompare(JSON.stringify(right.value)));
}

function normalizedSupersededHashes(values) {
  if (values == null) return [];
  if (!Array.isArray(values)) throw new TypeError('superseded source hashes must be an array');
  const hashes = [...new Set(values.map((value) => requiredText(value, 'superseded source hash'))) ].sort();
  if (hashes.some((hash) => !/^[a-f0-9]{64}$/.test(hash))) throw new TypeError('superseded source hash invalid');
  return hashes;
}

function receiptPayload(source, caseIdentity, verifiedAt) {
  const identity = normalizedIdentity(caseIdentity);
  return {
    schemaVersion: resolutionPolicy.receiptSchemaVersion,
    policyVersion: resolutionPolicy.policyVersion,
    manufacturerPolicyVersion: manufacturerPolicy.policyVersion,
    verifiedAt,
    caseIdentity: identity,
    source: {
      requestedUrl: trustedUrl(source?.sourceUrl, identity.brand, 'source URL'),
      finalUrl: trustedUrl(source?.finalUrl, identity.brand, 'final URL'),
      redirectChain: (source?.redirectChain ?? []).map((url, index) => trustedUrl(url, identity.brand, `redirect ${index + 1}`)),
      retrievedAt: requiredText(source?.retrievedAt, 'retrieval time'),
      contentSha256: requiredText(source?.contentSha256, 'content SHA-256'),
      objectPath: requiredText(source?.objectPath, 'object path'),
      contentType: requiredText(source?.contentType, 'content type').toLowerCase(),
      byteSize: source?.byteSize,
      supersedesContentSha256: normalizedSupersededHashes(source?.supersedesContentSha256),
    },
    identitySignals: normalizedSignals(source?.identitySignals),
    claims: normalizedClaims(source?.claims),
  };
}

export function validateTrustedSourceMetadata(source, caseIdentity, options = {}) {
  const identity = normalizedIdentity(caseIdentity);
  if (source?.authority !== 'manufacturer') throw new TypeError('manufacturer authority required');
  trustedUrl(source?.sourceUrl, identity.brand, 'source URL');
  trustedUrl(source?.finalUrl, identity.brand, 'final URL');
  const redirects = source?.redirectChain ?? [];
  if (!Array.isArray(redirects) || redirects.length > resolutionPolicy.maximumRedirects) {
    throw new TypeError('redirect chain invalid');
  }
  redirects.forEach((url, index) => trustedUrl(url, identity.brand, `redirect ${index + 1}`));
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
  if (!['text/html', 'application/pdf'].includes(requiredText(source?.contentType, 'content type').toLowerCase())) {
    throw new TypeError('unsupported content type');
  }
  if (source?.identity?.outcome !== 'exact'
    || brandKey(source?.identity?.brand) !== brandKey(identity.brand)
    || requiredText(source?.identity?.model, 'source identity model').toUpperCase() !== identity.model.toUpperCase()) {
    throw new TypeError('source identity does not match case identity');
  }
  normalizedSignals(source?.identitySignals);
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
  validateTrustedSourceMetadata(source, caseIdentity, { asOf: verifiedAt });
  if (verifiedMilliseconds < parseTime(source.retrievedAt, 'retrieval time')) {
    throw new TypeError('verification time precedes retrieval time');
  }
  const payload = receiptPayload(source, caseIdentity, verifiedAt);
  return Object.freeze({
    schemaVersion: payload.schemaVersion,
    policyVersion: payload.policyVersion,
    manufacturerPolicyVersion: payload.manufacturerPolicyVersion,
    verifiedAt,
    bindingSha256: digest(payload),
  });
}

export function verifyVerificationReceipt(source, caseIdentity, options = {}) {
  const receipt = source?.verificationReceipt;
  if (!receipt || receipt.schemaVersion !== resolutionPolicy.receiptSchemaVersion
    || receipt.policyVersion !== resolutionPolicy.policyVersion
    || receipt.manufacturerPolicyVersion !== manufacturerPolicy.policyVersion) {
    throw new TypeError('current verification receipt required');
  }
  parseTime(receipt.verifiedAt, 'verification time');
  validateTrustedSourceMetadata(source, caseIdentity, { asOf: options.asOf ?? receipt.verifiedAt });
  const expected = digest(receiptPayload(source, caseIdentity, receipt.verifiedAt));
  if (receipt.bindingSha256 !== expected) throw new Error('verification receipt digest mismatch');
  return true;
}

export const evidenceSourcePolicy = Object.freeze({
  manufacturerPolicy: Object.freeze(manufacturerPolicy),
  resolutionPolicy: Object.freeze(resolutionPolicy),
});
