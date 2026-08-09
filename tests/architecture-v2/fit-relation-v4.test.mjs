import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { getFitV4Field, validateFitV4FieldMap } from '../../src/domain/fit-v4-contract.mjs';
import { validateFitV4NormalizedValue } from '../../src/domain/installation-evidence-receipt-v4.mjs';
import {
  FIT_RELATIONS_V4,
  combineRepeatedMeasurements,
  composeScalarMeasurements,
  evaluateFitRelationV4,
} from '../../src/domain/fit-relation-v4.mjs';

const FIELD_MAP = validateFitV4FieldMap(JSON.parse(await readFile(
  new URL('../../data/architecture-v2/policies/fit-v4-field-map.json', import.meta.url),
  'utf8',
)));

const exact = (value, overrides = {}) => ({
  kind: 'DETERMINISTIC', value, unit: 'mm', coordinateSystem: 'installed_appliance',
  datum: 'cabinet_front', axis: 'x', geometryId: 'cavity_width', ...overrides,
});

const coverage = (minimum, maximum, overrides = {}) => ({
  kind: 'COVERAGE_INTERVAL', minimum, maximum,
  minimumEndpoint: 'closed', maximumEndpoint: 'closed',
  unit: 'mm', coordinateSystem: 'installed_appliance', datum: 'cabinet_front',
  axis: 'x', geometryId: 'cavity_width', ...overrides,
});

const geometry = (kind, value, overrides = {}) => ({
  kind, value, unit: 'mm', coordinateSystem: 'installed_appliance',
  datum: 'rear_left_floor_origin', ...overrides,
});

const box3 = (min, max, overrides) => geometry('box3', { min, max }, overrides);
const route3 = (points, overrides) => geometry('route3', points, overrides);
const polygon2 = (points, overrides) => geometry('polygon2', points, overrides);
const sweep3 = (path, min, max, overrides) => geometry('sweep3', {
  path, envelope: { min, max },
}, overrides);
const categorical = (valueType, value, overrides = {}) => ({
  kind: 'DETERMINISTIC', valueType, value, unit: null,
  coordinateSystem: 'non_geometric', datum: 'selected_configuration',
  axis: 'none', geometryId: 'configuration_identity', ...overrides,
});

function scalar(relation, required, available, extra = {}) {
  return evaluateFitRelationV4({ relation, required, available, ...extra });
}

test('exports the closed Fit V4 numeric, geometry and categorical relation names', () => {
  assert.deepEqual(FIT_RELATIONS_V4, [
    'MIN_REQUIRED', 'MAX_ALLOWED', 'WITHIN_RANGE', 'CONTAINS', 'REQUIRED_CONTAINS',
    'PROHIBITED_ZONE', 'NO_INTERSECTION', 'EXACT_MATCH', 'REQUIRES_TRUE',
    'NOT_MEMBER_OF', 'SET_CONTAINS',
  ]);
});

test('MIN_REQUIRED and MAX_ALLOWED preserve inclusive/exclusive boundaries', () => {
  assert.equal(scalar('MIN_REQUIRED', exact(600), exact(600)).status, 'PASS');
  assert.equal(scalar('MIN_REQUIRED', exact(600), exact(600), { equality: 'open' }).status, 'FAIL');
  assert.equal(scalar('MIN_REQUIRED', exact(600), exact(599)).status, 'FAIL');
  assert.equal(scalar('MAX_ALLOWED', exact(10), exact(10)).status, 'PASS');
  assert.equal(scalar('MAX_ALLOWED', exact(10), exact(10), { equality: 'open' }).status, 'FAIL');
  assert.equal(scalar('MAX_ALLOWED', exact(10), coverage(9, 11)).status, 'UNKNOWN');
});

