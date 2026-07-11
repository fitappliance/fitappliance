import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGeometry,
  requiredInstallationEnvelope,
} from '../../src/domain/geometry.mjs';

const fixture = {
  closedEnvelope: {
    widthMm: 790,
    heightMm: { minimumMm: 1715, maximumMm: 1735 },
    depthMm: 695,
  },
  installation: {
    leftMm: 10,
    rightMm: 10,
    topMm: 20,
    rearMm: 50,
    frontMm: 0,
  },
};

test('creates immutable geometry and preserves an adjustable height range', () => {
  const input = structuredClone(fixture);
  const geometry = createGeometry(input);

  assert.deepEqual(input, fixture);
  assert.notStrictEqual(geometry, input);
  assert.deepEqual(geometry.closedEnvelope.heightMm, {
    minimumMm: 1715,
    maximumMm: 1735,
  });
  assert.equal(geometry.installation.frontMm, 0);
  assert.equal(geometry.operation, null);
  assert.equal(geometry.delivery, null);
  assert.equal(Object.isFrozen(geometry), true);
  assert.equal(Object.isFrozen(geometry.closedEnvelope), true);
  assert.equal(Object.isFrozen(geometry.closedEnvelope.heightMm), true);
  assert.equal(Object.isFrozen(geometry.installation), true);
});

test('normalizes a fixed height into a closed height range', () => {
  const geometry = createGeometry({
    ...fixture,
    closedEnvelope: { ...fixture.closedEnvelope, heightMm: 1720 },
  });

  assert.deepEqual(geometry.closedEnvelope.heightMm, {
    minimumMm: 1720,
    maximumMm: 1720,
  });
});

test('calculates the complete required installation envelope using maximum height', () => {
  const envelope = requiredInstallationEnvelope(createGeometry(fixture));

  assert.deepEqual(envelope, {
    widthMm: 810,
    heightMm: 1755,
    depthMm: 745,
  });
  assert.equal(Object.isFrozen(envelope), true);
});

test('returns null instead of treating an unknown dimension or clearance as zero', () => {
  const unknownRear = createGeometry({
    ...fixture,
    installation: { ...fixture.installation, rearMm: null },
  });
  const unknownWidth = createGeometry({
    ...fixture,
    closedEnvelope: { ...fixture.closedEnvelope, widthMm: null },
  });

  assert.equal(requiredInstallationEnvelope(unknownRear), null);
  assert.equal(requiredInstallationEnvelope(unknownWidth), null);
});

test('rejects non-numeric, non-finite, zero, and negative closed dimensions', () => {
  for (const value of ['790', Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
    assert.throws(
      () => createGeometry({
        ...fixture,
        closedEnvelope: { ...fixture.closedEnvelope, widthMm: value },
      }),
      /widthMm/i,
    );
  }
});

test('allows explicit zero clearance but rejects negative and non-finite clearance', () => {
  assert.equal(createGeometry(fixture).installation.frontMm, 0);
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, '0']) {
    assert.throws(
      () => createGeometry({
        ...fixture,
        installation: { ...fixture.installation, frontMm: value },
      }),
      /frontMm/i,
    );
  }
});

test('rejects inverted or incomplete height ranges', () => {
  for (const heightMm of [
    { minimumMm: 1735, maximumMm: 1715 },
    { minimumMm: 1715 },
    { minimumMm: 0, maximumMm: 1715 },
  ]) {
    assert.throws(
      () => createGeometry({
        ...fixture,
        closedEnvelope: { ...fixture.closedEnvelope, heightMm },
      }),
      /height/i,
    );
  }
});
