import { createHash } from 'node:crypto';

import { inspectMineruContentListV2 } from './mineru-document.mjs';
import { isOfficialBrandHostUrl } from './evidence-source-verifier.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REFERENCE_USER_AGENT = 'FitApplianceReferenceBot/1.0 (+https://www.fitappliance.com.au/about/editorial-standards)';

function requiredText(value, label) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function absoluteHttpsUrl(value, label) {
  let url;
  try { url = new URL(requiredText(value, label)); } catch { throw new TypeError(`${label} invalid`); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError(`${label} must use trusted HTTPS`);
  }
  url.hash = '';
  return url.toString();
}

function reviewedDate(value, label) {
  const text = requiredText(value, label);
  if (!DATE.test(text) || !Number.isFinite(Date.parse(`${text}T00:00:00.000Z`))) {
    throw new TypeError(`${label} must be YYYY-MM-DD`);
  }
  return text;
}

function positiveInteger(value, label, minimum = 1) {
  if (!Number.isInteger(value) || value < minimum) throw new TypeError(`${label} invalid`);
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function rejectUnknownKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new TypeError(`${label} contains unknown fields: ${unknown.sort().join(', ')}`);
}

function normalizeReview(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} review required`);
  }
  rejectUnknownKeys(value, new Set(['url', 'reviewedAt', 'status']), `${label} review`);
  return {
    url: absoluteHttpsUrl(value.url, `${label} URL`),
    reviewedAt: reviewedDate(value.reviewedAt, `${label} review date`),
    status: requiredText(value.status, `${label} status`),
  };
}

export function validateReferenceArtifactPolicy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('reference artifact policy required');
  }
  if (value.schemaVersion !== 1) throw new TypeError('reference artifact policy schema invalid');
  rejectUnknownKeys(
    value,
    new Set(['schemaVersion', 'version', 'maximumBytes', 'maximumRedirects', 'sources']),
    'reference artifact policy',
  );
  if (!Array.isArray(value.sources) || !value.sources.length) throw new TypeError('reference sources required');
  const maximumBytes = positiveInteger(value.maximumBytes, 'reference maximum bytes');
  const maximumRedirects = positiveInteger(value.maximumRedirects, 'reference maximum redirects', 0);
  const ids = new Set();
  const sources = value.sources.map((source) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw new TypeError('reference source must be an object');
    }
    rejectUnknownKeys(source, new Set([
      'id', 'retailer', 'allowedHosts', 'minimumIntervalMs', 'robots', 'terms',
      'scaleAllowed', 'manualCanaryUrls',
    ]), 'reference source');
    const id = requiredText(source?.id, 'reference source ID');
    if (ids.has(id)) throw new TypeError(`duplicate reference source ${id}`);
    ids.add(id);
    if (!Array.isArray(source.allowedHosts) || !source.allowedHosts.length) {
      throw new TypeError('reference allowed hosts required');
    }
    const allowedHosts = [...new Set(source.allowedHosts.map((host) => requiredText(host, 'reference allowed host')
      .toLowerCase().replace(/\.$/, '')))].sort();
    const minimumIntervalMs = positiveInteger(source.minimumIntervalMs, 'reference minimum interval', 250);
    const robots = normalizeReview(source.robots, 'robots');
    const terms = normalizeReview(source.terms, 'terms');
    const scaleAllowed = source.scaleAllowed === true;
    if (scaleAllowed && (robots.status !== 'allowed' || terms.status !== 'reviewed_for_automated_reference_access')) {
      throw new TypeError(`reference source ${id} cannot scale without affirmative robots and terms review`);
    }
    const manualCanaryUrls = [...new Set((source.manualCanaryUrls ?? []).map((url) => {
      const normalized = absoluteHttpsUrl(url, 'reference canary URL');
      if (!allowedHosts.includes(new URL(normalized).hostname.toLowerCase())) {
        throw new TypeError('reference canary URL is outside allowed hosts');
      }
      return normalized;
    }))].sort();
    return {
      id,
      retailer: requiredText(source.retailer, 'reference retailer'),
      allowedHosts,
      minimumIntervalMs,
      robots,
      terms,
      scaleAllowed,
      manualCanaryUrls,
    };
  });
  return Object.freeze({
    schemaVersion: 1,
    version: requiredText(value.version, 'reference policy version'),
    maximumBytes,
    maximumRedirects,
    sources: Object.freeze(sources.map(Object.freeze)),
  });
}

function sourceForUrl(policy, value) {
  const sourceUrl = absoluteHttpsUrl(value, 'reference source URL');
  const host = new URL(sourceUrl).hostname.toLowerCase();
  const source = policy.sources.find((entry) => entry.allowedHosts.includes(host));
  if (!source) throw new TypeError(`reference URL is outside allowed hosts: ${host}`);
  return { source, sourceUrl };
}

function normalizeContentType(value) {
  return String(value ?? '').split(';')[0].trim().toLowerCase();
}

function validatePdfPayload(bytes, contentType, maximumBytes) {
  const buffer = Buffer.from(bytes ?? []);
  if (!buffer.length || buffer.length > maximumBytes) throw new Error('reference artifact size outside limits');
  if (!buffer.subarray(0, 5).toString('ascii').toLowerCase().startsWith('%pdf-')) {
    throw new Error('reference PDF magic bytes invalid');
  }
  if (!['application/pdf', 'application/octet-stream'].includes(contentType)) {
    throw new Error(`reference PDF content type invalid: ${contentType || 'missing'}`);
  }
  return buffer;
}

export function createReferenceArtifactTransport(policyInput, options = {}) {
  const policy = validateReferenceArtifactPolicy(policyInput);
  const mode = options.mode ?? 'scale';
  if (!['scale', 'manual_canary'].includes(mode)) throw new TypeError('reference transport mode invalid');
  if (mode === 'scale' && !policy.sources.some((source) => source.scaleAllowed)) {
    throw new Error('reference scale is not allowed by reviewed policy');
  }
  if (mode === 'manual_canary') {
    const selected = sourceForUrl(policy, options.sourceUrl);
    if (!selected.source.manualCanaryUrls.includes(selected.sourceUrl)) {
      throw new Error('reference URL is not a reviewed canary');
    }
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const clock = options.clock ?? Date.now;
  const lastRequestAt = new Map();

  async function rateLimit(source, host) {
    const prior = lastRequestAt.get(host);
    if (Number.isFinite(prior)) {
      const remaining = source.minimumIntervalMs - (clock() - prior);
      if (remaining > 0) await sleep(remaining);
    }
    lastRequestAt.set(host, clock());
  }

  return Object.freeze({
    policyVersion: policy.version,
    mode,
    async fetch(value) {
      const selected = sourceForUrl(policy, value);
      if (mode === 'scale' && !selected.source.scaleAllowed) {
        throw new Error(`reference scale is not allowed for ${selected.source.id}`);
      }
      if (mode === 'manual_canary' && !selected.source.manualCanaryUrls.includes(selected.sourceUrl)) {
        throw new Error('reference URL is not a reviewed canary');
      }
      let current = selected.sourceUrl;
      const redirectChain = [];
      for (let redirects = 0; redirects <= policy.maximumRedirects; redirects += 1) {
        const currentSelection = sourceForUrl(policy, current);
        await rateLimit(currentSelection.source, new URL(current).hostname.toLowerCase());
        const response = await fetchImpl(current, {
          redirect: 'manual',
          signal: options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 30_000),
          headers: { 'user-agent': REFERENCE_USER_AGENT, accept: 'application/pdf' },
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (redirects >= policy.maximumRedirects) throw new Error('reference redirect limit exceeded');
          const location = response.headers.get('location');
          if (!location) throw new Error('reference redirect location missing');
          const next = absoluteHttpsUrl(new URL(location, current).toString(), 'reference redirect URL');
          try { sourceForUrl(policy, next); } catch {
            throw new Error('reference redirect escaped allowed host');
          }
          redirectChain.push(next);
          current = next;
          continue;
        }
        if (!response.ok) throw new Error(`reference HTTP ${response.status}`);
        const bytes = validatePdfPayload(
          await response.arrayBuffer(),
          normalizeContentType(response.headers.get('content-type')),
          policy.maximumBytes,
        );
        return Object.freeze({
          schemaVersion: 1,
          authorityMode: 'reference',
          sourcePolicyId: selected.source.id,
          policyVersion: policy.version,
          sourceUrl: selected.sourceUrl,
          finalUrl: current,
          redirectChain: Object.freeze([...redirectChain]),
          retrievedAt: typeof options.now === 'function' ? options.now() : new Date().toISOString(),
          contentType: 'application/pdf',
          contentSha256: sha256(bytes),
          byteSize: bytes.length,
          bytes,
          publishable: false,
          receiptEligible: false,
        });
      }
      throw new Error('unreachable reference redirect state');
    },
  });
}

function modelTokens(text) {
  return [...new Set((String(text).toUpperCase().match(/\b[A-Z][A-Z0-9-]{3,}\b/g) ?? [])
    .filter((token) => /\d/.test(token))
    .map((token) => token.replace(/-+$/g, '')))].sort();
}

function modelKey(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

export function buildReferenceArtifactFingerprint(artifact, identity) {
  if (artifact?.authorityMode !== 'reference') throw new TypeError('reference artifact required');
  if (artifact.contentType !== 'application/pdf') throw new TypeError('reference PDF required');
  if (!SHA256.test(String(artifact.contentSha256 ?? ''))) throw new TypeError('reference PDF hash invalid');
  if (artifact.derivedArtifact?.format !== 'content_list_v2'
    || artifact.derivedArtifact?.sourcePdfSha256 !== artifact.contentSha256
    || !SHA256.test(String(artifact.derivedArtifact?.contentSha256 ?? ''))) {
    throw new TypeError('hash-bound MinerU content_list_v2 required');
  }
  const jsonBytes = Buffer.from(artifact.derivedArtifactBytes ?? []);
  if (jsonBytes.length !== artifact.derivedArtifact.byteSize
    || sha256(jsonBytes) !== artifact.derivedArtifact.contentSha256) {
    throw new Error('reference MinerU object integrity mismatch');
  }
  const inspected = inspectMineruContentListV2(jsonBytes);
  const text = inspected.pages.map((page) => page.text).join(' ');
  const tokens = modelTokens(text);
  const target = modelKey(identity?.model);
  const linkedValues = [
    ...(text.match(/https?:\/\/[^\s<>)"']+/gi) ?? []),
    ...(text.match(/\b(?:[a-z0-9](?:[a-z0-9-]{0,62})\.)+(?:com\.au|co\.nz|com|net|org)(?:\/[^\s<>)"']*)?/gi) ?? []),
  ];
  const linkedOfficialDomains = [...new Set(linkedValues.flatMap((value) => {
    try {
      const candidate = value.match(/^https?:\/\//i) ? value : `https://${value}`;
      const parsed = new URL(candidate.replace(/[.,;]+$/g, ''));
      const host = parsed.hostname.toLowerCase();
      return isOfficialBrandHostUrl(`https://${host}/`, identity?.brand) ? [host] : [];
    } catch { return []; }
  }))].sort();
  const title = inspected.pages[0]?.fragments.find((fragment) => fragment.type === 'page_header' && fragment.text)?.text
    ?? inspected.pages[0]?.fragments.find((fragment) => fragment.text)?.text
    ?? null;
  const filename = decodeURIComponent(new URL(artifact.finalUrl ?? artifact.sourceUrl).pathname.split('/').at(-1) || '');
  return Object.freeze({
    schemaVersion: 1,
    authorityMode: 'reference',
    sourceUrl: absoluteHttpsUrl(artifact.sourceUrl, 'reference source URL'),
    finalUrl: absoluteHttpsUrl(artifact.finalUrl, 'reference final URL'),
    contentSha256: artifact.contentSha256,
    derivedContentSha256: artifact.derivedArtifact.contentSha256,
    documentTitle: title ? title.slice(0, 240) : null,
    filename: filename || null,
    modelTokens: Object.freeze(tokens),
    targetModelObserved: Boolean(target) && tokens.some((token) => {
      const candidate = modelKey(token);
      return candidate === target || candidate === `${target}1`;
    }),
    linkedOfficialDomains: Object.freeze(linkedOfficialDomains),
    pageCount: inspected.pageCount,
    pdfMetadata: Object.freeze({
      status: 'unavailable_in_content_list_v2',
      title: null,
      author: null,
      subject: null,
    }),
    publishable: false,
    receiptEligible: false,
    identityUse: 'discovery_only',
  });
}
