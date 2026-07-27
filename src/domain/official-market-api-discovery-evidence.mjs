import { createHash } from 'node:crypto';

import {
  hasMineruBoundExactCoverIdentity,
  hasMineruBoundFamilyIdentity,
  hasMineruBoundSeriesIdentity,
} from './mineru-document.mjs';
import { officialMarketApiModelVariant } from './official-model-variant-policy.mjs';

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

function apiProductModel(product, caseIdentity) {
  const brand = requiredText(caseIdentity?.brand, 'target brand').toUpperCase();
  return brand === 'HISENSE' ? product?.code : product?.modelMark;
}

function exactProducts(payload, targetModel, caseIdentity) {
  if (Array.isArray(payload?.products)) {
    return payload.products.filter((product) => exactModel(
      apiProductModel(product, caseIdentity),
      targetModel,
    ));
  }
  return payload && exactModel(apiProductModel(payload, caseIdentity), targetModel) ? [payload] : [];
}

function boundProductSelection(payload, caseIdentity, provenance = null) {
  const targetModel = requiredText(caseIdentity?.model, 'target model');
  const requestedModel = provenance?.requestedModel == null
    ? targetModel
    : requiredText(provenance.requestedModel, 'API requested model');
  if (!exactModel(requestedModel, targetModel)) {
    throw new Error('official market API requested model does not match target model');
  }
  const matchedModel = provenance?.matchedModel == null
    ? targetModel
    : requiredText(provenance.matchedModel, 'API matched model');
  const variant = exactModel(matchedModel, targetModel)
    ? null
    : officialMarketApiModelVariant(caseIdentity, matchedModel);
  if (!exactModel(matchedModel, targetModel) && !variant) {
    throw new Error('official market API model relation is not policy approved');
  }
  return {
    targetModel,
    matchedModel,
    variant,
    products: exactProducts(payload, matchedModel, caseIdentity),
  };
}

function productDocuments(product, caseIdentity) {
  if (Array.isArray(product?.manuals)) return product.manuals;
  if (Array.isArray(product?.documents)) return product.documents;
  if (requiredText(caseIdentity?.brand, 'target brand').toUpperCase() !== 'HISENSE') return [];
  const additional = Array.isArray(product?.additionalManual)
    ? product.additionalManual
    : [product?.additionalManual];
  return [
    product?.specificationDoc,
    product?.productManual,
    product?.warrantyManual,
    ...additional,
  ].filter((document) => document && typeof document === 'object');
}

function canonicalLinkedUrl(value, baseUrl, label) {
  const url = new URL(requiredText(value, label), baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError(`${label} must use trusted HTTPS`);
  }
  return url.toString();
}

export function officialMarketApiDimensions(payload, caseIdentity, provenance = null) {
  const { products } = boundProductSelection(payload, caseIdentity, provenance);
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

export function officialMarketApiDimensionClaims(payload, caseIdentity, provenance = null) {
  const dimensions = officialMarketApiDimensions(payload, caseIdentity, provenance);
  if (!dimensions) return null;
  return [
    ['closedEnvelope.widthMm', 'width', dimensions.widthMm],
    ['closedEnvelope.heightMm', 'height', dimensions.heightMm],
    ['closedEnvelope.depthMm', 'depth', dimensions.depthMm],
  ].map(([field, axis, mm]) => ({
    field,
    value: { kind: 'fixed', mm },
    sourceLabel: `Official PIM ${axis}`,
    sourceAxisOrder: [axis],
    sourceUnit: 'mm',
    measurementScope: 'product_closed_external',
    includesDoor: null,
    includesHandle: null,
    page: null,
    fragmentSha256: null,
    bbox: null,
  }));
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
  const discoveryUrl = canonicalUrl(provenance.discoveryUrl, 'official market API discovery URL');
  const artifactUrl = canonicalUrl(provenance.artifactUrl, 'discovered artifact URL');
  const selection = boundProductSelection(payload, caseIdentity, provenance);
  const matchedProducts = selection.products;
  if (!matchedProducts.length) throw new Error('official market API does not prove the declared model');
  if (artifactUrl === discoveryUrl) {
    if (matchedProducts.length !== 1 || !officialMarketApiDimensions(payload, caseIdentity, provenance)) {
      throw new Error('official market API self-source lacks one complete declared-model dimension set');
    }
    return true;
  }
  const linked = matchedProducts.some((product) => (
    productDocuments(product, caseIdentity).some((manual) => {
      try {
        return canonicalLinkedUrl(manual?.url, discoveryUrl, 'API artifact URL') === artifactUrl;
      } catch {
        return false;
      }
    })
  ));
  if (!linked) throw new Error('official market API model is missing the declared artifact link');
  return true;
}

export function officialMarketApiBoundVariantModel(
  provenance,
  caseIdentity,
  discoveryBytes,
  mineruJsonBytes,
) {
  if (provenance?.method !== 'official_market_api' || !provenance.discoveryContentSha256) return null;
  if (requiredText(caseIdentity?.brand, 'target brand').toUpperCase() !== 'ASKO') return null;
  verifyOfficialMarketApiDiscoveryEvidence(provenance, caseIdentity, discoveryBytes);
  const variant = officialMarketApiModelVariant(caseIdentity, provenance.matchedModel);
  if (!variant) return null;
  const payload = JSON.parse(Buffer.from(discoveryBytes).toString('utf8'));
  if (!officialMarketApiDimensions(payload, caseIdentity, provenance)) return null;
  return hasMineruBoundExactCoverIdentity(mineruJsonBytes, variant.sourceModel)
    ? variant.sourceModel
    : null;
}

export function officialMarketApiBoundFamilyModel(
  provenance,
  caseIdentity,
  discoveryBytes,
  mineruJsonBytes,
) {
  if (provenance?.method !== 'official_market_api' || !provenance.discoveryContentSha256) return null;
  if (officialMarketApiModelVariant(caseIdentity, provenance.matchedModel)) return null;
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
  if (officialMarketApiModelVariant(caseIdentity, provenance.matchedModel)) return null;
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
  if (officialMarketApiModelVariant(caseIdentity, provenance.matchedModel)) return null;
  verifyOfficialMarketApiDiscoveryEvidence(provenance, caseIdentity, discoveryBytes);
  const payload = JSON.parse(Buffer.from(discoveryBytes).toString('utf8'));
  if (!officialMarketApiDimensions(payload, caseIdentity)) return null;
  const targetModel = requiredText(caseIdentity?.model, 'target model');
  return hasMineruBoundExactCoverIdentity(mineruJsonBytes, targetModel) ? targetModel : null;
}
