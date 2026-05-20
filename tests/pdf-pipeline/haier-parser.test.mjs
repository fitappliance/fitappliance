import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { validateApplianceDimension } from '../../scripts/pdf-pipeline/4-validate.js';

const require = createRequire(import.meta.url);
const {
  findModelEvidence,
  parseHaierText,
  parseSpecificationGuideDimensions,
  splitSideClearance
} = require('../../scripts/pdf-pipeline/parsers/haier.js');

const EXTRACTION_DATE = '2026-05-19T00:00:00.000Z';

const fridgeSpec = `
SPECIFICATION GUIDE
HRF130UW2 - White
Height 850mm
Width 545mm
Depth 566mm
PRODUCT OVERVIEW
P R O D U C T D I M E N S I O N S
C AV I T Y D I M E N S I O N S
A Overall height of cavity 900
B Overall width of cavity 595
C Minimum depth of cavity 616
A Overall height 850
B Overall width (door closed) 545
Overall width (door open) 824
C Overall depth (door closed) 566
Overall depth (door open) 996
Reversible door
`;

const dishwasherSpec = `
SPECIFICATION GUIDE
HDW13F0PS1
Freestanding Dishwasher
PRODUCT DIMENSIONS
CAVITY DIMENSIONS
A Overall height 850 - 868
B Overall width 597
C Overall depth 599
A Overall height of cavity 850 - 868
B Overall width of cavity 600
C Minimum depth of cavity 600
D Height of rear plumbing and electrical clearance 100 - 145*
E Depth of rear plumbing and electrical clearance 60
Cold water inlet required
`;

const userGuideWithoutCavity = `
User Guide
HCF137W
Product and cabinetry dimensions
The diagram shows the installation requirements.
`;

test('Haier parser extracts Specification Guide dimensions and cavity-derived clearances', () => {
  const result = parseHaierText(fridgeSpec, {
    target: { brand: 'Haier', sku: 'HRF130UW2', category: 'fridge' },
    sourceUrl: 'https://www.haier.com.au/example-spec.pdf',
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 850,
    width_mm: 545,
    depth_mm: 566,
    door_open_90_depth_mm: 996
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 50,
    left_mm: 25,
    right_mm: 25,
    rear_mm: 50
  });
  assert.equal(result.data.flags.reversible_door, true);
  assert.equal(validateApplianceDimension(result.data).valid, true);
});

test('Haier parser handles range values and odd side-clearance splits conservatively', () => {
  const result = parseHaierText(dishwasherSpec, {
    target: { brand: 'Haier', sku: 'HDW13F0PS1', category: 'dishwasher' },
    sourceUrl: 'https://www.haier.com.au/dishwasher-spec.pdf',
    extractionDate: EXTRACTION_DATE
  });

  assert.deepEqual(result.data.dimensions, {
    height_mm: 850,
    width_mm: 597,
    depth_mm: 599,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 1,
    right_mm: 2,
    rear_mm: 1
  });
  assert.equal(result.data.flags.requires_plumbing, true);
  assert.equal(validateApplianceDimension(result.data).valid, true);
});

test('Haier parser fails closed without explicit Specification Guide cavity dimensions', () => {
  assert.throws(() => parseHaierText(userGuideWithoutCavity, {
    target: { brand: 'Haier', sku: 'HCF137W', category: 'fridge' },
    sourceUrl: 'https://www.haier.com.au/user-guide.pdf',
    extractionDate: EXTRACTION_DATE
  }), /Specification Guide|cavity dimensions/i);
});

test('Haier parser requires model evidence and exact family aliases', () => {
  assert.equal(findModelEvidence(fridgeSpec, { sku: 'HRF130UW2' }), true);
  assert.equal(findModelEvidence(fridgeSpec, { sku: 'HRF130UG2' }, 'HRF130UW2'), true);
  assert.equal(findModelEvidence(fridgeSpec, { sku: 'HRF330TG' }), false);
});

test('Haier parser exposes deterministic side split and dimension helpers', () => {
  assert.deepEqual(splitSideClearance(3), { left: 1, right: 2 });
  assert.deepEqual(parseSpecificationGuideDimensions(fridgeSpec).clearance_requirements, {
    top_mm: 50,
    left_mm: 25,
    right_mm: 25,
    rear_mm: 50
  });
});
