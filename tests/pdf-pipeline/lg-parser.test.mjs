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
  },
  'WWT-1910BX': {
    file: 'washtower-wwt-1910bx.pdf',
    category: 'washtower_combo',
    sourceUrl: 'https://gscs-b2c.lge.com/open/downloadFile?fileId=aDEyNnLn9ZhB6npLvfqKzA',
    expected: {
      dimensions: { height_mm: 1890, width_mm: 700, depth_mm: 830, door_open_90_depth_mm: 1460 },
      clearance: { top_mm: 110, left_mm: 50, right_mm: 50, rear_mm: 200 },
      requires_plumbing: true,
      ventilation_required: true
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
  assert.equal(lgModelMatchesSku('WWT-1910BX', '1910BX'), true);
  assert.equal(lgModelMatchesSku('GF-V8**', 'GF-V900MBS'), false);
  assert.equal(lgModelMatchesSku('GF', 'GF-V900MBS'), false);
  assert.equal(lgModelMatchesSku('ABC-1910BX', '1910BX'), false);
});

test('LG parser upgrades shorthand washing-machine WashTower manifests to WashTower Combo', async () => {
  const result = await parseLgPdf(path.join(fixtureDir, 'washtower-wwt-1910bx.pdf'), {
    target: { brand: 'LG', sku: '1910BX', category: 'washing_machine' },
    sourceUrl: fixtures['WWT-1910BX'].sourceUrl,
    verifiedAlias: 'WWT-1910BX',
    extractionDate: EXTRACTION_DATE
  });

  assert.equal(result.data.category, 'WASHTOWER_COMBO');
  assert.equal(result.data.sku, '1910BX');
  assert.deepEqual(result.data.dimensions, fixtures['WWT-1910BX'].expected.dimensions);
  assert.deepEqual(result.data.clearance_requirements, fixtures['WWT-1910BX'].expected.clearance);
  assert.equal(result.data.metadata.verified_alias, 'WWT-1910BX');
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
  Dimension (Width X Depth X Height) 700 mm X 770 mm X 1890 mm
  Floor Installation
  *1 minimum space for installation
  To ensure sufficient clearance for water inlet hoses, drain hose and airflow,
  allow minimum clearances on the sides and behind the appliance.
  A 30 cm*1
  W 70 cm
  B 5 cm
  C 10 cm
  D 77 cm
  D' 141 cm*1
  H 189 cm
  H' 200 cm
  `, {
    target: { brand: 'LG', sku: 'WWT-1710B', category: 'washtower_combo' },
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
    top_mm: 110,
    left_mm: 50,
    right_mm: 50,
    rear_mm: 100
  });
  assert.equal(result.data.category, 'WASHTOWER_COMBO');
  assert.equal(result.data.flags.requires_plumbing, true);
});

test('LG parser handles older fridge Size(mm) a/b tables with explicit adjacent-wall clearance', () => {
  const result = parseLgText(`
    OWNER'S MANUAL
    FRIDGE & FREEZER
    GB-335WL / GB-335PL / GB-W335MBL / GB-335MBL

    Dimensions and Clearances
    Allow over 50 mm of clearance from each adjacent wall when installing the appliance.
    Size (mm)
    a b
    A 595 595
    B 1720/1860/2030 1720/1860/2030
    C 682 677
    D 615 610
    E 682 677
    F 1230 1225
    G 995 995
  `, {
    target: {
      brand: 'LG',
      sku: 'GB-335PL',
      category: 'fridge',
      product: {
        w: 595,
        h: 1720,
        d: 677
      }
    },
    sourceUrl: 'https://www.lg.com/au/support/product/lg-GB-335PL',
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 1720,
    width_mm: 595,
    depth_mm: 677,
    door_open_90_depth_mm: 995
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 50,
    right_mm: 50,
    rear_mm: 50
  });
});

test('LG parser handles legacy washer Size W/D/H line with cm additional clearance', () => {
  const result = parseLgText(`
    OWNER'S MANUAL
    WASHING MACHINE
    Specifications
    Model WD1216HTE
    Wash Capacity 16 kg (Wash) / 9 kg (Dry)
    Size 700 mm (W) x 835 mm (D) x 990 mm (H)
    Product Weight 105 kg

    Installation Place Requirements
    Additional Clearance : For the wall, 10 cm: rear
    /2.5 cm: right & left side
  `, {
    target: { brand: 'LG', sku: 'WD1216HTE', category: 'washing_machine' },
    sourceUrl: 'https://gscs-b2c.lge.com/open/downloadFile?fileId=c5KT0VXQEkTcJ8ojmWFA',
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 990,
    width_mm: 700,
    depth_mm: 835,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 25,
    right_mm: 25,
    rear_mm: 100
  });
  assert.equal(result.data.flags.requires_plumbing, true);
});

test('LG parser requires explicit verified_alias for manual cross-model support aliases', () => {
  const text = `
    OWNER'S MANUAL
    FRIDGE & FREEZER
    GP-F324PL / GP-F324MBL

    Dimensions and Clearances
    Allow over 50 mm of clearance between the back of the appliance and the wall.
    Size (mm)
    A 595
    B 1860
    C 707
    D 600
    E 666
    F 707
    G 1225
    H 816
  `;

  const options = {
    target: {
      brand: 'LG',
      sku: 'MP-F324',
      category: 'fridge',
      product: {
        w: 595,
        h: 1860,
        d: 707
      }
    },
    sourceUrl: 'https://gscs-b2c.lge.com/open/downloadFile?fileId=feLeOVbe7DABWnJeatsRg',
    extractionDate: EXTRACTION_DATE
  };

  assert.throws(() => parseLgText(text, options), /verify SKU MP-F324/);

  const result = parseLgText(text, {
    ...options,
    verifiedAlias: 'GP-F324MBL'
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 1860,
    width_mm: 595,
    depth_mm: 707,
    door_open_90_depth_mm: 1225
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: 50
  });
  assert.equal(result.data.flags.requires_plumbing, false);
  assert.equal(result.data.metadata.verified_alias, 'GP-F324MBL');
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
