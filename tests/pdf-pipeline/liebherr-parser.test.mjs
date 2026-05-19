import test from 'node:test';
import assert from 'node:assert/strict';

import { parseLiebherrText } from '../../scripts/pdf-pipeline/parsers/liebherr.js';

function makeTarget(overrides = {}) {
  return {
    brand: 'Liebherr',
    sku: 'CNef 4315',
    category: 'fridge',
    product: {
      brand: 'Liebherr',
      model: 'CNef 4315',
      cat: 'fridge',
      w: 600,
      h: 1850,
      d: 665,
      ...overrides.product
    },
    ...overrides
  };
}

test('Liebherr parser extracts product dimensions and rear ventilation shaft depth', () => {
  const parsed = parseLiebherrText(`
    Liebherr CNef 4315 freestanding fridge freezer
    Product dimensions (H/W/D) cm
    185 / 60 / 66.5
    Ventilation requirements
    A ventilation shaft must be provided at the rear. The depth of the ventilation shaft must be at least 50 mm.
  `, {
    target: makeTarget(),
    sourceUrl: 'https://www.appliancesonline.com.au/public/manuals/CNEF4315-Liebherr-Specifications-Sheet.pdf',
    extractionDate: '2026-05-19T00:00:00.000Z'
  });

  assert.deepEqual(parsed.data.dimensions, {
    height_mm: 1850,
    width_mm: 600,
    depth_mm: 665,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(parsed.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: 50
  });
  assert.equal(parsed.data.metadata.source_type, 'liebherr-product_dimensions_cm+rear_ventilation_depth');
});

test('Liebherr parser accepts integrated installation dimensions only with ventilation guide evidence', () => {
  const parsed = parseLiebherrText(`
    Liebherr Refrigerator/Freezer Model ICNh 5123
    Intallation Dimensions
    Height
    Width
    Depth
    177.2-178.8 cm
    56-57 cm
    min. 55 cm
    SIGN 3576 SIKB 3550 ICNh 5123 ICNh 5133 ICNh 5173 ICBNh 5173
    The following installation figures ensure correct ventilation requirements are achieved.
    Arrows denote airflow from ventilation entry to exit point.
  `, {
    target: makeTarget({
      sku: 'ICNh 5123',
      product: {
        model: 'ICNh 5123',
        w: 560,
        h: 1772,
        d: 550
      }
    }),
    sourceUrl: 'https://www.appliancesonline.com.au/public/manuals/ICNH5123LH-Liebherr-Specifications-Sheet.pdf',
    extractionDate: '2026-05-19T00:00:00.000Z'
  });

  assert.deepEqual(parsed.data.dimensions, {
    height_mm: 1772,
    width_mm: 560,
    depth_mm: 550,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(parsed.data.clearance_requirements, {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: 0
  });
  assert.equal(parsed.data.metadata.source_type, 'liebherr-installation_dimensions+integrated_installation_ventilation');
});

test('Liebherr parser fails closed when the document does not contain the target SKU', () => {
  assert.throws(() => parseLiebherrText(`
    Liebherr CNPef 4516
    Product dimensions (H/W/D) cm
    185 / 60 / 66.5
    Ventilation requirements depth min. 50 mm
  `, {
    target: makeTarget(),
    sourceUrl: 'https://example.com/wrong.pdf'
  }), /could not verify SKU/);
});

test('Liebherr parser fails closed when no explicit ventilation or clearance evidence is present', () => {
  assert.throws(() => parseLiebherrText(`
    Liebherr CNef 4315 freestanding fridge freezer
    Product dimensions (H/W/D) cm
    185 / 60 / 66.5
  `, {
    target: makeTarget(),
    sourceUrl: 'https://example.com/no-clearance.pdf'
  }), /could not find explicit ventilation\/clearance/);
});
