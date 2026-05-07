import test from 'node:test';
import assert from 'node:assert/strict';

import { validateExtracted } from '../../scripts/pdf-pipeline/4-validate.js';

const validFixture = {
  brand: 'Bosch',
  model: 'B36FD52SNS',
  category: 'fridge',
  dimensions_mm: { width: 905, height: 1780, depth: 841 },
  clearance_mm: { side: 3, top: 13, rear: 25, front: 0 },
  capacity_litres: 736,
  energy_stars: null,
  annual_kwh: 702,
  door_swing_mm: null,
  weight_kg: 145,
  noise_db: null,
  confidence: 'high',
  source_quote: 'Required cutout size 70 in x 36 in x 29 5/16 in'
};

test('pdf pipeline validate: accepts plausible extracted fixture data', () => {
  assert.deepEqual(validateExtracted(validFixture), { valid: true, errors: [] });
});

test('pdf pipeline validate: rejects missing required fields', () => {
  const result = validateExtracted({ ...validFixture, model: '' });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => /model/i.test(error)));
});

test('pdf pipeline validate: rejects dimensions outside category sanity ranges', () => {
  const result = validateExtracted({
    ...validFixture,
    dimensions_mm: { ...validFixture.dimensions_mm, width: 1300 }
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => /width/i.test(error)));
});

test('pdf pipeline validate: rejects implausible optional values', () => {
  const result = validateExtracted({ ...validFixture, noise_db: 120, confidence: 'certain' });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => /noise/i.test(error)));
  assert.ok(result.errors.some((error) => /confidence/i.test(error)));
});