test('WITHIN_RANGE and scalar CONTAINS preserve asymmetric endpoints and overlap', () => {
  const allowed = coverage(10, 20, { minimumEndpoint: 'open', geometryId: 'drain_height' });
  assert.equal(scalar('WITHIN_RANGE', allowed, exact(10, { geometryId: 'drain_height' })).status, 'FAIL');
  assert.equal(scalar('WITHIN_RANGE', allowed, exact(20, { geometryId: 'drain_height' })).status, 'PASS');
  assert.equal(scalar('WITHIN_RANGE', allowed, coverage(9, 11, { geometryId: 'drain_height' })).status, 'UNKNOWN');
  assert.equal(scalar('CONTAINS', coverage(10, 20), coverage(0, 30)).status, 'PASS');
  assert.equal(scalar('CONTAINS', coverage(10, 20), coverage(0, 9)).status, 'FAIL');
  assert.equal(scalar('CONTAINS', coverage(10, 20), coverage(0, 15)).status, 'UNKNOWN');
});

test('directional bounds, coverage and estimates remain distinct and fail closed', () => {
  assert.equal(scalar('MIN_REQUIRED', exact(600), { ...exact(610), kind: 'DETERMINISTIC_BOUND', direction: 'LOWER' }).status, 'PASS');
  assert.equal(scalar('MIN_REQUIRED', exact(600), { ...exact(590), kind: 'DETERMINISTIC_BOUND', direction: 'UPPER' }).status, 'FAIL');
  assert.equal(scalar('MIN_REQUIRED', exact(600), coverage(590, 610)).status, 'UNKNOWN');
  const estimate = scalar('MIN_REQUIRED', exact(600), { ...exact(700), kind: 'ESTIMATE' });
  assert.deepEqual(estimate, { status: 'UNKNOWN', relation: 'MIN_REQUIRED', reasonCode: 'ESTIMATE_NOT_DECISIVE' });
});

test('scalar identity includes unit, coordinate system, datum, axis and geometry ID', () => {
  for (const [override, reasonCode] of [
    [{ unit: 'cm' }, 'UNIT_MISMATCH'],
    [{ coordinateSystem: 'delivery_path' }, 'COORDINATE_SYSTEM_MISMATCH'],
    [{ datum: 'rear_wall' }, 'DATUM_MISMATCH'],
    [{ axis: 'y' }, 'AXIS_MISMATCH'],
    [{ geometryId: 'height' }, 'GEOMETRY_MISMATCH'],
  ]) {
    assert.equal(scalar('MIN_REQUIRED', exact(600), exact(700, override)).reasonCode, reasonCode);
  }
});

test('categorical relations are typed, deterministic and fail closed', () => {
  assert.equal(evaluateFitRelationV4({
    relation: 'EXACT_MATCH',
    required: categorical('enum', 'heat_pump'),
    available: categorical('enum', 'heat_pump'),
  }).status, 'PASS');
  assert.equal(evaluateFitRelationV4({
    relation: 'EXACT_MATCH',
    required: categorical('string', 'stack-kit-1'),
    available: categorical('string', 'stack-kit-2'),
  }).status, 'FAIL');
  assert.equal(evaluateFitRelationV4({
    relation: 'EXACT_MATCH',
    required: categorical('connector', { type: 'g3/4', size: 20 }),
    available: categorical('connector', { type: 'g3/4', size: 20 }),
  }).status, 'PASS');

  assert.equal(evaluateFitRelationV4({
    relation: 'REQUIRES_TRUE',
    required: categorical('boolean', true),
    available: categorical('boolean', true),
  }).status, 'PASS');
  assert.equal(evaluateFitRelationV4({
    relation: 'REQUIRES_TRUE',
    required: categorical('boolean', true),
    available: categorical('boolean', false),
  }).status, 'FAIL');
  assert.equal(evaluateFitRelationV4({
    relation: 'REQUIRES_TRUE',
    required: categorical('boolean', false),
    available: categorical('boolean', false),
  }).status, 'PASS');

  assert.equal(evaluateFitRelationV4({
    relation: 'NOT_MEMBER_OF',
    required: categorical('enum_set', ['outdoor', 'wet_area']),
    available: categorical('enum', 'indoor'),
  }).status, 'PASS');
  assert.equal(evaluateFitRelationV4({
    relation: 'NOT_MEMBER_OF',
    required: categorical('enum_set', ['outdoor', 'wet_area']),
    available: categorical('enum', 'wet_area'),
  }).status, 'FAIL');

  assert.equal(evaluateFitRelationV4({
    relation: 'SET_CONTAINS',
    required: categorical('enum_set', ['door', 'shelf']),
    available: categorical('enum_set', ['door']),
  }).status, 'PASS');
  assert.equal(evaluateFitRelationV4({
    relation: 'SET_CONTAINS',
    required: categorical('enum_set', ['door', 'shelf']),
    available: categorical('enum_set', ['door', 'panel']),
  }).status, 'FAIL');

  assert.throws(() => evaluateFitRelationV4({
    relation: 'EXACT_MATCH',
    required: categorical('enum', 'heat_pump'),
    available: exact(1),
  }), /categorical|value type/i);
  assert.equal(evaluateFitRelationV4({
    relation: 'EXACT_MATCH',
    required: categorical('enum', 'heat_pump'),
    available: categorical('enum', 'heat_pump', { datum: 'other_configuration' }),
  }).reasonCode, 'DATUM_MISMATCH');
});

