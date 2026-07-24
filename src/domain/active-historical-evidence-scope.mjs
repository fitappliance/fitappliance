import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';
import { isCurrentRetailProduct } from './historical-appliance-reference.mjs';

const SUPPORTED_CATEGORIES = new Set([
  'fridge',
  'dishwasher',
  'dryer',
  'washing_machine',
]);
const LIFECYCLE_STATES = new Set([
  'CURRENT_RETAIL',
  'CATALOG_ARCHIVED',
  'UNKNOWN_RETAIL',
]);
const SHA256 = /^[a-f0-9]{64}$/;

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function sha256(value, label) {
  const result = required(value, label).toLowerCase();
  if (!SHA256.test(result)) throw new TypeError(`${label} invalid`);
  return result;
}

function countByLifecycle(records) {
  const counts = new Map();
  for (const record of records) {
    counts.set(record.lifecycleState, (counts.get(record.lifecycleState) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function validateLifecycle(product) {
  const decision = product?.retailLifecycle;
  const productId = required(product?.id, 'active product ID');
  if (!decision || decision.schemaVersion !== 1 || !LIFECYCLE_STATES.has(decision.lifecycleState)) {
    throw new TypeError(`active product lifecycle decision invalid: ${productId}`);
  }
  if (required(product.canonicalProductId, `active canonical product ID: ${productId}`)
    !== required(decision.canonicalProductId, `active lifecycle canonical product ID: ${productId}`)) {
    throw new Error(`active lifecycle canonical identity mismatch: ${productId}`);
  }
  if (decision.lifecycleState === 'CURRENT_RETAIL' && !isCurrentRetailProduct(product, decision)) {
    throw new Error(`active current-retail evidence invalid: ${productId}`);
  }
  if (decision.lifecycleState !== 'CURRENT_RETAIL' && decision.authorizingObservation !== null) {
    throw new Error(`active non-current product has authorizing observation: ${productId}`);
  }
  return decision;
}

function validateIdentity(reference, product) {
  const productId = required(product.id, 'active product ID');
  if (reference.category !== product.cat
    || reference.brand !== product.brand
    || reference.model !== product.model) {
    throw new Error(`active historical identity mismatch: ${productId}`);
  }
}

export function buildActiveHistoricalEvidenceScope({ descriptor, catalog, reference }) {
  if (!descriptor || !catalog || !Array.isArray(catalog.products)
    || reference?.schemaVersion !== 1 || !Array.isArray(reference.records)) {
    throw new TypeError('active release catalogue and historical reference required');
  }
  if (reference.summary?.records !== reference.records.length) {
    throw new Error('active historical reference summary mismatch');
  }
  const releaseCandidateId = required(descriptor.releaseCandidateId, 'active release candidate ID');
  const activatedAt = new Date(required(descriptor.activatedAt, 'active release activation timestamp'));
  if (Number.isNaN(activatedAt.valueOf())) throw new TypeError('active release activation timestamp invalid');
  const sourceBindings = {
    releaseCandidateId,
    publicProjectionSha256: sha256(
      descriptor.artifacts?.publicProjection?.sha256,
      'active public projection SHA-256',
    ),
    historicalReferenceSha256: sha256(
      descriptor.artifacts?.historicalReference?.sha256,
      'active historical reference SHA-256',
    ),
    authorizationManifestSha256: sha256(
      descriptor.artifacts?.authorizationManifest?.sha256,
      'active authorization manifest SHA-256',
    ),
  };

  const productsById = new Map();
  for (const product of catalog.products) {
    const productId = required(product?.id, 'active product ID');
    if (productsById.has(productId)) throw new Error(`duplicate active product ID: ${productId}`);
    productsById.set(productId, product);
    validateLifecycle(product);
  }

  const referencesByProductId = new Map();
  const seenReferenceIds = new Set();
  for (const record of reference.records) {
    const referenceId = required(record?.referenceId, 'active historical reference ID');
    if (seenReferenceIds.has(referenceId)) {
      throw new Error(`duplicate active historical reference ID: ${referenceId}`);
    }
    seenReferenceIds.add(referenceId);
    const productIds = record.catalogProductIds ?? [];
    if (!Array.isArray(productIds)) {
      throw new TypeError(`active historical catalogProductIds invalid: ${referenceId}`);
    }
    for (const rawProductId of productIds) {
      const productId = required(rawProductId, `active historical product ID: ${referenceId}`);
      const product = productsById.get(productId);
      if (!product) throw new Error(`active historical reference contains removed product: ${productId}`);
      if (referencesByProductId.has(productId)) {
        throw new Error(`active product maps to multiple historical references: ${productId}`);
      }
      validateIdentity(record, product);
      referencesByProductId.set(productId, record);
    }
  }

  for (const product of catalog.products) {
    if (!SUPPORTED_CATEGORIES.has(product.cat)) continue;
    if (!referencesByProductId.has(product.id)) {
      throw new Error(`supported active product missing historical reference: ${product.id}`);
    }
  }

  const records = reference.records.map((record) => {
    const productIds = record.catalogProductIds ?? [];
    if (productIds.length === 0) return structuredClone(record);
    if (productIds.length !== 1) {
      throw new Error(`active historical reference maps multiple products: ${record.referenceId}`);
    }
    const product = productsById.get(productIds[0]);
    return {
      ...structuredClone(record),
      lifecycleState: product.retailLifecycle.lifecycleState,
      retailLifecycle: structuredClone(product.retailLifecycle),
    };
  });
  const supportedProducts = catalog.products.filter((product) => (
    SUPPORTED_CATEGORIES.has(product.cat)
  ));
  const unsupportedProducts = catalog.products.filter((product) => (
    !SUPPORTED_CATEGORIES.has(product.cat)
  ));
  const summary = {
    activeCatalogProducts: catalog.products.length,
    supportedCatalogProducts: supportedProducts.length,
    unsupportedCatalogProducts: unsupportedProducts.length,
    supportedCurrentRetailProducts: supportedProducts.filter((product) => (
      product.retailLifecycle.lifecycleState === 'CURRENT_RETAIL'
    )).length,
    unsupportedCurrentRetailProducts: unsupportedProducts.filter((product) => (
      product.retailLifecycle.lifecycleState === 'CURRENT_RETAIL'
    )).length,
    historicalReferences: records.length,
    mappedHistoricalReferences: records.filter((record) => (
      (record.catalogProductIds ?? []).length > 0
    )).length,
    unmappedHistoricalReferences: records.filter((record) => (
      (record.catalogProductIds ?? []).length === 0
    )).length,
    byLifecycle: countByLifecycle(records),
  };
  const semantic = {
    schemaVersion: 1,
    policyVersion: 'active-historical-evidence-scope-v1',
    sourceBindings,
    summary,
    records,
  };
  return Object.freeze({
    ...semantic,
    generatedAt: activatedAt.toISOString(),
    semanticScopeSha256: canonicalJsonSha256(semantic),
  });
}
