import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  buildAffiliateUrl,
  resolveAffiliateLinkForProduct,
  renderAffiliateCta
} = require('../scripts/render-affiliate-links.js');

const PROVIDERS = [
  {
    slug: 'amazon-au',
    name: 'Amazon AU',
    domain: 'amazon.com.au',
    linkTemplate: 'https://www.amazon.com.au/dp/{asin}?tag={AMAZON_AU_TAG}',
    disclosureText: 'We may earn a commission from qualifying purchases.'
  },
  {
    slug: 'appliances-online',
    name: 'Appliances Online',
    domain: 'appliancesonline.com.au',
    linkTemplate: 'https://www.appliancesonline.com.au/product/{sku}/?aid={APPLIANCES_ONLINE_AFFILIATE_ID}',
    disclosureText: 'We may earn a commission from qualifying purchases.'
  }
];

function makeProduct(overrides = {}) {
  return {
    id: 'p1',
    brand: 'Samsung',
    model: 'SRF7500WFH',
    affiliate: {},
    ...overrides
  };
}

test('phase 31 affiliate: missing AMAZON_AU_TAG returns null amazon URL without throwing', () => {
  const product = makeProduct({
    affiliate: { amazonAU: { asin: 'B0TEST1234' } }
  });
  const url = buildAffiliateUrl({
    provider: PROVIDERS[0],
    product,
    env: {}
  });
  assert.equal(url, null);
});

test('phase 31 affiliate: with AMAZON_AU_TAG and ASIN builds strict amazon URL', () => {
  const product = makeProduct({
    affiliate: { amazonAU: { asin: 'B0TEST1234' } }
  });
  const url = buildAffiliateUrl({
    provider: PROVIDERS[0],
    product,
    env: { AMAZON_AU_TAG: 'fitappliance-22' }
  });
  assert.equal(url, 'https://www.amazon.com.au/dp/B0TEST1234?tag=fitappliance-22');
});

test('phase 31 affiliate: resolveAffiliateLinkForProduct selects first resolvable provider', () => {
  const product = makeProduct({
    affiliate: {
      amazonAU: { asin: 'B0TEST1234' },
      appliancesOnline: { sku: 'adw7003b' }
    }
  });
  const row = resolveAffiliateLinkForProduct(product, {
    providers: PROVIDERS,
    env: { AMAZON_AU_TAG: 'fitappliance-22', APPLIANCES_ONLINE_AFFILIATE_ID: 'ao-123' }
  });
  assert.equal(row?.providerSlug, 'amazon-au');
  assert.equal(row?.url, 'https://www.amazon.com.au/dp/B0TEST1234?tag=fitappliance-22');
});

test('phase 31 affiliate: renderAffiliateCta outputs sponsored nofollow noopener rel when link exists', () => {
  const product = makeProduct({
    affiliate: { amazonAU: { asin: 'B0TEST1234' } }
  });
  const html = renderAffiliateCta(product, {
    providers: PROVIDERS,
    env: { AMAZON_AU_TAG: 'fitappliance-22' }
  });

  assert.match(html, /rel="sponsored nofollow noopener"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /Buy at Amazon AU/);
});

test('phase 31 affiliate: disclosure text appears in same CTA block', () => {
  const product = makeProduct({
    affiliate: { amazonAU: { asin: 'B0TEST1234' } }
  });
  const html = renderAffiliateCta(product, {
    providers: PROVIDERS,
    env: { AMAZON_AU_TAG: 'fitappliance-22' }
  });

  assert.match(html, /We may earn a commission from qualifying purchases\./);
  assert.match(html, /\/affiliate-disclosure/);
});

test('phase 31 affiliate: no env and no ids returns empty CTA HTML', () => {
  const html = renderAffiliateCta(makeProduct(), {
    providers: PROVIDERS,
    env: {}
  });
  assert.equal(html, '');
});
