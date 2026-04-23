import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const {
  DEFAULT_RETAILER_WEIGHT,
  RETAILER_WEIGHTS,
  computePriorityScore,
  inferBrandTier
} = require('../scripts/common/popularity-score.js');
const {
  buildFallbackResearchDocument,
  buildResearchBackfillMarkdown,
  buildResearchQueue,
  loadCatalogProducts,
  resolveBatchSize,
  researchPopularity
} = require('../scripts/research-popularity.js');

function makeProduct(overrides = {}) {
  return {
    id: 'p1',
    brand: 'Samsung',
    model: 'WW90T684DLH 9kg Front Loader',
    cat: 'washing_machine',
    stars: 4,
    retailers: [
      { n: 'Harvey Norman', url: 'https://www.harveynorman.com.au/product-a' },
      { n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/product-a' }
    ],
    ...overrides
  };
}

test('phase 42a popularity: retailer weights sum into the raw priority score', () => {
  const score = computePriorityScore(makeProduct(), {
    now: '2026-04-21',
    verifiedAt: '2026-04-21',
    research: null
  });

  assert.ok(score >= RETAILER_WEIGHTS['Harvey Norman'] + RETAILER_WEIGHTS['JB Hi-Fi']);
});

test('phase 42a popularity: unknown retailer falls back to default weight', () => {
  const score = computePriorityScore(makeProduct({
    retailers: [{ n: 'Unknown Retailer', url: 'https://example.com/p1' }]
  }), {
    now: '2026-04-21',
    verifiedAt: '2026-04-21',
    research: null
  });

  assert.ok(score >= DEFAULT_RETAILER_WEIGHT);
});

test('phase 42a popularity: tier1 brands receive a higher boost than tier3 brands', () => {
  const tier1 = computePriorityScore(makeProduct({ brand: 'Samsung', retailers: [] }), {
    now: '2026-04-21',
    verifiedAt: '2026-04-21'
  });
  const tier3 = computePriorityScore(makeProduct({ brand: 'Kogan', retailers: [] }), {
    now: '2026-04-21',
    verifiedAt: '2026-04-21'
  });

  assert.ok(tier1 > tier3);
});

test('phase 42a popularity: stale verifiedAt older than 90 days applies a penalty', () => {
  const fresh = computePriorityScore(makeProduct({ retailers: [] }), {
    now: '2026-04-21',
    verifiedAt: '2026-04-20'
  });
  const stale = computePriorityScore(makeProduct({ retailers: [] }), {
    now: '2026-04-21',
    verifiedAt: '2025-12-01'
  });

  assert.ok(stale < fresh);
});

test('phase 42a popularity: research boost uses available retailer count and capped review count', () => {
  const score = computePriorityScore(makeProduct({ retailers: [] }), {
    now: '2026-04-21',
    verifiedAt: '2026-04-20',
    research: {
      retailersAvailable: 2,
      reviewCountSum: 999
    }
  });

  assert.equal(score, 100);
});

test('phase 42a popularity: dropped brands clamp priority score to zero', () => {
  const score = computePriorityScore(makeProduct({
    brand: 'CHIQ',
    retailers: [{ n: 'Harvey Norman', url: 'https://example.com/chiq' }]
  }), {
    now: '2026-04-21',
    verifiedAt: '2026-04-21'
  });

  assert.equal(score, 0);
});

test('phase 42a popularity: inferBrandTier maps featured and drop brands', () => {
  assert.equal(inferBrandTier('Samsung'), 'tier1');
  assert.equal(inferBrandTier('Whirlpool'), 'tier2');
  assert.equal(inferBrandTier('Kogan'), 'tier3');
  assert.equal(inferBrandTier('CHIQ'), 'dropped');
});

test('phase 42a popularity: research queue respects the 500 fetch limit and cursor offset', () => {
  const products = Array.from({ length: 620 }, (_, index) => makeProduct({
    id: `p${index + 1}`,
    brand: index % 2 === 0 ? 'Samsung' : 'Whirlpool',
    retailers: [{ n: 'Harvey Norman', url: `https://example.com/${index + 1}` }]
  }));

  const queue = buildResearchQueue(products, { limit: 500, cursor: 50 });

  assert.equal(queue.length, 500);
  assert.equal(queue[0].id, 'p51');
  assert.equal(queue.at(-1).id, 'p550');
});

test('phase 43a backfill: research queue includes tier1 and tier2 brands even when retailers are empty', () => {
  const products = [
    ...Array.from({ length: 5 }, (_, index) => makeProduct({
      id: `tier1-${index + 1}`,
      brand: 'Samsung',
      retailers: []
    })),
    ...Array.from({ length: 5 }, (_, index) => makeProduct({
      id: `tier2-${index + 1}`,
      brand: 'Whirlpool',
      retailers: []
    })),
    ...Array.from({ length: 5 }, (_, index) => makeProduct({
      id: `tier3-${index + 1}`,
      brand: 'Kogan',
      retailers: [{ n: 'Harvey Norman', url: `https://example.com/tier3-${index + 1}` }]
    })),
    ...Array.from({ length: 5 }, (_, index) => makeProduct({
      id: `drop-${index + 1}`,
      brand: 'CHIQ',
      retailers: []
    }))
  ];

  const queue = buildResearchQueue(products, { limit: 20, cursor: 0 });

  assert.equal(queue.length, 10);
  assert.deepEqual(
    queue.map((product) => product.id),
    [
      'tier1-1',
      'tier1-2',
      'tier1-3',
      'tier1-4',
      'tier1-5',
      'tier2-1',
      'tier2-2',
      'tier2-3',
      'tier2-4',
      'tier2-5'
    ]
  );
});

test('phase 42a popularity: fallback research document is empty and marks last_researched null', () => {
  const doc = buildFallbackResearchDocument();
  assert.equal(doc.schema_version, 2);
  assert.equal(doc.last_researched, null);
  assert.deepEqual(doc.products, {});
});

test('phase 42a popularity: backfill markdown explains manual retailer research fields', () => {
  const markdown = buildResearchBackfillMarkdown({
    products: [makeProduct({ id: 'f6', brand: 'Samsung', model: 'SRF7500WFH French Door 740L' })]
  });

  assert.match(markdown, /retailersAvailable/i);
  assert.match(markdown, /priceMinAud/i);
  assert.match(markdown, /reviewCountSum/i);
  assert.match(markdown, /f6/);
});

test('phase 43a backfill: batch size defaults to 500 and can be overridden by env', () => {
  assert.equal(resolveBatchSize({}), 500);
  assert.equal(resolveBatchSize({ RESEARCH_BATCH_SIZE: '125' }), 125);
  assert.equal(resolveBatchSize({ RESEARCH_BATCH_SIZE: '0' }), 500);
  assert.equal(resolveBatchSize({ RESEARCH_BATCH_SIZE: 'bogus' }), 500);
});

test('phase 43a backfill: loadCatalogProducts merges split files and dedupes by slug or id', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-popularity-catalog-'));
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const fridgeProduct = makeProduct({
    id: 'fridge-1',
    slug: 'shared-slug',
    cat: 'fridge'
  });
  const washerProduct = makeProduct({
    id: 'washer-1',
    cat: 'washing_machine',
    slug: 'washer-only'
  });

  const categoryDocuments = {
    'fridges.json': { cat: 'fridge', products: [fridgeProduct] },
    'dishwashers.json': { cat: 'dishwasher', products: [] },
    'dryers.json': { cat: 'dryer', products: [] },
    'washing-machines.json': {
      cat: 'washing_machine',
      products: [
        { ...fridgeProduct, id: 'fridge-duplicate' },
        washerProduct
      ]
    }
  };

  for (const [fileName, document] of Object.entries(categoryDocuments)) {
    fs.writeFileSync(
      path.join(dataDir, fileName),
      JSON.stringify({
        schema_version: 2,
        last_updated: '2026-04-22',
        ...document
      })
    );
  }

  const catalog = await loadCatalogProducts({ dataDir });

  assert.equal(catalog.length, 2);
  assert.deepEqual(
    catalog.map((product) => product.id),
    ['fridge-1', 'washer-1']
  );
});