test('invalid scalar values and unused relation parameters are rejected', () => {
  for (const bad of [null, '', false, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => scalar('MIN_REQUIRED', exact(1), exact(bad)), /finite number|object/);
  }
  assert.throws(() => scalar('WITHIN_RANGE', coverage(20, 10), exact(15)), /minimum.*maximum/);
  assert.throws(() => scalar('WITHIN_RANGE', coverage(10, 20), exact(15), { equality: 'closed' }), /equality/);
  assert.throws(() => evaluateFitRelationV4({ relation: 'MIN_REQUIRED', required: exact(1), available: exact(2), unused: true }), /keys/);
});

test('Task 1 field axis and normalized endpoint flow into Task 2 without translation', () => {
  const field = getFitV4Field(FIELD_MAP, 'installation.clearance.leftMin');
  const normalized = validateFitV4NormalizedValue(FIELD_MAP, field.id, {
    value: 10, unit: 'mm', relation: 'MIN_REQUIRED', endpoints: { boundary: 'closed' },
  }, { state: 'required' });
  assert.equal(field.coordinateFrame.axis, 'x');
  assert.equal(normalized.endpoints.boundary, 'closed');
  const identity = {
    coordinateSystem: field.coordinateFrame.id,
    axis: field.coordinateFrame.axis,
    geometryId: field.coordinateFrame.geometry,
  };
  const result = evaluateFitRelationV4({
    relation: normalized.relation,
    required: exact(normalized.value, identity),
    available: exact(10, identity),
    equality: normalized.endpoints.boundary,
  });
  assert.equal(result.status, 'PASS');
});

test('box3 vs box3 detects pass, overlap, boundary and three-dimensional separation', () => {
  const zone = box3([10, 10, 10], [20, 20, 20]);
  assert.equal(evaluateFitRelationV4({ relation: 'NO_INTERSECTION', required: zone, available: box3([0, 0, 0], [5, 5, 5]) }).status, 'PASS');
  const overlap = evaluateFitRelationV4({ relation: 'PROHIBITED_ZONE', required: zone, available: box3([12, 12, 12], [14, 14, 14]) });
  assert.deepEqual(overlap.intersection, geometry('box3', { min: [12, 12, 12], max: [14, 14, 14] }));
  assert.equal(evaluateFitRelationV4({ relation: 'NO_INTERSECTION', required: zone, available: box3([0, 10, 10], [10, 20, 20]) }).status, 'FAIL');
  assert.equal(evaluateFitRelationV4({ relation: 'NO_INTERSECTION', required: zone, available: box3([12, 12, 21], [14, 14, 30]) }).status, 'PASS');
  assert.equal(evaluateFitRelationV4({ relation: 'NO_INTERSECTION', required: zone, available: box3([12, 12, 20], [14, 14, 30]) }).status, 'FAIL');
});

