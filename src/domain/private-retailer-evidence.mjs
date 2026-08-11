import {
  pruneRetailerSourceFromTrackedLedger,
  resetRetailerIdentityResolutionReplay,
} from './retailer-observation-ledger.mjs';
import { sanitizePrivateRetailerFeedPublication } from './public-projection.mjs';

export const PRIVATE_PARTNERIZE_SOURCE_ID = 'the-good-guys-partnerize-feed-v1';

export function sanitizeTrackedCatalog(document) {
  if (!document || !Array.isArray(document.products)) {
    throw new TypeError('tracked catalog products required');
  }
  const sanitized = sanitizePrivateRetailerFeedPublication(document);
  return {
    ...sanitized,
    summary: document.summary == null ? document.summary : {
      ...document.summary,
      total_products: sanitized.products.length,
      active_products: sanitized.products.filter((product) => product.unavailable === false).length,
    },
  };
}

export function sanitizeTrackedManualRetailers(document) {
  if (!document || !document.products || Array.isArray(document.products)
    || typeof document.products !== 'object') {
    throw new TypeError('tracked manual retailer products required');
  }
  const products = Object.fromEntries(Object.entries(document.products).map(([id, entry]) => {
    const originalRetailers = Array.isArray(entry?.retailers) ? entry.retailers : [];
    const sanitized = sanitizePrivateRetailerFeedPublication({ ...entry, retailers: originalRetailers });
    const removedPrivateEvidence = sanitized.retailers.length !== originalRetailers.length;
    delete sanitized.unavailable;
    delete sanitized.price;
    if (removedPrivateEvidence && sanitized.retailers.length === 0) sanitized.approved = false;
    return [id, sanitized];
  }));
  return {
    ...structuredClone(document),
    products,
    approved_count: Object.values(products).filter((entry) => entry.approved === true).length,
  };
}

export function sanitizeTrackedRetailerLedger(document) {
  return resetRetailerIdentityResolutionReplay(
    pruneRetailerSourceFromTrackedLedger(document, PRIVATE_PARTNERIZE_SOURCE_ID),
  );
}
