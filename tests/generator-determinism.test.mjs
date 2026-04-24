import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  sampleBrandModels
} = require('../scripts/generate-comparisons.js');

const {
  pickReviewPilotEntries
} = require('../scripts/pick-review-pilot.js');

function makeProduct(overrides = {}) {
  return {
    id: 'p1',
    cat: 'fridge',
    brand: 'LG',
    model: 'GF-L708MBL French Door 708L',
    w: 905,
    h: 1790,
    d: 740,
    stars: 4,
    unavailable: false,
    retailers: [],
    ...overrides
  };
}

test('phase 45a generator determinism: comparison samples choose a stable retailer independent of source order', () => {
  assert.equal(typeof sampleBrandModels, 'function');

  const products = [
    makeProduct({
      id: 'lg-one',
      model: 'GF-L708MBL French Door 708L',
      retailers: [
        { n: 'The Good Guys', url: 'https://www.thegoodguys.com.au' },
        { n: 'Harvey Norman', url: 'https://www.harveynorman.com.au' }
      ]
    }),
    makeProduct({
      id: 'lg-two',
      model: 'GF-L708MBL French Door 708L Alt',
      retailers: [
        { n: 'Harvey Norman', url: 'https://www.harveynorman.com.au' },
        { n: 'The Good Guys', url: 'https://www.thegoodguys.com.au' }
      ]
    })
  ];

  const samples = sampleBrandModels(products, 'fridge', 'LG');

  assert.deepEqual(
    samples.map((sample) => sample.bestRetailer?.n),
    ['Harvey Norman', 'Harvey Norman']
  );
});

test('phase 45a generator determinism: review pilot selection is stable when source product order changes', () => {
  const clearanceRules = {
    fridge: { __default__: { side: 20, rear: 50, top: 20 } },
    dishwasher: { __default__: { side: 0, rear: 50, top: 0 } },
    washing_machine: { __default__: { side: 0, rear: 50, top: 0 } },
    dryer: { __default__: { side: 0, rear: 50, top: 0 } }
  };
  const products = [
    makeProduct({ id: 'fridge-a', model: 'AAA 600L', retailers: [{ n: 'A', url: 'https://example.com/a', p: 1200 }] }),
    makeProduct({ id: 'fridge-b', model: 'BBB 600L', retailers: [{ n: 'B', url: 'https://example.com/b', p: 1300 }] }),
    makeProduct({ id: 'dishwasher-a', cat: 'dishwasher', brand: 'Bosch', model: 'SMS6ECI05A', retailers: [{ n: 'A', url: 'https://example.com/c', p: 1400 }] }),
    makeProduct({ id: 'washer-a', cat: 'washing_machine', brand: 'Bosch', model: 'WAX32EH0AU', retailers: [{ n: 'A', url: 'https://example.com/d', p: 1500 }] }),
    makeProduct({ id: 'dryer-a', cat: 'dryer', brand: 'LG', model: 'RC802HM2F', retailers: [{ n: 'A', url: 'https://example.com/e', p: 1600 }] })
  ];

  const forward = pickReviewPilotEntries({ products, clearanceRules });
  const reversed = pickReviewPilotEntries({ products: [...products].reverse(), clearanceRules });

  assert.deepEqual(
    forward.map((row) => row.modelSlug),
    reversed.map((row) => row.modelSlug)
  );
});
