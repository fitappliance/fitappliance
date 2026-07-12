import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createGeometry } from '../../src/domain/geometry.mjs';
import { evaluateFit } from '../../src/domain/fit-decision.mjs';

const cases = JSON.parse(readFileSync(
  new URL('../fixtures/architecture-v2/golden-fit-cases.json', import.meta.url),
  'utf8',
));

for (const fixture of cases) {
  test(`golden fit decision: ${fixture.name}`, () => {
    const input = {
      geometry: createGeometry(fixture.geometry),
      cavity: structuredClone(fixture.cavity),
      evidenceLevel: fixture.evidenceLevel,
      advisoryChecks: structuredClone(fixture.advisoryChecks),
    };
    const snapshot = structuredClone(input);

    const decision = evaluateFit(input);
    const statuses = Object.fromEntries(decision.checks
      .filter((check) => check.id.startsWith('installation_'))
      .map((check) => [check.id, check.status]));
    const advisoryStatuses = Object.fromEntries(decision.checks
      .filter((check) => !check.id.startsWith('installation_'))
      .map((check) => [check.id, check.status]));

    assert.equal(decision.outcome, fixture.expected.outcome);
    assert.deepEqual(statuses, fixture.expected.statuses);
    assert.deepEqual(advisoryStatuses, fixture.expected.advisoryStatuses);
    assert.deepEqual(decision.required, fixture.expected.required);
    assert.deepEqual(decision.spare, fixture.expected.spare);
    for (const [id, field] of [
      ['installation_width', 'widthMm'],
      ['installation_height', 'heightMm'],
      ['installation_depth', 'depthMm'],
    ]) {
      const check = decision.checks.find((candidate) => candidate.id === id);
      assert.equal(check.requiredMm, fixture.expected.required[field]);
      assert.equal(check.availableMm, fixture.cavity[field]);
      assert.equal(check.spareMm, fixture.expected.spare[field]);
    }
    assert.equal(decision.evidenceLevel, fixture.evidenceLevel);
    assert.deepEqual(input, snapshot);
    assert.equal(Object.isFrozen(decision), true);
    assert.equal(Object.isFrozen(decision.checks), true);
    assert.equal(Object.isFrozen(decision.checks[0]), true);
  });
}

test('applicable operation failure is a physical no-fit', () => {
  const verified = cases[0];
  const decision = evaluateFit({
    geometry: createGeometry(verified.geometry),
    cavity: verified.cavity,
    evidenceLevel: 'verified',
    advisoryChecks: [{ id: 'door_swing', applicable: true, status: 'FAIL' }],
  });

  assert.equal(decision.outcome, 'NO_FIT');
});

test('non-applicable advisory checks do not make a fit conditional', () => {
  const verified = cases[0];
  const decision = evaluateFit({
    geometry: createGeometry(verified.geometry),
    cavity: verified.cavity,
    evidenceLevel: 'verified',
    advisoryChecks: [{ id: 'plumbing', applicable: false, status: 'UNKNOWN' }],
  });

  assert.equal(decision.outcome, 'VERIFIED_FIT');
});

test('fit depth excludes front operation space and uses required rear service maximum', () => {
  const geometry = {
    ...createGeometry({
      closedEnvelope: { widthMm: 600, heightMm: 850, depthMm: 600 },
      installation: { leftMm: 5, rightMm: 5, topMm: 10, rearMm: 20, frontMm: 600 },
    }),
    category: 'dishwasher',
    service: { rearServicesMm: 80, plumbingRearMm: null, rearVentilationMm: null },
  };
  const decision = evaluateFit({
    geometry,
    cavity: { widthMm: 610, heightMm: 860, depthMm: 680 },
    evidenceLevel: 'verified',
    advisoryChecks: [{ id: 'door_open', applicable: true, status: 'PASS' }],
  });
  assert.equal(decision.required.depthMm, 680);
  assert.equal(decision.outcome, 'VERIFIED_FIT');
});

test('rejects string cavity dimensions, unknown evidence levels, and invalid checks', () => {
  const geometry = createGeometry(cases[0].geometry);
  assert.throws(
    () => evaluateFit({
      geometry,
      cavity: { ...cases[0].cavity, widthMm: '810' },
      evidenceLevel: 'verified',
      advisoryChecks: [],
    }),
    /widthMm/i,
  );
  assert.throws(
    () => evaluateFit({
      geometry,
      cavity: cases[0].cavity,
      evidenceLevel: 'high',
      advisoryChecks: [],
    }),
    /evidence level/i,
  );
  assert.throws(
    () => evaluateFit({
      geometry,
      cavity: cases[0].cavity,
      evidenceLevel: 'verified',
      advisoryChecks: [{ id: 'door_swing', applicable: true, status: 'MAYBE' }],
    }),
    /status/i,
  );
});

test('rejects duplicate and reserved advisory check identifiers', () => {
  const geometry = createGeometry(cases[0].geometry);
  const base = {
    geometry,
    cavity: cases[0].cavity,
    evidenceLevel: 'verified',
  };

  assert.throws(
    () => evaluateFit({
      ...base,
      advisoryChecks: [
        { id: 'door_swing', applicable: true, status: 'PASS' },
        { id: 'door_swing', applicable: true, status: 'UNKNOWN' },
      ],
    }),
    /duplicate/i,
  );
  assert.throws(
    () => evaluateFit({
      ...base,
      advisoryChecks: [{ id: 'installation_width', applicable: true, status: 'PASS' }],
    }),
    /reserved/i,
  );
});
