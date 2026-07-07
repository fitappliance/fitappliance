import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  TGG_CAMPAIGN_TERMS,
  applyPartnerizeTrackingToCatalog,
  applyPartnerizeTrackingToManualRetailers,
  buildTggCommissionMetadata,
  buildPartnerizeClickUrl,
  buildTggPdfEvidenceQueue,
  extractTggRetailerDimensionHint,
  importPartnerizeFeedToCatalog,
  importPartnerizeFeedToManualRetailers,
  isTggExcludedBrand,
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

test('partnerize TGG terms: records core white-goods commission and excluded brands from campaign terms', () => {
  assert.equal(TGG_CAMPAIGN_TERMS.cookieDays, 7);
  assert.equal(TGG_CAMPAIGN_TERMS.coreApplianceCpaPercent, 3);
  assert.equal(TGG_CAMPAIGN_TERMS.excludedBrands.includes('Asko'), true);
  assert.equal(TGG_CAMPAIGN_TERMS.excludedBrands.includes('Miele'), true);
  assert.equal(TGG_CAMPAIGN_TERMS.excludedBrands.includes('Loewe'), true);
  assert.equal(isTggExcludedBrand('MIELE'), true);
  assert.equal(isTggExcludedBrand('LG'), false);
});

test('partnerize TGG terms: marks excluded-brand products as zero-commission while preserving link eligibility', () => {
  assert.deepEqual(
    buildTggCommissionMetadata({ brand: 'Miele', cat: 'dishwasher' }),
    {
      commission_eligible: false,
      commission_rate_percent: 0,
      commission_cookie_days: 7,
      commission_model: 'CPA',
      commission_terms_observed_at: '2026-07-07',
      commission_exclusion_reason: 'Brand excluded by The Good Guys Australia Partnerize terms: Miele',
    }
  );

  assert.deepEqual(
    buildTggCommissionMetadata({ brand: 'LG', cat: 'fridge' }),
    {
      commission_eligible: true,
      commission_rate_percent: 3,
      commission_cookie_days: 7,
      commission_model: 'CPA',
      commission_terms_observed_at: '2026-07-07',
    }
  );
});

test('partnerize TGG dimensions: maps labelled high, wide, and deep values to the correct axes', () => {
  assert.deepEqual(
    extractTggRetailerDimensionHint('Sized at 950 millimetres high, 650 wide, and 780 deep.'),
    {
      source: 'partnerize-feed-description',
      confidence: 'retailer_text_hint',
      h_mm: 950,
      w_mm: 650,
      d_mm: 780,
      source_text: 'Sized at 950 millimetres high, 650 wide, and 780 deep.',
    }
  );

  assert.deepEqual(
    extractTggRetailerDimensionHint('At 474mm wide, 1137mm high and 498mm deep it fits flush against walls.'),
    {
      source: 'partnerize-feed-description',
      confidence: 'retailer_text_hint',
      w_mm: 474,
      h_mm: 1137,
      d_mm: 498,
      source_text: 'At 474mm wide, 1137mm high and 498mm deep it fits flush against walls.',
    }
  );
});

test('partnerize TGG dimensions: respects explicit W x H x D and H x W x D labels', () => {
  assert.deepEqual(
    extractTggRetailerDimensionHint('Dimensions (W x H x D) 550x1456x562 mm.'),
    {
      source: 'partnerize-feed-description',
      confidence: 'retailer_text_hint',
      w_mm: 550,
      h_mm: 1456,
      d_mm: 562,
      source_text: 'Dimensions (W x H x D) 550x1456x562 mm.',
    }
  );

  assert.deepEqual(
    extractTggRetailerDimensionHint('Dimensions are H x W x D 850 x 600 x 595 mm.'),
    {
      source: 'partnerize-feed-description',
      confidence: 'retailer_text_hint',
      h_mm: 850,
      w_mm: 600,
      d_mm: 595,
      source_text: 'Dimensions are H x W x D 850 x 600 x 595 mm.',
    }
  );
});

test('partnerize TGG dimensions: handles real feed variants without changing axis meaning', () => {
  assert.deepEqual(
    extractTggRetailerDimensionHint('Measuring 905mm wide, 1830mm tall, and 731mm deep, this fridge fits well in most kitchens.'),
    {
      source: 'partnerize-feed-description',
      confidence: 'retailer_text_hint',
      w_mm: 905,
      h_mm: 1830,
      d_mm: 731,
      source_text: 'Measuring 905mm wide, 1830mm tall, and 731mm deep, this fridge fits well in most kitchens.',
    }
  );

  assert.deepEqual(
    extractTggRetailerDimensionHint('With a width of 905mm, height of 1790mm and depth of 688mm, it fits most kitchen spaces.'),
    {
      source: 'partnerize-feed-description',
      confidence: 'retailer_text_hint',
      w_mm: 905,
      h_mm: 1790,
      d_mm: 688,
      source_text: 'With a width of 905mm, height of 1790mm and depth of 688mm, it fits most kitchen spaces.',
    }
  );

  assert.deepEqual(
    extractTggRetailerDimensionHint('The Haier fridge measures 830mm W x 1775mm H x 705mm D.'),
    {
      source: 'partnerize-feed-description',
      confidence: 'retailer_text_hint',
      w_mm: 830,
      h_mm: 1775,
      d_mm: 705,
      source_text: 'The Haier fridge measures 830mm W x 1775mm H x 705mm D.',
    }
  );
});

