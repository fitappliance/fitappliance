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

function visibleText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function productFinishCandidates($, relationship) {
  const candidates = [visibleText($('title').text()), visibleText($('h1').text())];

  $('[data-product-sku]').each((_, element) => {
    if (visibleText($(element).attr('data-product-sku')) === relationship.materialNumber) {
      candidates.push(visibleText($(element).text()));
    }
  });

  $('dl.attribute-list-item').each((_, element) => {
    const label = visibleText($(element).find('dt').first().text());
    if (/^(?:(?:control panel|front|door|product)\s+)?(?:colour|color|finish)$/i.test(label)) {
      candidates.push(visibleText($(element).find('dd').first().text()));
    }
  });

  return candidates.filter(Boolean);
}

function materialFromProductUrl(value, caseIdentity) {
  const url = new URL(canonicalUrl(value, 'Miele product URL'));
  const category = String(caseIdentity?.category ?? '').trim().toLowerCase();
  const categoryPath = category === 'dishwasher'
    ? /^\/en\/kitchen\/dishwashers\//i
    : category === 'fridge'
      ? /^\/en\/kitchen\/refrigeration\//i
      : null;
  if (url.hostname.toLowerCase() !== 'shop.miele.com.au'
    || !categoryPath?.test(url.pathname)) {
    throw new TypeError('Miele product URL is not an approved Australian category page');
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
  const matchedModel = requiredText(provenance.matchedModel, 'product-material source model');
  const exactModel = modelKey(matchedModel) === modelKey(targetModel);
  const variant = exactModel
    ? {
      relationshipKind: 'exact_model',
      sourceModel: matchedModel.toUpperCase(),
      pageModel: matchedModel.toUpperCase(),
      suffix: null,
      finishLabel: null,
      pageFinishLabels: [],
    }
    : officialProductMaterialModelVariant(caseIdentity, matchedModel);
  if (!variant) throw new TypeError('product-material model variant is not policy approved');

  const materialNumber = requiredText(provenance.materialNumber, 'Miele material number');
  if (!/^\d{6,14}$/.test(materialNumber)) {
    throw new TypeError('Miele material number invalid');
  }
  const discoveryUrl = canonicalUrl(provenance.discoveryUrl, 'Miele product discovery URL');
  if (materialFromProductUrl(discoveryUrl, caseIdentity) !== materialNumber) {
    throw new TypeError('Miele product URL material binding invalid');
  }
  if (variant.materialNumber && variant.materialNumber !== materialNumber) {
    throw new TypeError('Miele product material does not match the exact alias policy');
  }
  const artifactUrl = new URL(canonicalUrl(provenance.artifactUrl, 'Miele specification URL'));
  const productPageSelfSource = artifactUrl.toString() === discoveryUrl;
  const materialSpecification = artifactUrl.hostname.toLowerCase() === 'www.miele.com.au'
    && artifactUrl.pathname === `/media/ex/au/specsheets/${materialNumber}.pdf`
    && !artifactUrl.search;
  if (!productPageSelfSource && !materialSpecification) {
    throw new TypeError('Miele specification material binding invalid');
  }
  return {
    relationshipKind: variant.relationshipKind ?? 'model_variant',
    ...variant,
    targetModel,
    materialNumber,
    discoveryUrl,
    artifactUrl: artifactUrl.toString(),
    artifactKind: productPageSelfSource ? 'product_page' : 'specification_sheet',
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
  const pageModel = relationship.pageModel ?? relationship.sourceModel;
  const comparableIdentityText = pageModel.endsWith('K2O')
    ? identityText.replace(/\bAutoDos\b/gi, ' ')
    : identityText;
  if (!containsExactModel(comparableIdentityText, pageModel)) {
    throw new Error('Miele discovery page does not prove the bound source model');
  }
  const declaredSkus = new Set($('[data-product-sku]').map((_, element) => (
    String($(element).attr('data-product-sku') ?? '').trim()
  )).get().filter((value) => /^\d{6,14}$/.test(value)));
  if (!declaredSkus.has(relationship.materialNumber)) {
    throw new Error('Miele discovery page does not prove the bound material number');
  }
  if (relationship.finishLabel) {
    const finishLabels = relationship.pageFinishLabels?.length
      ? relationship.pageFinishLabels
      : [relationship.finishLabel];
    const finishPatterns = finishLabels.map((label) => new RegExp(
      `(?:^|[^A-Z0-9])${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^A-Z0-9]|$)`,
      'i',
    ));
    if (!productFinishCandidates($, relationship).some((value) => (
      finishPatterns.some((pattern) => pattern.test(value))
    ))) {
      throw new Error('Miele discovery page does not prove the approved finish');
    }
  }
  return relationship;
}

export function officialProductMaterialBoundVariant(provenance, caseIdentity, discoveryBytes) {
  return verifyOfficialProductMaterialDiscoveryEvidence(provenance, caseIdentity, discoveryBytes);
}
