import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  applyPartnerizeTrackingToCatalog,
  applyPartnerizeTrackingToManualRetailers,
  buildPartnerizeClickUrl,
  importPartnerizeFeedToCatalog,
  importPartnerizeFeedToManualRetailers,
  isTheGoodGuysProductUrl,
  parsePartnerizeFeedCsv,
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
    'data/catalog-final.json',
    'data/manual-retailers.json',
    'public/data/appliances.json',
  ];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const privateFeedMarker of privateFeedMarkers) {
      assert.equal(source.includes(privateFeedMarker), false, `${file} should not contain private feed URL material`);
    }
  }
});

test('partnerize TGG feed: parses pipe-delimited feed and classifies only appliance categories', () => {
  const csv = [
    'Category|Currency|Price|SKU/Unique Identifier|Stock|Title|URL|Brand|ModelNumber',
    'Fridges & Freezers > Refrigerators > Bottom Mount Fridges|AUD|999.00|GB-455BLE|Yes|LG 420L Bottom Mount Refrigerator|https://prf.hn/click/camref:1011l5JNxE/creativeref:1011l64579/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Flg-420l-bottom-mount-refrigerator-gb-455ble|LG|50073316',
    'Cooking & Dishwashers > Cooktops > Induction Cooktops|AUD|799.00|COOKTOP-1|Yes|Demo Cooktop|https://prf.hn/click/camref:1011l5JNxE/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Fdemo-cooktop|Demo|50000000',
  ].join('\n');

  const rows = parsePartnerizeFeedCsv(csv);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].fit_category, 'fridge');
  assert.equal(rows[0].manufacturer_model, 'GB-455BLE');
  assert.equal(rows[0].partnerize_url, 'https://prf.hn/click/camref:1011l5JNxE/creativeref:1011l64579/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Flg-420l-bottom-mount-refrigerator-gb-455ble');
  assert.equal(rows[0].url, 'https://www.thegoodguys.com.au/lg-420l-bottom-mount-refrigerator-gb-455ble');
  assert.equal(rows[0].tgg_sku, '50073316');
  assert.equal(rows[0].p, 999);
  assert.equal(rows[0].stock, 'Yes');
});

test('partnerize TGG feed: imports by manufacturer SKU, preserves canonical URL, and stores affiliate URL separately', () => {
  const csv = [
    'Category|Currency|Price|SKU/Unique Identifier|Stock|Title|URL|Brand|ModelNumber',
    'Fridges & Freezers > Refrigerators > Bottom Mount Fridges|AUD|999.00|GB-455BLE|Yes|LG 420L Bottom Mount Refrigerator|https://prf.hn/click/camref:1011l5JNxE/creativeref:1011l64579/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Flg-420l-bottom-mount-refrigerator-gb-455ble|LG|50073316',
  ].join('\n');
  const manual = {
    schema_version: 1,
    products: {
      'fridge-lg-gb455ble': {
        approved: true,
        retailers: [],
      },
    },
  };
  const catalogProducts = [
    {
      id: 'fridge-lg-gb455ble',
      cat: 'fridge',
      brand: 'LG',
      model: 'GB-455BLE',
      retailers: [],
      unavailable: false,
    },
  ];

  const { document, stats } = importPartnerizeFeedToManualRetailers({
    manualDocument: manual,
    catalogProducts,
    feedCsv: csv,
    verifiedAt: '2026-06-02',
  });
  const retailer = document.products['fridge-lg-gb455ble'].retailers[0];

  assert.equal(stats.feedRows, 1);
  assert.equal(stats.exactMatches, 1);
  assert.equal(stats.updatedProducts, 1);
  assert.equal(retailer.n, 'The Good Guys');
  assert.equal(retailer.url, 'https://www.thegoodguys.com.au/lg-420l-bottom-mount-refrigerator-gb-455ble');
  assert.equal(retailer.affiliate_url, 'https://prf.hn/click/camref:1011l5JNxE/creativeref:1011l64579/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Flg-420l-bottom-mount-refrigerator-gb-455ble');
  assert.equal(retailer.affiliate_network, 'partnerize');
  assert.equal(retailer.p, 999);
  assert.equal(retailer.stock, 'Yes');
  assert.equal(retailer.tgg_sku, '50073316');
  assert.equal(retailer.source, 'partnerize-feed');
  assert.equal(retailer.verified_at, '2026-06-02');
});

