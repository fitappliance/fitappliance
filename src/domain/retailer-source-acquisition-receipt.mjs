import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const RECEIPT_POLICY_VERSION = 'retailer-source-acquisition-receipt-v1';

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Value(value, label) {
  const result = required(value, label).toLowerCase();
  if (!SHA256.test(result)) throw new TypeError(`${label} must be a SHA-256`);
  return result;
}

function timestamp(value, label) {
  const parsed = new Date(required(value, label));
  if (Number.isNaN(parsed.valueOf())) throw new TypeError(`${label} must be an ISO timestamp`);
  return parsed.toISOString();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function canonicalSha256(value) {
  return sha256Bytes(JSON.stringify(canonical(value)));
}

function receiptSemanticPayload(value) {
  const clone = structuredClone(value);
  delete clone.acquisitionId;
  delete clone.semanticSha256;
  return clone;
}

function normalizedHosts(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError('approved acquisition hosts required');
  }
  const hosts = [...new Set(values.map((value) => {
    const host = required(value, 'approved acquisition host').toLowerCase();
    const parsed = new URL(`https://${host}`);
    if (parsed.hostname !== host || parsed.port || parsed.username || parsed.password
      || parsed.pathname !== '/') {
      throw new TypeError(`invalid approved acquisition host ${host}`);
    }
    return host;
  }))].sort();
  return hosts;
}

function secretSafeUrlReference(value, allowedHosts, label) {
  const url = new URL(required(value, label));
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError(`${label} must use trusted HTTPS`);
  }
  const host = url.hostname.toLowerCase();
  if (!allowedHosts.includes(host)) {
    throw new Error(`${label} is outside approved acquisition hosts: ${host}`);
  }
  url.hash = '';
  return {
    host,
    pathSha256: sha256Bytes(`${url.pathname}${url.search}`),
  };
}

