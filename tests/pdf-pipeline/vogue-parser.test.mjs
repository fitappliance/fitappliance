import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractVogueClearance,
  extractVogueDimensions,
  parseVogueText
} from '../../scripts/pdf-pipeline/parsers/vogue.js';

const topLoader12kg = `
  VOGUE Australia
  360113Top Load Washing Machine
  Installation area
  Sufficient ventilation
  L w
  W> 20mm L> 45mm
  Technical specifications
  Dimension Net Weight
  Capacity Rated input power (W*D*Hmm)
  360113 12.0kg 640x684x1070 43kg
`;

const topLoader10kg = `
  VOGUE top load washing machine
  360116Top Load Washing Machine
  Installation area
  Sufficient ventilation
  L w
  W> 20mm L> 45mm
  Technical specifications
  Dimension Net Weight
  power (W*D*Hmm) lncluding drain hose
  (W*D*Hmm)
  360116 10.0kg 601x630x1060 40kg
  601x700x1060
`;

test('VOGUE parser extracts top-loader dimensions from SKU row', () => {
  assert.deepEqual(extractVogueDimensions(topLoader12kg, '360113'), {
    width_mm: 640,
    depth_mm: 684,
    height_mm: 1070,
    door_open_90_depth_mm: null
  });
});

test('VOGUE parser prefers including-drain-hose dimensions when explicitly present', () => {
  assert.deepEqual(extractVogueDimensions(topLoader10kg, '360116'), {
    width_mm: 601,
    depth_mm: 700,
    height_mm: 1060,
    door_open_90_depth_mm: null
  });
});

test('VOGUE parser extracts explicit installation clearance from diagram text', () => {
  assert.deepEqual(extractVogueClearance(topLoader12kg), {
    top_mm: 0,
    left_mm: 20,
    right_mm: 20,
    rear_mm: 45
  });
});

test('VOGUE parser returns strict payload for accepted washing-machine manual', () => {
  const parsed = parseVogueText(topLoader12kg, {
    target: { brand: 'VOGUE', sku: '360113', cat: 'washing_machine' },
    sourceUrl: 'https://trade-depot.s3.ap-southeast-2.amazonaws.com/files/products/manuals/360113_User_Manual.pdf',
    extractionDate: '2026-05-20T00:00:00.000Z'
  });

  assert.equal(parsed.data.brand, 'VOGUE');
  assert.equal(parsed.data.sku, '360113');
  assert.equal(parsed.data.category, 'WASHING_MACHINE');
  assert.equal(parsed.data.dimensions.depth_mm, 684);
  assert.equal(parsed.data.clearance_requirements.rear_mm, 45);
});

test('VOGUE parser fails closed without exact SKU evidence', () => {
  assert.throws(
    () => parseVogueText(topLoader12kg.replaceAll('360113', '360999'), {
      target: { brand: 'VOGUE', sku: '360113', cat: 'washing_machine' },
      sourceUrl: 'https://trade-depot.s3.ap-southeast-2.amazonaws.com/files/products/manuals/other.pdf'
    }),
    /could not verify SKU/
  );
});

test('VOGUE parser fails closed when rear or length clearance is missing', () => {
  assert.throws(
    () => parseVogueText(topLoader12kg.replace('W> 20mm L> 45mm', 'W> 20mm'), {
      target: { brand: 'VOGUE', sku: '360113', cat: 'washing_machine' },
      sourceUrl: 'https://trade-depot.s3.ap-southeast-2.amazonaws.com/files/products/manuals/360113_User_Manual.pdf'
    }),
    /requires explicit side and rear clearance/
  );
});
