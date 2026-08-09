export const FIT_RELATIONS_V4 = Object.freeze([
  'MIN_REQUIRED',
  'MAX_ALLOWED',
  'WITHIN_RANGE',
  'CONTAINS',
  'REQUIRED_CONTAINS',
  'PROHIBITED_ZONE',
  'NO_INTERSECTION',
  'EXACT_MATCH',
  'REQUIRES_TRUE',
  'NOT_MEMBER_OF',
  'SET_CONTAINS',
]);

const GEOMETRY_KINDS = new Set(['box3', 'polygon2', 'route3', 'sweep3']);
const CATEGORICAL_RELATIONS = new Set(['EXACT_MATCH', 'REQUIRES_TRUE', 'NOT_MEMBER_OF', 'SET_CONTAINS']);
const CATEGORICAL_VALUE_TYPES = new Set(['boolean', 'string', 'enum', 'enum_set', 'connector']);
const ENDPOINTS = new Set(['open', 'closed']);

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function exactKeys(value, allowed, required, name) {
  const keys = Object.keys(object(value, name)).sort();
  const allowedSet = new Set(allowed);
  const extras = keys.filter((key) => !allowedSet.has(key));
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  if (extras.length || missing.length) {
    throw new TypeError(`${name} keys invalid; extra=${extras.join(',')}; missing=${missing.join(',')}`);
  }
}

function text(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}

function point(value, dimensions, name) {
  if (!Array.isArray(value) || value.length !== dimensions) {
    throw new TypeError(`${name} must be a ${dimensions}-coordinate array`);
  }
  return value.map((coordinate, index) => finite(coordinate, `${name}[${index}]`));
}

function endpoint(value, name) {
  if (!ENDPOINTS.has(value)) throw new TypeError(`${name} must be open or closed`);
  return value;
}

function measurementIdentity(input, name) {
  return {
    unit: input.unit === null ? null : text(input.unit, `${name}.unit`),
    coordinateSystem: text(input.coordinateSystem, `${name}.coordinateSystem`),
    datum: text(input.datum, `${name}.datum`),
    axis: text(input.axis, `${name}.axis`),
    geometryId: text(input.geometryId, `${name}.geometryId`),
  };
}

function scalarInterval(value, name) {
  const input = object(value, name);
  const common = ['kind', 'unit', 'coordinateSystem', 'datum', 'axis', 'geometryId'];
  const identity = measurementIdentity(input, name);
  if (input.kind === 'DETERMINISTIC' || input.kind === 'ESTIMATE') {
    exactKeys(input, [...common, 'value'], [...common, 'value'], name);
    const exact = finite(input.value, `${name}.value`);
    if (input.kind === 'ESTIMATE') return { kind: input.kind, value: exact, ...identity };
    return {
      kind: input.kind, minimum: exact, maximum: exact,
      minimumEndpoint: 'closed', maximumEndpoint: 'closed', ...identity,
    };
  }
  if (input.kind === 'DETERMINISTIC_BOUND') {
    exactKeys(input, [...common, 'value', 'direction'], [...common, 'value', 'direction'], name);
    const bound = finite(input.value, `${name}.value`);
    if (!['LOWER', 'UPPER'].includes(input.direction)) {
      throw new TypeError(`${name}.direction must be LOWER or UPPER`);
    }
    return input.direction === 'LOWER'
      ? { kind: input.kind, minimum: bound, maximum: Infinity, minimumEndpoint: 'closed', maximumEndpoint: 'open', ...identity }
      : { kind: input.kind, minimum: -Infinity, maximum: bound, minimumEndpoint: 'open', maximumEndpoint: 'closed', ...identity };
  }
  if (input.kind === 'COVERAGE_INTERVAL') {
    const rangeKeys = [...common, 'minimum', 'maximum', 'minimumEndpoint', 'maximumEndpoint'];
    exactKeys(input, rangeKeys, rangeKeys, name);
    const minimum = finite(input.minimum, `${name}.minimum`);
    const maximum = finite(input.maximum, `${name}.maximum`);
    if (minimum > maximum) throw new RangeError(`${name}.minimum cannot exceed maximum`);
    const minimumEndpoint = endpoint(input.minimumEndpoint, `${name}.minimumEndpoint`);
    const maximumEndpoint = endpoint(input.maximumEndpoint, `${name}.maximumEndpoint`);
    if (minimum === maximum && (minimumEndpoint === 'open' || maximumEndpoint === 'open')) {
      throw new RangeError(`${name} cannot be an empty interval`);
    }
    return { kind: input.kind, minimum, maximum, minimumEndpoint, maximumEndpoint, ...identity };
  }
  throw new TypeError(`${name}.kind is not a supported scalar measurement kind`);
}