function validateUrlReference(value, allowedHosts, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} reference required`);
  }
  const host = required(value.host, `${label} host`).toLowerCase();
  if (!allowedHosts.includes(host)) throw new Error(`${label} is outside approved acquisition hosts: ${host}`);
  return { host, pathSha256: sha256Value(value.pathSha256, `${label} path SHA-256`) };
}

function headerValue(headers, name) {
  if (headers && typeof headers.get === 'function') return headers.get(name);
  if (!headers || typeof headers !== 'object') return null;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry == null ? null : String(entry[1]);
}

function optionalHttpTimestamp(value, label) {
  if (value == null || String(value).trim() === '') return null;
  return timestamp(value, label);
}

function normalizedResponseHeaders(headers) {
  const contentLengthValue = headerValue(headers, 'content-length');
  let declaredContentLength = null;
  if (contentLengthValue != null && contentLengthValue !== '') {
    declaredContentLength = Number(contentLengthValue);
    if (!Number.isInteger(declaredContentLength) || declaredContentLength < 0) {
      throw new TypeError('response content length must be a non-negative integer');
    }
  }
  const etag = headerValue(headers, 'etag');
  return {
    date: optionalHttpTimestamp(headerValue(headers, 'date'), 'response date'),
    contentType: headerValue(headers, 'content-type')?.split(';')[0].trim().toLowerCase() || null,
    declaredContentLength,
    etagSha256: etag == null || etag === '' ? null : sha256Bytes(etag),
    lastModified: optionalHttpTimestamp(headerValue(headers, 'last-modified'), 'response last-modified'),
  };
}

function validateResponse(value) {
  if (!value || value.statusCode !== 200) throw new Error('acquisition response status must be 200');
  const declared = value.declaredContentLength;
  if (declared != null && (!Number.isInteger(declared) || declared < 0)) {
    throw new TypeError('acquisition declared content length invalid');
  }
  return {
    statusCode: 200,
    date: value.date == null ? null : timestamp(value.date, 'acquisition response date'),
    contentType: value.contentType == null ? null : required(value.contentType, 'acquisition content type').toLowerCase(),
    declaredContentLength: declared ?? null,
    etagSha256: value.etagSha256 == null ? null : sha256Value(value.etagSha256, 'acquisition ETag SHA-256'),
    lastModified: value.lastModified == null ? null : timestamp(value.lastModified, 'acquisition last-modified'),
  };
}

function referencesEqual(left, right) {
  return left.host === right.host && left.pathSha256 === right.pathSha256;
}

export function validateRetailerSourceAcquisitionReceipt(document, expected = {}) {
  if (!document || document.schemaVersion !== 1
    || document.receiptPolicyVersion !== RECEIPT_POLICY_VERSION
    || !Array.isArray(document.redirects)) {
    throw new TypeError('retailer source acquisition receipt schema v1 required');
  }
  const acquisitionHosts = normalizedHosts(expected.acquisitionHosts ?? document.acquisitionHosts);
  const sourcePolicyId = required(document.sourcePolicyId, 'acquisition source policy ID');
  const sourcePolicySha256 = sha256Value(document.sourcePolicySha256, 'acquisition source policy SHA-256');
  if (expected.sourcePolicyId != null && sourcePolicyId !== expected.sourcePolicyId) {
    throw new Error('acquisition receipt source policy ID drift');
  }
  if (expected.sourcePolicySha256 != null
    && sourcePolicySha256 !== sha256Value(expected.sourcePolicySha256, 'expected source policy SHA-256')) {
    throw new Error('acquisition receipt source policy hash drift');
  }
  if (JSON.stringify(document.acquisitionHosts) !== JSON.stringify(acquisitionHosts)) {
    throw new Error('acquisition receipt host policy drift');
  }
  const requested = validateUrlReference(document.requested, acquisitionHosts, 'acquisition requested URL');
  const final = validateUrlReference(document.final, acquisitionHosts, 'acquisition final URL');
  const redirects = document.redirects.map((redirect) => {
    if (!REDIRECT_STATUSES.has(redirect?.statusCode)) throw new TypeError('acquisition redirect status invalid');
    return {
      statusCode: redirect.statusCode,
      from: validateUrlReference(redirect.from, acquisitionHosts, 'acquisition redirect source'),
      to: validateUrlReference(redirect.to, acquisitionHosts, 'acquisition redirect destination'),
    };
  });
  let cursor = requested;
  for (const redirect of redirects) {
    if (!referencesEqual(cursor, redirect.from)) throw new Error('acquisition redirect chain is disconnected');
    cursor = redirect.to;
  }
  if (!referencesEqual(cursor, final)) throw new Error('acquisition final URL does not close redirect chain');
  const startedAt = timestamp(document.startedAt, 'acquisition startedAt');
  const receivedAt = timestamp(document.receivedAt, 'acquisition receivedAt');
  if (new Date(receivedAt) < new Date(startedAt)) throw new Error('acquisition receivedAt precedes startedAt');
  const response = validateResponse(document.response);
  const payload = {
    sha256: sha256Value(document.payload?.sha256, 'acquisition payload SHA-256'),
    byteSize: document.payload?.byteSize,
    mediaType: required(document.payload?.mediaType, 'acquisition payload media type'),
  };
  if (!Number.isInteger(payload.byteSize) || payload.byteSize < 1) {
    throw new TypeError('acquisition payload byte size must be positive');
  }
  if (expected.rawPayloadSha256 != null
    && payload.sha256 !== sha256Value(expected.rawPayloadSha256, 'expected raw payload SHA-256')) {
    throw new Error('acquisition receipt payload hash drift');
  }
  if (expected.byteSize != null && payload.byteSize !== expected.byteSize) {
    throw new Error('acquisition receipt payload byte size drift');
  }
  const normalized = {
    schemaVersion: 1,
    receiptPolicyVersion: RECEIPT_POLICY_VERSION,
    sourcePolicyId,
    sourcePolicySha256,
    acquisitionHosts,
    requested,
    final,
    redirects,
    startedAt,
    receivedAt,
    response,
    payload,
    acquisitionId: required(document.acquisitionId, 'retailer acquisition ID'),
    semanticSha256: sha256Value(document.semanticSha256, 'retailer acquisition semantic SHA-256'),
  };
  const semanticSha256 = canonicalSha256(receiptSemanticPayload(normalized));
  if (normalized.semanticSha256 !== semanticSha256
    || normalized.acquisitionId !== `retailer_acquisition_${semanticSha256.slice(0, 24)}`) {
    throw new Error('retailer source acquisition receipt integrity mismatch');
  }
  return Object.freeze(normalized);
}

export function buildRetailerSourceAcquisitionReceipt({
  sourcePolicyId,
  sourcePolicySha256,
  acquisitionHosts,
  requestedUrl,
  finalUrl,
  redirects = [],
  startedAt,
  receivedAt,
  responseStatus,
  responseHeaders,
  rawBytes,
  mediaType,
}) {
  const hosts = normalizedHosts(acquisitionHosts);
  const bytes = Buffer.from(rawBytes ?? []);
  if (bytes.length === 0) throw new TypeError('acquisition response bytes required');
  const document = {
    schemaVersion: 1,
    receiptPolicyVersion: RECEIPT_POLICY_VERSION,
    sourcePolicyId: required(sourcePolicyId, 'acquisition source policy ID'),
    sourcePolicySha256: sha256Value(sourcePolicySha256, 'acquisition source policy SHA-256'),
    acquisitionHosts: hosts,
    requested: secretSafeUrlReference(requestedUrl, hosts, 'acquisition requested URL'),
    final: secretSafeUrlReference(finalUrl, hosts, 'acquisition final URL'),
    redirects: redirects.map((redirect) => ({
      statusCode: redirect.statusCode,
      from: secretSafeUrlReference(redirect.fromUrl, hosts, 'acquisition redirect source'),
      to: secretSafeUrlReference(redirect.toUrl, hosts, 'acquisition redirect destination'),
    })),
    startedAt: timestamp(startedAt, 'acquisition startedAt'),
    receivedAt: timestamp(receivedAt, 'acquisition receivedAt'),
    response: {
      statusCode: responseStatus,
      ...normalizedResponseHeaders(responseHeaders),
    },
    payload: {
      sha256: sha256Bytes(bytes),
      byteSize: bytes.length,
      mediaType: required(mediaType, 'acquisition payload media type'),
    },
  };
  const semanticSha256 = canonicalSha256(document);
  document.acquisitionId = `retailer_acquisition_${semanticSha256.slice(0, 24)}`;
  document.semanticSha256 = semanticSha256;
  return validateRetailerSourceAcquisitionReceipt(document, {
    sourcePolicyId: document.sourcePolicyId,
    sourcePolicySha256: document.sourcePolicySha256,
    acquisitionHosts: hosts,
    rawPayloadSha256: document.payload.sha256,
    byteSize: bytes.length,
  });
}

async function readBoundedBody(response, maximumBytes) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maximumBytes) throw new Error('acquisition response exceeds maximum byte limit');
    return bytes;
  }
  const chunks = [];
  let byteSize = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteSize += value.byteLength;
      if (byteSize > maximumBytes) {
        await reader.cancel('maximum byte limit exceeded');
        throw new Error('acquisition response exceeds maximum byte limit');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, byteSize);
}

function assertCsvResponse(response, bytes) {
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  if (contentType && !['text/csv', 'text/plain', 'application/csv', 'application/octet-stream'].includes(contentType)) {
    throw new Error(`authorized feed response has unsupported CSV content type: ${contentType}`);
  }
  const prefix = bytes.subarray(0, 512).toString('utf8').trimStart();
  if (/^<!doctype\s+html|^<html\b/i.test(prefix) || (!prefix.includes('|') && !prefix.includes(','))) {
    throw new Error('authorized feed response is not recognizable CSV data');
  }
}

export async function acquireAuthorizedRetailerSource({
  url,
  sourcePolicyId,
  sourcePolicySha256,
  acquisitionHosts,
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
  timeoutMs = 120_000,
  maximumBytes = 64 * 1024 * 1024,
  maximumRedirects = 5,
}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('retailer source fetch implementation required');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new TypeError('acquisition timeout must be positive');
  if (!Number.isInteger(maximumBytes) || maximumBytes < 1) throw new TypeError('acquisition maximum bytes must be positive');
  if (!Number.isInteger(maximumRedirects) || maximumRedirects < 0 || maximumRedirects > 10) {
    throw new TypeError('acquisition maximum redirects must be between 0 and 10');
  }
  const hosts = normalizedHosts(acquisitionHosts);
  const requestedUrl = new URL(required(url, 'authorized retailer source URL'));
  secretSafeUrlReference(requestedUrl, hosts, 'authorized retailer source URL');
  const startedAt = timestamp(now(), 'acquisition startedAt');
  let currentUrl = requestedUrl;
  const redirects = [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('authorized feed acquisition timeout')), timeoutMs);
  try {
    while (true) {
      const response = await fetchImpl(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: 'text/csv,text/plain;q=0.9,application/octet-stream;q=0.8' },
      });
      if (REDIRECT_STATUSES.has(response.status)) {
        if (redirects.length >= maximumRedirects) throw new Error('authorized feed exceeds maximum redirects');
        const location = response.headers.get('location');
        if (!location) throw new Error('authorized feed redirect is missing a location');
        const nextUrl = new URL(location, currentUrl);
        secretSafeUrlReference(nextUrl, hosts, 'authorized feed redirect destination');
        redirects.push({ statusCode: response.status, fromUrl: currentUrl, toUrl: nextUrl });
        currentUrl = nextUrl;
        continue;
      }
      if (response.status !== 200) throw new Error(`authorized feed returned HTTP ${response.status}`);
      const declaredLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
        throw new Error('acquisition response exceeds maximum byte limit');
      }
      const bytes = await readBoundedBody(response, maximumBytes);
      assertCsvResponse(response, bytes);
      const receivedAt = timestamp(now(), 'acquisition receivedAt');
      const receipt = buildRetailerSourceAcquisitionReceipt({
        sourcePolicyId,
        sourcePolicySha256,
        acquisitionHosts: hosts,
        requestedUrl,
        finalUrl: currentUrl,
        redirects,
        startedAt,
        receivedAt,
        responseStatus: response.status,
        responseHeaders: response.headers,
        rawBytes: bytes,
        mediaType: 'text/csv',
      });
      return { bytes, receipt };
    }
  } finally {
    clearTimeout(timeout);
  }
}
