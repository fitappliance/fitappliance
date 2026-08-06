import { isIP } from 'node:net';

import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const ACTIVE_RELEASE_ID = 'retail_lifecycle_release_6c42c754aeb1ff49097b32b4';
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const REJECTION_CODES = new Set([
  'EMAIL_BEARING_VALUE',
  'MALFORMED_URL',
  'NON_HTTPS_URL',
  'CREDENTIALLED_URL',
  'PRIVATE_FEED_HOST',
  'DUPLICATE_RESULT_RANK',
  'RESULT_SET_LIMIT_EXCEEDED',
  'MALFORMED_RESULT',
]);

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, label, keys) {
  object(value, label);
  const expected = new Set(keys);
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`${label} missing ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) throw new TypeError(`${label} unknown key: ${key}`);
  }
}

function text(value, label) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function hash(value, label) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!SHA256.test(normalized)) throw new TypeError(`${label} must be a SHA-256`);
  return normalized;
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${label} must be a positive integer`);
  return value;
}

function targetRecord(value) {
  exactKeys(value, 'public search target', [
    'targetId', 'referenceId', 'category', 'brand', 'exactModel', 'lifecycleState',
    'activeReleaseId', 'activeReleaseSha256',
  ]);
  if (value.lifecycleState !== 'CURRENT_RETAIL') throw new TypeError('public search target must be CURRENT_RETAIL');
  if (value.activeReleaseId !== ACTIVE_RELEASE_ID) throw new TypeError('public search target active release ID mismatch');
  return {
    targetId: text(value.targetId, 'target ID'),
    referenceId: text(value.referenceId, 'reference ID'),
    category: text(value.category, 'category'),
    brand: text(value.brand, 'brand'),
    exactModel: text(value.exactModel, 'exact model'),
    lifecycleState: value.lifecycleState,
    activeReleaseId: ACTIVE_RELEASE_ID,
    activeReleaseSha256: hash(value.activeReleaseSha256, 'active release SHA'),
  };
}

function queryRecord(value) {
  exactKeys(value, 'public search query binding', ['queryId', 'querySha256']);
  return {
    queryId: text(value.queryId, 'query ID'),
    querySha256: hash(value.querySha256, 'query SHA'),
  };
}

function captureRecord(value) {
  exactKeys(value, 'public search capture binding', [
    'objectSha256', 'objectPath', 'byteSize',
  ]);
  const objectSha256 = hash(value.objectSha256, 'capture object SHA');
  const objectPath = text(value.objectPath, 'capture object path');
  if (objectPath.startsWith('/') || objectPath.includes('..')
    || !objectPath.endsWith(`/${objectSha256}.json`)) {
    throw new TypeError('capture object path must be relative and content-addressed');
  }
  return {
    objectSha256,
    objectPath,
    byteSize: positiveInteger(value.byteSize, 'capture byte size'),
  };
}

function isPrivateIpv4(host) {
  if (isIP(host) !== 4) return false;
  const [first, second] = host.split('.').map(Number);
  return host === '0.0.0.0'
    || first === 127
    || first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 169 && second === 254);
}

function isPrivateIpv6(host) {
  if (isIP(host) !== 6) return false;
  if (host === '::1') return true;
  const first = Number.parseInt(host.split(':')[0], 16);
  return (first & 0xffc0) === 0xfe80
    || (first & 0xfe00) === 0xfc00;
}

function isPrivateFeedHost(rawHost) {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  return host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || isPrivateIpv4(host)
    || isPrivateIpv6(host)
    || host === 'prf.hn'
    || host.endsWith('.prf.hn')
    || host === 'partnerize.com'
    || host.endsWith('.partnerize.com')
    || host.startsWith('feed.')
    || host.startsWith('feeds.');
}

function normalizeResult(value) {
  exactKeys(value, 'public search result', ['rank', 'title', 'url', 'snippet']);
  const result = {
    rank: positiveInteger(value.rank, 'result rank'),
    title: text(value.title, 'result title'),
    url: text(value.url, 'result URL'),
    snippet: text(value.snippet, 'result snippet'),
  };
  if ([result.title, result.url, result.snippet].some((entry) => EMAIL.test(entry))) {
    return { result, reasonCode: 'EMAIL_BEARING_VALUE' };
  }
  let url;
  try {
    url = new URL(result.url);
  } catch {
    return { result, reasonCode: 'MALFORMED_URL' };
  }
  if (url.username || url.password) return { result, reasonCode: 'CREDENTIALLED_URL' };
  if (url.protocol !== 'https:') return { result, reasonCode: 'NON_HTTPS_URL' };
  if (isPrivateFeedHost(url.hostname.toLowerCase())) {
    return { result, reasonCode: 'PRIVATE_FEED_HOST' };
  }
  result.url = url.toString();
  return { result, reasonCode: null };
}

function semanticLead(value) {
  return {
    schemaVersion: value.schemaVersion,
    target: value.target,
    query: value.query,
    result: value.result,
    capture: value.capture,
    state: value.state,
  };
}

export function createPublicSearchLead(input, { forcedReasonCode = null } = {}) {
  exactKeys(input, 'public search lead input', ['target', 'query', 'result', 'capture']);
  const normalized = normalizeResult(input.result);
  const reasonCode = forcedReasonCode ?? normalized.reasonCode;
  if (reasonCode !== null && !REJECTION_CODES.has(reasonCode)) {
    throw new TypeError(`unsupported public search rejection reason: ${reasonCode}`);
  }
  const semantic = {
    schemaVersion: 1,
    target: targetRecord(input.target),
    query: queryRecord(input.query),
    result: normalized.result,
    capture: captureRecord(input.capture),
    state: {
      status: reasonCode === null ? 'UNVALIDATED' : 'REJECTED',
      reasonCode,
    },
  };
  const semanticLeadSha256 = canonicalJsonSha256(semantic);
  return {
    ...semantic,
    leadId: `public_search_lead_${semanticLeadSha256.slice(0, 24)}`,
    semanticLeadSha256,
  };
}

export function validatePublicSearchLead(value) {
  exactKeys(value, 'public search lead', [
    'schemaVersion', 'leadId', 'target', 'query', 'result', 'capture', 'state',
    'semanticLeadSha256',
  ]);
  if (value.schemaVersion !== 1) throw new TypeError('public search lead schemaVersion 1 required');
  exactKeys(value.state, 'public search lead state', ['status', 'reasonCode']);
  if (!['UNVALIDATED', 'REJECTED'].includes(value.state.status)) {
    throw new TypeError('unsupported public search lead state');
  }
  if (value.state.status === 'UNVALIDATED' && value.state.reasonCode !== null) {
    throw new TypeError('unvalidated public search lead cannot carry a rejection reason');
  }
  if (value.state.status === 'REJECTED' && !REJECTION_CODES.has(value.state.reasonCode)) {
    throw new TypeError('rejected public search lead requires a typed reason');
  }
  const rebuilt = createPublicSearchLead({
    target: value.target,
    query: value.query,
    result: value.result,
    capture: value.capture,
  }, { forcedReasonCode: value.state.reasonCode });
  if (rebuilt.semanticLeadSha256 !== value.semanticLeadSha256
    || rebuilt.leadId !== value.leadId
    || canonicalJsonSha256(rebuilt) !== canonicalJsonSha256(value)) {
    throw new Error('public search lead canonical binding mismatch');
  }
  return value;
}

export { canonicalJsonSha256 as publicSearchSha256 };
