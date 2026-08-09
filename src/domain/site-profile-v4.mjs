import { createHash } from 'node:crypto';

import { validateFitV4FieldMap } from './fit-v4-contract.mjs';

export const SITE_PROFILE_V4_SCHEMA_VERSION = 1;

const SOURCE_KINDS = new Set(['synthetic', 'real_site', 'consented_offline']);
const OBSERVATION_SOURCE_KINDS = new Set(['synthetic', 'real_site_ephemeral', 'consented_offline']);
const OBSERVATION_TYPES = new Set(['measurement', 'fact', 'geometry', 'confirmation']);
const BOUND_KINDS = new Set(['DETERMINISTIC', 'DETERMINISTIC_BOUND', 'COVERAGE_INTERVAL', 'ESTIMATE']);
const VALUE_TYPES = new Set([
  'finite_number', 'integer', 'boolean', 'string', 'enum', 'enum_set', 'connector',
  'box3', 'polygon2', 'route3',
]);
const COORDINATE_SYSTEMS = new Set(['installed_appliance', 'site_cavity', 'service_route', 'delivery_path', 'non_geometric']);
const AXES = new Set(['x', 'y', 'z', 'xy', 'xyz', 'route', 'diameter', 'area', 'none']);
const CONFIGURATION_STATES = new Set(['selected', 'unknown']);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const TOP_LEVEL_KEYS = [
  'schemaVersion', 'profileId', 'sourceKind', 'consent', 'configuration', 'observations',
  'surfaces', 'obstacles', 'operationZones', 'componentSelections',
  'serviceEndpoints', 'serviceRoutes', 'serviceSpecifications', 'holes',
  'connectors', 'access', 'environment', 'support', 'professionalConfirmations',
  'jurisdictionConfirmations', 'delivery',
];
const REFERENCE_GROUPS = [
  'surfaces', 'obstacles', 'operationZones', 'componentSelections',
  'serviceEndpoints', 'serviceRoutes', 'serviceSpecifications', 'holes',
  'connectors', 'access', 'environment', 'support', 'professionalConfirmations',
  'jurisdictionConfirmations',
];
const FORBIDDEN_PRIVACY_KEYS = new Set([
  'address', 'streetaddress', 'postaladdress', 'fulladdress', 'postcode', 'suburb', 'geohash',
  'email', 'phone', 'phonenumber', 'name', 'fullname', 'firstname', 'lastname', 'contactname',
  'householdid', 'residentid', 'propertyid', 'customerid', 'accountid', 'latitude', 'longitude',
]);

