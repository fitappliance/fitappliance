import { createHash } from 'node:crypto';

import {
  catalogReceiptDimensions,
  isCurrentRetailProduct,
} from './historical-appliance-reference.mjs';

const RECEIPT_FIELDS = Object.freeze([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
]);

function receiptEvidence(product) {
  const source = product?.geometry_v2_provenance?.fieldEvidence ?? {};
  return Object.fromEntries(RECEIPT_FIELDS.map((field) => {
    const evidence = source[field] ?? {};
    return [field, {
      contentSha256: evidence.contentSha256 ?? null,
      receiptBindingSha256: evidence.receiptBindingSha256 ?? null,
      fragmentSha256: evidence.fragmentSha256 ?? null,
    }];
  }));
}

function observationBinding(observation) {
  if (!observation) return null;
  return {
    id: String(observation.id ?? ''),
    canonicalProductId: String(observation.canonicalProductId ?? ''),
    adapterId: String(observation.adapterId ?? ''),
    retailer: String(observation.retailer ?? ''),
    retailerProductId: observation.retailerProductId == null
      ? null
      : String(observation.retailerProductId),
    observedAt: String(observation.observedAt ?? ''),
    url: String(observation.url ?? ''),
    availability: String(observation.availability ?? ''),
    listingState: String(observation.listingState ?? ''),
    freshnessState: String(observation.freshnessState ?? ''),
    rawSourceSha256: String(observation.rawSourceSha256 ?? ''),
    policyVersion: String(observation.policyVersion ?? ''),
  };
}

function retailLifecycleBinding(product) {
  const decision = product?.retailLifecycle;
  if (!decision) return null;
  return {
    schemaVersion: decision.schemaVersion ?? null,
    policyVersion: String(decision.policyVersion ?? ''),
    asOf: String(decision.asOf ?? ''),
    canonicalProductId: String(decision.canonicalProductId ?? ''),
    catalogState: String(decision.catalogState ?? ''),
    lifecycleState: String(decision.lifecycleState ?? ''),
    authorizingObservation: observationBinding(decision.authorizingObservation),
    latestObservations: (decision.latestObservations ?? [])
      .map(observationBinding)
      .sort((left, right) => left.id.localeCompare(right.id)),
    observationConflicts: structuredClone(decision.observationConflicts ?? []),
    reasonCodes: [...(decision.reasonCodes ?? [])].map(String).sort(),
  };
}

function productBinding(product) {
  const recoveryManaged = /^recovery_target_[a-z0-9]+$/i.test(
    String(product?.evidence?.acceptance?.id ?? ''),
  );
  const dimensionsMm = recoveryManaged ? null : catalogReceiptDimensions(product);
  const currentRetail = isCurrentRetailProduct(product);
  return {
    id: String(product?.id ?? ''),
    canonicalProductId: String(product?.canonicalProductId ?? ''),
    category: String(product?.cat ?? ''),
    brand: String(product?.brand ?? ''),
    model: String(product?.model ?? ''),
    currentRetail,
    retailLifecycle: retailLifecycleBinding(product),
    receiptGeometry: dimensionsMm ? {
      dimensionsMm,
      fieldEvidence: receiptEvidence(product),
    } : null,
  };
}

export function buildHistoricalCatalogBinding(catalog) {
  if (!catalog || !Array.isArray(catalog.products)) {
    throw new TypeError('historical catalog binding requires products');
  }
  const products = catalog.products.map(productBinding).sort((left, right) => (
    left.id.localeCompare(right.id)
    || left.category.localeCompare(right.category)
    || left.brand.localeCompare(right.brand)
    || left.model.localeCompare(right.model)
  ));
  const ids = new Set();
  for (const product of products) {
    if (!product.id) throw new TypeError('historical catalog binding product id required');
    if (ids.has(product.id)) throw new TypeError(`duplicate historical catalog binding product id: ${product.id}`);
    ids.add(product.id);
  }
  return Object.freeze({ schemaVersion: 1, products: Object.freeze(products) });
}

export function serializeHistoricalCatalogBinding(catalog) {
  return `${JSON.stringify(buildHistoricalCatalogBinding(catalog))}\n`;
}

export function hashHistoricalCatalogBinding(catalog) {
  return createHash('sha256').update(serializeHistoricalCatalogBinding(catalog)).digest('hex');
}