test('partnerize TGG dimensions: refuses unlabelled dimension triples instead of guessing axis order', () => {
  assert.equal(extractTggRetailerDimensionHint('Dimensions are 850 x 600 x 595 mm.'), null);
  assert.equal(extractTggRetailerDimensionHint('Measuring 820-880 mm in height, 597 mm in width and 554 mm in depth.'), null);
  assert.equal(extractTggRetailerDimensionHint('Measuring 597mm W x 857-917mm H x 574mm D.'), null);
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
    'Category|Currency|Price|SKU/Unique Identifier|Stock|Title|URL|Brand|ModelNumber|Description',
    'Fridges & Freezers > Refrigerators > Bottom Mount Fridges|AUD|999.00|GB-455BLE|Yes|LG 420L Bottom Mount Refrigerator|https://prf.hn/click/camref:1011l5JNxE/creativeref:1011l64579/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Flg-420l-bottom-mount-refrigerator-gb-455ble|LG|50073316|Dimensions are 1720 millimetres high, 700 wide, and 700 deep.',
    'Cooking & Dishwashers > Cooktops > Induction Cooktops|AUD|799.00|COOKTOP-1|Yes|Demo Cooktop|https://prf.hn/click/camref:1011l5JNxE/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Fdemo-cooktop|Demo|50000000|Dimensions are 850 x 600 x 600 mm.',
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
  assert.deepEqual(rows[0].retailer_dimension_hint, {
    source: 'partnerize-feed-description',
    confidence: 'retailer_text_hint',
    h_mm: 1720,
    w_mm: 700,
    d_mm: 700,
    source_text: 'Dimensions are 1720 millimetres high, 700 wide, and 700 deep.',
  });
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

test('partnerize TGG feed: preserves excluded-brand product links but flags zero commission', () => {
  const csv = [
    'Category|Currency|Price|SKU/Unique Identifier|Stock|Title|URL|Brand|ModelNumber',
    'Cooking & Dishwashers > Dishwashers > Freestanding Dishwashers|AUD|1599.00|G5000SCBRWS|Yes|Miele Dishwasher|https://prf.hn/click/camref:1011l5JNxE/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Fmiele-freestanding-dishwasher-g5000scbrws|Miele|50090000',
  ].join('\n');
  const catalog = {
    products: [
      {
        id: 'dishwasher-miele-g5000scbrws',
        cat: 'dishwasher',
        brand: 'Miele',
        model: 'G5000SCBRWS',
        retailers: [],
        unavailable: false,
      },
    ],
  };

  const { document, stats } = importPartnerizeFeedToCatalog({
    catalogDocument: catalog,
    feedCsv: csv,
    verifiedAt: '2026-07-07',
  });
  const retailer = document.products[0].retailers[0];

  assert.equal(stats.updatedProducts, 1);
  assert.equal(retailer.url, 'https://www.thegoodguys.com.au/miele-freestanding-dishwasher-g5000scbrws');
  assert.equal(retailer.commission_eligible, false);
  assert.equal(retailer.commission_rate_percent, 0);
  assert.equal(retailer.commission_cookie_days, 7);
  assert.match(retailer.commission_exclusion_reason, /Miele/);
});

test('partnerize TGG feed: flags retailer dimension hints that drift from catalog dimensions', () => {
  const csv = [
    'Category|Currency|Price|SKU/Unique Identifier|Stock|Title|URL|Brand|ModelNumber|Description',
    'Fridges & Freezers > Refrigerators > Top Mount Fridges|AUD|549.00|HRTF206|Yes|Hisense 205L Top Mount Refrigerator|https://prf.hn/click/camref:1011l5JNxE/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Fhisense-205l-top-mount-refrigerator-hrtf206|Hisense|50073320|Measuring 550mm wide, 1456mm high and 562mm deep, the HRTF206 is designed to fit seamlessly into your kitchen layout.',
  ].join('\n');
  const catalog = {
    products: [
      {
        id: 'fridge-arf3335',
        cat: 'fridge',
        brand: 'Hisense',
        model: 'HRTF206',
        w: 550,
        h: 1410,
        d: 490,
        retailers: [],
        unavailable: false,
      },
    ],
  };

  const { document } = importPartnerizeFeedToCatalog({
    catalogDocument: catalog,
    feedCsv: csv,
    verifiedAt: '2026-07-07',
  });
  const product = document.products[0];
  const retailer = product.retailers[0];

  assert.deepEqual({ w: product.w, h: product.h, d: product.d }, { w: 550, h: 1410, d: 490 });
  assert.deepEqual(retailer.retailer_dimension_hint, {
    source: 'partnerize-feed-description',
    confidence: 'retailer_text_hint',
    w_mm: 550,
    h_mm: 1456,
    d_mm: 562,
    source_text: 'Measuring 550mm wide, 1456mm high and 562mm deep, the HRTF206 is designed to fit seamlessly into your kitchen layout.',
  });
  assert.deepEqual(retailer.retailer_dimension_hint_catalog_delta_mm, {
    w_mm: 0,
    h_mm: 46,
    d_mm: 72,
  });
  assert.equal(retailer.retailer_dimension_hint_review_required, true);
});

test('partnerize TGG PDF queue: prioritizes matched products without treating retailer dimensions as verified dimensions', () => {
  const csv = [
    'Category|Currency|Price|SKU/Unique Identifier|Stock|Title|URL|Brand|ModelNumber|Description',
    'Fridges & Freezers > Refrigerators > Bottom Mount Fridges|AUD|999.00|GB-455BLE|Yes|LG 420L Bottom Mount Refrigerator|https://prf.hn/click/camref:1011l5JNxE/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Flg-420l-bottom-mount-refrigerator-gb-455ble|LG|50073316|Measuring 700mm wide, 1720mm high, and 700mm deep, this fridge fits most kitchens.',
    'Laundry > Washing Machines > Front Load Washing Machines|AUD|899.00|HWF75KW1|Yes|Haier Washer|https://prf.hn/click/camref:1011l5JNxE/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Fhaier-75kg-front-load-washer-hwf75kw1|Haier|50073317|Dimensions are 850 millimetres high, 595 wide, and 507 deep.',
    'Cooking & Dishwashers > Dishwashers > Freestanding Dishwashers|AUD|699.00|ARCHIVED-1|Yes|Archived Dishwasher|https://prf.hn/click/camref:1011l5JNxE/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Farchived-dishwasher-archived-1|Demo|50073318|Dimensions are 850 millimetres high, 600 wide, and 600 deep.',
    'Cooking & Dishwashers > Dishwashers > Freestanding Dishwashers|AUD|1199.00|SMS6HCW01A|Yes|Bosch Dishwasher|https://prf.hn/click/camref:1011l5JNxE/destination:https%3A%2F%2Fwww.thegoodguys.com.au%2Fbosch-serie-6-dishwasher-sms6hcw01a|Bosch|50073319|With a height of 845mm, width of 600mm, and depth of 600mm, dimensions suit most kitchens.',
  ].join('\n');
  const catalog = {
    products: [
      {
        id: 'fridge-lg-gb455ble',
        cat: 'fridge',
        brand: 'LG',
        model: 'GB-455BLE',
        unavailable: false,
        priorityScore: 48,
        evidence: {
          has_pdf_evidence: true,
          source_type: 'retailer_spec',
          trust_level: 'retailer_spec',
        },
      },
      { id: 'washing-machine-haier-hwf75kw1', cat: 'washing_machine', brand: 'Haier', model: 'HWF75KW1', unavailable: false, priorityScore: 24 },
      { id: 'dishwasher-demo-archived', cat: 'dishwasher', brand: 'Demo', model: 'ARCHIVED-1', unavailable: true, priorityScore: 99 },
      { id: 'dishwasher-bosch-sms6hcw01a', cat: 'dishwasher', brand: 'Bosch', model: 'SMS6HCW01A', unavailable: false, priorityScore: 12 },
    ],
  };
  const manualEvidence = {
    products: {
      'washing-machine-haier-hwf75kw1': {
        evidence: [{
          status: 'approved',
          type: 'spec_sheet',
          source_url: 'https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/example.pdf',
        }],
      },
      'dishwasher-bosch-sms6hcw01a': {
        evidence: [{
          status: 'approved',
          type: 'spec_sheet',
          source_url: 'https://www.appliancesonline.com.au/ak/example-bosch-specifications-sheet.pdf',
        }],
      },
    },
  };

  const { queue, stats } = buildTggPdfEvidenceQueue({
    catalogDocument: catalog,
    manualEvidenceDocument: manualEvidence,
    feedCsv: csv,
    verifiedAt: '2026-07-07',
  });

  assert.deepEqual(stats, {
    feedRows: 4,
    exactMatches: 4,
    queuedProducts: 2,
    skippedArchivedMatches: 1,
    skippedCategoryMismatches: 0,
    skippedExistingPdfEvidence: 1,
    unmatchedFeedRows: 0,
  });
  assert.equal(queue.length, 2);
  assert.equal(queue[0].product_id, 'fridge-lg-gb455ble');
  assert.equal(queue[0].brand, 'LG');
  assert.equal(queue[0].model, 'GB-455BLE');
  assert.equal(queue[0].retailer_dimension_hint.w_mm, 700);
  assert.equal(queue[0].retailer_dimension_hint.h_mm, 1720);
  assert.equal(queue[0].retailer_dimension_hint.d_mm, 700);
  assert.equal(queue[0].dimensions_verified, false);
  assert.equal(queue[0].pdf_evidence_status, 'missing_official_pdf');
  assert.equal('w' in queue[0], false);
  assert.equal('h' in queue[0], false);
  assert.equal('d' in queue[0], false);
  assert.equal(queue[1].product_id, 'dishwasher-bosch-sms6hcw01a');
  assert.equal(queue[1].pdf_evidence_status, 'missing_official_pdf');
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