test('phase 43a backfill: research script advances cursor by batch size and writes summary counts', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-popularity-cursor-'));
  const dataDir = path.join(tmpDir, 'data');
  const docsDir = path.join(tmpDir, 'docs');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(docsDir, { recursive: true });

  const products = [
    makeProduct({ id: 'f1', cat: 'fridge', slug: 'f1' }),
    makeProduct({ id: 'f2', cat: 'dishwasher', slug: 'f2' }),
    makeProduct({ id: 'f3', cat: 'dryer', slug: 'f3' })
  ];

  fs.writeFileSync(path.join(dataDir, 'fridges.json'), JSON.stringify({
    schema_version: 2,
    last_updated: '2026-04-22',
    cat: 'fridge',
    products: [products[0]]
  }));
  fs.writeFileSync(path.join(dataDir, 'dishwashers.json'), JSON.stringify({
    schema_version: 2,
    last_updated: '2026-04-22',
    cat: 'dishwasher',
    products: [products[1]]
  }));
  fs.writeFileSync(path.join(dataDir, 'dryers.json'), JSON.stringify({
    schema_version: 2,
    last_updated: '2026-04-22',
    cat: 'dryer',
    products: [products[2]]
  }));
  fs.writeFileSync(path.join(dataDir, 'washing-machines.json'), JSON.stringify({
    schema_version: 2,
    last_updated: '2026-04-22',
    cat: 'washing_machine',
    products: []
  }));

  const result = await researchPopularity({
    repoRoot: tmpDir,
    dataDir,
    docsDir,
    outputPath: path.join(tmpDir, 'popularity-research.json'),
    fetchImpl: async (url) => ({
      status: 200,
      async text() {
        return `price: 1299 reviews 14 ${url}`;
      }
    }),
    env: { RESEARCH_BATCH_SIZE: '2' },
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.researched, 2);
  assert.equal(result.total, 3);
  assert.equal(result.document.cursor, 2);
  assert.equal(result.document.totalCatalog, 3);
  assert.equal(result.document.skipped.length, 0);
  assert.deepEqual(result.document.last_batch, { researched: 2, skipped: 0 });

  const writtenDoc = JSON.parse(fs.readFileSync(path.join(tmpDir, 'popularity-research.json'), 'utf8'));
  assert.equal(writtenDoc.cursor, 2);
  assert.equal(writtenDoc.researched, 2);
  assert.equal(writtenDoc.totalCatalog, 3);
  assert.deepEqual(writtenDoc.last_batch, { researched: 2, skipped: 0 });
});