function identityMismatch(required, available, relation) {
  for (const [key, reasonCode] of [
    ['unit', 'UNIT_MISMATCH'],
    ['coordinateSystem', 'COORDINATE_SYSTEM_MISMATCH'],
    ['datum', 'DATUM_MISMATCH'],
    ['axis', 'AXIS_MISMATCH'],
    ['geometryId', 'GEOMETRY_MISMATCH'],
  ]) {
    if (required[key] !== available[key]) return freezeDeep({ status: 'UNKNOWN', relation, reasonCode });
  }
  return null;
}

function publicInterval(value) {
  return {
    minimum: Number.isFinite(value.minimum) ? value.minimum : null,
    maximum: Number.isFinite(value.maximum) ? value.maximum : null,
    minimumEndpoint: value.minimumEndpoint,
    maximumEndpoint: value.maximumEndpoint,
  };
}

function scalarResult({ status, relation, reasonCode, required, available, margin }) {
  return freezeDeep({
    status, relation, reasonCode,
    required: publicInterval(required),
    available: publicInterval(available),
    margin: Number.isFinite(margin) ? margin : null,
    unit: required.unit,
  });
}

function categoricalValue(valueType, value, name) {
  if (!CATEGORICAL_VALUE_TYPES.has(valueType)) throw new TypeError(`${name}.valueType is not categorical`);
  if (valueType === 'boolean') {
    if (typeof value !== 'boolean') throw new TypeError(`${name}.value boolean required`);
    return value;
  }
  if (valueType === 'string' || valueType === 'enum') return text(value, `${name}.value`);
  if (valueType === 'enum_set') {
    if (!Array.isArray(value) || value.length === 0) throw new TypeError(`${name}.value enum set required`);
    const accepted = value.map((item, index) => text(item, `${name}.value[${index}]`));
    if (new Set(accepted).size !== accepted.length) throw new TypeError(`${name}.value enum set duplicate`);
    return accepted.sort();
  }
  const connector = object(value, `${name}.value`);
  const allowed = Object.hasOwn(connector, 'size') ? ['type', 'size'] : ['type'];
  exactKeys(connector, allowed, allowed, `${name}.value`);
  const accepted = { type: text(connector.type, `${name}.value.type`) };
  if (Object.hasOwn(connector, 'size')) {
    accepted.size = finite(connector.size, `${name}.value.size`);
    if (accepted.size < 0) throw new RangeError(`${name}.value.size must be non-negative`);
  }
  return accepted;
}

function categoricalMeasurement(value, name) {
  const input = object(value, name);
  if (!Object.hasOwn(input, 'valueType')) throw new TypeError(`${name} categorical value type required`);
  const keys = ['kind', 'valueType', 'value', 'unit', 'coordinateSystem', 'datum', 'axis', 'geometryId'];
  exactKeys(input, keys, keys, name);
  if (input.kind !== 'DETERMINISTIC') throw new TypeError(`${name}.kind must be DETERMINISTIC for categorical evidence`);
  return {
    kind: input.kind,
    valueType: text(input.valueType, `${name}.valueType`),
    value: categoricalValue(input.valueType, input.value, name),
    ...measurementIdentity(input, name),
  };
}

function categoricalResult(status, relation, reasonCode, required, available) {
  return freezeDeep({
    status,
    relation,
    reasonCode,
    required: required.value,
    available: available.value,
  });
}

