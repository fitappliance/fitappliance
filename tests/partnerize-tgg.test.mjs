import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  applyPartnerizeTrackingToCatalog,
  applyPartnerizeTrackingToManualRetailers,
  buildPartnerizeClickUrl,
  isTheGoodGuysProductUrl,
} = require('../scripts/affiliate/partnerize-tgg.js');
const {
  isPartnerizeUrl,
  summarize,
} = require('../scripts/affiliate/audit-partnerize-tgg.js');

test('partnerize TGG: builds deeplink with camref, pubref, and encoded destination', () => {
  const destination = 'https://www.thegoodguys.com.au/lg-420l-bottom-mount-refrigerator-gb-455pl';
  const url = buildPartnerizeClickUrl(destination, {
    camref: '1011l5JNxE',
    pubref: 'fridge-lg-gb455pl',
  });

  assert.equal(
    url,
    'https://prf.hn/click/camref:1011l5JNxE/pubref:fridge-lg-gb455pl/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Flg-420l-bottom-mount-refrigerator-gb-455pl'
  );
  assert.equal(isPartnerizeUrl(url), true);
});

test('partnerize TGG: refuses non-product and non-TGG destinations', () => {
  assert.equal(isTheGoodGuysProductUrl('https://www.thegoodguys.com.au/lg-420l-bottom-mount-refrigerator-gb-455pl'), true);
  assert.equal(isTheGoodGuysProductUrl('https://www.thegoodguys.com.au/fridges'), false);
  assert.equal(isTheGoodGuysProductUrl('https://www.jbhifi.com.au/products/lg-gb455pl'), false);

  assert.throws(
    () => buildPartnerizeClickUrl('https://www.thegoodguys.com.au/fridges'),
    /Refusing to build Partnerize link/
  );
});

test('partnerize TGG: augments manual retailers without replacing canonical product URL', () => {
  const manual = {
    schema_version: 1,
    products: {
      'fridge-lg-gb455pl': {
        approved: true,
        retailers: [
          {
            n: 'The Good Guys',
            url: 'https://www.thegoodguys.com.au/lg-420l-bottom-mount-refrigerator-gb-455pl',
            p: null,
            verified_at: '2026-06-01',
            source: 'manual',
          },
        ],
      },
    },
  };

  const { document, stats } = applyPartnerizeTrackingToManualRetailers(manual, {
    camref: '1011l5JNxE',
    verifiedAt: '2026-06-01',
  });
  const retailer = document.products['fridge-lg-gb455pl'].retailers[0];

  assert.equal(stats.updatedRetailers, 1);
  assert.equal(retailer.url, 'https://www.thegoodguys.com.au/lg-420l-bottom-mount-refrigerator-gb-455pl');
  assert.equal(retailer.affiliate_network, 'partnerize');
  assert.equal(retailer.affiliate_campaign, 'The Good Guys Australia');
  assert.equal(retailer.camref, '1011l5JNxE');
  assert.equal(retailer.pubref, 'fridge-lg-gb455pl');
  assert.equal(retailer.tracking_verified_at, '2026-06-01');
  assert.equal(isPartnerizeUrl(retailer.affiliate_url), true);
});

test('partnerize TGG: augments catalog-final style products for static product pages', () => {
  const catalog = {
    products: [
      {
        id: 'washing_machine-acw1319',
        retailers: [
          {
            n: 'The Good Guys',
            url: 'https://www.thegoodguys.com.au/hisense-10kg-front-load-washer-hwfs1015e',
            p: null,
          },
        ],
      },
    ],
  };

  const { document, stats } = applyPartnerizeTrackingToCatalog(catalog, {
    camref: '1011l5JNxE',
    verifiedAt: '2026-06-01',
  });
  const retailer = document.products[0].retailers[0];

  assert.equal(stats.updatedRetailers, 1);
  assert.equal(retailer.url, 'https://www.thegoodguys.com.au/hisense-10kg-front-load-washer-hwfs1015e');
  assert.match(retailer.affiliate_url, /^https:\/\/prf\.hn\/click\/camref:1011l5JNxE\/pubref:washing_machine-acw1319\//);
});

test('partnerize TGG audit: counts valid canonical and affiliate URLs separately', () => {
  const rows = [
    {
      retailer: {
        n: 'The Good Guys',
        url: 'https://www.thegoodguys.com.au/lg-420l-bottom-mount-refrigerator-gb-455pl',
        affiliate_url: 'https://prf.hn/click/camref:1011l5JNxE/pubref:fridge-lg-gb455pl/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Flg-420l-bottom-mount-refrigerator-gb-455pl',
      },
    },
    {
      retailer: {
        n: 'The Good Guys',
        url: 'https://www.thegoodguys.com.au/fridges',
      },
    },
  ];

  assert.deepEqual(summarize(rows), {
    total: 2,
    canonicalValid: 1,
    affiliateValid: 1,
    missingAffiliate: 1,
    badCanonical: 1,
    badAffiliate: 0,
  });
});

test('partnerize TGG: private feed location is not committed into source files', () => {
  const privateFeedMarkers = [
    ['feeds', 'performancehorizon', 'com'].join('.'),
    ['c8644334', 'f58e9872', 'a1864d9fbaa7e11a'].join(''),
  ];
  const files = [
    'scripts/affiliate/partnerize-tgg.js',
    'scripts/affiliate/audit-partnerize-tgg.js',
    'data/manual-retailers.json',
  ];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const privateFeedMarker of privateFeedMarkers) {
      assert.equal(source.includes(privateFeedMarker), false, `${file} should not contain private feed URL material`);
    }
  }
});
