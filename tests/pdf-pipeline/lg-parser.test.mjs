import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { validateApplianceDimension } from '../../scripts/pdf-pipeline/4-validate.js';

const require = createRequire(import.meta.url);
const {
  lgModelMatchesSku,
  parseLgPdf,
  parseLgText
} = require('../../scripts/pdf-pipeline/parsers/lg.js');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixtureDir = path.join(repoRoot, 'tests', 'pdf-pipeline', 'fixtures', 'lg');
const EXTRACTION_DATE = '2026-05-14T00:00:00.000Z';

const fixtures = {
  'GF-L706PL': {
    file: 'gf-l706pl.pdf',
    category: 'fridge',
    sourceUrl: 'https://www.lg.com/au/lgecs.downloadFile.ldwf?DOC_ID=20221101178242',
    expected: {
      dimensions: { height_mm: 1793, width_mm: 912, depth_mm: 744, door_open_90_depth_mm: 1699 },
      clearance: { top_mm: 0, left_mm: 0, right_mm: 0, rear_mm: 50 },
      requires_plumbing: true,
      ventilation_required: true
    }
  },
  'WV9-1412W': {
    file: 'wv9-1412w.pdf',
    category: 'washing_machine',
    sourceUrl: 'https://www.lg.com/au/support/product/lg-WV9-1412W',
    expected: {
      dimensions: { height_mm: 850, width_mm: 600, depth_mm: 610, door_open_90_depth_mm: 1135 },
      clearance: { top_mm: 0, left_mm: 20, right_mm: 20, rear_mm: 100 },
      requires_plumbing: true,
      ventilation_required: false
    }
  },
  'DVH9-09B': {
    file: 'dvh9-09b.pdf',
    category: 'dryer',
    sourceUrl: 'https://www.lg.com/au/support/product/lg-DVH9-09B',
    expected: {
      dimensions: { height_mm: 850, width_mm: 600, depth_mm: 690, door_open_90_depth_mm: 1115 },
      clearance: { top_mm: 20, left_mm: 0, right_mm: 0, rear_mm: 0 },
      requires_plumbing: true,
      ventilation_required: false
    }
  },
  'XD3A15BS': {
    file: 'xd3a15bs.pdf',
    category: 'dishwasher',
    sourceUrl: 'https://www.appliancesonline.com.au/ak/9/9/a/e/99ae5513d5b3466d6a551dbcc97940e0b75afc35_XD3A15BS_LG_Specifications_Sheet.pdf',
    expected: {
      dimensions: { height_mm: 850, width_mm: 600, depth_mm: 600, door_open_90_depth_mm: null },
      clearance: { top_mm: 0, left_mm: 50, right_mm: 50, rear_mm: 0 },
      requires_plumbing: true,
      ventilation_required: false
    }
  }
};

for (const [sku, fixture] of Object.entries(fixtures)) {
  test(`LG parser extracts strict appliance dimensions and clearance for ${sku}`, async () => {
    const result = await parseLgPdf(path.join(fixtureDir, fixture.file), {
      target: { brand: 'LG', sku, category: fixture.category },
      sourceUrl: fixture.sourceUrl,
      extractionDate: EXTRACTION_DATE
    });

    assert.equal(result.data.brand, 'LG');
    assert.equal(result.data.sku, sku);
    assert.equal(result.data.category, fixture.category.toUpperCase());
    assert.deepEqual(result.data.dimensions, fixture.expected.dimensions);
    assert.deepEqual(result.data.clearance_requirements, fixture.expected.clearance);
    assert.equal(result.data.flags.requires_plumbing, fixture.expected.requires_plumbing);
    assert.equal(result.data.flags.ventilation_required, fixture.expected.ventilation_required);
    assert.equal(result.data.metadata.source_pdf_url, fixture.sourceUrl);
    assert.ok(result.data.metadata.confidence_score >= 0.86);

    const validation = validateApplianceDimension(result.data);
    assert.equal(validation.valid, true, validation.errors.join('; '));
  });
}

test('LG model matcher accepts safe suffixes and wildcards without broad false positives', () => {
  assert.equal(lgModelMatchesSku('GF-V900', 'GF-V900MBS'), true);
  assert.equal(lgModelMatchesSku('GF-V9**', 'GF-V900MBS'), true);
  assert.equal(lgModelMatchesSku('WV9-1412W', 'WV9-1412W'), true);
  assert.equal(lgModelMatchesSku('GF-V8**', 'GF-V900MBS'), false);
  assert.equal(lgModelMatchesSku('GF', 'GF-V900MBS'), false);
});

test('LG parser handles WashTower as one tall appliance instead of a split washer/dryer', () => {
  const result = parseLgText(`
    LG WashTower
    Owner's Manual
    INSTALLATION
    Parts and Specifications
    Specifications
    Model WWT-1710B
    Dimension(mm)
    W 700 D 770 D" 1410
    H 1890
    Installation Location Requirements
    To ensure sufficient clearance for water inlet hoses, drain hose and airflow,
    allow minimum clearances of at least 20 mm at the sides and 100 mm behind the appliance.
    Keep at least 20 mm between the top of the appliance and any cabinet.
  `, {
    target: { brand: 'LG', sku: 'WWT-1710B', category: 'washing_machine' },
    sourceUrl: 'https://www.lg.com/au/support/product/lg-WWT-1710B',
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 1890,
    width_mm: 700,
    depth_mm: 770,
    door_open_90_depth_mm: 1410
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 20,
    left_mm: 20,
    right_mm: 20,
    rear_mm: 100
  });
  assert.equal(result.data.flags.requires_plumbing, true);
});

test('LG parser fails closed when a document has dimensions but no explicit clearance', () => {
  assert.throws(() => parseLgText(`
    LG Washing Machine
    Specifications
    Model WV9-1412W
    Dimension(mm)
    W 600 D 610 D" 1135
    H 850
  `, {
    target: { brand: 'LG', sku: 'WV9-1412W', category: 'washing_machine' },
    sourceUrl: 'https://www.lg.com/au/support/product/lg-WV9-1412W',
    extractionDate: EXTRACTION_DATE
  }), /clearance/i);
});
