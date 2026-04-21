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

test('phase 42a popularity: fallback research document is empty and marks last_researched null', () => {
  const doc = buildFallbackResearchDocument();
  assert.equal(doc.schema_version, 1);
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

test('phase 42a popularity: research script falls back to empty data and writes backfill doc on fetch failure', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-popularity-'));
  const dataDir = path.join(tmpDir, 'data');
  const docsDir = path.join(tmpDir, 'docs');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'appliances.json'), JSON.stringify({
    schema_version: 2,
    last_updated: '2026-04-21',
    products: [makeProduct({ id: 'f6' })]
  }));

  const result = await researchPopularity({
    repoRoot: tmpDir,
    dataDir,
    docsDir,
    fetchImpl: async () => {
      throw new Error('getaddrinfo ENOTFOUND www.harveynorman.com.au');
    },
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.mode, 'fallback');
  assert.equal(result.researched, 0);

  const writtenDoc = JSON.parse(fs.readFileSync(path.join(dataDir, 'popularity-research.json'), 'utf8'));
  assert.deepEqual(writtenDoc.products, {});
  assert.equal(writtenDoc.last_researched, null);

  const backfillDoc = fs.readFileSync(path.join(docsDir, 'PHASE42A-RESEARCH-BACKFILL.md'), 'utf8');
  assert.match(backfillDoc, /manual retailer research/i);
  assert.match(backfillDoc, /f6/);
});