const SUBJECTS = Object.freeze({
  'cavity.width': { group: 'surfaces', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'site_cavity', axis: 'x' },
  'cavity.height': { group: 'surfaces', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'site_cavity', axis: 'z' },
  'cavity.depth': { group: 'surfaces', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'site_cavity', axis: 'y' },
  'cavity.availableVolume': { group: 'surfaces', observationType: 'geometry', valueType: 'box3', unit: 'mm', coordinateSystem: 'site_cavity', axis: 'xyz' },
  'placement.leftGap': { group: 'surfaces', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'site_cavity', axis: 'x' },
  'placement.rightGap': { group: 'surfaces', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'site_cavity', axis: 'x' },
  'placement.topGap': { group: 'surfaces', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'site_cavity', axis: 'z' },
  'placement.rearGap': { group: 'surfaces', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'site_cavity', axis: 'y' },
  'surface.wall.left': { group: 'surfaces', observationType: 'fact', valueType: 'boolean', unit: null, coordinateSystem: 'site_cavity', axis: 'xyz' },
  'surface.cabinet.right': { group: 'surfaces', observationType: 'fact', valueType: 'boolean', unit: null, coordinateSystem: 'site_cavity', axis: 'xyz' },
  'surface.skirting.depth': { group: 'surfaces', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'site_cavity', axis: 'y' },
  'support.floor.level': { group: 'surfaces', observationType: 'fact', valueType: 'boolean', unit: null, coordinateSystem: 'site_cavity', axis: 'xy' },
  'support.cavity.square': { group: 'surfaces', observationType: 'fact', valueType: 'boolean', unit: null, coordinateSystem: 'site_cavity', axis: 'xy' },
  'obstacle.pipe': { group: 'obstacles', observationType: 'geometry', valueType: 'box3', unit: 'mm', coordinateSystem: 'site_cavity', axis: 'xyz' },
  'operation.door.availableDepth': { group: 'operationZones', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'installed_appliance', axis: 'y' },
  'operation.door.availableAngle': { group: 'operationZones', observationType: 'measurement', valueType: 'finite_number', unit: 'degree', coordinateSystem: 'installed_appliance', axis: 'xy' },
  'operation.door.zone': { group: 'operationZones', observationType: 'geometry', valueType: 'polygon2', unit: 'mm', coordinateSystem: 'installed_appliance', axis: 'xy' },
  'operation.hinge.availableSideGap': { group: 'operationZones', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'installed_appliance', axis: 'x' },
  'operation.lid.availableHeight': { group: 'operationZones', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'installed_appliance', axis: 'z' },
  'operation.component.availableRemovalZone': { group: 'operationZones', observationType: 'geometry', valueType: 'box3', unit: 'mm', coordinateSystem: 'installed_appliance', axis: 'xyz' },
  'operation.dishwasher.toeKickDepth': { group: 'operationZones', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'installed_appliance', axis: 'y' },
  'component.dishwasher.panel.weight': { group: 'componentSelections', observationType: 'measurement', valueType: 'finite_number', unit: 'kg', coordinateSystem: 'installed_appliance', axis: 'z' },
  'component.dishwasher.panel.height': { group: 'componentSelections', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'installed_appliance', axis: 'z' },
  'service.power.endpoint': { group: 'serviceEndpoints', observationType: 'geometry', valueType: 'box3', unit: 'mm', coordinateSystem: 'service_route', axis: 'xyz' },
  'service.water.endpoint': { group: 'serviceEndpoints', observationType: 'geometry', valueType: 'box3', unit: 'mm', coordinateSystem: 'service_route', axis: 'xyz' },
  'service.drain.endpoint': { group: 'serviceEndpoints', observationType: 'geometry', valueType: 'box3', unit: 'mm', coordinateSystem: 'service_route', axis: 'xyz' },
  'service.power.socketZone': { group: 'serviceEndpoints', observationType: 'geometry', valueType: 'box3', unit: 'mm', coordinateSystem: 'installed_appliance', axis: 'xyz' },
  'service.hole.zone': { group: 'serviceEndpoints', observationType: 'geometry', valueType: 'box3', unit: 'mm', coordinateSystem: 'site_cavity', axis: 'xyz' },
  'service.power.route': { group: 'serviceRoutes', observationType: 'geometry', valueType: 'route3', unit: 'mm', coordinateSystem: 'service_route', axis: 'xyz' },
  'service.water.route': { group: 'serviceRoutes', observationType: 'geometry', valueType: 'route3', unit: 'mm', coordinateSystem: 'service_route', axis: 'xyz' },
  'service.drain.route': { group: 'serviceRoutes', observationType: 'geometry', valueType: 'route3', unit: 'mm', coordinateSystem: 'service_route', axis: 'xyz' },
  'service.dryer.duct.route': { group: 'serviceRoutes', observationType: 'geometry', valueType: 'route3', unit: 'mm', coordinateSystem: 'service_route', axis: 'xyz' },
  'service.water.routeLength': { group: 'serviceSpecifications', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'service_route', axis: 'route' },
  'service.power.routeLength': { group: 'serviceSpecifications', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'service_route', axis: 'route' },
  'service.drain.routeLength': { group: 'serviceSpecifications', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'service_route', axis: 'route' },
  'service.drain.connectionDiameter': { group: 'serviceSpecifications', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'non_geometric', axis: 'diameter' },
  'service.drain.connectionHeight': { group: 'serviceSpecifications', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'site_cavity', axis: 'z' },
  'service.drain.insertionDepth': { group: 'serviceSpecifications', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'service_route', axis: 'route' },
  'service.drain.fall': { group: 'serviceSpecifications', observationType: 'measurement', valueType: 'finite_number', unit: 'percent', coordinateSystem: 'service_route', axis: 'route' },
  'service.water.pressure': { group: 'serviceSpecifications', observationType: 'measurement', valueType: 'finite_number', unit: 'kPa', coordinateSystem: 'non_geometric', axis: 'none' },
  'service.water.temperature': { group: 'serviceSpecifications', observationType: 'measurement', valueType: 'finite_number', unit: 'C', coordinateSystem: 'non_geometric', axis: 'none' },
  'service.power.voltage': { group: 'serviceSpecifications', observationType: 'measurement', valueType: 'finite_number', unit: 'V', coordinateSystem: 'non_geometric', axis: 'none' },
  'service.power.currentCapacity': { group: 'serviceSpecifications', observationType: 'measurement', valueType: 'finite_number', unit: 'A', coordinateSystem: 'non_geometric', axis: 'none' },
  'service.water.connectionType': { group: 'serviceSpecifications', observationType: 'fact', valueType: 'enum', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'service.power.connectionType': { group: 'serviceSpecifications', observationType: 'fact', valueType: 'enum', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'service.drain.connectionType': { group: 'serviceSpecifications', observationType: 'fact', valueType: 'enum', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'service.drain.backflowProtection': { group: 'serviceSpecifications', observationType: 'fact', valueType: 'enum', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'service.dryer.duct.diameter': { group: 'serviceSpecifications', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'service_route', axis: 'diameter' },
  'service.dryer.duct.length': { group: 'serviceSpecifications', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'service_route', axis: 'route' },
  'service.dryer.duct.elbowCount': { group: 'serviceSpecifications', observationType: 'measurement', valueType: 'integer', unit: null, coordinateSystem: 'service_route', axis: 'route' },
  'service.dryer.duct.terminationType': { group: 'serviceSpecifications', observationType: 'fact', valueType: 'enum', unit: null, coordinateSystem: 'service_route', axis: 'route' },
  'ventilation.openArea': { group: 'serviceSpecifications', observationType: 'measurement', valueType: 'finite_number', unit: 'mm2', coordinateSystem: 'installed_appliance', axis: 'area' },
  'service.hole.diameter': { group: 'holes', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'site_cavity', axis: 'diameter' },
  'service.water.connector': { group: 'connectors', observationType: 'fact', valueType: 'connector', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'service.isolation.access': { group: 'access', observationType: 'fact', valueType: 'boolean', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'service.power.access': { group: 'access', observationType: 'fact', valueType: 'boolean', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'service.drain.kinkFree': { group: 'access', observationType: 'fact', valueType: 'boolean', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'service.drain.highLoop': { group: 'access', observationType: 'fact', valueType: 'boolean', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'environment.indoor': { group: 'environment', observationType: 'fact', valueType: 'boolean', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'environment.roomVolume': { group: 'environment', observationType: 'measurement', valueType: 'finite_number', unit: 'm3', coordinateSystem: 'non_geometric', axis: 'none' },
  'environment.ambientTemperature': { group: 'environment', observationType: 'measurement', valueType: 'finite_number', unit: 'C', coordinateSystem: 'non_geometric', axis: 'none' },
  'environment.location': { group: 'environment', observationType: 'fact', valueType: 'enum', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'support.load.confirmed': { group: 'support', observationType: 'confirmation', valueType: 'boolean', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'support.level.confirmed': { group: 'support', observationType: 'confirmation', valueType: 'boolean', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'support.square.confirmed': { group: 'support', observationType: 'confirmation', valueType: 'boolean', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'support.load.capacity': { group: 'support', observationType: 'measurement', valueType: 'finite_number', unit: 'kg', coordinateSystem: 'site_cavity', axis: 'z' },
  'professional.electrical.confirmed': { group: 'professionalConfirmations', observationType: 'confirmation', valueType: 'boolean', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'professional.plumbing.confirmed': { group: 'professionalConfirmations', observationType: 'confirmation', valueType: 'boolean', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'professional.anchoring.confirmed': { group: 'professionalConfirmations', observationType: 'confirmation', valueType: 'boolean', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'professional.transitBoltsRemoved.confirmed': { group: 'professionalConfirmations', observationType: 'confirmation', valueType: 'boolean', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'professional.dedicatedCircuit.confirmed': { group: 'professionalConfirmations', observationType: 'confirmation', valueType: 'boolean', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'jurisdiction.au.wa.confirmed': { group: 'jurisdictionConfirmations', observationType: 'confirmation', valueType: 'boolean', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
  'delivery.selected.path': { group: 'delivery', observationType: 'geometry', valueType: 'route3', unit: 'mm', coordinateSystem: 'delivery_path', axis: 'xyz' },
  'delivery.path.minimumWidth': { group: 'delivery', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'delivery_path', axis: 'x' },
  'delivery.path.minimumHeight': { group: 'delivery', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'delivery_path', axis: 'z' },
  'delivery.path.minimumDepth': { group: 'delivery', observationType: 'measurement', valueType: 'finite_number', unit: 'mm', coordinateSystem: 'delivery_path', axis: 'y' },
  'delivery.path.loadCapacity': { group: 'delivery', observationType: 'measurement', valueType: 'finite_number', unit: 'kg', coordinateSystem: 'non_geometric', axis: 'none' },
  'delivery.path.permittedRemovals': { group: 'delivery', observationType: 'fact', valueType: 'enum_set', unit: null, coordinateSystem: 'delivery_path', axis: 'xyz' },
  'delivery.path.turningZone': { group: 'delivery', observationType: 'geometry', valueType: 'box3', unit: 'mm', coordinateSystem: 'delivery_path', axis: 'xyz' },
  'configuration.selection': { group: 'configuration', observationType: 'fact', valueType: 'string', unit: null, coordinateSystem: 'non_geometric', axis: 'none' },
});

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys, label) {
  if (!isPlainObject(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new TypeError(`${label} schema key set invalid`);
  }
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} required`);
  return value;
}

function safeId(value, label) {
  const accepted = text(value, label);
  if (!SAFE_ID.test(accepted) || accepted.split(/[.:]/).some((part) => ['__proto__', 'prototype', 'constructor'].includes(part))) {
    throw new TypeError(`${label} safe ID required`);
  }
  return accepted;
}

function canonical(value, label = 'value') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} finite number required`);
    return value;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new TypeError(`${label} array hole rejected`);
    }
    return value.map((item, index) => canonical(item, `${label}[${index}]`));
  }
  if (!isPlainObject(value)) throw new TypeError(`${label} plain JSON required`);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key], `${label}.${key}`)]));
}

function semanticHash(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

export const SITE_PROFILE_V4_SUBJECTS = freezeDeep(structuredClone(SUBJECTS));

function instant(value, label) {
  const date = new Date(text(value, label));
  if (Number.isNaN(date.valueOf())) throw new TypeError(`${label} invalid`);
  return date;
}

function assertNoPrivateIdentifiers(value, path = 'site profile') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateIdentifiers(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
    if (FORBIDDEN_PRIVACY_KEYS.has(normalized) || normalized.startsWith('addressline')) {
      throw new TypeError(`${path}.${key} address or direct identity field forbidden by privacy policy`);
    }
    assertNoPrivateIdentifiers(child, `${path}.${key}`);
  }
}

function validateConsent(value, sourceKind) {
  if (sourceKind !== 'consented_offline') {
    if (value !== null) throw new TypeError('consent must be null unless profile is consented_offline');
    return null;
  }
  exactKeys(value, ['approvalId', 'approvedAt', 'retentionUntil'], 'consented_offline approval');
  const accepted = {
    approvalId: safeId(value.approvalId, 'consent approval ID'),
    approvedAt: instant(value.approvedAt, 'consent approvedAt').toISOString(),
    retentionUntil: instant(value.retentionUntil, 'consent retentionUntil').toISOString(),
  };
  if (accepted.retentionUntil <= accepted.approvedAt) throw new TypeError('consent retention must end after approval');
  return accepted;
}

function validateSource(value, profileSourceKind, label) {
  exactKeys(value, ['kind', 'sourceId'], `${label} source`);
  if (!OBSERVATION_SOURCE_KINDS.has(value.kind)) throw new TypeError(`${label} source kind invalid`);
  const expected = { synthetic: 'synthetic', real_site: 'real_site_ephemeral', consented_offline: 'consented_offline' }[profileSourceKind];
  if (value.kind !== expected) throw new TypeError(`${label} source kind conflicts with profile source kind`);
  const sourceId = safeId(value.sourceId, `${label} source ID`);
  const prefix = { synthetic: 'synthetic-', real_site: 'session-', consented_offline: 'offline-' }[profileSourceKind];
  if (!sourceId.startsWith(prefix)) throw new TypeError(`${label} source ID must be opaque and ${prefix} scoped, not a household/property identifier`);
  return { kind: value.kind, sourceId };
}

function validateMeasurementValue(value, boundKind, unit, label) {
  if (boundKind === 'COVERAGE_INTERVAL') {
    exactKeys(value, ['minimum', 'maximum', 'minimumEndpoint', 'maximumEndpoint'], `${label} interval`);
    if (!Number.isFinite(value.minimum) || !Number.isFinite(value.maximum) || value.minimum < 0 || value.maximum < 0) {
      throw new RangeError(`${label} interval must contain non-negative finite values`);
    }
    if (value.minimum > value.maximum) throw new RangeError(`${label} interval is inverted`);
    if (!['open', 'closed'].includes(value.minimumEndpoint) || !['open', 'closed'].includes(value.maximumEndpoint)) throw new TypeError(`${label} interval endpoints invalid`);
    if (value.minimum === value.maximum && (value.minimumEndpoint === 'open' || value.maximumEndpoint === 'open')) throw new RangeError(`${label} interval cannot be empty`);
    return canonical(value);
  }
  if (!Number.isFinite(value)) throw new TypeError(`${label} measurement must be finite`);
  if (unit !== 'C' && value < 0) throw new RangeError(`${label} measurement must be non-negative`);
  return value;
}

function finitePoint(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => !Number.isFinite(item))) throw new TypeError(`${label} finite three-coordinate point required`);
  return [...value];
}

function finitePoint2(value, label) {
  if (!Array.isArray(value) || value.length !== 2 || value.some((item) => !Number.isFinite(item))) {
    throw new TypeError(`${label} finite two-coordinate point required`);
  }
  return [...value];
}

function cross(left, middle, right) {
  return (middle[0] - left[0]) * (right[1] - left[1])
    - (middle[1] - left[1]) * (right[0] - left[0]);
}

function onSegment(start, pointValue, end) {
  return pointValue[0] >= Math.min(start[0], end[0])
    && pointValue[0] <= Math.max(start[0], end[0])
    && pointValue[1] >= Math.min(start[1], end[1])
    && pointValue[1] <= Math.max(start[1], end[1]);
}

function segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd) {
  const turns = [
    cross(leftStart, leftEnd, rightStart),
    cross(leftStart, leftEnd, rightEnd),
    cross(rightStart, rightEnd, leftStart),
    cross(rightStart, rightEnd, leftEnd),
  ];
  if (turns[0] === 0 && onSegment(leftStart, rightStart, leftEnd)) return true;
  if (turns[1] === 0 && onSegment(leftStart, rightEnd, leftEnd)) return true;
  if (turns[2] === 0 && onSegment(rightStart, leftStart, rightEnd)) return true;
  if (turns[3] === 0 && onSegment(rightStart, leftEnd, rightEnd)) return true;
  return Math.sign(turns[0]) !== Math.sign(turns[1]) && Math.sign(turns[2]) !== Math.sign(turns[3]);
}

function validatePolygon2(value, label) {
  if (!Array.isArray(value) || value.length < 3) throw new TypeError(`${label} polygon2 requires at least three points`);
  const points = value.map((item, index) => finitePoint2(item, `${label} polygon2[${index}]`));
  const area = points.reduce((sum, current, index) => {
    const next = points[(index + 1) % points.length];
    return sum + current[0] * next[1] - next[0] * current[1];
  }, 0);
  if (area === 0) throw new TypeError(`${label} polygon2 area must be non-zero`);
  for (let left = 0; left < points.length; left += 1) {
    const leftNext = (left + 1) % points.length;
    for (let right = left + 1; right < points.length; right += 1) {
      const rightNext = (right + 1) % points.length;
      if (right === leftNext || left === rightNext) continue;
      if (segmentsIntersect(points[left], points[leftNext], points[right], points[rightNext])) {
        throw new TypeError(`${label} polygon2 must not self-intersect`);
      }
    }
  }
  return points;
}

function validateConnector(value, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} connector object required`);
  const keys = Object.hasOwn(value, 'size') ? ['type', 'size'] : ['type'];
  exactKeys(value, keys, `${label} connector`);
  const accepted = { type: text(value.type, `${label} connector type`) };
  if (Object.hasOwn(value, 'size')) {
    if (!Number.isFinite(value.size) || value.size < 0) throw new RangeError(`${label} connector size must be non-negative and finite`);
    accepted.size = value.size;
  }
  return accepted;
}

function validateTypedValue(value, valueType, observationType, boundKind, unit, label) {
  if (!VALUE_TYPES.has(valueType)) throw new TypeError(`${label} value type is outside Fit V4`);
  if (observationType === 'measurement') {
    if (!['finite_number', 'integer'].includes(valueType)) throw new TypeError(`${label} measurement value type must be finite_number or integer`);
    if (valueType === 'integer') {
      if (boundKind !== 'DETERMINISTIC' || !Number.isInteger(value) || value < 0) {
        throw new TypeError(`${label} integer measurement must be a non-negative deterministic integer`);
      }
      return value;
    }
    return validateMeasurementValue(value, boundKind, unit, label);
  }
  if (observationType === 'fact') {
    if (valueType === 'boolean' && typeof value === 'boolean') return value;
    if (['string', 'enum'].includes(valueType) && typeof value === 'string' && value.trim()) return value;
    if (valueType === 'enum_set' && Array.isArray(value)
      && value.every((item) => typeof item === 'string' && item.trim())
      && new Set(value).size === value.length) return [...value].sort();
    if (valueType === 'connector') return validateConnector(value, label);
    throw new TypeError(`${label} fact value type mismatch`);
  }
  if (observationType === 'confirmation') {
    if (valueType !== 'boolean' || typeof value !== 'boolean') throw new TypeError(`${label} confirmation must be boolean`);
    return value;
  }
  if (observationType !== 'geometry' || !['box3', 'polygon2', 'route3'].includes(valueType)) {
    throw new TypeError(`${label} geometry must be box3, polygon2 or route3`);
  }
  if (valueType === 'box3') {
    exactKeys(value, ['min', 'max'], `${label} box3`);
    const minimum = finitePoint(value.min, `${label} box3 min`);
    const maximum = finitePoint(value.max, `${label} box3 max`);
    if (minimum.some((coordinate, index) => coordinate > maximum[index])) throw new RangeError(`${label} box3 bounds inverted`);
    return { min: minimum, max: maximum };
  }
  if (valueType === 'polygon2') return validatePolygon2(value, label);
  if (!Array.isArray(value) || value.length < 2) throw new TypeError(`${label} route3 requires at least two points`);
  return value.map((point, index) => finitePoint(point, `${label} route3[${index}]`));
}

function validateObservation(value, profileSourceKind, asOf, options, index) {
  const label = `observations[${index}]`;
  exactKeys(value, [
    'id', 'subject', 'observationType', 'valueType', 'value', 'unit', 'coordinateSystem', 'datum',
    'axis', 'geometryId', 'method', 'observedAt', 'boundKind', 'boundDirection', 'source',
  ], label);
  const id = safeId(value.id, `${label} ID`);
  const subject = safeId(value.subject, `${label} subject`);
  if (!Object.hasOwn(SUBJECTS, subject)) throw new TypeError(`${label} subject is outside the explicit Task 4 subject contract`);
  if (!OBSERVATION_TYPES.has(value.observationType)) throw new TypeError(`${label} observation type invalid`);
  if (!BOUND_KINDS.has(value.boundKind)) throw new TypeError(`${label} bound kind invalid`);
  if (value.boundKind === 'DETERMINISTIC_BOUND') {
    if (!['LOWER', 'UPPER'].includes(value.boundDirection)) throw new TypeError(`${label} bound direction invalid`);
  } else if (value.boundDirection !== null) throw new TypeError(`${label} bound direction must be null`);
  const unit = value.unit === null ? null : text(value.unit, `${label} unit`);
  if (value.observationType === 'measurement' && unit === null && value.valueType !== 'integer') {
    throw new TypeError(`${label} measurement unit required`);
  }
  if (value.valueType === 'integer' && unit !== null) throw new TypeError(`${label} integer count unit must be null`);
  if (value.observationType !== 'measurement' && value.boundKind !== 'DETERMINISTIC') throw new TypeError(`${label} non-measurement must be deterministic`);
  const acceptedValue = validateTypedValue(value.value, value.valueType, value.observationType, value.boundKind, unit, label);
  const observedAt = instant(value.observedAt, `${label} observedAt`);
  if (observedAt > asOf) throw new Error(`${label} future observation is after asOf`);
  if (options.maxObservationAgeMs !== undefined
    && asOf.valueOf() - observedAt.valueOf() > options.maxObservationAgeMs) throw new Error(`${label} stale observation rejected`);
  const coordinateSystem = safeId(value.coordinateSystem, `${label} coordinate system`);
  const axis = safeId(value.axis, `${label} axis`);
  if (!COORDINATE_SYSTEMS.has(coordinateSystem) || !AXES.has(axis)) throw new TypeError(`${label} coordinate system or axis outside Fit V4`);
  return freezeDeep({
    id, subject, observationType: value.observationType, valueType: value.valueType,
    value: acceptedValue, unit, coordinateSystem, datum: safeId(value.datum, `${label} datum`), axis,
    geometryId: safeId(value.geometryId, `${label} geometry ID`), method: safeId(value.method, `${label} method`),
    observedAt: observedAt.toISOString(), boundKind: value.boundKind, boundDirection: value.boundDirection,
    source: validateSource(value.source, profileSourceKind, label),
  });
}

function validateRepeatedMeasurementIdentity(observations) {
  const bySubject = new Map();
  for (const observation of observations.filter((item) => item.observationType === 'measurement')) {
    const prior = bySubject.get(observation.subject);
    if (!prior) bySubject.set(observation.subject, observation);
    else for (const key of ['unit', 'coordinateSystem', 'datum', 'axis', 'geometryId']) {
      if (observation[key] !== prior[key]) throw new TypeError(`repeated measurements for ${observation.subject} have ${key} mismatch`);
    }
  }
}

function assertSubjectContract(observation, group) {
  const contract = SUBJECTS[observation.subject];
  for (const key of ['observationType', 'valueType', 'unit', 'coordinateSystem', 'axis']) {
    if (observation[key] !== contract[key]) throw new TypeError(`${group} observation ${observation.id} has incompatible ${key}`);
  }
  if (contract.group !== group) throw new TypeError(`${group} observation ${observation.id} is incompatible with subject group ${contract.group}`);
}

function validateReferences(value, group, observations, used) {
  if (!Array.isArray(value)) throw new TypeError(`${group} observation references required`);
  const ids = new Set();
  return value.map((id) => {
    safeId(id, `${group} observation reference`);
    const observation = observations.get(id);
    if (!observation) throw new TypeError(`${group} observation reference missing: ${id}`);
    if (ids.has(id)) throw new TypeError(`${group} duplicate observation reference: ${id}`);
    if (used.has(id)) throw new TypeError(`${group} observation reuse across incompatible groups: ${id}`);
    assertSubjectContract(observation, group);
    ids.add(id);
    used.add(id);
    return id;
  });
}

function validateConfiguration(value, observations, used, fieldMap) {
  exactKeys(value, ['state', 'values', 'observationRef'], 'site configuration');
  if (!CONFIGURATION_STATES.has(value.state)) throw new TypeError('site configuration state invalid');
  if (!isPlainObject(value.values)) throw new TypeError('site configuration values object required');
  const values = canonical(value.values);
  if (value.state === 'unknown' && Object.keys(values).length !== 0) throw new TypeError('unknown site configuration requires empty values');
  if (value.state === 'selected' && Object.keys(values).length === 0) throw new TypeError('selected site configuration requires values');
  for (const [name, selected] of Object.entries(values)) {
    if (!fieldMap.configurationVariables.includes(name)) throw new TypeError(`unknown Task 1 configuration variable: ${name}`);
    if (selected === 'unknown') throw new TypeError(`selected configuration value cannot be unknown: ${name}`);
    const domain = fieldMap.selectorDomains[name];
    if (domain && (!domain.includes(selected) || selected === 'unknown')) throw new TypeError(`configuration value unknown or outside Task 1 domain: ${name}`);
    if (!domain && !(typeof selected === 'number' && Number.isFinite(selected)) && typeof selected !== 'string') throw new TypeError(`configuration value invalid: ${name}`);
  }
  const observation = observations.get(value.observationRef);
  if (!observation) throw new TypeError('configuration observation reference missing');
  assertSubjectContract(observation, 'configuration');
  if (observation.value !== value.state) throw new TypeError('configuration observation value must equal configuration state');
  if (used.has(value.observationRef)) throw new TypeError('configuration observation reused');
  used.add(value.observationRef);
  return { state: value.state, values, observationRef: value.observationRef };
}

function validateDelivery(value, observations, used) {
  exactKeys(value, ['selected', 'pathObservationRefs'], 'site delivery');
  if (typeof value.selected !== 'boolean' || !Array.isArray(value.pathObservationRefs)) throw new TypeError('site delivery schema invalid');
  if (value.selected && value.pathObservationRefs.length === 0) throw new TypeError('selected delivery path requires observations');
  if (!value.selected && value.pathObservationRefs.length !== 0) throw new TypeError('unselected delivery cannot carry path observations');
  if (!value.selected) return { selected: false, pathObservationRefs: [] };
  const pathObservationRefs = validateReferences(value.pathObservationRefs, 'delivery', observations, used);
  return { selected: value.selected, pathObservationRefs };
}

function validateApprovalRegistry(registry, evidenceBytesByApprovalId, site, asOf) {
  exactKeys(registry, ['schemaVersion', 'registryId', 'approvals', 'registrySha256'], 'trusted consent approval registry');
  if (registry.schemaVersion !== 1) throw new TypeError('trusted consent approval registry schemaVersion 1 required');
  const registryId = safeId(registry.registryId, 'approval registry ID');
  if (!Array.isArray(registry.approvals) || registry.approvals.length === 0) throw new TypeError('approval registry approvals required');
  const payload = { schemaVersion: 1, registryId, approvals: canonical(registry.approvals) };
  if (semanticHash(payload) !== registry.registrySha256) throw new TypeError('trusted consent approval registry hash mismatch');
  const ids = new Set();
  let matched = null;
  for (const approval of registry.approvals) {
    exactKeys(approval, [
      'approvalId', 'profileId', 'approvedAt', 'retentionUntil',
      'approvalEvidenceSha256', 'semanticSha256',
    ], 'trusted consent approval');
    const content = {
      approvalId: safeId(approval.approvalId, 'approval ID'), profileId: safeId(approval.profileId, 'approved profile ID'),
      approvedAt: instant(approval.approvedAt, 'approval approvedAt').toISOString(),
      retentionUntil: instant(approval.retentionUntil, 'approval retentionUntil').toISOString(),
      approvalEvidenceSha256: text(approval.approvalEvidenceSha256, 'approval evidence SHA-256'),
    };
    if (!/^[a-f0-9]{64}$/.test(content.approvalEvidenceSha256)) throw new TypeError('approval evidence SHA-256 invalid');
    if (semanticHash(content) !== approval.semanticSha256) throw new TypeError('trusted consent approval hash/content mismatch');
    if (ids.has(content.approvalId)) throw new TypeError(`duplicate trusted consent approval: ${content.approvalId}`);
    ids.add(content.approvalId);
    if (content.approvalId === site.consent.approvalId) matched = content;
  }
  if (!matched || matched.profileId !== site.profileId
    || matched.approvedAt !== site.consent.approvedAt || matched.retentionUntil !== site.consent.retentionUntil) {
    throw new TypeError('trusted consent approval mismatch');
  }
  if (instant(matched.approvedAt, 'approval approvedAt') > asOf) throw new Error('trusted consent approval is future-dated at asOf');
  if (instant(matched.retentionUntil, 'approval retentionUntil') <= asOf) throw new Error('trusted consent approval retention expired at asOf');
  const evidenceBytes = evidenceBytesByApprovalId?.[matched.approvalId];
  if (!(evidenceBytes instanceof Uint8Array) || evidenceBytes.byteLength === 0) {
    throw new TypeError('trusted consent approval evidence bytes required');
  }
  const observedEvidenceSha256 = createHash('sha256').update(evidenceBytes).digest('hex');
  if (observedEvidenceSha256 !== matched.approvalEvidenceSha256) {
    throw new TypeError('trusted consent approval evidence hash mismatch');
  }
}

export function validateSiteProfileV4(value, options = {}) {
  assertNoPrivateIdentifiers(value);
  exactKeys(value, TOP_LEVEL_KEYS, 'Site Profile V4');
  if (value.schemaVersion !== SITE_PROFILE_V4_SCHEMA_VERSION) throw new TypeError('Site Profile V4 schemaVersion 1 required');
  const fieldMap = validateFitV4FieldMap(options.fieldMap);
  const asOf = instant(options.asOf, 'site profile asOf');
  if (options.maxObservationAgeMs !== undefined
    && (!Number.isFinite(options.maxObservationAgeMs) || options.maxObservationAgeMs < 0)) {
    throw new TypeError('maxObservationAgeMs must be finite and non-negative');
  }
  const profileId = safeId(value.profileId, 'site profile ID');
  if (!SOURCE_KINDS.has(value.sourceKind)) throw new TypeError('site profile source kind invalid');
  if (value.sourceKind === 'real_site' && !profileId.startsWith('session-')) throw new TypeError('real-site profile ID must be opaque session-scoped ID');
  if (!Array.isArray(value.observations) || value.observations.length === 0) throw new TypeError('site observations required');
  const observations = value.observations.map((item, index) => validateObservation(item, value.sourceKind, asOf, options, index));
  const observationMap = new Map();
  for (const observation of observations) {
    if (observationMap.has(observation.id)) throw new TypeError(`duplicate observation ID: ${observation.id}`);
    observationMap.set(observation.id, observation);
  }
  validateRepeatedMeasurementIdentity(observations);
  const used = new Set();
  const accepted = {
    schemaVersion: 1, profileId, sourceKind: value.sourceKind, consent: validateConsent(value.consent, value.sourceKind),
    configuration: validateConfiguration(value.configuration, observationMap, used, fieldMap), observations,
  };
  for (const group of REFERENCE_GROUPS) accepted[group] = validateReferences(value[group], group, observationMap, used);
  accepted.delivery = validateDelivery(value.delivery, observationMap, used);
  const orphan = observations.find((observation) => !used.has(observation.id));
  if (orphan) throw new TypeError(`orphan unreferenced site observation: ${orphan.id}`);
  return freezeDeep(canonical(accepted));
}

export function createSiteProfileV4(input, options = {}) {
  return validateSiteProfileV4(input, options);
}

export function validatePersistedSiteProfileV4(value, options = {}) {
  if (!Number.isFinite(options.maxObservationAgeMs) || options.maxObservationAgeMs < 0) {
    throw new TypeError('persisted site validation requires finite non-negative maxObservationAgeMs');
  }
  const accepted = validateSiteProfileV4(value, options);
  if (accepted.sourceKind === 'real_site') throw new Error('ephemeral real-site profile cannot be persisted');
  if (accepted.sourceKind === 'consented_offline') {
    const asOf = instant(options.asOf, 'site profile asOf');
    validateApprovalRegistry(options.approvalRegistry, options.approvalEvidenceBytes, accepted, asOf);
  }
  return accepted;
}