function categoricalRelation(relation, requiredInput, availableInput) {
  const required = categoricalMeasurement(requiredInput, 'required');
  const available = categoricalMeasurement(availableInput, 'available');
  const mismatch = identityMismatch(required, available, relation);
  if (mismatch) return mismatch;

  if (relation === 'EXACT_MATCH') {
    if (required.valueType !== available.valueType) throw new TypeError('EXACT_MATCH categorical value types must match');
    const matched = JSON.stringify(required.value) === JSON.stringify(available.value);
    return categoricalResult(matched ? 'PASS' : 'FAIL', relation, matched ? 'EXACT_VALUE_MATCH' : 'EXACT_VALUE_MISMATCH', required, available);
  }
  if (relation === 'REQUIRES_TRUE') {
    if (required.valueType !== 'boolean' || available.valueType !== 'boolean') {
      throw new TypeError('REQUIRES_TRUE accepts boolean values only');
    }
    const satisfied = required.value === false || available.value === true;
    return categoricalResult(satisfied ? 'PASS' : 'FAIL', relation, satisfied ? 'BOOLEAN_REQUIREMENT_SATISFIED' : 'BOOLEAN_REQUIREMENT_FAILED', required, available);
  }
  if (relation === 'NOT_MEMBER_OF') {
    if (required.valueType !== 'enum_set' || !['enum', 'string'].includes(available.valueType)) {
      throw new TypeError('NOT_MEMBER_OF requires an enum set and one enum/string value');
    }
    const prohibited = required.value.includes(available.value);
    return categoricalResult(prohibited ? 'FAIL' : 'PASS', relation, prohibited ? 'PROHIBITED_MEMBER' : 'MEMBER_NOT_PROHIBITED', required, available);
  }
  if (required.valueType !== 'enum_set' || available.valueType !== 'enum_set') {
    throw new TypeError('SET_CONTAINS requires two enum sets');
  }
  const missing = available.value.find((item) => !required.value.includes(item));
  return categoricalResult(missing ? 'FAIL' : 'PASS', relation, missing ? 'SET_MEMBER_NOT_ALLOWED' : 'SET_CONTAINED', required, available);
}

function minimumRequired(relation, required, available, equality) {
  const exclusive = equality === 'open';
  const passMargin = available.minimum - required.maximum;
  const failMargin = available.maximum - required.minimum;
  const passOpenTouch = required.maximumEndpoint === 'open' || available.minimumEndpoint === 'open';
  const failOpenTouch = required.minimumEndpoint === 'open' || available.maximumEndpoint === 'open';
  if (passMargin > 0 || (passMargin === 0 && (!exclusive || passOpenTouch))) {
    return scalarResult({ status: 'PASS', relation, reasonCode: 'PROVEN_PASS', required, available, margin: passMargin });
  }
  if (failMargin < 0 || (failMargin === 0 && (exclusive || failOpenTouch))) {
    return scalarResult({ status: 'FAIL', relation, reasonCode: 'PROVEN_FAIL', required, available, margin: failMargin });
  }
  return scalarResult({ status: 'UNKNOWN', relation, reasonCode: 'INTERVAL_OVERLAP', required, available, margin: null });
}

function maximumAllowed(relation, required, available, equality) {
  const exclusive = equality === 'open';
  const passMargin = required.minimum - available.maximum;
  const failMargin = required.maximum - available.minimum;
  const passOpenTouch = required.minimumEndpoint === 'open' || available.maximumEndpoint === 'open';
  const failOpenTouch = required.maximumEndpoint === 'open' || available.minimumEndpoint === 'open';
  if (passMargin > 0 || (passMargin === 0 && (!exclusive || passOpenTouch))) {
    return scalarResult({ status: 'PASS', relation, reasonCode: 'PROVEN_PASS', required, available, margin: passMargin });
  }
  if (failMargin < 0 || (failMargin === 0 && (exclusive || failOpenTouch))) {
    return scalarResult({ status: 'FAIL', relation, reasonCode: 'PROVEN_FAIL', required, available, margin: failMargin });
  }
  return scalarResult({ status: 'UNKNOWN', relation, reasonCode: 'INTERVAL_OVERLAP', required, available, margin: null });
}

function lowerContained(inner, outer) {
  if (inner.minimum !== outer.minimum) return inner.minimum > outer.minimum;
  return outer.minimumEndpoint === 'closed' || inner.minimumEndpoint === 'open';
}

function upperContained(inner, outer) {
  if (inner.maximum !== outer.maximum) return inner.maximum < outer.maximum;
  return outer.maximumEndpoint === 'closed' || inner.maximumEndpoint === 'open';
}

function intervalsDisjoint(left, right) {
  if (left.maximum < right.minimum || right.maximum < left.minimum) return true;
  if (left.maximum === right.minimum) return left.maximumEndpoint === 'open' || right.minimumEndpoint === 'open';
  if (right.maximum === left.minimum) return right.maximumEndpoint === 'open' || left.minimumEndpoint === 'open';
  return false;
}

function withinRange(relation, required, available) {
  if (lowerContained(available, required) && upperContained(available, required)) {
    return scalarResult({ status: 'PASS', relation, reasonCode: 'PROVEN_PASS', required, available, margin: Math.min(available.minimum - required.minimum, required.maximum - available.maximum) });
  }
  if (intervalsDisjoint(required, available) || available.minimum === available.maximum) {
    return scalarResult({ status: 'FAIL', relation, reasonCode: 'PROVEN_FAIL', required, available, margin: null });
  }
  return scalarResult({ status: 'UNKNOWN', relation, reasonCode: 'INTERVAL_OVERLAP', required, available, margin: null });
}

