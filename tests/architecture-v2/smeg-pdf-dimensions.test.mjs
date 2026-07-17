import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractSmegAuDishwasherSizeRows,
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
