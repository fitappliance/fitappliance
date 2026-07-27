import { createHash } from 'node:crypto';
import { load } from 'cheerio';

import { containsExactModel } from './evidence-claim-semantics.mjs';

function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function modelKey(value, label) {
  return requiredText(value, label).toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function canonicalUrl(value, base = undefined) {
  const url = new URL(requiredText(value, 'discovery artifact link URL'), base);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError('discovery artifact link URL must use trusted HTTPS');
  }
  url.hash = '';
  return url.toString();
}

function salesforceDocumentPath(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/sfc\/p\/[^/]+\/a\/([^/]+)\/([^/]+)\/?$/);
    return match ? `/a/${match[1]}/${match[2]}` : null;
  } catch {
    return null;
  }
}

function serializedScriptArtifactUrls(value) {
  const decoded = String(value ?? '')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/&amp;/gi, '&');
  const urls = [];
  const pattern = /"(?:url|href|downloadUrl)"\s*:\s*"(https:\/\/[^"\\\s<>]+)"/g;
  for (const match of decoded.matchAll(pattern)) urls.push(match[1]);
  return urls;
}

function serializedTechnicalDocumentRecords(value) {
  const decoded = String(value ?? '')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/&amp;/gi, '&');
  const records = [];
  for (const match of decoded.matchAll(/\{[^{}]{1,8192}\}/g)) {
    let record;
    try { record = JSON.parse(match[0]); } catch { continue; }
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    const id = String(record.id ?? '').trim();
    const titleKey = String(record.titleKey ?? '').trim();
    const filename = String(record.filename ?? '').trim();
    if (!id || !titleKey || !filename || !record.url) continue;
    let url;
    try { url = canonicalUrl(record.url); } catch { continue; }
    records.push({ id, titleKey, filename, url });
  }
  return records;
}

function structuredSupportArtifactUrls($) {
  const urls = [];
  $('[data-sdf-prop="contents"]').each((_, element) => {
    let payload;
    try {
      payload = JSON.parse($(element).text().trim());
    } catch {
      return;
    }
    for (const manual of Array.isArray(payload?.manuals) ? payload.manuals : []) {
      if (typeof manual?.downloadUrl !== 'string') continue;
      try { urls.push(canonicalUrl(manual.downloadUrl)); } catch { /* Ignore malformed records. */ }
    }
  });
  return urls;
}

function structuredSupportValue($, property, label) {
  const values = new Set($(`[data-sdf-prop="${property}"]`)
    .map((_, element) => requiredText($(element).text(), label))
    .get());
  if (values.size !== 1) throw new Error(`official support page requires one ${label}`);
  return [...values][0];
}

export function officialProductPageBoundSupportFamilyModel(provenance, caseIdentity, bytes) {
  if (provenance?.method !== 'official_product_page'
    || modelKey(caseIdentity?.brand, 'target brand') !== 'SAMSUNG'
    || requiredText(caseIdentity?.category, 'target category') !== 'fridge') return null;

  verifyOfficialProductPageDiscoveryEvidence(provenance, caseIdentity, bytes);
  const discoveryUrl = new URL(provenance.discoveryUrl);
  if (discoveryUrl.hostname.toLowerCase() !== 'www.samsung.com') return null;
  const segments = discoveryUrl.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (segments.length !== 5 || segments[0] !== 'au' || segments[1] !== 'support'
    || segments[2] !== 'model') return null;

  const targetModel = modelKey(caseIdentity.model, 'target model');
  if (modelKey(provenance.requestedModel, 'requested model') !== targetModel
    || modelKey(provenance.matchedModel, 'matched model') !== targetModel) return null;
  const $ = load(Buffer.from(bytes).toString('utf8'));
  if (modelKey(structuredSupportValue($, 'modelName', 'support marketing model'), 'support marketing model')
    !== targetModel) return null;
  const sourceModel = structuredSupportValue($, 'modelCode', 'support canonical model');
  if (modelKey(`${segments[3]}/${segments[4]}`, 'support URL canonical model')
    !== modelKey(sourceModel, 'support canonical model')) return null;

  const artifact = new URL(canonicalUrl(provenance.artifactLinkUrl));
  if (artifact.hostname.toLowerCase() !== 'org.downloadcenter.samsung.com'
    || artifact.pathname.toLowerCase() !== '/downloadfile/contentsfile.aspx'
    || modelKey(artifact.searchParams.get('CDSite'), 'Samsung document site') !== 'UNIAU'
    || modelKey(artifact.searchParams.get('CDCttType'), 'Samsung document type') !== 'UM'
    || modelKey(artifact.searchParams.get('ModelName'), 'Samsung document model') !== targetModel
    || !/^\d+$/.test(requiredText(artifact.searchParams.get('CttFileID'), 'Samsung document ID'))) {
    return null;
  }
  if (!/^RF71A[A-Z0-9]{5,14}\/SA$/i.test(sourceModel)) return null;
  return Object.freeze({ familyModel: 'RF71A', sourceModel });
}