test('phase 43a backfill: existing cursor resumes the next batch when cursor option is omitted', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-popularity-resume-'));
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const products = Array.from({ length: 4 }, (_, index) => makeProduct({
    id: `f${index + 1}`,
    slug: `f${index + 1}`,
    cat: 'fridge'
  }));

  fs.writeFileSync(path.join(dataDir, 'fridges.json'), JSON.stringify({
    schema_version: 2,
    last_updated: '2026-04-22',
    cat: 'fridge',
    products
  }));
  fs.writeFileSync(path.join(dataDir, 'dishwashers.json'), JSON.stringify({
    schema_version: 2,
    last_updated: '2026-04-22',
    cat: 'dishwasher',
    products: []
  }));
  fs.writeFileSync(path.join(dataDir, 'dryers.json'), JSON.stringify({
    schema_version: 2,
    last_updated: '2026-04-22',
    cat: 'dryer',
    products: []
  }));
  fs.writeFileSync(path.join(dataDir, 'washing-machines.json'), JSON.stringify({
    schema_version: 2,
    last_updated: '2026-04-22',
    cat: 'washing_machine',
    products: []
  }));
  fs.writeFileSync(path.join(tmpDir, 'popularity-research.json'), JSON.stringify({
    schema_version: 1,
    last_researched: '2026-04-21',
    cursor: 2,
    products: {},
    skipped: []
  }));

  const result = await researchPopularity({
    repoRoot: tmpDir,
    dataDir,
    outputPath: path.join(tmpDir, 'popularity-research.json'),
    fetchImpl: async () => ({
      status: 200,
      async text() {
        return 'price 1449 12 reviews';
      }
    }),
    env: { RESEARCH_BATCH_SIZE: '2' },
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.document.schema_version, 2);
  assert.equal(result.document.cursor, 2);
  assert.deepEqual(Object.keys(result.document.products), ['f1', 'f2']);
});

test('phase 43a backfill: failed fetches are recorded as skipped and do not mark products unavailable', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-popularity-'));
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'fridges.json'), JSON.stringify({
    schema_version: 2,
    last_updated: '2026-04-22',
    cat: 'fridge',
    products: [makeProduct({ id: 'f6', slug: 'f6', cat: 'fridge' })]
  }));
  fs.writeFileSync(path.join(dataDir, 'dishwashers.json'), JSON.stringify({
    schema_version: 2,
    last_updated: '2026-04-22',
    cat: 'dishwasher',
    products: []
  }));
  fs.writeFileSync(path.join(dataDir, 'dryers.json'), JSON.stringify({
    schema_version: 2,
    last_updated: '2026-04-22',
    cat: 'dryer',
    products: []
  }));
  fs.writeFileSync(path.join(dataDir, 'washing-machines.json'), JSON.stringify({
    schema_version: 2,
    last_updated: '2026-04-22',
    cat: 'washing_machine',
    products: []
  }));

  const result = await researchPopularity({
    repoRoot: tmpDir,
    dataDir,
    outputPath: path.join(tmpDir, 'popularity-research.json'),
    fetchImpl: async () => Promise.reject(new Error('getaddrinfo ENOTFOUND www.harveynorman.com.au')),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.mode, 'researched');
  assert.equal(result.researched, 1);
  assert.equal(result.document.cursor, 1);
  assert.equal(result.document.skipped.length, 2);
  assert.deepEqual(result.document.last_batch, { researched: 1, skipped: 2 });
  assert.match(result.document.skipped[0].reason, /ENOTFOUND/);

  const writtenDoc = JSON.parse(fs.readFileSync(path.join(tmpDir, 'popularity-research.json'), 'utf8'));
  assert.deepEqual(writtenDoc.products, {});
  assert.equal(writtenDoc.skipped.length, 2);
  assert.deepEqual(writtenDoc.last_batch, { researched: 1, skipped: 2 });
});
