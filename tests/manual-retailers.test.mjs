import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const MANUAL_RETAILERS_PATH = path.join(process.cwd(), 'data', 'manual-retailers.json');

function isReviewedRetailerProductPath(parsedUrl) {
  const host = parsedUrl.hostname.replace(/^www\./, '');
  const pathname = parsedUrl.pathname.replace(/\/+$/, '');
  if (host === 'appliancesonline.com.au') return /^\/product\/[^/]+$/.test(pathname);
  if (host === 'binglee.com.au') return /^\/products\/[^/]+$/.test(pathname);
  if (host === 'harveynorman.com.au') return /\.html$/.test(pathname);
  if (host === 'jbhifi.com.au') return /^\/products\/[^/]+$/.test(pathname);
  if (host === 'thegoodguys.com.au') return /^\/[^/]+-[^/]+$/.test(pathname);
  return false;
}

function categoryEntries(document, category) {
  return Object.entries(document.products)
    .filter(([slug, entry]) => {
      if (entry?.approved !== true) return false;
      if (category === 'dryer') return slug.startsWith('dryer-') || slug.startsWith('dr');
      return slug.startsWith(`${category}-`);
    });
}

function categoryRetailerStats(entries) {
  const retailerCounts = new Map();
  let entriesWithNonAoRetailer = 0;

  for (const [, entry] of entries) {
    const retailers = entry.retailers ?? [];
    if (retailers.some((retailer) => retailer.n !== 'Appliances Online')) {
      entriesWithNonAoRetailer += 1;
    }
    for (const retailer of retailers) {
      retailerCounts.set(retailer.n, (retailerCounts.get(retailer.n) ?? 0) + 1);
    }
  }

  return { entriesWithNonAoRetailer, retailerCounts };
}

test('manual retailers: document has stable schema metadata and consistent approved_count', () => {
  const document = JSON.parse(fs.readFileSync(MANUAL_RETAILERS_PATH, 'utf8'));

  assert.equal(document.schema_version, 1);
  assert.match(document.last_updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof document.products, 'object');
  assert.notEqual(document.products, null);

  const approvedEntries = Object.values(document.products).filter((entry) => entry?.approved === true);
  assert.equal(document.approved_count, approvedEntries.length, 'approved_count must equal entries with approved=true');
});

test('manual retailers: approved entry schema is documented by fixture shape', () => {
  const entry = {
    researched_at: '2026-04-27T00:00:00.000Z',
    approved: false,
    approved_by: null,
    confidence: 'medium',
    retailers: [
      {
        n: 'JB Hi-Fi',
        url: 'https://www.jbhifi.com.au/products/lg-gth560npl',
        p: null,
        verified_at: '2026-04-27T00:00:00.000Z',
        source: 'duckduckgo-search',
      },
    ],
  };

  assert.equal(typeof entry.researched_at, 'string');
  assert.equal(entry.approved, false);
  assert.equal(entry.approved_by, null);
  assert.ok(['high', 'medium', 'low'].includes(entry.confidence));
  assert.deepEqual(Object.keys(entry.retailers[0]), ['n', 'url', 'p', 'verified_at', 'source']);
});

