import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ReplacementMatchEngine = require('../public/scripts/replacement-match-engine.js');

function currentProduct(overrides = {}) {
  return {
    id: 'fridge-current',
    cat: 'fridge',
    brand: 'Example',
    model: 'NEW-1',
    w: 600,
    h: 1700,
    d: 650,
    unavailable: false,
    retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/example-new-1' }],
    ...overrides,
  };
}

test('replacement engine computes direct new-minus-old W/H/D differences without clearance semantics', () => {
  const match = ReplacementMatchEngine.compareDimensions(
    { w: 600, h: 1700, d: 650 },
    { w: 601, h: 1695, d: 660 },
  );
  assert.deepEqual(match.deltasMm, { width: 1, height: -5, depth: 10 });
  assert.deepEqual(match.absoluteDeltasMm, { width: 1, height: 5, depth: 10 });
  assert.equal(match.maxAbsoluteDeltaMm, 10);
  assert.equal(match.totalAbsoluteDeltaMm, 16);
  assert.equal(match.relation, 'MIXED');
  assert.ok(Math.abs(match.normalizedDistance - (
    (1 / 600 * 0.4) + (5 / 1700 * 0.3) + (10 / 650 * 0.3)
  )) < 1e-12);
  assert.doesNotMatch(JSON.stringify(match), /fit|clearance|cavity/i);
});

test('replacement engine retains slightly larger products and ranks by maximum axis difference first', () => {
  const results = ReplacementMatchEngine.matchCurrentProducts([
    currentProduct({ id: 'smaller', model: 'SMALLER', w: 596, d: 640 }),
    currentProduct({ id: 'larger-one-mm', model: 'LARGER', w: 601 }),
    currentProduct({ id: 'mixed', model: 'MIXED', w: 599, h: 1702, d: 650 }),
  ], {
    category: 'fridge',
    sourceDimensions: { w: 600, h: 1700, d: 650 },
  });
  assert.deepEqual(results.map((row) => row.product.id), ['larger-one-mm', 'mixed', 'smaller']);
  assert.equal(results[0].match.relation, 'SAME_OR_LARGER');
  assert.deepEqual(results[0].match.deltasMm, { width: 1, height: 0, depth: 0 });
});

test('replacement engine hard-filters archived, non-buyable and incomplete output products', () => {
  const results = ReplacementMatchEngine.matchCurrentProducts([
    currentProduct(),
    currentProduct({ id: 'archived', unavailable: true }),
    currentProduct({ id: 'no-link', retailers: [] }),
    currentProduct({ id: 'search-link', retailers: [{ url: 'https://www.jbhifi.com.au/search?q=new' }] }),
    currentProduct({ id: 'unknown-host', retailers: [{ url: 'https://example.com/products/example-new-1' }] }),
    currentProduct({ id: 'missing-depth', d: null }),
    currentProduct({ id: 'wrong-category', cat: 'dryer' }),
  ], {
    category: 'fridge',
    sourceDimensions: { width: 600, height: 1700, depth: 650 },
  });
  assert.deepEqual(results.map((row) => row.product.id), ['fridge-current']);
});

test('replacement engine requires all three old-appliance dimensions', () => {
  assert.throws(
    () => ReplacementMatchEngine.matchCurrentProducts([currentProduct()], {
      category: 'fridge',
      sourceDimensions: { w: 600, h: 1700 },
    }),
    /width.*height.*depth|complete/i,
  );
});

test('replacement engine prefers canonical closed-envelope dimensions over stale top-level fields', () => {
  const [result] = ReplacementMatchEngine.matchCurrentProducts([
    currentProduct({
      id: 'canonical-geometry',
      w: 700,
      h: 1850,
      d: 720,
      geometry_v2: {
        closedEnvelope: {
          widthMm: 914,
          heightMm: { minimumMm: 1792, maximumMm: 1792 },
          depthMm: 729,
        },
      },
    }),
  ], {
    sourceDimensions: { w: 914, h: 1792, d: 729 },
  });

  assert.deepEqual(result.match.candidateDimensionsMm, { width: 914, height: 1792, depth: 729 });
  assert.deepEqual(result.match.deltasMm, { width: 0, height: 0, depth: 0 });
  assert.equal(result.match.candidateDimensionSource, 'geometry_v2');
});

test('replacement engine evaluates adjustable height at the closest supported setting', () => {
  const [result] = ReplacementMatchEngine.matchCurrentProducts([
    currentProduct({
      id: 'adjustable-dishwasher',
      cat: 'dishwasher',
      w: 597,
      h: 895,
      d: 599,
      geometry_v2: {
        closedEnvelope: {
          widthMm: 597,
          heightMm: { minimumMm: 850, maximumMm: 895 },
          depthMm: 599,
        },
      },
    }),
  ], {
    category: 'dishwasher',
    sourceDimensions: { w: 597, h: 870, d: 599 },
  });

  assert.equal(result.match.deltasMm.height, 0);
  assert.deepEqual(result.match.candidateHeightRangeMm, { minimum: 850, maximum: 895, selected: 870 });
  assert.equal(result.match.candidateDimensionSource, 'geometry_v2');
});
