import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { evaluateFit } from '../../src/domain/fit-decision.mjs';

const require = createRequire(import.meta.url);
const SearchCore = require('../../public/scripts/search-core.js');

const products = [
  { id: 'fits', cat: 'fridge', brand: 'Example', w: 600, h: 1700, d: 650 },
  { id: 'too-wide', cat: 'fridge', brand: 'Example', w: 700, h: 1700, d: 650 },
];

for (const product of products) {
  test(`browser and domain FitDecision agree for ${product.id}`, () => {
    const cavity = { w: 620, h: 1720, d: 660 };
    const browser = SearchCore.computeFitMeta(product, { cat: 'fridge', ...cavity, clearanceMode: 'practical' });
    const domain = evaluateFit({
      geometry: {
        closedEnvelope: {
          widthMm: product.w,
          heightMm: { minimumMm: product.h, maximumMm: product.h },
          depthMm: product.d,
        },
        installation: { leftMm: 5, rightMm: 5, topMm: 20, rearMm: 10, frontMm: 0 },
      },
      cavity: { widthMm: cavity.w, heightMm: cavity.h, depthMm: cavity.d },
      evidenceLevel: 'none',
      advisoryChecks: [],
    });

    assert.equal(browser.fitDecision.outcome, domain.outcome);
    assert.deepEqual(browser.fitDecision.spare, domain.spare);
  });
}

test('partial browser searches are explicitly insufficient rather than silently verified', () => {
  const browser = SearchCore.computeFitMeta(products[0], { cat: 'fridge', w: 620, clearanceMode: 'practical' });
  assert.equal(browser.fitDecision.outcome, 'INSUFFICIENT_DATA');
});
