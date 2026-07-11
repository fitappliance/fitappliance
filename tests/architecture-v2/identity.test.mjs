import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCanonicalProduct,
  createShadowProductId,
  findIdentifier,
  normalizeIdentifier,
} from '../../src/domain/identity.mjs';

const fixture = {
  id: 'fa_00000001',
  category: 'fridge',
  brand: 'Fisher & Paykel',
  model: 'RF505ANUX1',
  identifiers: [
    {
      scheme: 'legacy_runtime_id',
      value: ' Fridge-Fisher-Paykel-RF505ANUX1 ',
      authority: ' FitAppliance ',
    },
    {
      scheme: 'manufacturer_model',
      value: ' rf505anux1 ',
      authority: ' fisher-paykel ',
    },
    {
      scheme: 'gems_model',
      value: ' gems-rf505anux1 ',
      authority: ' GEMS ',
    },
  ],
};

test('normalizes identifiers according to their scheme', () => {
  assert.equal(
    normalizeIdentifier('legacy_runtime_id', ' Fridge-Fisher-Paykel-RF505ANUX1 '),
    'fridge-fisher-paykel-rf505anux1',
  );
  assert.equal(normalizeIdentifier('manufacturer_model', ' rf505anux1 '), 'RF505ANUX1');
  assert.equal(normalizeIdentifier('gems_model', ' gems-rf505anux1 '), 'GEMS-RF505ANUX1');
  assert.throws(() => normalizeIdentifier('unknown_scheme', 'value'), /scheme/i);
});

test('creates deterministic opaque shadow IDs from normalized legacy IDs', () => {
  const shadowId = createShadowProductId(' Fridge-Fisher-Paykel-RF505ANUX1 ');

  assert.equal(
    shadowId,
    'fa_shadow_3a8ddbd22f3fc223afdb8c1f3d2f4c65d063019e76c63410f67488411ddead5f',
  );
  assert.equal(shadowId, createShadowProductId('fridge-fisher-paykel-rf505anux1'));
  assert.match(shadowId, /^fa_shadow_[0-9a-f]{64}$/);
  assert.doesNotMatch(shadowId, /fisher|paykel|rf505/i);
});

test('creates a deeply frozen canonical product without mutating input', () => {
  const input = structuredClone(fixture);
  const product = createCanonicalProduct(input);

  assert.deepEqual(input, fixture);
  assert.notStrictEqual(product, input);
  assert.notStrictEqual(product.identifiers, input.identifiers);
  assert.equal(product.id, 'fa_00000001');
  assert.equal(product.identifiers[0].value, 'fridge-fisher-paykel-rf505anux1');
  assert.equal(product.identifiers[1].value, 'RF505ANUX1');
  assert.equal(product.identifiers[2].value, 'GEMS-RF505ANUX1');
  assert.equal(product.identifiers[0].authority, 'FitAppliance');
  assert.equal(findIdentifier(product, 'manufacturer_model').value, 'RF505ANUX1');
  const productWithoutGems = createCanonicalProduct({
    ...input,
    identifiers: [input.identifiers[0]],
  });
  assert.equal(findIdentifier(productWithoutGems, 'gems_model'), null);
  assert.equal(Object.isFrozen(product), true);
  assert.equal(Object.isFrozen(product.identifiers), true);
  assert.equal(Object.isFrozen(product.identifiers[0]), true);
  assert.throws(() => {
    product.identifiers[0].value = 'changed';
  }, TypeError);
});

test('rejects empty and duplicate identifiers after normalization', () => {
  assert.throws(
    () => createCanonicalProduct({ ...fixture, identifiers: [{ ...fixture.identifiers[0], value: '   ' }] }),
    /empty/i,
  );
  assert.throws(
    () => createCanonicalProduct({
      ...fixture,
      identifiers: [
        { scheme: 'manufacturer_model', value: 'RF505ANUX1', authority: 'fisher-paykel' },
        { scheme: 'manufacturer_model', value: ' rf505anux1 ', authority: 'other' },
      ],
    }),
    /duplicate/i,
  );
});

test('rejects identifiers with invalid schemes and products with invalid categories', () => {
  assert.throws(
    () => createCanonicalProduct({
      ...fixture,
      identifiers: [{ scheme: 'retailer_sku', value: 'SKU-1', authority: 'retailer' }],
    }),
    /scheme/i,
  );
  assert.throws(() => createCanonicalProduct({ ...fixture, category: 'oven' }), /category/i);
});
