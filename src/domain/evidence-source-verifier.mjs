import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validateDimensionEvidenceClaimsV2 } from './dimension-evidence-claim.mjs';
import {
  validateOfficialProductPageArtifactRelationship,
  verifyOfficialProductPageDiscoveryEvidence,
} from './official-product-page-discovery-evidence.mjs';
import { verifyOfficialMarketApiDiscoveryEvidence } from './official-market-api-discovery-evidence.mjs';
import { verifyOfficialSupportApiDiscoveryEvidence } from './official-support-api-discovery-evidence.mjs';
import {
  isStrictOfficialModelVariantApiSource,
  isStrictOfficialModelVariantPdfSource,
  officialMarketApiModelVariant,
  strictOfficialModelVariantApiFailure,
  strictOfficialModelVariantPdfFailure,
} from './official-model-variant-policy.mjs';

export { officialMarketApiModelVariant } from './official-model-variant-policy.mjs';

const manufacturerPolicy = JSON.parse(readFileSync(
  new URL('../../data/architecture-v2/policies/manufacturer-source-policy.json', import.meta.url),
  'utf8',
));
const resolutionPolicy = JSON.parse(readFileSync(
  new URL('../../data/architecture-v2/policies/evidence-resolution-policy.json', import.meta.url),
  'utf8',
));
const discoverySeedPolicy = JSON.parse(readFileSync(
  new URL('../../data/architecture-v2/policies/official-discovery-seed-policy.json', import.meta.url),
  'utf8',
));
const OFFICIAL_TRANSPORTS = new Set(['fetch', 'curl', 'scrapling']);
const DISCOVERY_OBJECT_TRANSPORT = 'content_addressed_discovery_object';

