import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrandDataOutreachQueue } from '../../src/domain/brand-data-outreach.mjs';

test('brand outreach queue covers pilot brands without inventing contact details', () => {
  const queue = buildBrandDataOutreachQueue({ products: [
    { brand: 'Fisher & Paykel', model: 'RF605QZUVB1', category: 'fridge' },
    { brand: 'Fisher & Paykel', model: 'DW60UT4I2', category: 'dishwasher' },
    { brand: 'Example Brand', model: 'EX1', category: 'fridge' },
  ] });
  assert.equal(queue.brands.length, 2);
  assert.equal(queue.brands[0].brand, 'Fisher & Paykel');
  assert.equal(queue.brands[0].route.state, 'official_trade_portal_confirmed');
  const unknown = queue.brands.find((row) => row.brand === 'Example Brand');
  assert.equal(unknown.route.url, null);
  assert.equal(unknown.route.state, 'official_contact_research_required');
  assert.equal(queue.summary.messagesSent, 0);
});
