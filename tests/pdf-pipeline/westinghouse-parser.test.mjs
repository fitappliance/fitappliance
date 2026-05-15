import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { validateApplianceDimension } from '../../scripts/pdf-pipeline/4-validate.js';

const require = createRequire(import.meta.url);
const {
  parseWestinghousePdf,
  parseWestinghouseText,
  westinghouseModelMatchesSku
} = require('../../scripts/pdf-pipeline/parsers/westinghouse.js');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixtureDir = path.join(repoRoot, 'tests', 'pdf-pipeline', 'fixtures', 'westinghouse');
const EXTRACTION_DATE = '2026-05-16T00:00:00.000Z';

test('Westinghouse parser extracts fridge dimensions and airspace from dimension sheets', async () => {
  const result = await parseWestinghousePdf(path.join(fixtureDir, 'wbb3400ah-dimension-sheet.pdf'), {
    target: { brand: 'Westinghouse', sku: 'WBB3400AH', category: 'fridge' },
    sourceUrl: 'https://www.westinghouse.com.au/documenthandler.ashx?assetid=511925',
    extractionDate: EXTRACTION_DATE
  });

  assert.equal(result.data.brand, 'Westinghouse');
  assert.equal(result.data.sku, 'WBB3400AH');
  assert.equal(result.data.category, 'FRIDGE');
  assert.deepEqual(result.data.dimensions, {
    height_mm: 1645,
    width_mm: 598,
    depth_mm: 650,
    door_open_90_depth_mm: 1199
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 50,
    left_mm: 30,
    right_mm: 30,
    rear_mm: 50
  });
  assert.equal(validateApplianceDimension(result.data).valid, true);
});

test('Westinghouse parser accepts hinge suffix rows for the base catalog SKU', async () => {
  const result = await parseWestinghousePdf(path.join(fixtureDir, 'wbe4302wc-dimension-sheet.pdf'), {
    target: { brand: 'Westinghouse', sku: 'WBE4302WC', category: 'fridge' },
    sourceUrl: 'https://www.westinghouse.com.au/documenthandler.ashx?assetid=513621',
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 1725,
    width_mm: 699,
    depth_mm: 723,
    door_open_90_depth_mm: 1360
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 50,
    left_mm: 30,
    right_mm: 30,
    rear_mm: 50
  });
});

test('Westinghouse parser fails closed when a sheet lacks explicit airspace values', async () => {
  await assert.rejects(() => parseWestinghousePdf(path.join(fixtureDir, 'wsf6602xb-dimension-sheet.pdf'), {
    target: { brand: 'Westinghouse', sku: 'WSF6602XB', category: 'dishwasher' },
    sourceUrl: 'https://www.westinghouse.com.au/documenthandler.ashx?assetid=511111',
    extractionDate: EXTRACTION_DATE
  }), /airspace|clearance/i);
});

test('Westinghouse model matcher handles slash shorthand and hinge suffixes without broad matches', () => {
  assert.equal(westinghouseModelMatchesSku('WBB3400AH/ WH', 'WBB3400AH'), true);
  assert.equal(westinghouseModelMatchesSku('WBB3400AH/ WH', 'WBB3400WH'), true);
  assert.equal(westinghouseModelMatchesSku('WBE4302WC-R', 'WBE4302WC'), true);
  assert.equal(westinghouseModelMatchesSku('WBE4302WC-L', 'WBE4302WC'), true);
  assert.equal(westinghouseModelMatchesSku('WBE4500BC/ SC/ WC', 'WBE4500BC'), true);
  assert.equal(westinghouseModelMatchesSku('WBE4500BC/ SC/ WC', 'WBE4500SC'), true);
  assert.equal(westinghouseModelMatchesSku('WBE4500BC/ SC/ WC', 'WBE4500WC'), true);
  assert.equal(westinghouseModelMatchesSku('WRB3504SA/ WA', 'WRB3504*A'), true);
  assert.equal(westinghouseModelMatchesSku('WFB2804SA/ WA', 'WRB3504*A'), false);
  assert.equal(westinghouseModelMatchesSku('WBE4302WC-R', 'WBE5300WC'), false);
  assert.equal(westinghouseModelMatchesSku('WBE4500BC/ SC/ WC', 'WBE5300WC'), false);
  assert.equal(westinghouseModelMatchesSku('WC', 'WBE4302WC'), false);
});

test('Westinghouse parser rejects documents that do not name the requested model family', () => {
  assert.throws(() => parseWestinghouseText(`
    Dimension and installation guide
    WBE4302WC
    Dimensions Product Height Product Width Product Depth Product Depth (Door Open)
    WBE4302WC-R 1725 699 723 1360
    Airspace Side - both Top Behind
    WBE4302WC-R 30 50 50
  `, {
    target: { brand: 'Westinghouse', sku: 'WBB3400AH', category: 'fridge' },
    sourceUrl: 'https://www.westinghouse.com.au/documenthandler.ashx?assetid=513621',
    extractionDate: EXTRACTION_DATE
  }), /could not verify SKU/i);
});
