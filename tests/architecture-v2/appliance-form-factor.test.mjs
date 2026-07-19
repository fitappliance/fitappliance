import test from 'node:test';
import assert from 'node:assert/strict';

import { inferApplianceFormFactor } from '../../src/domain/appliance-form-factor.mjs';

test('infers only explicit category-specific appliance form factors', () => {
  assert.equal(inferApplianceFormFactor({
    cat: 'fridge', displayName: 'Samsung 498L French Door Refrigerator',
  }), 'upright');
  assert.equal(inferApplianceFormFactor({
    cat: 'fridge', displayName: 'Example 300L Chest Freezer',
  }), 'chest');
  assert.equal(inferApplianceFormFactor({
    cat: 'washing_machine', displayName: 'Example 9kg Front Load Washing Machine',
  }), 'front_loader');
  assert.equal(inferApplianceFormFactor({
    cat: 'washing_machine', displayName: 'Example 10kg Top Loader',
  }), 'top_loader');
  assert.equal(inferApplianceFormFactor({
    cat: 'washing_machine', displayName: 'Example 10kg Smart Laundry Appliance',
  }), null);
  assert.equal(inferApplianceFormFactor({
    cat: 'dishwasher', displayName: 'Example Front Load Dishwasher',
  }), null);
  assert.equal(inferApplianceFormFactor({
    cat: 'dishwasher', displayName: 'Example Integrated Tall Dishwasher',
  }), 'integrated');
  assert.equal(inferApplianceFormFactor({
    cat: 'dishwasher', displayName: 'Example Freestanding Dishwasher',
  }), 'freestanding');
  assert.equal(inferApplianceFormFactor({
    cat: 'dishwasher', displayName: 'Example Double DishDrawer Dishwasher',
  }), 'drawer');
  assert.equal(inferApplianceFormFactor({
    cat: 'washing_machine', displayName: 'Example Front Load Washer Dryer Combo',
  }), 'washer_dryer_combo');
  assert.equal(inferApplianceFormFactor({
    cat: 'dryer', displayName: 'Example 9kg Heat Pump Dryer',
  }), 'front_loader');
});

test('preserves an existing receipt-bound form factor before reading display text', () => {
  assert.equal(inferApplianceFormFactor({
    cat: 'fridge',
    displayName: 'Ambiguous cooling appliance',
    geometry_v2: { formFactor: 'upright' },
  }), 'upright');
  assert.equal(inferApplianceFormFactor({
    cat: 'dishwasher',
    displayName: 'Example Freestanding Dishwasher',
    geometry_v2: { formFactor: 'front_loader' },
  }), 'freestanding');
  assert.equal(inferApplianceFormFactor({
    cat: 'dishwasher',
    displayName: 'Ambiguous dishwasher',
    geometry_v2: { formFactor: 'front_loader' },
  }), null);
});
