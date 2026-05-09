import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ApplianceDimensionSchema,
  normalizeApplianceDimensionCandidate,
  validateApplianceDimension
} from '../../scripts/pdf-pipeline/4-validate.js';

const validCandidate = {
  brand: 'Bosch',
  sku: 'B36FD52SNS',
  category: 'FRIDGE',
  dimensions: {
    height_mm: 1780,
    width_mm: 905,
    depth_mm: 841,
    door_open_90_depth_mm: null
  },
  clearance_requirements: {
    top_mm: 13,
    left_mm: 3,
    right_mm: 3,
    rear_mm: 25
  },
  flags: {
    requires_plumbing: true,
    ventilation_required: true,
    reversible_door: null
  },
  metadata: {
    source_pdf_url: 'https://media3.bosch-home.com/Documents/example.pdf',
    extraction_date: '2026-05-07T08:00:00.000Z',
    confidence_score: 0.92
  }
};

test('pdf pipeline zod validation: accepts strict appliance dimension candidates', () => {
  const parsed = ApplianceDimensionSchema.parse(validCandidate);

  assert.equal(parsed.brand, 'Bosch');
  assert.equal(parsed.category, 'FRIDGE');
  assert.equal(parsed.dimensions.width_mm, 905);
});

test('pdf pipeline zod validation: rejects ambiguous or missing dimensions instead of guessing', () => {
  const result = validateApplianceDimension({
    ...validCandidate,
    dimensions: { ...validCandidate.dimensions, depth_mm: null }
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => /depth_mm/i.test(error)));
});

test('pdf pipeline zod validation: rejects malformed source URL and out-of-range confidence', () => {
  const result = validateApplianceDimension({
    ...validCandidate,
    metadata: {
      ...validCandidate.metadata,
      source_pdf_url: 'manual.pdf',
      confidence_score: 1.4
    }
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => /source_pdf_url/i.test(error)));
  assert.ok(result.errors.some((error) => /confidence_score/i.test(error)));
});

test('pdf pipeline zod validation: marks low confidence candidates for manual review', () => {
  const result = validateApplianceDimension({
    ...validCandidate,
    metadata: { ...validCandidate.metadata, confidence_score: 0.79 }
  });

  assert.equal(result.valid, true);
  assert.equal(result.requiresManualReview, true);
});

test('pdf pipeline zod validation: rounds decimal millimetre values before strict parsing', () => {
  const result = validateApplianceDimension({
    ...validCandidate,
    dimensions: {
      height_mm: 1784.6,
      width_mm: 912.4,
      depth_mm: 724.5,
      door_open_90_depth_mm: 1142.2
    },
    clearance_requirements: {
      top_mm: 19.6,
      left_mm: 4.4,
      right_mm: 4.5,
      rear_mm: 10.1
    }
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.data.dimensions, {
    height_mm: 1785,
    width_mm: 912,
    depth_mm: 725,
    door_open_90_depth_mm: 1142
  });
  assert.deepEqual(result.data.clearance_requirements, {
    top_mm: 20,
    left_mm: 4,
    right_mm: 5,
    rear_mm: 10
  });
});

test('pdf pipeline zod validation: fills missing brand sku and category from target context', () => {
  const result = validateApplianceDimension({
    ...validCandidate,
    brand: null,
    sku: null,
    category: null
  }, {
    target: {
      brand: 'Hisense',
      sku: 'HRSBS632BW',
      category: 'fridge'
    }
  });

  assert.equal(result.valid, true);
  assert.equal(result.data.brand, 'Hisense');
  assert.equal(result.data.sku, 'HRSBS632BW');
  assert.equal(result.data.category, 'FRIDGE');
});

test('pdf pipeline zod validation: normalizes legacy B1 extraction shape into strict schema', () => {
  const normalized = normalizeApplianceDimensionCandidate({
    brand: 'Bosch',
    model: 'B36FD52SNS',
    category: 'fridge',
    dimensions_mm: { width: 905, height: 1780, depth: 841 },
    clearance_mm: { side: 3, top: 13, rear: 25 },
    confidence: 'high',
    source_pdf_url: 'https://media3.bosch-home.com/Documents/example.pdf',
    extraction_date: '2026-05-07T08:00:00.000Z'
  });

  assert.equal(normalized.sku, 'B36FD52SNS');
  assert.equal(normalized.category, 'FRIDGE');
  assert.deepEqual(normalized.clearance_requirements, {
    top_mm: 13,
    left_mm: 3,
    right_mm: 3,
    rear_mm: 25
  });
});
