import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCatalogProjection, outcomeCopy, rankResults } from '../../src/domain/projection-selector.mjs';

test('projection defaults to legacy and requires an explicit V2 flag', () => {
  const legacy = { products: [{ id: 'legacy' }] };
  const v2 = { products: [{ id: 'legacy', canonicalProductId: 'fa_prod_1' }] };
  assert.equal(selectCatalogProjection({ legacy, v2 }).name, 'legacy');
  assert.equal(selectCatalogProjection({ legacy, v2, flag: 'v2' }).name, 'v2');
  assert.throws(() => selectCatalogProjection({ legacy, v2: { products: [{}] }, flag: 'v2' }), /canonical/i);
});

test('every V2 outcome has conservative public copy', () => {
  for (const outcome of ['NO_FIT', 'INSUFFICIENT_DATA', 'CONDITIONAL_FIT', 'VERIFIED_FIT', 'LIKELY_FIT_ESTIMATED']) {
    assert.match(outcomeCopy(outcome).label, /\S/);
  }
});

test('ranking cannot turn a physical failure into a fit', () => {
  const rows = rankResults([
    { id: 'a', fitDecision: { outcome: 'NO_FIT' }, rankingScore: 100 },
    { id: 'b', fitDecision: { outcome: 'VERIFIED_FIT' }, rankingScore: 1 },
  ]);
  assert.equal(rows[0].id, 'b');
  assert.throws(() => rankResults([{ id: 'x', fitDecision: { outcome: 'MAYBE' } }]), /outcome/i);
});