test('route3 segments use all three coordinates against box3', () => {
  const obstacle = box3([10, 10, 10], [20, 20, 20], { coordinateSystem: 'service_route' });
  const clear = route3([[0, 15, 30], [30, 15, 30]], { coordinateSystem: 'service_route' });
  const crossing = route3([[0, 15, 15], [30, 15, 15]], { coordinateSystem: 'service_route' });
  const boundary = route3([[0, 15, 20], [10, 15, 20]], { coordinateSystem: 'service_route' });
  assert.equal(evaluateFitRelationV4({ relation: 'NO_INTERSECTION', required: obstacle, available: clear }).status, 'PASS');
  assert.deepEqual(
    evaluateFitRelationV4({ relation: 'NO_INTERSECTION', required: obstacle, available: crossing }).intersection,
    geometry('point3', [10, 15, 15], { coordinateSystem: 'service_route' }),
  );
  assert.equal(evaluateFitRelationV4({ relation: 'NO_INTERSECTION', required: obstacle, available: boundary }).status, 'FAIL');
  assert.equal(evaluateFitRelationV4({
    relation: 'NO_INTERSECTION', required: obstacle,
    available: route3([[0, 15, 15], [30, 15, 15]], { coordinateSystem: 'delivery_path' }),
  }).reasonCode, 'COORDINATE_SYSTEM_MISMATCH');
});

test('polygon2 supports clear, crossing, containment and boundary contact', () => {
  const zone = polygon2([[10, 10], [20, 10], [20, 20], [10, 20]]);
  const clear = polygon2([[0, 0], [5, 0], [5, 5], [0, 5]]);
  const crossing = polygon2([[15, 15], [25, 15], [25, 25], [15, 25]]);
  const inside = polygon2([[12, 12], [14, 12], [14, 14], [12, 14]]);
  const touching = polygon2([[0, 10], [10, 10], [10, 20], [0, 20]]);
  assert.equal(evaluateFitRelationV4({ relation: 'NO_INTERSECTION', required: zone, available: clear }).status, 'PASS');
  assert.equal(evaluateFitRelationV4({ relation: 'NO_INTERSECTION', required: zone, available: crossing }).status, 'FAIL');
  assert.equal(evaluateFitRelationV4({ relation: 'NO_INTERSECTION', required: zone, available: inside }).status, 'FAIL');
  assert.equal(evaluateFitRelationV4({ relation: 'NO_INTERSECTION', required: zone, available: touching }).status, 'FAIL');
  assert.equal(evaluateFitRelationV4({ relation: 'CONTAINS', required: inside, available: zone }).status, 'PASS');
  assert.equal(evaluateFitRelationV4({
    relation: 'NO_INTERSECTION', required: zone,
    available: polygon2([[0, 0], [5, 0], [0, 5]], { coordinateSystem: 'door_frame' }),
  }).reasonCode, 'COORDINATE_SYSTEM_MISMATCH');
});

test('polygon2 rejects an ambiguous self-intersecting zone', () => {
  const zone = polygon2([[10, 10], [20, 10], [20, 20], [10, 20]]);
  const selfIntersecting = polygon2([[0, 0], [4, 4], [0, 4], [4, 0], [5, 2]]);
  assert.throws(() => evaluateFitRelationV4({
    relation: 'NO_INTERSECTION', required: zone, available: selfIntersecting,
  }), /self-intersect/);
});

