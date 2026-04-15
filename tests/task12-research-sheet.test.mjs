import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildResearchGroups } = require('../scripts/generate-research-sheet.js');

function makeProduct(overrides = {}) {
  return {
    id: 'p1',
    cat: 'fridge',
    brand: 'WESTINGHOUSE',
    model: 'WBE4500WC',
    w: 896,
    h: 1725,
    door_swing_mm: null,
    features: ['Upright', '5B'],
    ...overrides
  };
}

test('task 12 research-sheet: priority brands rank ahead of non-priority groups', () => {
  const products = [
    makeProduct({ id: 'w1', brand: 'WESTINGHOUSE', w: 895 }),
    makeProduct({ id: 'w2', brand: 'WESTINGHOUSE', w: 897 }),
    makeProduct({ id: 'u1', brand: 'UNKNOWN-BRAND', w: 600 }),
    makeProduct({ id: 'u2', brand: 'UNKNOWN-BRAND', w: 602 }),
    makeProduct({ id: 'u3', brand: 'UNKNOWN-BRAND', w: 604 }),
    makeProduct({ id: 'u4', brand: 'UNKNOWN-BRAND', w: 606 }),
    makeProduct({ id: 'u5', brand: 'UNKNOWN-BRAND', w: 608 })
  ];

  const groups = buildResearchGroups(products, {
    priorityBrands: ['WESTINGHOUSE'],
    widthTolerance: 5
  });

  assert.equal(groups[0].brand, 'WESTINGHOUSE');
  assert.equal(groups[0].rank, 1);
});

test('task 12 research-sheet: width tolerance clusters 895/897 and separates 905', () => {
  const products = [
    makeProduct({ id: 'a', brand: 'LG', w: 895 }),
    makeProduct({ id: 'b', brand: 'LG', w: 897 }),
    makeProduct({ id: 'c', brand: 'LG', w: 905 })
  ];

  const groups = buildResearchGroups(products, {
    priorityBrands: ['LG'],
    widthTolerance: 5
  });

  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].ids, ['a', 'b']);
  assert.deepEqual(groups[1].ids, ['c']);
});

test('task 12 research-sheet: excludes non-null door_swing models', () => {
  const products = [
    makeProduct({ id: 'pending', brand: 'HISENSE', door_swing_mm: null }),
    makeProduct({ id: 'resolved', brand: 'HISENSE', door_swing_mm: 0 })
  ];

  const groups = buildResearchGroups(products, {
    priorityBrands: ['HISENSE'],
    widthTolerance: 5
  });

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].ids, ['pending']);
});

test('task 12 research-sheet: suggestCommand is anchored on the first id', () => {
  const products = [
    makeProduct({ id: 'f-1', brand: 'CHIQ', w: 794 }),
    makeProduct({ id: 'f-2', brand: 'CHIQ', w: 796 })
  ];

  const groups = buildResearchGroups(products, {
    priorityBrands: ['CHIQ'],
    widthTolerance: 5
  });

  assert.ok(groups[0].suggestCommand.startsWith(`node scripts/suggest-door-swing.js --id ${groups[0].ids[0]}`));
});

test('task 12 research-sheet: modelCount equals ids.length for every group', () => {
  const products = [
    makeProduct({ id: 'g1', brand: 'LG', w: 835 }),
    makeProduct({ id: 'g2', brand: 'LG', w: 836 }),
    makeProduct({ id: 'g3', brand: 'LG', w: 912 }),
    makeProduct({ id: 'h1', brand: 'HISENSE', w: 794 })
  ];

  const groups = buildResearchGroups(products, {
    priorityBrands: ['LG', 'HISENSE'],
    widthTolerance: 5
  });

  for (const group of groups) {
    assert.equal(group.modelCount, group.ids.length);
  }
});

test('task 12 research-sheet: returns empty when no pending products exist', () => {
  const products = [
    makeProduct({ id: 'x1', door_swing_mm: 0 }),
    makeProduct({ id: 'x2', door_swing_mm: 20 })
  ];

  const groups = buildResearchGroups(products, {
    priorityBrands: ['WESTINGHOUSE'],
    widthTolerance: 5
  });

  assert.deepEqual(groups, []);
});