test('partnerize TGG feed: imports matching feed rows into catalog-final style products', () => {
  const csv = [
    'Category|Currency|Price|SKU/Unique Identifier|Stock|Title|URL|Brand|ModelNumber',
    'Fridges & Freezers > Refrigerators > Bottom Mount Fridges|AUD|999.00|GB-455BLE|Yes|LG 420L Bottom Mount Refrigerator|https://prf.hn/click/camref:1011l5JNxE/creativeref:1011l64579/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Flg-420l-bottom-mount-refrigerator-gb-455ble|LG|50073316',
  ].join('\n');
  const catalog = {
    products: [
      {
        id: 'fridge-lg-gb455ble',
        cat: 'fridge',
        brand: 'LG',
        model: 'GB-455BLE',
        retailers: [],
        unavailable: false,
      },
    ],
  };

  const { document, stats } = importPartnerizeFeedToCatalog({
    catalogDocument: catalog,
    feedCsv: csv,
    verifiedAt: '2026-06-02',
  });
  const retailer = document.products[0].retailers[0];

  assert.equal(stats.feedRows, 1);
  assert.equal(stats.exactMatches, 1);
  assert.equal(stats.updatedProducts, 1);
  assert.equal(retailer.n, 'The Good Guys');
  assert.equal(retailer.url, 'https://www.thegoodguys.com.au/lg-420l-bottom-mount-refrigerator-gb-455ble');
  assert.equal(retailer.affiliate_url, 'https://prf.hn/click/camref:1011l5JNxE/creativeref:1011l64579/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Flg-420l-bottom-mount-refrigerator-gb-455ble');
  assert.equal(retailer.affiliate_network, 'partnerize');
  assert.equal(retailer.p, 999);
  assert.equal(retailer.stock, 'Yes');
  assert.equal(retailer.tgg_sku, '50073316');
  assert.equal(retailer.source, 'partnerize-feed');
});

test('partnerize TGG feed: does not create approved entries for unknown or archived catalog products by default', () => {
  const csv = [
    'Category|Currency|Price|SKU/Unique Identifier|Stock|Title|URL|Brand|ModelNumber',
    'Laundry > Washing Machines > Front Load Washing Machines|AUD|899.00|ACTIVE-1|Yes|Active Washer|https://prf.hn/click/camref:1011l5JNxE/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Factive-washer-active-1|Demo|5001',
    'Laundry > Washing Machines > Front Load Washing Machines|AUD|799.00|ARCHIVED-1|Yes|Archived Washer|https://prf.hn/click/camref:1011l5JNxE/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Farchived-washer-archived-1|Demo|5002',
    'Laundry > Washing Machines > Front Load Washing Machines|AUD|699.00|UNKNOWN-1|Yes|Unknown Washer|https://prf.hn/click/camref:1011l5JNxE/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Funknown-washer-unknown-1|Demo|5003',
  ].join('\n');
  const manual = { schema_version: 1, products: { active: { approved: true, retailers: [] } } };
  const catalogProducts = [
    { id: 'active', cat: 'washing_machine', brand: 'Demo', model: 'ACTIVE-1', unavailable: false },
    { id: 'archived', cat: 'washing_machine', brand: 'Demo', model: 'ARCHIVED-1', unavailable: true },
  ];

  const { document, stats } = importPartnerizeFeedToManualRetailers({
    manualDocument: manual,
    catalogProducts,
    feedCsv: csv,
    verifiedAt: '2026-06-02',
  });

  assert.equal(document.products.active.retailers.length, 1);
  assert.equal(document.products.archived, undefined);
  assert.equal(stats.exactMatches, 2);
  assert.equal(stats.skippedArchivedMatches, 1);
  assert.equal(stats.unmatchedFeedRows, 1);
});