test('sweep3 validates path and uses its evidence-bound swept envelope', () => {
  const obstacle = box3([10, 10, 10], [20, 20, 20], { coordinateSystem: 'delivery_path' });
  const clearSweep = sweep3([[0, 0, 0], [5, 5, 5]], [0, 0, 0], [5, 5, 5], { coordinateSystem: 'delivery_path' });
  const blockedSweep = sweep3([[0, 15, 15], [30, 15, 15]], [0, 14, 14], [30, 16, 16], { coordinateSystem: 'delivery_path' });
  assert.equal(evaluateFitRelationV4({ relation: 'NO_INTERSECTION', required: obstacle, available: clearSweep }).status, 'PASS');
  const blocked = evaluateFitRelationV4({ relation: 'NO_INTERSECTION', required: obstacle, available: blockedSweep });
  assert.equal(blocked.status, 'FAIL');
  assert.equal(blocked.intersection.kind, 'box3');
  const touchingSweep = sweep3([[0, 10, 10], [10, 20, 20]], [0, 10, 10], [10, 20, 20], { coordinateSystem: 'delivery_path' });
  assert.equal(evaluateFitRelationV4({ relation: 'NO_INTERSECTION', required: obstacle, available: touchingSweep }).status, 'FAIL');
  assert.equal(evaluateFitRelationV4({
    relation: 'NO_INTERSECTION', required: obstacle,
    available: sweep3([[0, 0, 0], [5, 5, 5]], [0, 0, 0], [5, 5, 5]),
  }).reasonCode, 'COORDINATE_SYSTEM_MISMATCH');
  assert.throws(() => evaluateFitRelationV4({
    relation: 'NO_INTERSECTION', required: obstacle,
    available: sweep3([[0, 0, 0], [30, 30, 30]], [0, 0, 0], [5, 5, 5], { coordinateSystem: 'delivery_path' }),
  }), /path.*envelope/);
});

test('geometry rejects old custom shapes, dimension mismatch, identity mismatch and equality', () => {
  const zone = box3([10, 10, 10], [20, 20, 20]);
  assert.throws(() => evaluateFitRelationV4({
    relation: 'NO_INTERSECTION', required: zone,
    available: { kind: 'RECTANGLE', minimumX: 0, minimumY: 0, maximumX: 5, maximumY: 5, unit: 'mm', coordinateSystem: 'installed_appliance', datum: 'rear_left_floor_origin' },
  }), /keys|kind|geometry/);
  assert.throws(() => evaluateFitRelationV4({ relation: 'NO_INTERSECTION', required: zone, available: polygon2([[0, 0], [5, 0], [0, 5]]) }), /dimension|shape/);
  assert.throws(() => evaluateFitRelationV4({
    relation: 'NO_INTERSECTION', required: zone,
    available: polygon2([[0, 0], [5, 0], [0, 5]], { coordinateSystem: 'door_frame' }),
  }), /dimension|shape/);
  assert.equal(evaluateFitRelationV4({ relation: 'NO_INTERSECTION', required: zone, available: box3([0, 0, 0], [5, 5, 5], { coordinateSystem: 'delivery_path' }) }).reasonCode, 'COORDINATE_SYSTEM_MISMATCH');
  assert.throws(() => evaluateFitRelationV4({ relation: 'NO_INTERSECTION', required: zone, available: zone, equality: 'closed' }), /equality/);
  assert.throws(() => evaluateFitRelationV4({ relation: 'NO_INTERSECTION', required: zone, available: zone, tolerance: 1 }), /keys/);
});

test('geometry arithmetic cannot emit a non-finite intersection witness', () => {
  const zone = box3([-1, -1, -1], [1, 1, 1], { coordinateSystem: 'service_route' });
  const extreme = route3([
    [-Number.MAX_VALUE, 0, 0], [Number.MAX_VALUE, 0, 0],
  ], { coordinateSystem: 'service_route' });
  assert.throws(() => evaluateFitRelationV4({
    relation: 'NO_INTERSECTION', required: zone, available: extreme,
  }), /finite/);
});

