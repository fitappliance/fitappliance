import assert from 'node:assert/strict';
import test from 'node:test';

import {
  sanitizeTrackedCatalog,
  sanitizeTrackedManualRetailers,
} from '../../src/domain/private-retailer-evidence.mjs';
import { assertNoPrivateRetailerFeedPublication } from '../../src/domain/public-projection.mjs';

const privateRetailer = {
  n: 'The Good Guys',
  url: 'https://www.thegoodguys.com.au/private-product',
  source: 'partnerize-feed',
  affiliate_network: 'partnerize',
  affiliate_url: 'https://prf.hn/click/private',
  tgg_sku: '50000001',
};
const publicRetailer = {
  n: 'Appliances Online',
  url: 'https://www.appliancesonline.com.au/product/public-product',
  source: 'appliances-online-api',
};

test('tracked catalog sanitizer removes private rows and conservatively recomputes availability', () => {
  const catalog = {
    schema_version: 1,
    summary: { total_products: 2, active_products: 2, evidence_files: 10 },
    products: [
      { id: 'private-only', unavailable: false, price: 999, retailers: [privateRetailer] },
      { id: 'mixed', unavailable: false, price: 899, retailers: [privateRetailer, publicRetailer] },
    ],
  };

  const result = sanitizeTrackedCatalog(catalog);

  assert.equal(result.products[0].unavailable, true);
  assert.deepEqual(result.products[0].retailers, []);
  assert.equal(result.products[1].unavailable, false);
  assert.deepEqual(result.products[1].retailers, [publicRetailer]);
  assert.equal(result.summary.active_products, 1);
  assert.equal(result.summary.total_products, 2);
  assert.equal(result.summary.evidence_files, 10);
  assert.equal(assertNoPrivateRetailerFeedPublication(result), true);
});

test('tracked manual retailer sanitizer revokes entries with only private evidence', () => {
  const manual = {
    schema_version: 1,
    approved_count: 2,
    products: {
      'private-only': { approved: true, retailers: [privateRetailer] },
      mixed: { approved: true, retailers: [privateRetailer, publicRetailer] },
    },
  };

  const result = sanitizeTrackedManualRetailers(manual);

  assert.equal(result.products['private-only'].approved, false);
  assert.deepEqual(result.products['private-only'].retailers, []);
  assert.equal(result.products.mixed.approved, true);
  assert.deepEqual(result.products.mixed.retailers, [publicRetailer]);
  assert.equal(result.approved_count, 1);
  assert.equal(assertNoPrivateRetailerFeedPublication({
    products: Object.values(result.products),
  }), true);
});
