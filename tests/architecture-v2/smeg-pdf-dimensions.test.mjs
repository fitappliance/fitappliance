import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractSmegAuDishwasherFixedTableSizeRows,
  extractSmegAuDishwasherFixedSuffixPermutationRows,
  extractSmegAuDishwasherSizeRows,
  SMEG_AU_DISHWASHER_SUFFIX_FIXED_GRAMMAR,
  SMEG_AU_DISHWASHER_SUFFIX_PERMUTATION_GRAMMAR,
  SMEG_AU_DISHWASHER_SUFFIX_RANGE_GRAMMAR,
} from '../../src/domain/smeg-pdf-dimensions.mjs';

test('extracts the bounded Smeg dishwasher W-D-H adjustable-height expression', () => {
  assert.deepEqual(
    extractSmegAuDishwasherSizeRows('Size 598mmW x 570mmD x 818–868mmH max'),
    [{
      axisOrder: ['width', 'depth', 'height'],
      grammarProfileId: SMEG_AU_DISHWASHER_SUFFIX_RANGE_GRAMMAR,
      label: 'Width', value: '598 mm', quote: 'Width 598 mm',
    }, {
      axisOrder: ['width', 'depth', 'height'],
      grammarProfileId: SMEG_AU_DISHWASHER_SUFFIX_RANGE_GRAMMAR,
      label: 'Depth', value: '570 mm', quote: 'Depth 570 mm',
    }, {
      axisOrder: ['width', 'depth', 'height'],
      grammarProfileId: SMEG_AU_DISHWASHER_SUFFIX_RANGE_GRAMMAR,
      label: 'Height', value: '818-868 mm', quote: 'Height 818-868 mm',
      semanticBasis: 'explicit_label_range',
    }],
  );
});

test('extracts the bounded Smeg dishwasher W-H-D fixed-height expression', () => {
  assert.deepEqual(
    extractSmegAuDishwasherFixedTableSizeRows('Size 598mmW × 850mmH x 595mmD'),
    [{
      axisOrder: ['width', 'height', 'depth'],
      grammarProfileId: SMEG_AU_DISHWASHER_SUFFIX_FIXED_GRAMMAR,
      label: 'Width', value: '598 mm', quote: 'Width 598 mm',
    }, {
      axisOrder: ['width', 'height', 'depth'],
      grammarProfileId: SMEG_AU_DISHWASHER_SUFFIX_FIXED_GRAMMAR,
      label: 'Height', value: '850 mm', quote: 'Height 850 mm',
    }, {
      axisOrder: ['width', 'height', 'depth'],
      grammarProfileId: SMEG_AU_DISHWASHER_SUFFIX_FIXED_GRAMMAR,
      label: 'Depth', value: '595 mm', quote: 'Depth 595 mm',
    }],
  );
});

test('rejects lookalikes outside the exact Smeg dishwasher grammar', () => {
  for (const value of [
    'Packaging size 598mmW x 570mmD x 818–868mmH',
    'Size 598mmW x 570–590mmD x 818mmH',
    'Size 598mmW x 570mmW x 818–868mmH',
    'Size 598mmW x 570mmD x 868–818mmH',
    'Size 598mmW x 570mmD x 818–868mmH including hoses',
    'Size 598mmW x 570mmD x 818mmH',
  ]) assert.equal(extractSmegAuDishwasherSizeRows(value), null, value);
});

test('rejects lookalikes outside the fixed Smeg two-cell table grammar', () => {
  for (const value of [
    'Package Size 598mmW x 850mmH x 595mmD',
    'Size 598mmW x 850mmH x 595mmD including hoses',
    'Size 598mmW x 595mmD x 850mmH',
    'Size 598mmW x 850mmH x 595–610mmD',
  ]) assert.equal(extractSmegAuDishwasherFixedTableSizeRows(value), null, value);
});

test('extracts strict Smeg fixed dimensions in explicit W-D-H and H-W-D order', () => {
  for (const [expression, expected] of [
    ['Size 598mmW x 600mmD x 850mmH', [
      ['Width', '598 mm'], ['Depth', '600 mm'], ['Height', '850 mm'],
    ]],
    ['dimensions 850mmH x 448mmW x 600mmD', [
      ['Height', '850 mm'], ['Width', '448 mm'], ['Depth', '600 mm'],
    ]],
  ]) {
    const rows = extractSmegAuDishwasherFixedSuffixPermutationRows(expression);
    assert.deepEqual(rows.map((row) => [row.label, row.value]), expected);
    assert.ok(rows.every((row) => (
      row.grammarProfileId === SMEG_AU_DISHWASHER_SUFFIX_PERMUTATION_GRAMMAR
    )));
  }
});

test('fixed Smeg permutation grammar rejects legacy W-H-D and qualified dimensions', () => {
  for (const expression of [
    'size 598mmW x 850mmH x 596mmD',
    'Package Size 598mmW x 600mmD x 850mmH',
    'Size 598mmW x 600mmW x 850mmH',
    'Size 598mmW x 600mmD x 850-900mmH',
    'size 598mmW x 928mmH max x 550mmD (excluding door)',
    'size 598mmW x 858mmH (928mmH max) x 570mmD',
  ]) assert.equal(extractSmegAuDishwasherFixedSuffixPermutationRows(expression), null, expression);
});