test('geometry CONTAINS supports box3, route3 and sweep3 without scalarization', () => {
  const container = box3([0, 0, 0], [100, 100, 100], { coordinateSystem: 'delivery_path' });
  const route = route3([[10, 10, 10], [90, 90, 90]], { coordinateSystem: 'delivery_path' });
  const sweep = sweep3([[10, 10, 10], [90, 90, 90]], [5, 5, 5], [95, 95, 95], { coordinateSystem: 'delivery_path' });
  assert.equal(evaluateFitRelationV4({ relation: 'CONTAINS', required: route, available: container }).status, 'PASS');
  assert.equal(evaluateFitRelationV4({ relation: 'CONTAINS', required: sweep, available: container }).status, 'PASS');
  const outside = evaluateFitRelationV4({ relation: 'CONTAINS', required: route3([[10, 10, 10], [110, 90, 90]], { coordinateSystem: 'delivery_path' }), available: container });
  assert.equal(outside.status, 'FAIL');
  assert.deepEqual(outside.witness, geometry('point3', [110, 90, 90], { coordinateSystem: 'delivery_path' }));
});

test('REQUIRED_CONTAINS keeps manufacturer permitted zones on the required side', () => {
  const permitted = box3([0, 0, 0], [100, 100, 100], { coordinateSystem: 'service_route' });
  const inside = route3([[10, 10, 10], [90, 90, 90]], { coordinateSystem: 'service_route' });
  const outside = route3([[10, 10, 10], [110, 90, 90]], { coordinateSystem: 'service_route' });
  assert.equal(evaluateFitRelationV4({ relation: 'REQUIRED_CONTAINS', required: permitted, available: inside }).status, 'PASS');
  assert.equal(evaluateFitRelationV4({ relation: 'REQUIRED_CONTAINS', required: permitted, available: outside }).status, 'FAIL');
  assert.throws(() => evaluateFitRelationV4({ relation: 'REQUIRED_CONTAINS', required: inside, available: permitted }), /shape|dimension/i);
});

test('repeated measurements share all five identity dimensions', () => {
  const combined = combineRepeatedMeasurements({ measurements: [exact(602), exact(600), exact(601)], limiting: 'MINIMUM' });
  assert.deepEqual(combined, exact(600));
  for (const override of [
    { unit: 'cm' }, { coordinateSystem: 'delivery_path' }, { datum: 'rear_wall' },
    { axis: 'y' }, { geometryId: 'other_width' },
  ]) {
    assert.throws(() => combineRepeatedMeasurements({ measurements: [exact(600), exact(601, override)], limiting: 'MINIMUM' }), /share/);
  }
});

const span = (geometryId, start, end, overrides = {}) => ({
  geometryId, coordinateSystem: 'cavity', datum: 'cabinet_left', axis: 'x',
  start, end, ...overrides,
});

test('MAX composition verifies bound per-term spans with a shared origin', () => {
  const terms = [
    exact(10, { coordinateSystem: 'cavity', datum: 'cabinet_left', geometryId: 'clearance' }),
    exact(20, { coordinateSystem: 'cavity', datum: 'cabinet_left', geometryId: 'ventilation' }),
  ];
  const result = composeScalarMeasurements({
    operation: 'MAX', terms,
    proof: { coordinateSystem: 'cavity', datum: 'cabinet_left', axis: 'x', spans: [span('clearance', 0, 10), span('ventilation', 0, 20)] },
  });
  assert.deepEqual(result, exact(20, {
    coordinateSystem: 'cavity', datum: 'cabinet_left', geometryId: 'composed:MAX:x',
  }));
  assert.throws(() => composeScalarMeasurements({
    operation: 'MAX', terms,
    proof: { coordinateSystem: 'cavity', datum: 'cabinet_left', axis: 'x', compatibility: 'COLOCATED', termGeometryIds: ['clearance', 'ventilation'] },
  }), /keys|spans/);
  assert.throws(() => composeScalarMeasurements({
    operation: 'MAX', terms,
    proof: { coordinateSystem: 'cavity', datum: 'cabinet_left', axis: 'x', spans: [span('clearance', 0, 10), span('ventilation', 1, 21)] },
  }), /origin/);
});

