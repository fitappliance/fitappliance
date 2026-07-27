import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  extractMieleModelAliases,
  mieleModelMatchesSku,
  parseMieleText
} = require('../../scripts/pdf-pipeline/parsers/miele.js');

const MIELE_DISHWASHER_SPEC = `
  Miele G 5000 SC BRWS
  Product data sheet

  Technical data
  Niche width in mm 600
  Niche height in mm 805
  Niche depth in mm 570
  Appliance width in mm 598
  Appliance height in mm 805
  Appliance depth in mm 570
  Depth with door open in cm 116.5
`;

test('Miele parser computes dishwasher clearances from niche and appliance dimensions', () => {
  const result = parseMieleText(MIELE_DISHWASHER_SPEC, {
    target: { brand: 'Miele', sku: 'G 5000', category: 'dishwasher' },
    sourceUrl: 'https://www.appliancesonline.com.au/ak/c/6/7/d/G5000BKBRWS_Miele_Specifications_Sheet.pdf',
    extractionDate: '2026-05-19T00:00:00.000Z'
  });

  assert.deepEqual(result.data.dimensions, {
    width_mm: 598,
    height_mm: 805,
    depth_mm: 570,
    door_open_90_depth_mm: 1165
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 1,
    right_mm: 1,
    rear_mm: 0
  });
  assert.equal(result.data.metadata.verified_alias, 'G5000SCBRWS');
  assert.equal(result.data.flags.requires_plumbing, true);
});

test('Miele parser supports current official Product Sheet minimal/maximal niche labels', () => {
  const result = parseMieleText(`
    Miele G 7130 SCU
    Product Sheet
    Technical data
    Niche width minimal in mm 600
    Niche width max in mm 600
    Niche height minimal in mm 805
    Niche height maximal in mm 870
    Niche depth in mm 570
    Appliance width in mm 598
    Appliance height in mm 805
    Appliance depth in mm 570
    Depth with door open in cm 116.5
  `, {
    target: { brand: 'Miele', sku: 'G 7130 SCU', category: 'dishwasher' },
    sourceUrl: 'https://www.miele.com.au/media/ex/au/specsheets/12531620.pdf',
    extractionDate: '2026-05-19T00:00:00.000Z'
  });

  assert.deepEqual(result.data.dimensions, {
    width_mm: 598,
    height_mm: 805,
    depth_mm: 570,
    door_open_90_depth_mm: 1165
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 1,
    right_mm: 1,
    rear_mm: 0
  });
  assert.equal(result.data.metadata.verified_alias, 'G7130SCU');
});

test('Miele parser fails closed when a spec sheet lacks explicit niche dimensions', () => {
  assert.throws(() => parseMieleText(`
    Miele G 5000
    Appliance width in mm 598
    Appliance height in mm 805
    Appliance depth in mm 570
  `, {
    target: { brand: 'Miele', sku: 'G 5000', category: 'dishwasher' },
    sourceUrl: 'https://www.appliancesonline.com.au/G5000.pdf'
  }), /requires explicit niche dimensions/);
});

test('Miele model matcher allows safe suffix variants but rejects broad or unrelated aliases', () => {
  assert.equal(mieleModelMatchesSku('G5000BKBRWS', 'G 5000'), true);
  assert.equal(mieleModelMatchesSku('G5000SCBRWS', 'G 5000'), true);
  assert.equal(mieleModelMatchesSku('G6XXX', 'G 6xxx'), false);
  assert.equal(mieleModelMatchesSku('G4203SCIACTIVE', 'G 5000'), false);
  assert.equal(mieleModelMatchesSku('KFNS37452IDE', 'KFNS 37452 iDE'), true);
  assert.equal(mieleModelMatchesSku('FNS 4782 E edt/bs', 'FNS4782EBS'), true);
  assert.equal(mieleModelMatchesSku('FNS 4782 E edt/cs', 'FNS4782EBS'), false);
});

test('Miele alias extractor reads lowercase model suffixes and underscore-wrapped URL model tokens', () => {
  const aliases = extractMieleModelAliases(
    'TRP MI 9638\nG 5210 SCi CLST\nIntegrated dishwasher',
    'https://www.appliancesonline.com.au/ak/9/e/8/8/G5210SCICLST___Specification_Sheet_Updated_082024.pdf'
  );

  assert.ok(aliases.includes('G5210SCICLST'));
});