test('manual retailers: Appliances Online fridge round uses reviewed product-page links', () => {
  const document = JSON.parse(fs.readFileSync(MANUAL_RETAILERS_PATH, 'utf8'));
  const appliancesOnlineLinks = Object.entries(document.products)
    .filter(([, entry]) => entry?.approved === true)
    .flatMap(([slug, entry]) => (entry.retailers ?? [])
      .filter((retailer) => retailer?.n === 'Appliances Online')
      .map((retailer) => ({ slug, retailer })));

  assert.ok(
    appliancesOnlineLinks.length >= 30,
    `expected at least 30 reviewed Appliances Online fridge links, got ${appliancesOnlineLinks.length}`,
  );

  for (const { slug, retailer } of appliancesOnlineLinks) {
    assert.match(
      retailer.url,
      /^https:\/\/www\.appliancesonline\.com\.au\/product\/[^?#]+\/?$/,
      `${slug} must use a direct Appliances Online product URL`,
    );
    assert.equal(retailer.p, null, `${slug} should keep price null until a trusted feed is available`);
    assert.equal(retailer.source, 'websearch-appliances-online');
    assert.match(retailer.verified_at, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('manual retailers: washing machine round uses reviewed product-page links', () => {
  const document = JSON.parse(fs.readFileSync(MANUAL_RETAILERS_PATH, 'utf8'));
  const washingMachineEntries = Object.entries(document.products)
    .filter(([slug, entry]) => slug.startsWith('washing_machine-') && entry?.approved === true);

  assert.ok(
    washingMachineEntries.length >= 12,
    `expected at least 12 approved washing-machine manual retailer entries, got ${washingMachineEntries.length}`,
  );

  const allowedHosts = [
    'www.appliancesonline.com.au',
    'www.binglee.com.au',
    'www.harveynorman.com.au',
    'www.jbhifi.com.au',
    'www.thegoodguys.com.au',
  ];

  for (const [slug, entry] of washingMachineEntries) {
    assert.ok(['exact', 'variant'].includes(entry.match_type), `${slug} must document exact or variant matching`);
    assert.match(entry.researched_at, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok((entry.retailers ?? []).length >= 1, `${slug} must include at least one retailer`);

    for (const retailer of entry.retailers) {
      const parsed = new URL(retailer.url);
      assert.ok(allowedHosts.includes(parsed.hostname), `${slug} uses unsupported retailer host ${parsed.hostname}`);
      assert.ok(isReviewedRetailerProductPath(parsed), `${slug} must use a direct retailer product URL`);
      assert.equal(retailer.p, null, `${slug} should keep price null until a trusted feed is available`);
      assert.match(retailer.verified_at, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(retailer.source, /^websearch-/);
    }
  }
});

test('manual retailers: dishwasher and dryer rounds use reviewed product-page links', () => {
  const document = JSON.parse(fs.readFileSync(MANUAL_RETAILERS_PATH, 'utf8'));
  const entriesByCategory = {
    dishwasher: Object.entries(document.products)
      .filter(([slug, entry]) => slug.startsWith('dishwasher-') && entry?.approved === true),
    dryer: Object.entries(document.products)
      .filter(([slug, entry]) => slug.startsWith('dryer-') || slug.startsWith('dr'))
      .filter(([, entry]) => entry?.approved === true),
  };

  assert.ok(
    entriesByCategory.dishwasher.length >= 12,
    `expected at least 12 approved dishwasher manual retailer entries, got ${entriesByCategory.dishwasher.length}`,
  );
  assert.ok(
    entriesByCategory.dryer.length >= 4,
    `expected at least 4 approved dryer manual retailer entries, got ${entriesByCategory.dryer.length}`,
  );

  for (const [category, entries] of Object.entries(entriesByCategory)) {
    for (const [slug, entry] of entries) {
      assert.ok(['exact', 'variant'].includes(entry.match_type), `${slug} must document exact or variant matching`);
      assert.match(entry.researched_at, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok((entry.retailers ?? []).length >= 1, `${slug} must include at least one retailer`);

      for (const retailer of entry.retailers) {
        const parsed = new URL(retailer.url);
        assert.ok(isReviewedRetailerProductPath(parsed), `${category} ${slug} must use a direct retailer product URL`);
        assert.equal(retailer.p, null, `${slug} should keep price null until a trusted feed is available`);
        assert.match(retailer.verified_at, /^\d{4}-\d{2}-\d{2}$/);
        assert.match(retailer.source, /^websearch-/);
      }
    }
  }
});

test('manual retailers: non-fridge categories keep reviewed non-AO retailer coverage', () => {
  const document = JSON.parse(fs.readFileSync(MANUAL_RETAILERS_PATH, 'utf8'));
  const minimums = {
    dishwasher: {
      entriesWithNonAoRetailer: 6,
      retailerCounts: { 'The Good Guys': 7, 'Harvey Norman': 4, 'Bing Lee': 6 },
    },
    dryer: {
      entriesWithNonAoRetailer: 2,
      retailerCounts: { 'The Good Guys': 2, 'Bing Lee': 2 },
    },
    washing_machine: {
      entriesWithNonAoRetailer: 9,
      retailerCounts: { 'The Good Guys': 6, 'Harvey Norman': 3, 'Bing Lee': 8 },
    },
  };

  for (const [category, expected] of Object.entries(minimums)) {
    const stats = categoryRetailerStats(categoryEntries(document, category));

    assert.ok(
      stats.entriesWithNonAoRetailer >= expected.entriesWithNonAoRetailer,
      `${category} expected at least ${expected.entriesWithNonAoRetailer} products with non-AO retailer links, got ${stats.entriesWithNonAoRetailer}`,
    );

    for (const [retailer, minimumCount] of Object.entries(expected.retailerCounts)) {
      assert.ok(
        (stats.retailerCounts.get(retailer) ?? 0) >= minimumCount,
        `${category} expected at least ${minimumCount} ${retailer} links, got ${stats.retailerCounts.get(retailer) ?? 0}`,
      );
    }
  }
});

test('manual retailers: reviewed exact-link expansion uses direct retailer product pages', () => {
  const document = JSON.parse(fs.readFileSync(MANUAL_RETAILERS_PATH, 'utf8'));
  const expectedLinks = {
    'dishwasher-adw1155': {
      model: 'WSF6606XB',
      retailers: {
        'Harvey Norman': 'https://www.harveynorman.com.au/westinghouse-60cm-15-place-setting-freestanding-dishwasher-stainless-steel.html',
        'Bing Lee': 'https://www.binglee.com.au/products/60cm-freestanding-dishwasher-stainless-steel-with-15-place-settings-wsf6606xb',
      },
      excludedRetailers: ['The Good Guys'],
    },
    'dishwasher-adw1149': {
      model: 'WSF6604XB',
      retailers: {
        'Harvey Norman': 'https://www.harveynorman.com.au/westinghouse-wsf6604xb-60cm-14-place-setting-freestanding-dishwasher-stainless-steel.html',
        'Bing Lee': 'https://www.binglee.com.au/products/60cm-freestanding-dishwasher-stainless-steel-with-14-place-settings-wsf6604xb',
      },
    },
    'dishwasher-adw1245': {
      model: 'HSBE15FS',
      retailers: {
        'The Good Guys': 'https://www.thegoodguys.com.au/hisense-series-5-freestanding-dishwasher-silver-steel-hsbe15fs',
      },
    },
    'washing_machine-acw1423': {
      model: 'HWFS7514S',
      retailers: {
        'Harvey Norman': 'https://www.harveynorman.com.au/hisense-7-5kg-series-3-front-load-washing-machine.html',
      },
    },
    'washing_machine-acw1243': {
      model: 'WWF9024M5SA',
      retailers: {
        'Harvey Norman': 'https://www.harveynorman.com.au/westinghouse-9kg-easycare-front-load-washing-machine-dark.html',
        'Bing Lee': 'https://www.binglee.com.au/products/9kg-front-loader-dark-grey-wwf9024m5sa',
      },
    },
  };

  for (const [slug, expected] of Object.entries(expectedLinks)) {
    const entry = document.products[slug];
    assert.ok(entry, `${slug} should be present in manual retailer data`);
    assert.equal(entry.match_type, 'exact', `${slug} must stay an exact model match`);

    for (const [retailerName, expectedUrl] of Object.entries(expected.retailers)) {
      const retailer = (entry.retailers ?? []).find((row) => row.n === retailerName);
      assert.ok(retailer, `${slug} should include ${retailerName} for ${expected.model}`);
      assert.equal(retailer.url, expectedUrl, `${slug} ${retailerName} URL should be the reviewed product page`);
      assert.ok(isReviewedRetailerProductPath(new URL(retailer.url)), `${slug} ${retailerName} must use a direct product URL`);
      assert.equal(retailer.p, null, `${slug} ${retailerName} should not record live price without a trusted feed`);
      assert.match(retailer.source, /^websearch-/);
      assert.match(retailer.verified_at, /^\d{4}-\d{2}-\d{2}$/);
    }

    for (const excludedRetailer of expected.excludedRetailers ?? []) {
      assert.equal(
        (entry.retailers ?? []).some((retailer) => retailer.n === excludedRetailer),
        false,
        `${slug} ${excludedRetailer} redirects to a category/search page and must not be exposed`,
      );
    }
  }
});

test('manual retailers: known The Good Guys category redirects are not exposed as product links', () => {
  const document = JSON.parse(fs.readFileSync(MANUAL_RETAILERS_PATH, 'utf8'));
  const knownCategoryRedirects = [
    'fridge-arf2444',
    'fridge-arf2745',
    'fridge-arf2733',
    'fridge-arf2860',
    'fridge-arf3570',
    'fridge-arf2887',
    'washing_machine-acw1345',
    'washing_machine-acw1469',
  ];

  for (const slug of knownCategoryRedirects) {
    const entry = document.products[slug];
    assert.ok(entry, `${slug} should remain documented in manual retailer data`);
    assert.equal(
      (entry.retailers ?? []).some((retailer) => retailer.n === 'The Good Guys'),
      false,
      `${slug} The Good Guys URL redirects to a category/search page and must not be shown`,
    );
  }
});
