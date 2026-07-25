import { createHash } from 'node:crypto';
import { load } from 'cheerio';

import { containsExactModel } from './evidence-claim-semantics.mjs';
import { officialProductMaterialModelVariant } from './official-model-variant-policy.mjs';

export const MIELE_AU_PRODUCT_MATERIAL_IDENTITY_CAPABILITY =
  'miele_au_product_material_identity_v1';

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
  url.hash = '';
  return url.toString();
}

function modelKey(value) {
  return requiredText(value, 'model').toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function materialFromProductUrl(value) {
  const url = new URL(canonicalUrl(value, 'Miele product URL'));
  if (url.hostname.toLowerCase() !== 'shop.miele.com.au'
    || !/^\/en\/kitchen\/dishwashers\//i.test(url.pathname)) {
    throw new TypeError('Miele product URL is not an Australian dishwasher page');
  }
  const match = url.pathname.match(/-zid(\d{6,14})\/?$/i);
  if (!match) throw new TypeError('Miele product URL lacks a material number');
  return match[1];
}

export function validateOfficialProductMaterialRelationship(provenance, caseIdentity) {
  if (provenance?.method !== 'official_product_material') return null;
  const targetModel = requiredText(caseIdentity?.model, 'target model');
  if (modelKey(provenance.requestedModel) !== modelKey(targetModel)) {
    throw new TypeError('product-material requested model does not match target model');
  }
  const variant = officialProductMaterialModelVariant(caseIdentity, provenance.matchedModel);
  if (!variant) throw new TypeError('product-material model variant is not policy approved');

  const materialNumber = requiredText(provenance.materialNumber, 'Miele material number');
  if (!/^\d{6,14}$/.test(materialNumber)) {
    throw new TypeError('Miele material number invalid');
  }
  const discoveryUrl = canonicalUrl(provenance.discoveryUrl, 'Miele product discovery URL');
  if (materialFromProductUrl(discoveryUrl) !== materialNumber) {
    throw new TypeError('Miele product URL material binding invalid');
  }
  const artifactUrl = new URL(canonicalUrl(provenance.artifactUrl, 'Miele specification URL'));
  if (artifactUrl.hostname.toLowerCase() !== 'www.miele.com.au'
    || artifactUrl.pathname !== `/media/ex/au/specsheets/${materialNumber}.pdf`
    || artifactUrl.search) {
    throw new TypeError('Miele specification material binding invalid');
  }
  return {
    ...variant,
    targetModel,
    materialNumber,
    discoveryUrl,
    artifactUrl: artifactUrl.toString(),
  };
}

export function verifyOfficialProductMaterialDiscoveryEvidence(provenance, caseIdentity, bytes) {
  if (provenance?.method !== 'official_product_material') return null;
  const relationship = validateOfficialProductMaterialRelationship(provenance, caseIdentity);
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    throw new TypeError('product-material discovery artifact bytes required');
  }
  const buffer = Buffer.from(bytes);
  const hash = createHash('sha256').update(buffer).digest('hex');
  if (hash !== provenance.discoveryContentSha256) {
    throw new Error('product-material discovery artifact hash mismatch');
  }
  if (buffer.length !== provenance.discoveryByteSize) {
    throw new Error('product-material discovery artifact byte size mismatch');
  }
  const expectedPath = `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.html`;
  if (provenance.discoveryObjectPath !== expectedPath) {
    throw new TypeError('content-addressed product-material discovery object path required');
  }

  const $ = load(buffer.toString('utf8'));
  const canonicalLinks = $('link[rel="canonical"][href]').map((_, element) => {
    try { return canonicalUrl($(element).attr('href'), 'Miele canonical product URL'); } catch { return null; }
  }).get().filter(Boolean);
  if (canonicalLinks.length !== 1 || canonicalLinks[0] !== relationship.discoveryUrl) {
    throw new Error('Miele discovery page canonical URL does not match the bound product');
  }
  const identityText = [$('title').text(), $('h1').text()].join(' ');
  if (!containsExactModel(identityText, relationship.sourceModel)) {
    throw new Error('Miele discovery page does not prove the bound source model');
  }
  const declaredSkus = new Set($('[data-product-sku]').map((_, element) => (
    String($(element).attr('data-product-sku') ?? '').trim()
  )).get().filter((value) => /^\d{6,14}$/.test(value)));
  if (!declaredSkus.has(relationship.materialNumber)) {
    throw new Error('Miele discovery page does not prove the bound material number');
  }
  const pageText = [$('title').text(), $('h1').text(), $('body').text()].join(' ');
  const finishPattern = new RegExp(
    `(?:^|[^A-Z0-9])${relationship.finishLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^A-Z0-9]|$)`,
    'i',
  );
  if (!finishPattern.test(pageText)) {
    throw new Error('Miele discovery page does not prove the approved finish');
  }
  return relationship;
}

export function officialProductMaterialBoundVariant(provenance, caseIdentity, discoveryBytes) {
  return verifyOfficialProductMaterialDiscoveryEvidence(provenance, caseIdentity, discoveryBytes);
}
