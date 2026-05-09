import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);

const {
  seedDiscoveryEvidence,
} = require('../scripts/discovery-pipeline/2-seed-evidence.js');
const {
  selectBestPdfManual,
  slugFromProductUrl,
} = require('../scripts/discovery-pipeline/lib/appliances-online-product-api.js');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function makeFetch(fixtures) {
  return async (url) => {
    const key = [...Object.keys(fixtures)].find((fixtureKey) => String(url).includes(fixtureKey));
    if (!key) {
      return {
        ok: false,
        status: 404,
        json: async () => ({})
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => fixtures[key]
    };
  };
}

test('AO product API helper extracts product slug from product URLs', () => {
  assert.equal(
    slugFromProductUrl('https://www.appliancesonline.com.au/product/lg-wv5-1408w-8kg-series-5-front-load-washing-machine/'),
    'lg-wv5-1408w-8kg-series-5-front-load-washing-machine',
  );
});

test('AO manual selector prefers specification sheets over generic manuals', () => {
  const selected = selectBestPdfManual({
    manuals: [
      { name: 'User Manual', url: '/manual.pdf', displayOrder: 0 },
      { name: 'Specifications Sheet', url: '/specifications.pdf', displayOrder: 1 },
    ],
  });

  assert.equal(selected.url, 'https://www.appliancesonline.com.au/specifications.pdf');
});

test('discovery evidence seeding writes manual-evidence candidate entries and continues after edge failures', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-seed-'));
  const discoveryPath = path.join(tmp, 'data', 'discovery-report.json');
  const manualEvidencePath = path.join(tmp, 'data', 'manual-evidence.json');
  const reportPath = path.join(tmp, 'reports', 'seed.json');
  writeJson(discoveryPath, {
    schema_version: 1,
    new_discoveries: {
      washing_machine: {
        LG: [
          {
            brand: 'LG',
            model: 'WV5-1408W',
            retailer: 'Appliances Online',
            source: 'sitemap',
            url: 'https://www.appliancesonline.com.au/product/lg-wv5-1408w-8kg-series-5-front-load-washing-machine/'
          },
          {
            brand: 'LG',
            model: 'BADMODEL',
            retailer: 'Appliances Online',
            source: 'sitemap',
            url: 'https://www.appliancesonline.com.au/product/lg-badmodel-front-load-washing-machine/'
          }
        ]
      }
    }
  });
  writeJson(manualEvidencePath, {
    schema_version: 1,
    products: {}
  });

  const result = await seedDiscoveryEvidence({
    delayMs: 0,
    discoveryReportPath: discoveryPath,
    fetchImpl: makeFetch({
      'lg-wv5-1408w-8kg-series-5-front-load-washing-machine': {
        productId: 79153,
        sku: 'WV5-1408W',
        title: 'LG Series 5 8kg Front Load Washing Machine WV5-1408W',
        uri: '/product/lg-wv5-1408w-8kg-series-5-front-load-washing-machine',
        price: 931,
        manufacturer: { name: 'LG' }
      },
      'specifications/sku/WV5-1408W': {
        groupedAttributes: {
          'key Specifications': {
            attributes: [
              { displayName: 'Height (mm)', value: '850 mm' },
              { displayName: 'Width (mm)', value: '600 mm' },
              { displayName: 'Depth (mm)', value: '605 mm' },
            ]
          }
        }
      },
      'manuals/id/79153': {
        manuals: [
          { name: 'WV5-1408W - LG - Specifications Sheet', url: '/ak/spec.pdf', displayOrder: 0 }
        ]
      }
    }),
    manualEvidencePath,
    outputReportPath: reportPath,
    runAt: '2026-05-09T00:00:00.000Z'
  });

  const manifest = JSON.parse(fs.readFileSync(manualEvidencePath, 'utf8'));
  assert.equal(result.report.seeded_count, 1);
  assert.equal(result.report.failure_count, 1);
  assert.equal(manifest.products['ao-79153'].source_url, 'https://www.appliancesonline.com.au/ak/spec.pdf');
  assert.equal(manifest.products['ao-79153'].product.w, 600);
  assert.equal(manifest.products['ao-79153'].product.unavailable, false);
});

test('discovery evidence seeding supports non-AO retailer candidates via PDF search', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-seed-generic-'));
  const discoveryPath = path.join(tmp, 'data', 'discovery-report.json');
  const manualEvidencePath = path.join(tmp, 'data', 'manual-evidence.json');
  const reportPath = path.join(tmp, 'reports', 'seed.json');
  writeJson(discoveryPath, {
    schema_version: 1,
    retailer: 'jb-hi-fi',
    new_discoveries: {
      fridge: {
        Bosch: [
          {
            brand: 'Bosch',
            model: 'KFD96AXEAA',
            retailer: 'JB Hi-Fi',
            retailer_key: 'jb-hi-fi',
            source: 'sitemap',
            url: 'https://www.jbhifi.com.au/products/bosch-kfd96axeaa-574l-quad-door-refrigerator'
          }
        ]
      }
    }
  });
  writeJson(manualEvidencePath, {
    schema_version: 1,
    products: {}
  });

  const result = await seedDiscoveryEvidence({
    delayMs: 0,
    discoveryReportPath: discoveryPath,
    manualEvidencePath,
    outputReportPath: reportPath,
    pdfSearch: async () => ({
      url: 'https://media3.bosch-home.com/Documents/specsheet/en-AU/KFD96AXEAA.pdf',
      source: 'duckduckgo-html'
    }),
    runAt: '2026-05-09T00:00:00.000Z'
  });

  const manifest = JSON.parse(fs.readFileSync(manualEvidencePath, 'utf8'));
  const entry = manifest.products['discovery-fridge-bosch-kfd96axeaa'];

  assert.equal(result.report.seeded_count, 1);
  assert.equal(result.report.failure_count, 0);
  assert.equal(entry.source_url, 'https://media3.bosch-home.com/Documents/specsheet/en-AU/KFD96AXEAA.pdf');
  assert.equal(entry.discovery.retailer_key, 'jb-hi-fi');
  assert.equal(entry.product.retailers[0].n, 'JB Hi-Fi');
  assert.equal(entry.product.unavailable, false);
});