export function validateOfficialProductPageArtifactRelationship(artifactLinkUrl, artifactUrl) {
  const linked = new URL(canonicalUrl(artifactLinkUrl));
  const artifact = new URL(canonicalUrl(artifactUrl));
  if (linked.toString() === artifact.toString()) return true;

  const host = 'fisherpaykel.my.salesforce.com';
  const linkedDocumentPath = linked.hostname.toLowerCase() === host
    ? salesforceDocumentPath(linked)
    : null;
  const downloadedDocumentPath = artifact.hostname.toLowerCase() === host
    && artifact.pathname === '/sfc/dist/version/download/'
    ? artifact.searchParams.get('d')
    : null;
  if (!linkedDocumentPath || downloadedDocumentPath !== linkedDocumentPath) {
    throw new TypeError('official product-page artifact link relationship invalid');
  }
  return true;
}

export function verifyOfficialProductPageDiscoveryEvidence(provenance, caseIdentity, bytes, options = {}) {
  if (provenance?.method !== 'official_product_page') return true;
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    throw new TypeError('discovery artifact bytes required');
  }
  const buffer = Buffer.from(bytes);
  const hash = createHash('sha256').update(buffer).digest('hex');
  if (hash !== provenance.discoveryContentSha256) {
    throw new Error('discovery artifact hash mismatch');
  }
  if (buffer.length !== provenance.discoveryByteSize) {
    throw new Error('discovery artifact byte size mismatch');
  }
  const expectedPath = `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.html`;
  if (provenance.discoveryObjectPath !== expectedPath) {
    throw new TypeError('content-addressed discovery object path required');
  }
  validateOfficialProductPageArtifactRelationship(provenance.artifactLinkUrl, provenance.artifactUrl);

  const $ = load(buffer.toString('utf8'));
  const pageText = [
    $('title').text(),
    $('body').text(),
    $('meta[content]').map((_, element) => $(element).attr('content')).get().join(' '),
  ].join(' ');
  const exactModelMatched = containsExactModel(
    pageText,
    requiredText(caseIdentity?.model, 'discovery target model'),
  );
  if (!exactModelMatched && options.requireExactModel !== false) {
    throw new Error('official discovery page does not prove the exact model');
  }

  const linkedUrls = new Set();
  $('a[href],link[href],iframe[src],embed[src],object[data]').each((_, element) => {
    const value = $(element).attr('href') ?? $(element).attr('src') ?? $(element).attr('data');
    if (!value) return;
    try { linkedUrls.add(canonicalUrl(value, provenance.discoveryUrl)); } catch { /* Ignore malformed page links. */ }
  });
  $('script').each((_, element) => {
    for (const value of serializedScriptArtifactUrls($(element).text())) {
      try { linkedUrls.add(canonicalUrl(value, provenance.discoveryUrl)); } catch { /* Ignore malformed script URLs. */ }
    }
  });
  for (const value of structuredSupportArtifactUrls($)) linkedUrls.add(value);
  if (!linkedUrls.has(canonicalUrl(provenance.artifactLinkUrl))) {
    throw new Error('official discovery page is missing the declared artifact link');
  }
  if (provenance.discoveryRecordType === 'serialized_technical_document_manifest') {
    const expected = {
      id: requiredText(provenance.documentId, 'discovery document ID'),
      titleKey: requiredText(provenance.documentTitleKey, 'discovery document title key'),
      filename: requiredText(provenance.originalFileName, 'discovery original filename'),
      url: canonicalUrl(provenance.artifactLinkUrl),
    };
    const records = [];
    $('script').each((_, element) => {
      records.push(...serializedTechnicalDocumentRecords($(element).text()));
    });
    const matchingId = records.filter((record) => record.id === expected.id);
    const distinctRows = new Set(matchingId.map((record) => JSON.stringify(record)));
    if (distinctRows.size > 1) {
      throw new Error('official discovery manifest record is conflicting');
    }
    if (!matchingId.some((record) => (
      record.titleKey === expected.titleKey
        && record.filename === expected.filename
        && record.url === expected.url
    ))) {
      throw new Error('official discovery manifest record does not match declared document');
    }
  }
  return { exactModelMatched };
}
