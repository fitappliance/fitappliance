import { createHash } from 'node:crypto';

function requiredText(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function modelKey(value, label) {
  return requiredText(value, label).toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function canonicalUrl(value, label) {
  const url = new URL(requiredText(value, label));
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError(`${label} must use trusted HTTPS`);
  }
  return url.toString();
}

function articleLinks(article) {
  const text = String(article?.articleBody ?? '')
    .replace(/&amp;/gi, '&')
    .replace(/\\\//g, '/');
  const links = new Set();
  const attributes = /\b(?:href|src|data-url)=["']([^"']+)["']/gi;
  let match;
  while ((match = attributes.exec(text))) {
    try { links.add(canonicalUrl(match[1], 'support article artifact link')); } catch { /* Ignore non-HTTPS links. */ }
  }
  return links;
}

function singleQueryValue(url, name) {
  const values = url.searchParams.getAll(name);
  if (values.length !== 1 || values[0] === '') {
    throw new Error(`support API artifact URL requires one ${name} value`);
  }
  return values[0];
}

function salesforcePublicDistributionIdentity(url) {
  const segments = url.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
  if (segments.length !== 6 || segments[0] !== 'sfc' || segments[1] !== 'p'
    || segments[3] !== 'a') {
    throw new Error('support API artifact link is not a Salesforce public distribution URL');
  }
  const [, , orgPublic, keyPrefix, recordSuffix, token] = segments;
  if (!/^[A-Za-z0-9]{12,18}$/.test(orgPublic)
    || !/^Jw[A-Za-z0-9]{10,16}$/.test(recordSuffix)
    || !/^[A-Za-z0-9._-]{16,256}$/.test(token)) {
    throw new Error('support API Salesforce distribution identity is invalid');
  }
  return {
    oid: `00D${orgPublic}`,
    distributionPath: `/${keyPrefix}/${recordSuffix}/${token}`,
  };
}

function validateArtifactRelationship(linkValue, artifactValue) {
  const link = new URL(canonicalUrl(linkValue, 'support API artifact link URL'));
  const artifact = new URL(canonicalUrl(artifactValue, 'support API artifact URL'));
  if (link.toString() === artifact.toString()) return true;
  if (link.origin !== artifact.origin
    || !/^\/sfc\/dist\/version\/download\/?$/.test(artifact.pathname)) {
    throw new Error('support API artifact link does not resolve to the declared artifact');
  }
  const identity = salesforcePublicDistributionIdentity(link);
  if (singleQueryValue(artifact, 'oid') !== identity.oid
    || singleQueryValue(artifact, 'd') !== identity.distributionPath
    || singleQueryValue(artifact, 'operationContext') !== 'DELIVERY'
    || !/^068[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/.test(singleQueryValue(artifact, 'ids'))
    || !/^05H[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/.test(singleQueryValue(artifact, 'viewId'))) {
    throw new Error('support API artifact link does not resolve to the declared artifact');
  }
  return true;
}

export function verifyOfficialSupportApiDiscoveryEvidence(provenance, caseIdentity, bytes) {
  if (provenance?.method !== 'official_support_api' || !provenance.discoveryContentSha256) return true;
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    throw new TypeError('discovery artifact bytes required');
  }
  const buffer = Buffer.from(bytes);
  const hash = createHash('sha256').update(buffer).digest('hex');
  if (hash !== provenance.discoveryContentSha256) throw new Error('discovery artifact hash mismatch');
  if (buffer.length !== provenance.discoveryByteSize) throw new Error('discovery artifact byte size mismatch');
  const expectedPath = `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`;
  if (provenance.discoveryObjectPath !== expectedPath) {
    throw new TypeError('content-addressed discovery object path required');
  }
  let payload;
  try { payload = JSON.parse(buffer.toString('utf8')); } catch {
    throw new Error('official support API discovery artifact is invalid JSON');
  }
  const targetModel = modelKey(caseIdentity?.model, 'discovery target model');
  if (modelKey(payload?.product?.modelNumber, 'support API model') !== targetModel) {
    throw new Error('official support API does not prove the exact model');
  }
  const documentId = requiredText(provenance.documentId, 'support API document ID');
  const articles = (Array.isArray(payload?.product?.articles) ? payload.product.articles : [])
    .filter((article) => String(article?.id ?? '').trim() === documentId);
  if (articles.length !== 1) {
    throw new Error('official support API does not prove one exact document ID');
  }
  const artifactLinkUrl = canonicalUrl(provenance.artifactLinkUrl, 'support API artifact link URL');
  if (!articleLinks(articles[0]).has(artifactLinkUrl)) {
    throw new Error('official support API exact document is missing the declared artifact link');
  }
  validateArtifactRelationship(artifactLinkUrl, provenance.artifactUrl);
  return true;
}

export function officialSupportApiBoundFamilyModel(provenance, caseIdentity, discoveryBytes) {
  if (provenance?.method !== 'official_support_api' || !provenance.discoveryContentSha256) return null;
  if (modelKey(caseIdentity?.brand, 'target brand') !== 'FISHERPAYKEL') return null;
  const category = requiredText(caseIdentity?.category, 'target category');
  const targetModel = modelKey(caseIdentity?.model, 'target model');
  let familyModel = null;
  if (category === 'fridge' && /^RF610A[A-Z0-9]{3,12}$/.test(targetModel)) {
    familyModel = 'RF610A';
  } else if (category === 'dishwasher') {
    if (/^DW60CHP[WX]\d+$/.test(targetModel)) familyModel = 'DW60CHP';
    else if (/^DW60CH[WX]\d+$/.test(targetModel)) familyModel = 'DW60CH';
    else if (/^DW60CK[WX]\d+$/.test(targetModel)) familyModel = 'DW60CK';
  }
  if (!familyModel) return null;
  verifyOfficialSupportApiDiscoveryEvidence(provenance, caseIdentity, discoveryBytes);
  if (category === 'dishwasher') {
    const payload = JSON.parse(Buffer.from(discoveryBytes).toString('utf8'));
    const article = (Array.isArray(payload?.product?.articles) ? payload.product.articles : [])
      .find((entry) => String(entry?.id ?? '').trim() === String(provenance.documentId).trim());
    const articleScope = `${requiredText(article?.title, 'support article title')} ${String(article?.articleType ?? '')}`;
    if (!/\binstallation\b/i.test(articleScope)) return null;
  }
  return familyModel;
}