test('SUM composition verifies ordered contiguous spans with exact lengths', () => {
  const terms = [
    exact(10, { coordinateSystem: 'cavity', datum: 'cabinet_left', geometryId: 'body' }),
    exact(20, { coordinateSystem: 'cavity', datum: 'cabinet_left', geometryId: 'rear_space' }),
  ];
  const validProof = { coordinateSystem: 'cavity', datum: 'cabinet_left', axis: 'x', spans: [span('body', 0, 10), span('rear_space', 10, 30)] };
  assert.equal(composeScalarMeasurements({ operation: 'SUM', terms, proof: validProof }).value, 30);
  const invalidSpans = [
    [span('body', 10, 0), span('rear_space', 10, 30)],
    [span('body', 0, 10, { axis: 'y' }), span('rear_space', 10, 30)],
    [span('body', 0, 10, { coordinateSystem: 'other' }), span('rear_space', 10, 30)],
    [span('body', 0, 10, { datum: 'other' }), span('rear_space', 10, 30)],
    [span('wrong', 0, 10), span('rear_space', 10, 30)],
    [span('body', 0, 9), span('rear_space', 9, 29)],
    [span('body', 0, 10), span('rear_space', 11, 31)],
    [span('body', 0, 10), span('rear_space', 9, 29)],
    [span('body', 0, 10), span('rear_space', 10, 30), span('extra', 30, 31)],
  ];
  for (const spans of invalidSpans) {
    assert.throws(() => composeScalarMeasurements({
      operation: 'SUM', terms,
      proof: { coordinateSystem: 'cavity', datum: 'cabinet_left', axis: 'x', spans },
    }), /span|axis|coordinate|datum|geometry|contiguous|length|reversed/);
  }
});

test('composition rejects duplicate geometry IDs and reused physical spans', () => {
  const duplicateTerms = [
    exact(10, { coordinateSystem: 'cavity', datum: 'cabinet_left', geometryId: 'same' }),
    exact(20, { coordinateSystem: 'cavity', datum: 'cabinet_left', geometryId: 'same' }),
  ];
  assert.throws(() => composeScalarMeasurements({
    operation: 'MAX', terms: duplicateTerms,
    proof: { coordinateSystem: 'cavity', datum: 'cabinet_left', axis: 'x', spans: [span('same', 0, 10), span('same', 0, 20)] },
  }), /duplicate.*geometry/i);

  const uniqueTerms = [
    exact(10, { coordinateSystem: 'cavity', datum: 'cabinet_left', geometryId: 'body' }),
    exact(10, { coordinateSystem: 'cavity', datum: 'cabinet_left', geometryId: 'rear_space' }),
  ];
  assert.throws(() => composeScalarMeasurements({
    operation: 'SUM', terms: uniqueTerms,
    proof: { coordinateSystem: 'cavity', datum: 'cabinet_left', axis: 'x', spans: [span('body', 0, 10), span('rear_space', 0, 10)] },
  }), /duplicate|reused/i);
});

test('results and typed finite intersection witnesses are immutable and repeatable', () => {
  const input = { relation: 'NO_INTERSECTION', required: box3([10, 10, 10], [20, 20, 20]), available: route3([[0, 15, 15], [30, 15, 15]]) };
  const snapshot = structuredClone(input);
  const first = evaluateFitRelationV4(input);
  const second = evaluateFitRelationV4(structuredClone(input));
  assert.deepEqual(first, second);
  assert.deepEqual(input, snapshot);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.intersection), true);
  assert.deepEqual(first.intersection.value.every(Number.isFinite), true);
});
