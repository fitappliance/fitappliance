import { createHash } from 'node:crypto';

import {
  catalogReceiptDimensions,
  isCurrentRetailProduct,
  isRetailerProductPageUrl,
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

function productBinding(product) {
  const dimensionsMm = catalogReceiptDimensions(product);
  const currentRetail = isCurrentRetailProduct(product);
  const productPageUrls = currentRetail
    ? [...new Set((product?.retailers ?? [])
      .map((retailer) => String(retailer?.url ?? retailer?.href ?? retailer?.u ?? retailer?.link ?? '').trim())
      .filter(isRetailerProductPageUrl))].sort()
    : [];
  return {
    id: String(product?.id ?? ''),
    canonicalProductId: String(product?.canonicalProductId ?? ''),
    category: String(product?.cat ?? ''),
    brand: String(product?.brand ?? ''),
    model: String(product?.model ?? ''),
    currentRetail,
    productPageUrls,
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
