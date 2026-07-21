import { isOfficialBrandMarketUrl } from './evidence-source-verifier.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const FINGERPRINT_KEYS = new Set([
  'schemaVersion', 'authorityMode', 'sourceUrl', 'finalUrl', 'contentSha256',
  'derivedContentSha256', 'documentTitle', 'filename', 'modelTokens',
  'targetModelObserved', 'linkedOfficialDomains', 'pageCount', 'pdfMetadata',
  'publishable', 'receiptEligible', 'identityUse',
]);

function requiredText(value, label) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function modelKey(value) {
  return requiredText(value, 'model').toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function absoluteHttpsUrl(value, label) {
  let url;
  try { url = new URL(requiredText(value, label)); } catch { throw new TypeError(`${label} invalid`); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new TypeError(`${label} must use trusted HTTPS`);
  url.hash = '';
  return url.toString();
}

function optionalText(value, label) {
  if (value === null || value === undefined) return null;
  return requiredText(value, label);
}

function rejectUnknownKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new TypeError(`${label} contains unknown fields: ${unknown.sort().join(', ')}`);
}

function normalizeOfficialDomain(value) {
  const text = requiredText(value, 'reference fingerprint official domain').toLowerCase().replace(/\.$/, '');
  if (text.includes('/') || text.includes(':') || new URL(`https://${text}/`).hostname !== text) {
    throw new TypeError('reference fingerprint official domain invalid');
  }
  return text;
}

function validateFingerprint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('reference fingerprint required');
  }
  rejectUnknownKeys(value, FINGERPRINT_KEYS, 'reference fingerprint');
  if (value.schemaVersion !== 1 || value.authorityMode !== 'reference') {
    throw new TypeError('reference fingerprint required');
  }
  if (!SHA256.test(String(value.contentSha256 ?? ''))
    || !SHA256.test(String(value.derivedContentSha256 ?? ''))) {
    throw new TypeError('reference fingerprint hashes invalid');
  }
  if (value.publishable !== false) throw new TypeError('reference fingerprint publishable must be false');
  if (value.receiptEligible !== false) throw new TypeError('reference fingerprint receiptEligible must be false');
  if (value.identityUse !== 'discovery_only') {
    throw new TypeError('reference fingerprint identityUse must be discovery_only');
  }
  if (!Array.isArray(value.modelTokens)) throw new TypeError('reference fingerprint model tokens invalid');
  const modelTokens = [...new Set(value.modelTokens.map((token) => requiredText(token, 'reference fingerprint model token')))];
  if (modelTokens.length !== value.modelTokens.length || modelTokens.some((token, index) => (
    token !== token.toUpperCase() || !/^[A-Z][A-Z0-9-]{3,}$/.test(token)
    || !/\d/.test(token) || (index > 0 && modelTokens[index - 1].localeCompare(token) >= 0)
  ))) {
    throw new TypeError('reference fingerprint model tokens must be sorted unique appliance identifiers');
  }
  if (typeof value.targetModelObserved !== 'boolean') {
    throw new TypeError('reference fingerprint target model observation invalid');
  }
  if (!Array.isArray(value.linkedOfficialDomains)) {
    throw new TypeError('reference fingerprint linked official domains invalid');
  }
  const linkedOfficialDomains = [...new Set(value.linkedOfficialDomains.map(normalizeOfficialDomain))];
  if (linkedOfficialDomains.length !== value.linkedOfficialDomains.length
    || linkedOfficialDomains.some((domain, index) => index > 0 && linkedOfficialDomains[index - 1].localeCompare(domain) >= 0)) {
    throw new TypeError('reference fingerprint linked official domains must be sorted and unique');
  }
  if (!Number.isInteger(value.pageCount) || value.pageCount < 1) {
    throw new TypeError('reference fingerprint page count invalid');
  }
  if (!value.pdfMetadata || typeof value.pdfMetadata !== 'object' || Array.isArray(value.pdfMetadata)) {
    throw new TypeError('reference fingerprint PDF metadata required');
  }
  rejectUnknownKeys(value.pdfMetadata, new Set(['status', 'title', 'author', 'subject']), 'reference fingerprint PDF metadata');
  if (value.pdfMetadata.status !== 'unavailable_in_content_list_v2') {
    throw new TypeError('reference fingerprint PDF metadata status invalid');
  }
  return Object.freeze({
    schemaVersion: 1,
    authorityMode: 'reference',
    sourceUrl: absoluteHttpsUrl(value.sourceUrl, 'reference fingerprint source URL'),
    finalUrl: absoluteHttpsUrl(value.finalUrl, 'reference fingerprint final URL'),
    contentSha256: value.contentSha256,
    derivedContentSha256: value.derivedContentSha256,
    documentTitle: optionalText(value.documentTitle, 'reference fingerprint document title'),
    filename: optionalText(value.filename, 'reference fingerprint filename'),
    modelTokens: Object.freeze(modelTokens),
    targetModelObserved: value.targetModelObserved,
    linkedOfficialDomains: Object.freeze(linkedOfficialDomains),
    pageCount: value.pageCount,
    pdfMetadata: Object.freeze({
      status: value.pdfMetadata.status,
      title: optionalText(value.pdfMetadata.title, 'reference fingerprint PDF title'),
      author: optionalText(value.pdfMetadata.author, 'reference fingerprint PDF author'),
      subject: optionalText(value.pdfMetadata.subject, 'reference fingerprint PDF subject'),
    }),
    publishable: false,
    receiptEligible: false,
    identityUse: 'discovery_only',
  });
}

