import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const MANUAL_RETAILERS_PATH = path.join(process.cwd(), 'data', 'manual-retailers.json');

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