function requiredText(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function brandKey(value) {
  return requiredText(value, 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isHashBoundMarketApiSelfSource(source) {
  const provenance = source?.discoveryProvenance;
  const redirects = source?.redirectChain ?? [];
  return source?.contentType === 'application/json'
    && provenance?.method === 'official_market_api'
    && Array.isArray(redirects)
    && redirects.length === 0
    && source.sourceUrl === source.finalUrl
    && source.sourceUrl === provenance.discoveryUrl
    && source.sourceUrl === provenance.artifactUrl
    && source.contentSha256 === provenance.discoveryContentSha256
    && source.objectPath === provenance.discoveryObjectPath
    && source.byteSize === provenance.discoveryByteSize;
}

function officialTransport(value, source = null) {
  if (value == null) return null;
  const transport = requiredText(value, 'official transport');
  if (!OFFICIAL_TRANSPORTS.has(transport)
    && !(transport === DISCOVERY_OBJECT_TRANSPORT && isHashBoundMarketApiSelfSource(source))) {
    throw new TypeError('official transport invalid');
  }
  return transport;
}

function marketHostPathPatterns(brand, host) {
  const configured = manufacturerPolicy.marketHostPathPatterns?.[brandKey(brand)] ?? {};
  return Object.entries(configured)
    .filter(([suffix]) => host === suffix || host.endsWith(`.${suffix}`))
    .flatMap(([, patterns]) => patterns);
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
  const marketPatterns = [
    ...(manufacturerPolicy.marketPathPatterns?.[brandKey(brand)] ?? []),
    ...marketHostPathPatterns(brand, host),
  ];
  const marketTarget = `${url.pathname}${url.search}`;
  if (!options.hostOnly && marketPatterns.length && !marketPatterns.some((pattern) => new RegExp(pattern, 'i').test(marketTarget))) {
    throw new TypeError(`${label} does not match the Australian market`);
  }
  return url.toString();
}

function canonicalHttpsUrl(value, label) {
  let url;
  try { url = new URL(requiredText(value, label)); } catch { throw new TypeError(`${label} invalid`); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new TypeError(`${label} must use trusted HTTPS`);
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

export function isOfficialBrandMarketUrl(value, brand) {
  if (!isOfficialBrandUrl(value, brand)) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const qualifiedHosts = manufacturerPolicy.marketQualifiedHosts?.[brandKey(brand)] ?? [];
    if (qualifiedHosts.some((candidate) => host === String(candidate).toLowerCase().replace(/\.$/, ''))) {
      return true;
    }
    const configuredPatterns = manufacturerPolicy.marketPathPatterns?.[brandKey(brand)] ?? [];
    if (configuredPatterns.length) return true;
    if (marketHostPathPatterns(brand, host).length) return true;
    if (host.endsWith('.com.au') || host.endsWith('.au')) return true;
    const marketSegments = url.pathname.split('/').filter(Boolean);
    if (marketSegments.some((segment) => /^(?:au|en[-_]au|au[-_]en)$/i.test(segment))) return true;
    return [...url.searchParams.values()].some((entry) => /^(?:au|uni_au|en[-_]au|au[-_]en)$/i.test(entry));
  } catch {
    return false;
  }
}

function isApprovedGlobalArtifactHost(value, brand) {
  let url;
  try {
    url = new URL(canonicalHttpsUrl(value, 'source URL'));
  } catch {
    return false;
  }
  const approvedHosts = discoverySeedPolicy.brandGlobalArtifactHosts?.[brandKey(brand)] ?? [];
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  return approvedHosts.some((approved) => host === String(approved).toLowerCase().replace(/\.$/, ''));
}

export function officialArtifactUrlNeedsDiscoveryProvenance(value, brand) {
  if (!isOfficialBrandHostUrl(value, brand)) return false;
  let url;
  try { url = new URL(value); } catch { return false; }
  const patterns = discoverySeedPolicy.brandProvenanceRequiredArtifactPathPatterns?.[brandKey(brand)] ?? [];
  return patterns.some((pattern) => new RegExp(pattern, 'i').test(url.pathname));
}

function isOfficialNativeArtifactHopUrl(value, brand) {
  if (!isOfficialBrandHostUrl(value, brand)) return false;
  const host = new URL(value).hostname.toLowerCase().replace(/\.$/, '');
  return marketHostPathPatterns(brand, host).length === 0 || isOfficialBrandUrl(value, brand);
}

export function isOfficialBrandArtifactHostUrl(value, brand, context = {}) {
  if (isOfficialNativeArtifactHopUrl(value, brand)) return true;
  if (!isApprovedGlobalArtifactHost(value, brand)) return false;
  try {
    normalizeOfficialArtifactDiscoveryProvenance(context.discoveryProvenance, {
      brand,
      model: context.model,
      category: context.category,
      artifactUrl: context.artifactUrl,
    });
    return true;
  } catch {
    return false;
  }
}

function modelKey(value, label) {
  const raw = requiredText(value, label).toUpperCase();
  if (/[*?]/.test(raw)) throw new TypeError(`${label} cannot be a wildcard`);
  return raw.replace(/[^A-Z0-9]+/g, '');
}

export function officialHtmlModelVariant(caseIdentity, sourceModel) {
  const targetModel = String(caseIdentity?.model ?? '').trim().toUpperCase();
  const candidateModel = String(sourceModel ?? '').trim().toUpperCase();
  const category = String(caseIdentity?.category ?? '').trim().toLowerCase();
  if (!targetModel || !candidateModel || !category) return null;
  const suffixes = manufacturerPolicy.officialHtmlModelVariantSuffixes
    ?.[brandKey(caseIdentity?.brand)]?.[category];
  if (!Array.isArray(suffixes)) return null;
  for (const configuredSuffix of suffixes) {
    const configuration = typeof configuredSuffix === 'string'
      ? { suffix: configuredSuffix, separator: '-' }
      : configuredSuffix;
    const suffix = String(configuration?.suffix ?? '').trim().toUpperCase();
    const separator = configuration?.separator === '' ? '' : '-';
    if (suffix && candidateModel === `${targetModel}${separator}${suffix}`) {
      return { sourceModel: candidateModel, suffix };
    }
  }
  return null;
}

function officialMarketApiConfiguration(value, brand) {
  const source = new URL(trustedUrl(value, brand, 'discovery URL', { hostOnly: true }));
  const endpoints = discoverySeedPolicy.brandApiEndpoints?.[brandKey(brand)] ?? [];
  const endpoint = endpoints.find((candidate) => {
    const pathMatches = candidate.pathname
      ? source.pathname === candidate.pathname
      : new RegExp(requiredText(candidate.pathnamePattern, 'market API pathname pattern'), 'i')
        .test(source.pathname);
    if (source.hostname.toLowerCase() !== candidate.hostname || !pathMatches) return false;
    return Object.entries(candidate.requiredQuery ?? []).every(([key, expected]) => source.searchParams.get(key) === expected);
  });
  if (!endpoint) throw new TypeError(`discovery URL is not an approved ${discoverySeedPolicy.market} market API`);
  return { source, endpoint };
}

function officialMarketApiUrl(value, brand) {
  return officialMarketApiConfiguration(value, brand).source.toString();
}

function officialProductPageUrl(value, brand) {
  const source = new URL(trustedUrl(value, brand, 'discovery URL'));
  if (!isOfficialBrandMarketUrl(source.toString(), brand)) {
    throw new TypeError(`discovery URL does not match the ${discoverySeedPolicy.market} market`);
  }
  return source.toString();
}

function officialSupportApiUrl(value, brand, expectedSourceMarket) {
  const source = new URL(trustedUrl(value, brand, 'discovery URL', { hostOnly: true }));
  if (source.search || source.hash) {
    throw new TypeError('support API discovery URL cannot contain query or fragment data');
  }
  const sourceMarket = requiredText(expectedSourceMarket, 'discovery source market').toUpperCase();
  const endpoints = discoverySeedPolicy.brandSupportApiEndpoints?.[brandKey(brand)] ?? [];
  const match = endpoints.find((endpoint) => {
    if (source.hostname.toLowerCase() !== String(endpoint.hostname ?? '').toLowerCase()) return false;
    if (!new RegExp(requiredText(endpoint.pathnamePattern, 'support API pathname pattern'), 'i').test(source.pathname)) return false;
    return (endpoint.sourceMarkets ?? []).map((market) => String(market).toUpperCase()).includes(sourceMarket);
  });
  if (!match) throw new TypeError('discovery URL is not an approved official support API');
  const urlMarket = source.pathname.split('/').filter(Boolean)[0]?.toUpperCase();
  if (urlMarket !== sourceMarket) {
    throw new TypeError('discovery source market does not match discovery URL');
  }
  return source.toString();
}

export function normalizeOfficialArtifactDiscoveryProvenance(value, context = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('official artifact discovery provenance required');
  }
  const allowed = new Set([
    'schemaVersion', 'method', 'market', 'sourceMarket', 'discoveryUrl', 'requestedModel', 'matchedModel',
    'artifactUrl', 'artifactLinkUrl', 'discoveryContentSha256', 'discoveryObjectPath',
    'discoveryByteSize', 'discoveryRecordType', 'documentId', 'documentTitleKey', 'originalFileName',
  ]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new TypeError(`official artifact discovery provenance contains unknown fields: ${unknown.sort().join(', ')}`);
  if (value.schemaVersion !== 1) throw new TypeError('official artifact discovery provenance schema invalid');
  const brand = requiredText(context.brand, 'discovery brand');
  const expectedModel = requiredText(context.model, 'discovery target model');
  const artifactUrl = canonicalHttpsUrl(value.artifactUrl, 'discovered artifact URL');
  if (!isOfficialBrandHostUrl(artifactUrl, brand) && !isApprovedGlobalArtifactHost(artifactUrl, brand)) {
    throw new TypeError(`discovered artifact URL is not an approved official artifact host for ${brand}`);
  }
  if (artifactUrl !== new URL(requiredText(context.artifactUrl, 'expected artifact URL')).toString()) {
    throw new TypeError('discovery artifact URL does not match requested artifact');
  }
  const method = requiredText(value.method, 'discovery method');
  if (!['official_market_api', 'official_product_page', 'official_support_api'].includes(method)) {
    throw new TypeError('unsupported official artifact discovery method');
  }
  if (requiredText(value.market, 'discovery market') !== discoverySeedPolicy.market) {
    throw new TypeError(`official artifact discovery must be scoped to ${discoverySeedPolicy.market}`);
  }
  const sourceMarket = method === 'official_support_api'
    ? requiredText(value.sourceMarket, 'discovery source market').toUpperCase()
    : null;
  if (method !== 'official_support_api' && value.sourceMarket != null) {
    throw new TypeError('discovery source market is valid only for support API provenance');
  }
  const discoveryUrl = method === 'official_market_api'
    ? officialMarketApiUrl(value.discoveryUrl, brand)
    : method === 'official_product_page'
      ? officialProductPageUrl(value.discoveryUrl, brand)
      : officialSupportApiUrl(value.discoveryUrl, brand, sourceMarket);
  const expectedKey = modelKey(expectedModel, 'discovery target model');
  const requestedMatches = modelKey(value.requestedModel, 'discovery requested model') === expectedKey;
  const matchedMatches = modelKey(value.matchedModel, 'discovery matched model') === expectedKey;
  const approvedMarketVariant = method === 'official_market_api'
    ? officialMarketApiModelVariant({
      brand,
      model: expectedModel,
      category: context.category,
    }, value.matchedModel)
    : null;
  if (!requestedMatches || (!matchedMatches && !approvedMarketVariant)) {
    throw new TypeError('official artifact discovery model does not match target model');
  }
  const result = {
    schemaVersion: 1,
    method,
    market: discoverySeedPolicy.market,
    ...(sourceMarket ? { sourceMarket } : {}),
    discoveryUrl,
    requestedModel: requiredText(value.requestedModel, 'discovery requested model'),
    matchedModel: requiredText(value.matchedModel, 'discovery matched model'),
    artifactUrl,
    ...(value.documentId ? { documentId: requiredText(value.documentId, 'discovery document ID') } : {}),
    ...(value.originalFileName ? { originalFileName: requiredText(value.originalFileName, 'discovery original filename') } : {}),
  };
  const productPageFields = [
    'artifactLinkUrl', 'discoveryContentSha256', 'discoveryObjectPath', 'discoveryByteSize',
    'discoveryRecordType', 'documentTitleKey',
  ];
  if (method === 'official_product_page') {
    const artifactLinkUrl = canonicalHttpsUrl(value.artifactLinkUrl, 'discovery artifact link URL');
    if (!isOfficialBrandHostUrl(artifactLinkUrl, brand) && !isApprovedGlobalArtifactHost(artifactLinkUrl, brand)) {
      throw new TypeError(`discovery artifact link URL is not an approved official artifact host for ${brand}`);
    }
    validateOfficialProductPageArtifactRelationship(artifactLinkUrl, artifactUrl);
    const discoveryContentSha256 = requiredText(value.discoveryContentSha256, 'discovery content SHA-256');
    if (!/^[a-f0-9]{64}$/.test(discoveryContentSha256)) {
      throw new TypeError('discovery content SHA-256 invalid');
    }
    const discoveryObjectPath = requiredText(value.discoveryObjectPath, 'discovery object path');
    const expectedPath = `evidence/web/sha256/${discoveryContentSha256.slice(0, 2)}/${discoveryContentSha256.slice(2, 4)}/${discoveryContentSha256}.html`;
    if (discoveryObjectPath !== expectedPath) {
      throw new TypeError('content-addressed discovery object path required');
    }
    if (!Number.isInteger(value.discoveryByteSize) || value.discoveryByteSize <= 0) {
      throw new TypeError('positive discovery byte size required');
    }
    Object.assign(result, {
      artifactLinkUrl,
      discoveryContentSha256,
      discoveryObjectPath,
      discoveryByteSize: value.discoveryByteSize,
    });
    if (value.discoveryRecordType != null || value.documentTitleKey != null) {
      if (value.discoveryRecordType !== 'serialized_technical_document_manifest') {
        throw new TypeError('unsupported product-page discovery record type');
      }
      Object.assign(result, {
        discoveryRecordType: value.discoveryRecordType,
        documentId: requiredText(value.documentId, 'discovery document ID'),
        documentTitleKey: requiredText(value.documentTitleKey, 'discovery document title key'),
        originalFileName: requiredText(value.originalFileName, 'discovery original filename'),
      });
    }
  } else if (method === 'official_market_api'
    && officialMarketApiConfiguration(value.discoveryUrl, brand).endpoint.requiresBoundResponse === true) {
    const discoveryContentSha256 = requiredText(value.discoveryContentSha256, 'discovery content SHA-256');
    if (!/^[a-f0-9]{64}$/.test(discoveryContentSha256)) {
      throw new TypeError('discovery content SHA-256 invalid');
    }
    const discoveryObjectPath = requiredText(value.discoveryObjectPath, 'discovery object path');
    const expectedPath = `evidence/web/sha256/${discoveryContentSha256.slice(0, 2)}/${discoveryContentSha256.slice(2, 4)}/${discoveryContentSha256}.json`;
    if (discoveryObjectPath !== expectedPath) {
      throw new TypeError('content-addressed discovery object path required');
    }
    if (!Number.isInteger(value.discoveryByteSize) || value.discoveryByteSize <= 0) {
      throw new TypeError('positive discovery byte size required');
    }
    Object.assign(result, {
      discoveryContentSha256,
      discoveryObjectPath,
      discoveryByteSize: value.discoveryByteSize,
    });
  } else if (method === 'official_support_api' && value.discoveryContentSha256) {
    const artifactLinkUrl = canonicalHttpsUrl(value.artifactLinkUrl, 'discovery artifact link URL');
    if (!isOfficialBrandHostUrl(artifactLinkUrl, brand) && !isApprovedGlobalArtifactHost(artifactLinkUrl, brand)) {
      throw new TypeError(`discovery artifact link URL is not an approved official artifact host for ${brand}`);
    }
    const discoveryContentSha256 = requiredText(value.discoveryContentSha256, 'discovery content SHA-256');
    if (!/^[a-f0-9]{64}$/.test(discoveryContentSha256)) {
      throw new TypeError('discovery content SHA-256 invalid');
    }
    const discoveryObjectPath = requiredText(value.discoveryObjectPath, 'discovery object path');
    const expectedPath = `evidence/web/sha256/${discoveryContentSha256.slice(0, 2)}/${discoveryContentSha256.slice(2, 4)}/${discoveryContentSha256}.json`;
    if (discoveryObjectPath !== expectedPath) {
      throw new TypeError('content-addressed discovery object path required');
    }
    if (!Number.isInteger(value.discoveryByteSize) || value.discoveryByteSize <= 0) {
      throw new TypeError('positive discovery byte size required');
    }
    Object.assign(result, {
      artifactLinkUrl,
      discoveryContentSha256,
      discoveryObjectPath,
      discoveryByteSize: value.discoveryByteSize,
      documentId: requiredText(value.documentId, 'discovery document ID'),
    });
    if (value.discoveryRecordType != null) {
      if (value.discoveryRecordType !== 'support_document_resource') {
        throw new TypeError('unsupported support API discovery record type');
      }
      Object.assign(result, {
        discoveryRecordType: value.discoveryRecordType,
        documentTitleKey: requiredText(value.documentTitleKey, 'discovery document title key'),
        originalFileName: requiredText(value.originalFileName, 'discovery original filename'),
      });
    }
  } else if (method === 'official_support_api'
    && productPageFields.some((field) => value[field] != null)) {
    throw new TypeError('support API discovery evidence is incomplete');
  } else if (productPageFields.some((field) => value[field] != null)) {
    throw new TypeError('product-page discovery evidence is invalid for API provenance');
  }
  return result;
}

export function isOfficialBrandArtifactUrl(value, brand, context = {}) {
  if (isOfficialBrandUrl(value, brand)) return true;
  try {
    if (!isApprovedGlobalArtifactHost(value, brand)) return false;
    normalizeOfficialArtifactDiscoveryProvenance(context.discoveryProvenance, {
      brand,
      model: context.model,
      category: context.category,
      artifactUrl: value,
    });
    return true;
  } catch {
    return false;
  }
}

function trustedArtifactUrl(value, identity, discoveryProvenance) {
  if (isOfficialBrandUrl(value, identity.brand)) return new URL(value).toString();
  if (isApprovedGlobalArtifactHost(value, identity.brand)) {
    normalizeOfficialArtifactDiscoveryProvenance(discoveryProvenance, {
      brand: identity.brand,
      model: identity.model,
      category: identity.category,
      artifactUrl: value,
    });
    return new URL(value).toString();
  }
  if (isOfficialBrandHostUrl(value, identity.brand)) {
    // Preserve the native-host market diagnostic instead of misclassifying it as an unknown host.
    return trustedUrl(value, identity.brand, 'source URL');
  }
  throw new TypeError(`source URL is not an official host for ${identity.brand}`);
}

function trustedArtifactHopUrl(value, identity, sourceUrl, discoveryProvenance, label) {
  const normalized = canonicalHttpsUrl(value, label);
  if (isOfficialBrandHostUrl(normalized, identity.brand)) {
    if (!isOfficialNativeArtifactHopUrl(normalized, identity.brand)) {
      throw new TypeError(`${label} does not match the Australian market`);
    }
    return normalized;
  }
  if (!isOfficialBrandArtifactHostUrl(normalized, identity.brand, {
    model: identity.model,
    category: identity.category,
    artifactUrl: sourceUrl,
    discoveryProvenance,
  })) {
    throw new TypeError(`${label} is not an approved official artifact host for ${identity.brand}`);
  }
  return normalized;
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
  const sourceModel = requiredText(sourceIdentity?.sourceModel, 'alias source model');
  if (sourceModel.toUpperCase().replace(/[^A-Z0-9]+/g, '')
    === identity.model.toUpperCase().replace(/[^A-Z0-9]+/g, '')) {
    throw new TypeError('alias source model must differ from target model');
  }
  if (!(source?.claims ?? []).every((claim) => ALIAS_DIMENSION_FIELDS.has(claim?.field))) {
    throw new TypeError('official marketing alias is dimensions only');
  }
  const signalTypes = new Set((source?.identitySignals ?? []).map((signal) => signal?.type));
  if (contentType === 'application/pdf') {
    if (!isStrictOfficialModelVariantPdfSource(source, identity)) {
      throw new TypeError(`official model variant PDF binding invalid: ${strictOfficialModelVariantPdfFailure(source, identity)}`);
    }
    return { ...identity, outcome, sourceModel };
  }
  if (contentType === 'application/json') {
    if (!isStrictOfficialModelVariantApiSource(source, identity)) {
      throw new TypeError(`official model variant API binding invalid: ${strictOfficialModelVariantApiFailure(source, identity)}`);
    }
    return { ...identity, outcome, sourceModel };
  }
  if (contentType !== 'text/html') throw new TypeError('official marketing alias requires HTML, bound PDF, or bound API evidence');
  for (const required of ['document_title', 'canonical_source_model']) {
    if (!signalTypes.has(required)) throw new TypeError(`official marketing alias missing ${required}`);
  }
  if (!signalTypes.has('official_alias_binding') && !signalTypes.has('official_variant_binding')) {
    throw new TypeError('official marketing alias missing official binding');
  }
  if (signalTypes.has('official_variant_binding')) {
    const variant = officialHtmlModelVariant(identity, sourceModel);
    if (!variant) throw new TypeError('official HTML model variant is not policy approved');
    const binding = source.identitySignals.find((signal) => signal?.type === 'official_variant_binding');
    if (binding?.value !== `${identity.model} -> ${variant.sourceModel} (${variant.suffix})`) {
      throw new TypeError('official HTML model variant binding invalid');
    }
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

export function currentMineruEvidenceProfile(artifact) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    throw new TypeError('current MinerU JSON derived artifact required');
  }
  const profiles = resolutionPolicy.pdfEvidenceProfiles ?? [];
  const primary = profiles.find((profile) => profile.role === 'primary') ?? {
    profileId: 'pipeline-auto-v1',
    ...resolutionPolicy.pdfEvidence,
    tableEnabled: true,
    formulaEnabled: false,
  };
  const profile = artifact.profileId == null
    ? primary
    : profiles.find((candidate) => candidate.profileId === artifact.profileId);
  if (!profile || artifact.schemaVersion !== 1
    || artifact.format !== profile.requiredFormat
    || artifact.parserName !== profile.parserName
    || artifact.parserVersion !== profile.parserVersion
    || artifact.modelRevision !== profile.modelRevision
    || artifact.backend !== profile.backend
    || artifact.method !== profile.method
    || artifact.tableEnabled !== true || artifact.formulaEnabled !== false
    || (artifact.profileId != null && artifact.profileId !== profile.profileId)
    || (profile.effort != null && artifact.effort !== profile.effort)
    || (profile.imageAnalysis != null && artifact.imageAnalysis !== profile.imageAnalysis)) {
    throw new TypeError('current MinerU parsing profile required');
  }
  if (profile.role === 'image_dimension_fallback') {
    const trigger = artifact.fallbackTrigger;
    const pages = [...new Set(trigger?.pages ?? [])].sort((left, right) => left - right);
    const pageReasons = trigger?.pageReasons == null ? null : [...trigger.pageReasons]
      .sort((left, right) => left.page - right.page);
    const hash = String(trigger?.contentSha256 ?? '');
    const expectedPath = `evidence/derived/mineru-json/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`;
    if (trigger?.profileId !== 'pipeline-auto-v1'
      || !/^[a-f0-9]{64}$/.test(hash)
      || trigger?.objectPath !== expectedPath
      || !Array.isArray(trigger?.pages) || pages.length !== trigger.pages.length || !pages.length
      || pages.some((page) => !Number.isInteger(page) || page < 1)
      || (artifact.processedPages != null
        && JSON.stringify(pages) !== JSON.stringify([...artifact.processedPages].sort((a, b) => a - b)))) {
      throw new TypeError('hash-bound primary MinerU fallback trigger required');
    }
    if (pageReasons && (pageReasons.length !== pages.length
      || pageReasons.some((entry, index) => entry?.page !== pages[index]
        || !['image_dimension_signal', 'operational_page_failure'].includes(entry?.reason)
        || (entry.reason === 'operational_page_failure'
          ? entry.failureCode !== 'MINERU_COMMAND_FAILED'
          : entry.failureCode != null)))) {
      throw new TypeError('bounded MinerU fallback page reasons required');
    }
  }
  return profile;
}

function normalizedDerivedArtifact(source) {
  const contentType = requiredText(source?.contentType, 'content type').toLowerCase();
  if (contentType !== 'application/pdf') return null;
  const artifact = source?.derivedArtifact;
  const profile = currentMineruEvidenceProfile(artifact);
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
  const normalized = {
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
  if (artifact.profileId != null) {
    normalized.profileId = profile.profileId;
    if (profile.effort != null) normalized.effort = profile.effort;
    if (profile.imageAnalysis != null) normalized.imageAnalysis = profile.imageAnalysis;
  }
  if (artifact.fallbackTrigger != null) {
    normalized.fallbackTrigger = {
      profileId: artifact.fallbackTrigger.profileId,
      contentSha256: artifact.fallbackTrigger.contentSha256,
      objectPath: artifact.fallbackTrigger.objectPath,
      pages: [...artifact.fallbackTrigger.pages],
      ...(artifact.fallbackTrigger.pageReasons ? {
        pageReasons: artifact.fallbackTrigger.pageReasons.map((entry) => ({ ...entry })),
      } : {}),
    };
  }
  if (artifact.processedPages != null || artifact.sourcePageCount != null) {
    if (!Array.isArray(artifact.processedPages) || !artifact.processedPages.length
      || artifact.sourcePageCount !== artifact.pageCount) {
      throw new TypeError('derived artifact original page map invalid');
    }
    const processedPages = [...new Set(artifact.processedPages)].sort((left, right) => left - right);
    if (processedPages.length !== artifact.processedPages.length
      || processedPages.some((page) => !Number.isInteger(page) || page < 1 || page > artifact.pageCount)) {
      throw new TypeError('derived artifact processed pages invalid');
    }
    normalized.processedPages = processedPages;
    normalized.sourcePageCount = artifact.sourcePageCount;
  }
  return normalized;
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

function supportedDiscoveryReceiptPolicyVersions() {
  const values = discoverySeedPolicy.supportedReceiptPolicyVersions ?? [discoverySeedPolicy.policyVersion];
  if (!Array.isArray(values) || !values.includes(discoverySeedPolicy.policyVersion)
    || values.some((value) => typeof value !== 'string' || !value.trim())) {
    throw new TypeError('discovery receipt policy version allowlist invalid');
  }
  return [...new Set(values)];
}

function supportedManufacturerReceiptPolicyVersions() {
  const values = manufacturerPolicy.supportedReceiptPolicyVersions ?? [manufacturerPolicy.policyVersion];
  if (!Array.isArray(values) || !values.includes(manufacturerPolicy.policyVersion)
    || values.some((value) => typeof value !== 'string' || !value.trim())) {
    throw new TypeError('manufacturer receipt policy version allowlist invalid');
  }
  return [...new Set(values)];
}

function manufacturerReceiptPolicyVersion(value) {
  const normalized = requiredText(value, 'manufacturer policy version');
  if (!supportedManufacturerReceiptPolicyVersions().includes(normalized)) {
    throw new TypeError(`manufacturer policy version is not supported: ${normalized}`);
  }
  return normalized;
}

function discoveryReceiptPolicyVersion(value) {
  const normalized = requiredText(value, 'discovery policy version');
  if (!supportedDiscoveryReceiptPolicyVersions().includes(normalized)) {
    throw new TypeError(`discovery policy version is not supported: ${normalized}`);
  }
  return normalized;
}

function receiptPayload(
  source,
  caseIdentity,
  verifiedAt,
  claimSemanticsVersion = 1,
  discoveryPolicyVersion = discoverySeedPolicy.policyVersion,
  manufacturerPolicyVersion = manufacturerPolicy.policyVersion,
) {
  const identity = normalizedIdentity(caseIdentity);
  const contentType = requiredText(source?.contentType, 'content type').toLowerCase();
  const contract = receiptContract(claimSemanticsVersion);
  const requestedUrl = trustedArtifactUrl(source?.sourceUrl, identity, source?.discoveryProvenance);
  const transport = officialTransport(source?.transport, source);
  return {
    schemaVersion: contract.schemaVersion,
    ...(contract.claimSemanticsVersion === null ? {} : {
      claimSemanticsVersion: contract.claimSemanticsVersion,
    }),
    policyVersion: contract.policyVersion,
    manufacturerPolicyVersion: manufacturerReceiptPolicyVersion(manufacturerPolicyVersion),
    verifiedAt,
    caseIdentity: identity,
    sourceIdentity: normalizedSourceIdentity(source, identity, contentType),
    source: {
      requestedUrl,
      finalUrl: trustedArtifactHopUrl(
        source?.finalUrl,
        identity,
        requestedUrl,
        source?.discoveryProvenance,
        'final URL',
      ),
      redirectChain: (source?.redirectChain ?? []).map((url, index) => trustedArtifactHopUrl(
        url,
        identity,
        requestedUrl,
        source?.discoveryProvenance,
        `redirect ${index + 1}`,
      )),
      retrievedAt: requiredText(source?.retrievedAt, 'retrieval time'),
      contentSha256: requiredText(source?.contentSha256, 'content SHA-256'),
      objectPath: requiredText(source?.objectPath, 'object path'),
      contentType,
      byteSize: source?.byteSize,
      ...(transport ? { transport } : {}),
      supersedesContentSha256: normalizedSupersededHashes(source?.supersedesContentSha256),
      derivedArtifact: normalizedDerivedArtifact(source),
      ...(source?.discoveryProvenance ? {
        discoveryPolicyVersion: discoveryReceiptPolicyVersion(discoveryPolicyVersion),
        discoveryProvenance: normalizeOfficialArtifactDiscoveryProvenance(source.discoveryProvenance, {
          brand: identity.brand,
          model: identity.model,
          category: identity.category,
          artifactUrl: source.sourceUrl,
        }),
      } : {}),
    },
    identitySignals: normalizedSignals(source?.identitySignals),
    claims: normalizedClaims(source?.claims, contentType, claimSemanticsVersion),
  };
}

export function validateTrustedSourceMetadata(source, caseIdentity, options = {}) {
  const identity = normalizedIdentity(caseIdentity);
  if (source?.authority !== 'manufacturer') throw new TypeError('manufacturer authority required');
  const requestedUrl = trustedArtifactUrl(source?.sourceUrl, identity, source?.discoveryProvenance);
  trustedArtifactHopUrl(source?.finalUrl, identity, requestedUrl, source?.discoveryProvenance, 'final URL');
  const redirects = source?.redirectChain ?? [];
  if (!Array.isArray(redirects) || redirects.length > resolutionPolicy.maximumRedirects) {
    throw new TypeError('redirect chain invalid');
  }
  redirects.forEach((url, index) => trustedArtifactHopUrl(
    url,
    identity,
    requestedUrl,
    source?.discoveryProvenance,
    `redirect ${index + 1}`,
  ));
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
  officialTransport(source?.transport, source);
  if (normalizedSupersededHashes(source?.supersedesContentSha256).includes(source.contentSha256)) {
    throw new TypeError('source cannot supersede itself');
  }
  const contentType = requiredText(source?.contentType, 'content type').toLowerCase();
  if (!['text/html', 'application/pdf', 'application/json'].includes(contentType)) {
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
  if (source?.discoveryProvenance?.method === 'official_product_page') {
    const provenance = normalizeOfficialArtifactDiscoveryProvenance(source.discoveryProvenance, {
      brand: caseIdentity?.brand,
      model: caseIdentity?.model,
      category: caseIdentity?.category,
      artifactUrl: source?.sourceUrl,
    });
    const relationshipOnly = options.allowOfficialProductPageArtifactRelationship === true
      && (source.identitySignals ?? []).some((signal) => (
        signal?.type === 'official_product_page_artifact_relationship'
      ));
    verifyOfficialProductPageDiscoveryEvidence(
      provenance,
      caseIdentity,
      options.discoveryArtifactBytes,
      { requireExactModel: !relationshipOnly },
    );
  }
  if (source?.discoveryProvenance?.method === 'official_market_api'
    && source.discoveryProvenance.discoveryContentSha256) {
    const provenance = normalizeOfficialArtifactDiscoveryProvenance(source.discoveryProvenance, {
      brand: caseIdentity?.brand,
      model: caseIdentity?.model,
      category: caseIdentity?.category,
      artifactUrl: source?.sourceUrl,
    });
    verifyOfficialMarketApiDiscoveryEvidence(provenance, caseIdentity, options.discoveryArtifactBytes);
  }
  if (source?.discoveryProvenance?.method === 'official_support_api'
    && source.discoveryProvenance.discoveryContentSha256) {
    const provenance = normalizeOfficialArtifactDiscoveryProvenance(source.discoveryProvenance, {
      brand: caseIdentity?.brand,
      model: caseIdentity?.model,
      category: caseIdentity?.category,
      artifactUrl: source?.sourceUrl,
    });
    verifyOfficialSupportApiDiscoveryEvidence(provenance, caseIdentity, options.discoveryArtifactBytes);
  }
  if (verifiedMilliseconds < parseTime(source.retrievedAt, 'retrieval time')) {
    throw new TypeError('verification time precedes retrieval time');
  }
  const discoveryPolicyVersion = source?.discoveryProvenance
    ? discoveryReceiptPolicyVersion(options.discoveryPolicyVersion ?? discoverySeedPolicy.policyVersion)
    : null;
  const manufacturerPolicyVersion = manufacturerReceiptPolicyVersion(
    options.manufacturerPolicyVersion ?? manufacturerPolicy.policyVersion,
  );
  const payload = receiptPayload(
    source,
    caseIdentity,
    verifiedAt,
    claimSemanticsVersion,
    discoveryPolicyVersion ?? discoverySeedPolicy.policyVersion,
    manufacturerPolicyVersion,
  );
  return Object.freeze({
    schemaVersion: payload.schemaVersion,
    ...(claimSemanticsVersion === 1 ? {} : { claimSemanticsVersion }),
    policyVersion: payload.policyVersion,
    manufacturerPolicyVersion: payload.manufacturerPolicyVersion,
    ...(discoveryPolicyVersion ? { discoveryPolicyVersion } : {}),
    verifiedAt,
    bindingSha256: digest(payload),
  });
}

function receiptClaimSemanticsVersion(receipt) {
  if (receipt?.schemaVersion === resolutionPolicy.receiptSchemaVersion) return 1;
  if (receipt?.schemaVersion === resolutionPolicy.claimSemanticsReceiptSchemaVersion) {
    return receipt.claimSemanticsVersion;
  }
  return null;
}

export function verificationReceiptDiscoveryPolicyVersion(source, caseIdentity) {
  const receipt = source?.verificationReceipt;
  const claimSemanticsVersion = receiptClaimSemanticsVersion(receipt);
  let contract;
  try { contract = receiptContract(claimSemanticsVersion); } catch { contract = null; }
  if (!receipt || !contract || receipt.schemaVersion !== contract.schemaVersion
    || receipt.policyVersion !== contract.policyVersion
    || !supportedManufacturerReceiptPolicyVersions().includes(receipt.manufacturerPolicyVersion)) {
    throw new TypeError('current verification receipt required');
  }
  if (!source?.discoveryProvenance) {
    if (receipt.discoveryPolicyVersion != null) {
      throw new TypeError('discovery policy version requires discovery provenance');
    }
    const matches = receipt.bindingSha256 === digest(receiptPayload(
      source,
      caseIdentity,
      receipt.verifiedAt,
      claimSemanticsVersion,
      discoverySeedPolicy.policyVersion,
      receipt.manufacturerPolicyVersion,
    ));
    if (!matches) throw new Error('verification receipt digest mismatch');
    return null;
  }
  const candidates = receipt.discoveryPolicyVersion != null
    ? [discoveryReceiptPolicyVersion(receipt.discoveryPolicyVersion)]
    : supportedDiscoveryReceiptPolicyVersions();
  const matches = candidates.filter((discoveryPolicyVersion) => (
    receipt.bindingSha256 === digest(receiptPayload(
      source,
      caseIdentity,
      receipt.verifiedAt,
      claimSemanticsVersion,
      discoveryPolicyVersion,
      receipt.manufacturerPolicyVersion,
    ))
  ));
  if (matches.length !== 1) throw new Error('verification receipt digest mismatch');
  return matches[0];
}

export function verificationReceiptManufacturerPolicyVersion(source) {
  const receipt = source?.verificationReceipt;
  const claimSemanticsVersion = receiptClaimSemanticsVersion(receipt);
  let contract;
  try { contract = receiptContract(claimSemanticsVersion); } catch { contract = null; }
  if (!receipt || !contract || receipt.schemaVersion !== contract.schemaVersion
    || receipt.policyVersion !== contract.policyVersion) {
    throw new TypeError('current verification receipt required');
  }
  return manufacturerReceiptPolicyVersion(receipt.manufacturerPolicyVersion);
}

export function verifyVerificationReceipt(source, caseIdentity, options = {}) {
  const receipt = source?.verificationReceipt;
  const claimSemanticsVersion = receiptClaimSemanticsVersion(receipt);
  let contract;
  try { contract = receiptContract(claimSemanticsVersion); } catch { contract = null; }
  if (!receipt || !contract || receipt.schemaVersion !== contract.schemaVersion
    || receipt.policyVersion !== contract.policyVersion
    || !supportedManufacturerReceiptPolicyVersions().includes(receipt.manufacturerPolicyVersion)) {
    throw new TypeError('current verification receipt required');
  }
  parseTime(receipt.verifiedAt, 'verification time');
  validateTrustedSourceMetadata(source, caseIdentity, {
    asOf: options.asOf ?? receipt.verifiedAt,
    claimSemanticsVersion,
  });
  if (source?.discoveryProvenance?.method === 'official_product_page'
    && options.discoveryArtifactBytes != null) {
    const provenance = normalizeOfficialArtifactDiscoveryProvenance(source.discoveryProvenance, {
      brand: caseIdentity?.brand,
      model: caseIdentity?.model,
      category: caseIdentity?.category,
      artifactUrl: source?.sourceUrl,
    });
    const relationshipOnly = (source.identitySignals ?? []).some((signal) => (
      signal?.type === 'official_product_page_artifact_relationship'
    ));
    verifyOfficialProductPageDiscoveryEvidence(
      provenance,
      caseIdentity,
      options.discoveryArtifactBytes,
      { requireExactModel: !relationshipOnly },
    );
  }
  if (source?.discoveryProvenance?.method === 'official_market_api'
    && source.discoveryProvenance.discoveryContentSha256
    && options.discoveryArtifactBytes != null) {
    const provenance = normalizeOfficialArtifactDiscoveryProvenance(source.discoveryProvenance, {
      brand: caseIdentity?.brand,
      model: caseIdentity?.model,
      category: caseIdentity?.category,
      artifactUrl: source?.sourceUrl,
    });
    verifyOfficialMarketApiDiscoveryEvidence(provenance, caseIdentity, options.discoveryArtifactBytes);
  }
  if (source?.discoveryProvenance?.method === 'official_support_api'
    && source.discoveryProvenance.discoveryContentSha256
    && options.discoveryArtifactBytes != null) {
    const provenance = normalizeOfficialArtifactDiscoveryProvenance(source.discoveryProvenance, {
      brand: caseIdentity?.brand,
      model: caseIdentity?.model,
      category: caseIdentity?.category,
      artifactUrl: source?.sourceUrl,
    });
    verifyOfficialSupportApiDiscoveryEvidence(provenance, caseIdentity, options.discoveryArtifactBytes);
  }
  verificationReceiptDiscoveryPolicyVersion(source, caseIdentity);
  return true;
}

export const evidenceSourcePolicy = Object.freeze({
  manufacturerPolicy: Object.freeze(manufacturerPolicy),
  resolutionPolicy: Object.freeze(resolutionPolicy),
});
