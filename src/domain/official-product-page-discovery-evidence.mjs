import { createHash } from 'node:crypto';
import { load } from 'cheerio';

import { containsExactModel } from './evidence-claim-semantics.mjs';

function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
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

export function verifyOfficialProductPageDiscoveryEvidence(provenance, caseIdentity, bytes) {
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
  if (!containsExactModel(pageText, requiredText(caseIdentity?.model, 'discovery target model'))) {
    throw new Error('official discovery page does not prove the exact model');
  }

  const linkedUrls = new Set();
  $('a[href],link[href],iframe[src],embed[src],object[data]').each((_, element) => {
    const value = $(element).attr('href') ?? $(element).attr('src') ?? $(element).attr('data');
    if (!value) return;
    try { linkedUrls.add(canonicalUrl(value, provenance.discoveryUrl)); } catch { /* Ignore malformed page links. */ }
  });
  if (!linkedUrls.has(canonicalUrl(provenance.artifactLinkUrl))) {
    throw new Error('official discovery page is missing the declared artifact link');
  }
  return true;
}
