import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = '/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2';
const moduleUrl = pathToFileURL(
  path.join(repoRoot, 'scripts', 'generate-promotion-kit.js')
).href;

const appliancesFixture = {
  schema_version: 2,
  last_updated: '2026-04-15',
  products: [
    { id: 'p1', brand: 'LG', cat: 'fridge', door_swing_mm: 0 },
    { id: 'p2', brand: 'LG', cat: 'fridge', door_swing_mm: null },
    { id: 'p3', brand: 'Samsung', cat: 'dishwasher', door_swing_mm: 0 },
    { id: 'p4', brand: 'Bosch', cat: 'dishwasher', door_swing_mm: null },
    { id: 'p5', brand: 'Bosch', cat: 'washing_machine', door_swing_mm: 0 }
  ]
};

test('task 16 promotion-kit: buildPromoStats computes total product count', async () => {
  const { buildPromoStats } = await import(moduleUrl);
  const stats = buildPromoStats(appliancesFixture, [], []);
  assert.equal(stats.totalProducts, 5);
});

test('task 16 promotion-kit: buildPromoStats computes deduped brand count', async () => {
  const { buildPromoStats } = await import(moduleUrl);
  const stats = buildPromoStats(appliancesFixture, [], []);
  assert.equal(stats.totalBrands, 3);
});

test('task 16 promotion-kit: buildPromoKit output includes product count in markdown', async () => {
  const { buildPromoKit, buildPromoStats } = await import(moduleUrl);
  const stats = buildPromoStats(appliancesFixture, [{ slug: 'lg-fridge-clearance' }], []);
  const markdown = buildPromoKit(stats, { today: '2026-04-15' });
  assert.match(markdown, /\*\*5 appliance models\*\*/);
});

test('task 16 promotion-kit: buildPromoKit output includes today date in header', async () => {
  const { buildPromoKit, buildPromoStats } = await import(moduleUrl);
  const stats = buildPromoStats(appliancesFixture, [{ slug: 'lg-fridge-clearance' }], []);
  const markdown = buildPromoKit(stats, { today: '2026-04-30' });
  assert.match(markdown, /_Auto-generated 2026-04-30 from live database_/);
});
