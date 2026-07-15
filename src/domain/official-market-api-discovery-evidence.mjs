import { createHash } from 'node:crypto';

import {
  hasMineruBoundExactCoverIdentity,
  hasMineruBoundFamilyIdentity,
  hasMineruBoundSeriesIdentity,
} from './mineru-document.mjs';

function requiredText(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function canonicalUrl(value, label) {
  const url = new URL(requiredText(value, label));
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError(`${label} must use trusted HTTPS`);
  }
  return url.toString();
}

function exactModel(left, right) {
  return requiredText(left, 'API model').toUpperCase()
    === requiredText(right, 'target model').toUpperCase();
}

function exactProducts(payload, targetModel) {
  if (Array.isArray(payload?.products)) {
    return payload.products.filter((product) => exactModel(product?.modelMark, targetModel));
  }
  return payload && exactModel(payload.modelMark, targetModel) ? [payload] : [];
}

function productDocuments(product) {
  if (Array.isArray(product?.manuals)) return product.manuals;
  return Array.isArray(product?.documents) ? product.documents : [];
}

export function officialMarketApiDimensions(payload, caseIdentity) {
  const targetModel = requiredText(caseIdentity?.model, 'dimension target model');
  const products = exactProducts(payload, targetModel);
  if (products.length !== 1) return null;
  const axes = new Map();
  for (const classification of products[0].classifications ?? []) {
    for (const feature of classification?.features ?? []) {
      const axis = String(feature?.name ?? '').trim().toLowerCase();
      if (!['width', 'height', 'depth'].includes(axis)
        || String(feature?.featureUnit?.symbol ?? '').trim().toLowerCase() !== 'mm') continue;
      const values = (feature?.featureValues ?? []).map((entry) => Number(entry?.value));
      if (values.length !== 1 || !Number.isInteger(values[0]) || values[0] <= 0) return null;
      if (axes.has(axis) && axes.get(axis) !== values[0]) return null;
      axes.set(axis, values[0]);
    }
  }
  return ['width', 'height', 'depth'].every((axis) => axes.has(axis)) ? {
    widthMm: axes.get('width'),
    heightMm: axes.get('height'),
    depthMm: axes.get('depth'),
  } : null;
}

export function verifyOfficialMarketApiDiscoveryEvidence(provenance, caseIdentity, bytes) {
  if (provenance?.method !== 'official_market_api' || !provenance.discoveryContentSha256) return true;
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
    throw new Error('official market API discovery artifact is invalid JSON');
  }
  const targetModel = requiredText(caseIdentity?.model, 'discovery target model');
  const artifactUrl = canonicalUrl(provenance.artifactUrl, 'discovered artifact URL');
  const matchedProducts = exactProducts(payload, targetModel);
  if (!matchedProducts.length) throw new Error('official market API does not prove the exact model');
  const linked = matchedProducts.some((product) => (
    productDocuments(product).some((manual) => {
      try { return canonicalUrl(manual?.url, 'API artifact URL') === artifactUrl; } catch { return false; }
    })
  ));
  if (!linked) throw new Error('official market API exact model is missing the declared artifact link');
  return true;
}

export function officialMarketApiBoundFamilyModel(
  provenance,
  caseIdentity,
  discoveryBytes,
  mineruJsonBytes,
) {
  if (provenance?.method !== 'official_market_api' || !provenance.discoveryContentSha256) return null;
  verifyOfficialMarketApiDiscoveryEvidence(provenance, caseIdentity, discoveryBytes);
  const targetModel = requiredText(caseIdentity?.model, 'target model').toUpperCase();
  const match = /^(.{5,})[._/-]([A-Z0-9]{1,4})$/.exec(targetModel);
  if (!match) return null;
  const familyModel = match[1];
  return hasMineruBoundFamilyIdentity(mineruJsonBytes, familyModel) ? familyModel : null;
}

export function officialMarketApiBoundSeriesModel(
  provenance,
  caseIdentity,
  discoveryBytes,
  mineruJsonBytes,
) {
  if (provenance?.method !== 'official_market_api' || !provenance.discoveryContentSha256) return null;
  if (requiredText(caseIdentity?.brand, 'target brand').toUpperCase() !== 'ASKO') return null;
  verifyOfficialMarketApiDiscoveryEvidence(provenance, caseIdentity, discoveryBytes);
  const payload = JSON.parse(Buffer.from(discoveryBytes).toString('utf8'));
  if (!officialMarketApiDimensions(payload, caseIdentity)) return null;
  const targetModel = requiredText(caseIdentity?.model, 'target model').toUpperCase();
  const match = /^([WTD]\d{4})/.exec(targetModel);
  if (!match || targetModel.length <= match[1].length) return null;
  return hasMineruBoundSeriesIdentity(mineruJsonBytes, match[1]) ? match[1] : null;
}

export function officialMarketApiBoundExactCoverModel(
  provenance,
  caseIdentity,
  discoveryBytes,
  mineruJsonBytes,
) {
  if (provenance?.method !== 'official_market_api' || !provenance.discoveryContentSha256) return null;
  if (requiredText(caseIdentity?.brand, 'target brand').toUpperCase() !== 'ASKO') return null;
  verifyOfficialMarketApiDiscoveryEvidence(provenance, caseIdentity, discoveryBytes);
  const payload = JSON.parse(Buffer.from(discoveryBytes).toString('utf8'));
  if (!officialMarketApiDimensions(payload, caseIdentity)) return null;
  const targetModel = requiredText(caseIdentity?.model, 'target model');
  return hasMineruBoundExactCoverIdentity(mineruJsonBytes, targetModel) ? targetModel : null;
}
