import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  sampleBrandModels
} = require('../scripts/generate-comparisons.js');

const {
  isCurrentInStock,
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
        { n: 'The Good Guys', url: 'https://www.thegoodguys.com.au/lg-gf-l708mbl' },
        { n: 'Harvey Norman', url: 'https://www.harveynorman.com.au/lg-gf-l708mbl.html' }
      ]
    }),
    makeProduct({
      id: 'lg-two',
      model: 'GF-L708MBL French Door 708L Alt',
      retailers: [
        { n: 'Harvey Norman', url: 'https://www.harveynorman.com.au/lg-gf-l708mbl-alt.html' },
        { n: 'The Good Guys', url: 'https://www.thegoodguys.com.au/lg-gf-l708mbl-alt' }
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
    makeProduct({ id: 'fridge-a', model: 'AAA 600L', retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/fridge-a', p: 1200 }] }),
    makeProduct({ id: 'fridge-b', model: 'BBB 600L', retailers: [{ n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/product/fridge-b/', p: 1300 }] }),
    makeProduct({ id: 'dishwasher-a', cat: 'dishwasher', brand: 'Bosch', model: 'SMS6ECI05A', retailers: [{ n: 'The Good Guys', url: 'https://www.thegoodguys.com.au/dishwasher-a', p: 1400 }] }),
    makeProduct({ id: 'washer-a', cat: 'washing_machine', brand: 'Bosch', model: 'WAX32EH0AU', retailers: [{ n: 'Bing Lee', url: 'https://www.binglee.com.au/products/washer-a', p: 1500 }] }),
    makeProduct({ id: 'dryer-a', cat: 'dryer', brand: 'LG', model: 'RC802HM2F', retailers: [{ n: 'Harvey Norman', url: 'https://www.harveynorman.com.au/dryer-a.html', p: 1600 }] })
  ];

  const forward = pickReviewPilotEntries({ products, clearanceRules });
  const reversed = pickReviewPilotEntries({ products: [...products].reverse(), clearanceRules });

  assert.deepEqual(
    forward.map((row) => row.modelSlug),
    reversed.map((row) => row.modelSlug)
  );
});

test('hotfix review pilot: unpriced verified retailer links count as current candidates', () => {
  assert.equal(isCurrentInStock(makeProduct({
    retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/lg-gb335pl', p: null }],
    price: null
  })), true);

  assert.equal(isCurrentInStock(makeProduct({
    retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au', p: 1299 }],
    price: 1299
  })), false);
});

test('hotfix review pilot: categories without verified retailer links do not fail the build', () => {
  const clearanceRules = {
    fridge: { __default__: { side: 20, rear: 50, top: 20 } },
    dishwasher: { __default__: { side: 0, rear: 50, top: 0 } },
    washing_machine: { __default__: { side: 0, rear: 50, top: 0 } },
    dryer: { __default__: { side: 0, rear: 50, top: 0 } }
  };
  const products = [
    makeProduct({ id: 'fridge-a', model: 'AAA 600L', retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/fridge-a', p: null }] }),
    makeProduct({ id: 'fridge-b', model: 'BBB 600L', retailers: [{ n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/product/fridge-b/', p: null }] })
  ];

  const pilots = pickReviewPilotEntries({ products, clearanceRules });

  assert.equal(pilots.length, 2);
  assert.deepEqual(pilots.map((row) => row.cat), ['fridge', 'fridge']);
});