function scalarContains(relation, required, available) {
  if (lowerContained(required, available) && upperContained(required, available)) {
    return scalarResult({ status: 'PASS', relation, reasonCode: 'PROVEN_PASS', required, available, margin: Math.min(required.minimum - available.minimum, available.maximum - required.maximum) });
  }
  if (intervalsDisjoint(required, available)) {
    return scalarResult({ status: 'FAIL', relation, reasonCode: 'PROVEN_FAIL', required, available, margin: null });
  }
  return scalarResult({ status: 'UNKNOWN', relation, reasonCode: 'INTERVAL_OVERLAP', required, available, margin: null });
}

function geometryIdentity(input, name) {
  return {
    unit: text(input.unit, `${name}.unit`),
    coordinateSystem: text(input.coordinateSystem, `${name}.coordinateSystem`),
    datum: text(input.datum, `${name}.datum`),
  };
}

function normalizedBox3(value, name) {
  exactKeys(value, ['min', 'max'], ['min', 'max'], name);
  const min = point(value.min, 3, `${name}.min`);
  const max = point(value.max, 3, `${name}.max`);
  if (min.some((coordinate, index) => coordinate > max[index])) {
    throw new RangeError(`${name} box3 bounds are reversed`);
  }
  return { min, max };
}

function normalizedRoute3(value, name) {
  if (!Array.isArray(value) || value.length < 2) throw new TypeError(`${name} route3 requires at least two points`);
  return value.map((item, index) => point(item, 3, `${name}[${index}]`));
}

function signedArea(points) {
  return points.reduce((sum, current, index) => {
    const next = points[(index + 1) % points.length];
    return sum + current[0] * next[1] - next[0] * current[1];
  }, 0) / 2;
}

function normalizedPolygon2(value, name) {
  if (!Array.isArray(value) || value.length < 3) throw new TypeError(`${name} polygon2 requires at least three points`);
  const points = value.map((item, index) => point(item, 2, `${name}[${index}]`));
  if (signedArea(points) === 0) throw new TypeError(`${name} polygon2 area must be non-zero`);
  for (let left = 0; left < points.length; left += 1) {
    const leftNext = (left + 1) % points.length;
    for (let right = left + 1; right < points.length; right += 1) {
      const rightNext = (right + 1) % points.length;
      if (right === leftNext || left === rightNext) continue;
      if (segmentIntersection2(points[left], points[leftNext], points[right], points[rightNext])) {
        throw new TypeError(`${name} polygon2 must not self-intersect`);
      }
    }
  }
  return points;
}

function pointInBox(pointValue, box) {
  return pointValue.every((coordinate, axis) => coordinate >= box.min[axis] && coordinate <= box.max[axis]);
}

function normalizedGeometry(value, name) {
  const input = object(value, name);
  exactKeys(input, ['kind', 'value', 'unit', 'coordinateSystem', 'datum'], ['kind', 'value', 'unit', 'coordinateSystem', 'datum'], name);
  if (!GEOMETRY_KINDS.has(input.kind)) throw new TypeError(`${name}.kind is not canonical Task 1 geometry`);
  const identity = geometryIdentity(input, name);
  if (input.kind === 'box3') return { kind: input.kind, value: normalizedBox3(input.value, `${name}.value`), ...identity };
  if (input.kind === 'route3') return { kind: input.kind, value: normalizedRoute3(input.value, `${name}.value`), ...identity };
  if (input.kind === 'polygon2') return { kind: input.kind, value: normalizedPolygon2(input.value, `${name}.value`), ...identity };
  exactKeys(input.value, ['path', 'envelope'], ['path', 'envelope'], `${name}.value`);
  const path = normalizedRoute3(input.value.path, `${name}.value.path`);
  const envelope = normalizedBox3(input.value.envelope, `${name}.value.envelope`);
  if (path.some((pathPoint) => !pointInBox(pathPoint, envelope))) {
    throw new RangeError(`${name} sweep3 path must be inside its evidence-bound envelope`);
  }
  return { kind: input.kind, value: { path, envelope }, ...identity };
}

