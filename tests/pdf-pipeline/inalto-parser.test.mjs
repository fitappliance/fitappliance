import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractClearance,
  extractDimensions,
  parseInaltoText
} from '../../scripts/pdf-pipeline/parsers/inalto.js';

const fridgeText = `
  USER MANUAL MODEL/S IBF129S IBF129W BAR REFRIGERATOR 129L
  InAlto appliance distributed within Australia by Residentia Group.
  Clearances: Ensure that air can circulate freely around the back of the cabinet.
  Allow at least 10cm clear space at the back, 10cm at the sides of the unit and
  20cm between the top and any surface above.
  SPECIFICATIONS
  Product Dimensions: W: 501mm, D: 540mm, H: 860mm
`;

test('Inalto parser extracts fridge W/D/H dimensions from product dimensions row', () => {
  assert.deepEqual(extractDimensions(fridgeText), {
    width_mm: 501,
    depth_mm: 540,
    height_mm: 860,
    door_open_90_depth_mm: null
  });
});

test('Inalto parser selects the target model row from a multi-model family manual', () => {
  const familyText = `
    InAlto Chest Freezer User Manual
    Model: ICF142B2
    Product Dimensions: W: 600mm, D: 560mm, H: 850mm
    Model: ICF198B2
    Product Dimensions: W: 770mm, D: 560mm, H: 850mm
  `;

  assert.deepEqual(extractDimensions(familyText, 'ICF198B2'), {
    width_mm: 770,
    depth_mm: 560,
    height_mm: 850,
    door_open_90_depth_mm: null
  });
});

test('Inalto parser extracts explicit fridge clearance from manual text', () => {
  assert.deepEqual(extractClearance(fridgeText, 'FRIDGE'), {
    rear_mm: 100,
    left_mm: 100,
    right_mm: 100,
    top_mm: 200
  });
});

test('Inalto parser returns validated appliance payload for an official fridge manual', () => {
  const parsed = parseInaltoText(fridgeText, {
    target: { brand: 'Inalto', sku: 'IBF129S', cat: 'fridge' },
    sourceUrl: 'https://inalto.house/s/IBF129S-W_Manual_V10.pdf',
    extractionDate: '2026-05-20T00:00:00.000Z'
  });

  assert.equal(parsed.data.brand, 'Inalto');
  assert.equal(parsed.data.sku, 'IBF129S');
  assert.equal(parsed.data.category, 'FRIDGE');
  assert.equal(parsed.data.clearance_requirements.top_mm, 200);
});

test('Inalto parser fails closed without SKU evidence', () => {
  assert.throws(
    () => parseInaltoText(fridgeText.replaceAll('IBF129S', 'OTHER'), {
      target: { brand: 'Inalto', sku: 'IBF129S', cat: 'fridge' },
      sourceUrl: 'https://inalto.house/s/other.pdf'
    }),
    /could not verify SKU/
  );
});

test('Inalto parser fails closed without explicit clearance context', () => {
  assert.throws(
    () => parseInaltoText('InAlto MODEL/S IBF129S Product Dimensions: W: 501mm, D: 540mm, H: 860mm', {
      target: { brand: 'Inalto', sku: 'IBF129S', cat: 'fridge' },
      sourceUrl: 'https://inalto.house/s/IBF129S.pdf'
    }),
    /requires explicit installation clearance/
  );
});
