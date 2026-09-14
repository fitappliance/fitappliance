import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';
import { canonicalEvidenceJson } from '../../src/shared/canonical-evidence-json.mjs';

const ownProtoPayload = JSON.parse('{"__proto__":{"nested":1}}');

test('historical lossy encoding produces equal digests for own __proto__ and sparse arrays', () => {
  const sparse = [];
  sparse.length = 1;

  assert.equal(
    canonicalJsonSha256(ownProtoPayload),
    canonicalJsonSha256({}),
  );
  assert.equal(canonicalJsonSha256(sparse), canonicalJsonSha256([null]));
});

test('strict evidence JSON preserves an own __proto__ key as JSON data', () => {
  assert.equal(
    canonicalEvidenceJson(ownProtoPayload),
    '{"__proto__":{"nested":1}}',
  );
});

test('strict evidence JSON rejects sparse arrays instead of serializing holes as null', () => {
  const sparse = [];
  sparse.length = 1;

  assert.throws(
    () => canonicalEvidenceJson(sparse),
    /sparse|JSON/i,
  );
});

test('strict evidence JSON orders object keys and preserves meaningful array order', () => {
  assert.equal(
    canonicalEvidenceJson({ z: [2, 1], a: { d: false, c: null } }),
    '{"a":{"c":null,"d":false},"z":[2,1]}',
  );
  assert.notEqual(canonicalEvidenceJson([1, 2]), canonicalEvidenceJson([2, 1]));
});

test('strict evidence JSON rejects lossy object and array properties without running getters', () => {
  let getterRan = false;
  const accessor = {};
  Object.defineProperty(accessor, 'unsafe', {
    enumerable: true,
    get() {
      getterRan = true;
      throw new Error('getter must not run');
    },
  });
  const symbolProperty = { safe: true };
  symbolProperty[Symbol('unsafe')] = 1;
  const hiddenProperty = { safe: true };
  Object.defineProperty(hiddenProperty, 'hidden', { value: 1 });
  const extraArrayProperty = [null];
  extraArrayProperty.metadata = 'unsafe';

  for (const value of [accessor, symbolProperty, hiddenProperty, extraArrayProperty]) {
    assert.throws(() => canonicalEvidenceJson(value), /accessor|symbol|non-enumerable|non-index/i);
  }
  assert.equal(getterRan, false);
});

test('strict evidence JSON rejects non-JSON primitives, non-plain objects and cycles', () => {
  const cycle = { self: null };
  cycle.self = cycle;

  for (const value of [undefined, Number.NaN, Infinity, new Date('2026-01-01T00:00:00.000Z'), cycle]) {
    assert.throws(() => canonicalEvidenceJson(value), /invalid JSON|non-finite|non-plain|cyclic/i);
  }
});

test('strict V3 output and historical V2 digests retain independently literal goldens', () => {
  assert.equal(canonicalEvidenceJson({ a: 1 }), '{"a":1}');
  assert.equal(canonicalEvidenceJson([null]), '[null]');
  assert.equal(
    createHash('sha256').update(canonicalEvidenceJson({ a: 1 }), 'utf8').digest('hex'),
    '015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862',
  );
  assert.equal(
    createHash('sha256').update(canonicalEvidenceJson([null]), 'utf8').digest('hex'),
    '1d8fc6ceb1f94c6326d6d5483d258fcb2e179e9869325b245d105c2219bf69fd',
  );
  assert.equal(canonicalJsonSha256({ a: 1 }), '015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862');
  assert.equal(canonicalJsonSha256([null]), '1d8fc6ceb1f94c6326d6d5483d258fcb2e179e9869325b245d105c2219bf69fd');
});