function geometryMismatch(left, right, relation) {
  for (const [key, reasonCode] of [
    ['unit', 'UNIT_MISMATCH'],
    ['coordinateSystem', 'COORDINATE_SYSTEM_MISMATCH'],
    ['datum', 'DATUM_MISMATCH'],
  ]) {
    if (left[key] !== right[key]) return freezeDeep({ status: 'UNKNOWN', relation, reasonCode });
  }
  return null;
}

function witness(kind, value, identity) {
  let normalizedValue;
  if (kind === 'box3') normalizedValue = normalizedBox3(value, 'intersection witness');
  else if (kind === 'point3') normalizedValue = point(value, 3, 'intersection witness');
  else if (kind === 'point2') normalizedValue = point(value, 2, 'intersection witness');
  else throw new TypeError(`intersection witness kind unsupported: ${kind}`);
  return freezeDeep({ kind, value: normalizedValue, unit: identity.unit, coordinateSystem: identity.coordinateSystem, datum: identity.datum });
}

function boxIntersection(left, right, identity) {
  const min = left.min.map((coordinate, axis) => Math.max(coordinate, right.min[axis]));
  const max = left.max.map((coordinate, axis) => Math.min(coordinate, right.max[axis]));
  return min.some((coordinate, axis) => coordinate > max[axis]) ? null : witness('box3', { min, max }, identity);
}

function segmentBoxIntersection(start, end, box, identity) {
  let entry = 0;
  let exit = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const delta = end[axis] - start[axis];
    for (const [p, q] of [[-delta, start[axis] - box.min[axis]], [delta, box.max[axis] - start[axis]]]) {
      if (p === 0 && q < 0) return null;
      if (p === 0) continue;
      const ratio = q / p;
      if (p < 0) entry = Math.max(entry, ratio);
      else exit = Math.min(exit, ratio);
      if (entry > exit) return null;
    }
  }
  return witness('point3', start.map((coordinate, axis) => coordinate + entry * (end[axis] - coordinate)), identity);
}

function routeBoxIntersection(route, box, identity) {
  for (let index = 1; index < route.length; index += 1) {
    const found = segmentBoxIntersection(route[index - 1], route[index], box, identity);
    if (found) return found;
  }
  return null;
}

function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment(candidate, start, end) {
  return cross(start, end, candidate) === 0
    && candidate[0] >= Math.min(start[0], end[0]) && candidate[0] <= Math.max(start[0], end[0])
    && candidate[1] >= Math.min(start[1], end[1]) && candidate[1] <= Math.max(start[1], end[1]);
}

function segmentIntersection2(a, b, c, d) {
  const denominator = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (denominator !== 0) {
    const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / denominator;
    const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    return null;
  }
  const shared = [a, b, c, d]
    .filter((candidate) => pointOnSegment(candidate, a, b) && pointOnSegment(candidate, c, d))
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  return shared[0] ?? null;
}