export function buildOfficialRediscoveryQueries(identity, fingerprintInput) {
  const fingerprint = validateFingerprint(fingerprintInput);
  const brand = requiredText(identity?.brand, 'rediscovery brand');
  const model = requiredText(identity?.model, 'rediscovery model');
  const queries = new Set([
    `site:${fingerprint.linkedOfficialDomains?.[0] ?? ''} "${model}" PDF`.trim(),
    `"${brand}" "${model}" specifications PDF`,
  ]);
  if (fingerprint.documentTitle) queries.add(`"${fingerprint.documentTitle}"`);
  return Object.freeze([...queries].filter((query) => !query.startsWith('site: "')).sort());
}

export async function rediscoverOfficialArtifacts(identity, fingerprintInput, options = {}) {
  const fingerprint = validateFingerprint(fingerprintInput);
  const brand = requiredText(identity?.brand, 'rediscovery brand');
  const model = requiredText(identity?.model, 'rediscovery model');
  const category = requiredText(identity?.category, 'rediscovery category');
  if (typeof options.discoverOfficialCandidates !== 'function') {
    throw new TypeError('official candidate discovery function required');
  }
  const raw = await options.discoverOfficialCandidates({
    brand,
    model,
    category,
    referenceFingerprint: structuredClone(fingerprint),
    queries: buildOfficialRediscoveryQueries({ brand, model, category }, fingerprint),
  });
  if (!Array.isArray(raw)) throw new TypeError('official candidate discovery must return an array');
  const seen = new Set();
  const candidates = [];
  for (const value of raw) {
    const sourceUrl = absoluteHttpsUrl(value?.sourceUrl ?? value?.url, 'rediscovered official URL');
    if (sourceUrl === fingerprint.sourceUrl || sourceUrl === fingerprint.finalUrl) continue;
    if (!isOfficialBrandMarketUrl(sourceUrl, brand)) continue;
    if (seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);
    let inspected = null;
    if (typeof options.inspectOfficialCandidate === 'function') {
      inspected = await options.inspectOfficialCandidate({
        sourceUrl,
        brand,
        model,
        category,
      });
      if (inspected?.contentSha256 != null && !SHA256.test(String(inspected.contentSha256))) {
        throw new TypeError('official candidate content hash invalid');
      }
    }
    const sourceModelHint = value.sourceModelHint ? requiredText(value.sourceModelHint, 'official source model hint') : null;
    const exactModelHint = sourceModelHint && modelKey(sourceModelHint) === modelKey(model);
    const matchBasis = inspected?.contentSha256 === fingerprint.contentSha256
      ? 'exact_content_hash'
      : exactModelHint ? 'exact_model_official_candidate' : 'official_host_candidate';
    candidates.push({
      sourceUrl,
      authorityMode: 'official',
      documentType: requiredText(value.documentType ?? 'unknown_document', 'official document type'),
      sourceModelHint,
      matchBasis,
      referenceContentSha256: fingerprint.contentSha256,
      requiresOfficialAcquisition: true,
      marketValidationRequired: true,
      receiptEligible: false,
    });
  }
  candidates.sort((left, right) => left.sourceUrl.localeCompare(right.sourceUrl));
  return Object.freeze({
    schemaVersion: 1,
    status: candidates.length ? 'official_candidates_discovered' : 'source_authority',
    identity: Object.freeze({ brand, model, category }),
    referenceContentSha256: fingerprint.contentSha256,
    referenceSourceUrl: fingerprint.sourceUrl,
    queries: buildOfficialRediscoveryQueries({ brand, model, category }, fingerprint),
    officialCandidates: Object.freeze(candidates.map(Object.freeze)),
    receiptEligible: false,
    nextAction: candidates.length ? 'official_acquisition_and_attestation' : 'none',
  });
}