function pointInPolygon(candidate, polygon) {
  for (let index = 0; index < polygon.length; index += 1) {
    if (pointOnSegment(candidate, polygon[index], polygon[(index + 1) % polygon.length])) return true;
  }
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current];
    const b = polygon[previous];
    if ((a[1] > candidate[1]) !== (b[1] > candidate[1])
      && candidate[0] < ((b[0] - a[0]) * (candidate[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function polygonIntersection(left, right, identity) {
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const a = left[leftIndex];
    const b = left[(leftIndex + 1) % left.length];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const found = segmentIntersection2(a, b, right[rightIndex], right[(rightIndex + 1) % right.length]);
      if (found) return witness('point2', found, identity);
    }
  }
  if (pointInPolygon(left[0], right)) return witness('point2', left[0], identity);
  if (pointInPolygon(right[0], left)) return witness('point2', right[0], identity);
  return null;
}

function sweepEnvelope(geometryValue) {
  return geometryValue.kind === 'sweep3' ? geometryValue.value.envelope : geometryValue.value;
}

function intersectionOf(left, right) {
  const identity = left;
  const leftKind = left.kind === 'sweep3' ? 'box3' : left.kind;
  const rightKind = right.kind === 'sweep3' ? 'box3' : right.kind;
  const leftValue = sweepEnvelope(left);
  const rightValue = sweepEnvelope(right);
  if (leftKind === 'box3' && rightKind === 'box3') return boxIntersection(leftValue, rightValue, identity);
  if (leftKind === 'route3' && rightKind === 'box3') return routeBoxIntersection(leftValue, rightValue, identity);
  if (leftKind === 'box3' && rightKind === 'route3') return routeBoxIntersection(rightValue, leftValue, identity);
  if (leftKind === 'polygon2' && rightKind === 'polygon2') return polygonIntersection(leftValue, rightValue, identity);
  throw new TypeError(`geometry shape/dimension mismatch: ${left.kind} vs ${right.kind}`);
}

function boxContainsPoint(box, candidate) {
  return pointInBox(candidate, box);
}

function boxContainsGeometry(box, item) {
  if (item.kind === 'box3') return item.value.min.every((coordinate, axis) => coordinate >= box.min[axis])
    && item.value.max.every((coordinate, axis) => coordinate <= box.max[axis]);
  if (item.kind === 'route3') return item.value.every((candidate) => boxContainsPoint(box, candidate));
  if (item.kind === 'sweep3') {
    const envelope = item.value.envelope;
    return envelope.min.every((coordinate, axis) => coordinate >= box.min[axis])
      && envelope.max.every((coordinate, axis) => coordinate <= box.max[axis]);
  }
  throw new TypeError(`geometry shape/dimension mismatch: box3 cannot contain ${item.kind}`);
}

function firstPointOutsideBox(box, item) {
  if (item.kind === 'box3') {
    return [item.value.min, item.value.max].find((candidate) => !pointInBox(candidate, box));
  }
  if (item.kind === 'route3') return item.value.find((candidate) => !pointInBox(candidate, box));
  if (item.kind === 'sweep3') {
    return [item.value.envelope.min, item.value.envelope.max]
      .find((candidate) => !pointInBox(candidate, box));
  }
  return null;
}

function polygonIsConvex(polygon) {
  let direction = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const turn = cross(polygon[index], polygon[(index + 1) % polygon.length], polygon[(index + 2) % polygon.length]);
    if (turn === 0) continue;
    if (direction === 0) direction = Math.sign(turn);
    else if (Math.sign(turn) !== direction) return false;
  }
  return true;
}

function geometryContains(required, available, relation) {
  let contained;
  let outside;
  if (available.kind === 'box3') {
    contained = boxContainsGeometry(available.value, required);
    if (!contained) outside = witness('point3', firstPointOutsideBox(available.value, required), available);
  } else if (available.kind === 'polygon2' && required.kind === 'polygon2') {
    if (!polygonIsConvex(available.value)) throw new TypeError('polygon2 CONTAINS requires a convex container');
    contained = required.value.every((candidate) => pointInPolygon(candidate, available.value));
    if (!contained) outside = witness('point2', required.value.find((candidate) => !pointInPolygon(candidate, available.value)), available);
  } else {
    throw new TypeError(`geometry shape/dimension mismatch: ${available.kind} cannot contain ${required.kind}`);
  }
  return freezeDeep({
    status: contained ? 'PASS' : 'FAIL', relation,
    reasonCode: contained ? 'GEOMETRY_CONTAINED' : 'GEOMETRY_OUTSIDE',
    witness: contained ? null : outside,
  });
}

function geometryRelation(relation, requiredInput, availableInput) {
  const required = normalizedGeometry(requiredInput, 'required');
  const available = normalizedGeometry(availableInput, 'available');
  const requiredKind = required.kind === 'sweep3' ? 'box3' : required.kind;
  const availableKind = available.kind === 'sweep3' ? 'box3' : available.kind;
  const supported = relation === 'CONTAINS'
    ? (available.kind === 'box3' && ['box3', 'route3', 'sweep3'].includes(required.kind))
      || (available.kind === 'polygon2' && required.kind === 'polygon2')
    : relation === 'REQUIRED_CONTAINS'
      ? (required.kind === 'box3' && ['box3', 'route3', 'sweep3'].includes(available.kind))
        || (required.kind === 'polygon2' && available.kind === 'polygon2')
    : (requiredKind === 'box3' && availableKind === 'box3')
      || (requiredKind === 'route3' && availableKind === 'box3')
      || (requiredKind === 'box3' && availableKind === 'route3')
      || (requiredKind === 'polygon2' && availableKind === 'polygon2');
  if (!supported) throw new TypeError(`geometry shape/dimension mismatch: ${required.kind} vs ${available.kind}`);
  const mismatch = geometryMismatch(required, available, relation);
  if (mismatch) return mismatch;
  if (relation === 'CONTAINS') return geometryContains(required, available, relation);
  if (relation === 'REQUIRED_CONTAINS') return geometryContains(available, required, relation);
  const intersection = intersectionOf(required, available);
  return freezeDeep({
    status: intersection ? 'FAIL' : 'PASS', relation,
    reasonCode: intersection ? 'GEOMETRY_INTERSECTION' : 'GEOMETRY_CLEAR',
    intersection,
  });
}

function isGeometry(value) {
  return Boolean(value && typeof value === 'object' && GEOMETRY_KINDS.has(value.kind));
}

export function evaluateFitRelationV4(input) {
  const value = object(input, 'input');
  if (!FIT_RELATIONS_V4.includes(value.relation)) throw new TypeError('relation is not supported');
  if (CATEGORICAL_RELATIONS.has(value.relation)) {
    exactKeys(value, ['relation', 'required', 'available'], ['relation', 'required', 'available'], 'input');
    return categoricalRelation(value.relation, value.required, value.available);
  }
  const geometryInput = isGeometry(value.required) || isGeometry(value.available)
    || ['PROHIBITED_ZONE', 'NO_INTERSECTION'].includes(value.relation);
  if (geometryInput) {
    if (Object.hasOwn(value, 'equality')) throw new TypeError('equality is not allowed for geometry relations');
    exactKeys(value, ['relation', 'required', 'available'], ['relation', 'required', 'available'], 'input');
    if (!['CONTAINS', 'REQUIRED_CONTAINS', 'PROHIBITED_ZONE', 'NO_INTERSECTION'].includes(value.relation)) {
      throw new TypeError(`${value.relation} does not accept geometry`);
    }
    return geometryRelation(value.relation, value.required, value.available);
  }

  const equalityAllowed = ['MIN_REQUIRED', 'MAX_ALLOWED'].includes(value.relation);
  if (!equalityAllowed && Object.hasOwn(value, 'equality')) throw new TypeError(`equality is not allowed for ${value.relation}`);
  exactKeys(value, ['relation', 'required', 'available', ...(equalityAllowed ? ['equality'] : [])], ['relation', 'required', 'available'], 'input');
  if (!['MIN_REQUIRED', 'MAX_ALLOWED', 'WITHIN_RANGE', 'CONTAINS'].includes(value.relation)) {
    throw new TypeError(`${value.relation} requires geometry`);
  }
  if (value.equality !== undefined && !ENDPOINTS.has(value.equality)) {
    throw new TypeError('equality must be open or closed');
  }
  const required = scalarInterval(value.required, 'required');
  const available = scalarInterval(value.available, 'available');
  const mismatch = identityMismatch(required, available, value.relation);
  if (mismatch) return mismatch;
  if (required.kind === 'ESTIMATE' || available.kind === 'ESTIMATE') {
    return freezeDeep({ status: 'UNKNOWN', relation: value.relation, reasonCode: 'ESTIMATE_NOT_DECISIVE' });
  }
  if (value.relation === 'MIN_REQUIRED') return minimumRequired(value.relation, required, available, value.equality ?? 'closed');
  if (value.relation === 'MAX_ALLOWED') return maximumAllowed(value.relation, required, available, value.equality ?? 'closed');
  if (value.relation === 'WITHIN_RANGE') return withinRange(value.relation, required, available);
  return scalarContains(value.relation, required, available);
}

export function combineRepeatedMeasurements(input) {
  const value = object(input, 'input');
  exactKeys(value, ['measurements', 'limiting'], ['measurements', 'limiting'], 'input');
  if (!Array.isArray(value.measurements) || value.measurements.length === 0) throw new TypeError('measurements must be a non-empty array');
  if (!['MINIMUM', 'MAXIMUM'].includes(value.limiting)) throw new TypeError('limiting must be MINIMUM or MAXIMUM');
  const measurements = value.measurements.map((item, index) => {
    const parsed = scalarInterval(item, `measurements[${index}]`);
    if (parsed.kind !== 'DETERMINISTIC') throw new TypeError('repeated measurements must be deterministic');
    return parsed;
  });
  const first = measurements[0];
  for (const current of measurements.slice(1)) {
    if (['unit', 'coordinateSystem', 'datum', 'axis', 'geometryId'].some((key) => current[key] !== first[key])) {
      throw new TypeError('repeated measurements must share unit, coordinate system, datum, axis and geometry');
    }
  }
  const selected = value.limiting === 'MINIMUM'
    ? Math.min(...measurements.map((item) => item.minimum))
    : Math.max(...measurements.map((item) => item.maximum));
  return freezeDeep({ kind: 'DETERMINISTIC', value: selected, unit: first.unit, coordinateSystem: first.coordinateSystem, datum: first.datum, axis: first.axis, geometryId: first.geometryId });
}

function normalizedSpan(value, term, proof, index) {
  const name = `proof.spans[${index}]`;
  exactKeys(value, ['geometryId', 'coordinateSystem', 'datum', 'axis', 'start', 'end'], ['geometryId', 'coordinateSystem', 'datum', 'axis', 'start', 'end'], name);
  const span = {
    geometryId: text(value.geometryId, `${name}.geometryId`),
    coordinateSystem: text(value.coordinateSystem, `${name}.coordinateSystem`),
    datum: text(value.datum, `${name}.datum`),
    axis: text(value.axis, `${name}.axis`),
    start: finite(value.start, `${name}.start`),
    end: finite(value.end, `${name}.end`),
  };
  if (span.end < span.start) throw new RangeError(`${name} reversed span rejected`);
  if (span.geometryId !== term.geometryId) throw new TypeError(`${name} geometryId is not bound to term`);
  if (span.coordinateSystem !== proof.coordinateSystem || span.coordinateSystem !== term.coordinateSystem) throw new TypeError(`${name} coordinate system mismatch`);
  if (span.datum !== proof.datum || span.datum !== term.datum) throw new TypeError(`${name} datum mismatch`);
  if (span.axis !== proof.axis || span.axis !== term.axis) throw new TypeError(`${name} axis mismatch`);
  if (span.end - span.start !== term.minimum) throw new TypeError(`${name} length does not equal deterministic term value`);
  return span;
}

export function composeScalarMeasurements(input) {
  const value = object(input, 'input');
  exactKeys(value, ['operation', 'terms', 'proof'], ['operation', 'terms', 'proof'], 'input');
  if (!['MAX', 'SUM'].includes(value.operation)) throw new TypeError('operation must be MAX or SUM');
  if (!Array.isArray(value.terms) || value.terms.length === 0) throw new TypeError('terms must be a non-empty array');
  const proof = object(value.proof, 'proof');
  exactKeys(proof, ['coordinateSystem', 'datum', 'axis', 'spans'], ['coordinateSystem', 'datum', 'axis', 'spans'], 'proof');
  const normalizedProof = {
    coordinateSystem: text(proof.coordinateSystem, 'proof.coordinateSystem'),
    datum: text(proof.datum, 'proof.datum'),
    axis: text(proof.axis, 'proof.axis'),
  };
  if (!['x', 'y', 'z'].includes(normalizedProof.axis)) throw new TypeError('proof.axis must be x, y or z');
  const terms = value.terms.map((term, index) => {
    const parsed = scalarInterval(term, `terms[${index}]`);
    if (parsed.kind !== 'DETERMINISTIC') throw new TypeError('composition terms must be deterministic');
    if (parsed.minimum < 0) throw new RangeError('composition term values must be non-negative');
    return parsed;
  });
  const geometryIds = terms.map((term) => term.geometryId);
  if (new Set(geometryIds).size !== geometryIds.length) {
    throw new TypeError('composition terms contain duplicate geometryId values');
  }
  if (!Array.isArray(proof.spans) || proof.spans.length !== terms.length) {
    throw new TypeError('proof spans must bind every term exactly once in order');
  }
  const unit = terms[0].unit;
  if (terms.some((term) => term.unit !== unit)) throw new TypeError('composition terms must share unit');
  const spans = proof.spans.map((item, index) => normalizedSpan(item, terms[index], normalizedProof, index));
  const spanSignatures = spans.map((item) => JSON.stringify([
    item.coordinateSystem, item.datum, item.axis, item.start, item.end,
  ]));
  if (new Set(spanSignatures).size !== spanSignatures.length) {
    throw new TypeError('composition proof contains a duplicate or reused physical span');
  }
  let result;
  if (value.operation === 'MAX') {
    const origin = spans[0].start;
    if (spans.some((item) => item.start !== origin)) throw new TypeError('MAX spans must share the same origin');
    result = Math.max(...spans.map((item) => item.end)) - origin;
  } else {
    for (let index = 1; index < spans.length; index += 1) {
      if (spans[index].start !== spans[index - 1].end) throw new TypeError('SUM spans must be ordered and exactly contiguous');
    }
    result = spans.at(-1).end - spans[0].start;
  }
  if (!Number.isFinite(result)) throw new RangeError('composition result must be finite');
  return freezeDeep({
    kind: 'DETERMINISTIC', value: result, unit,
    coordinateSystem: normalizedProof.coordinateSystem, datum: normalizedProof.datum,
    axis: normalizedProof.axis, geometryId: `composed:${value.operation}:${normalizedProof.axis}`,
  });
}
