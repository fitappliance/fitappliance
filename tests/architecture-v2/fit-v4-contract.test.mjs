import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  FIT_V4_FIELD_MAP_VERSION,
  assertFitV4ContextPath,
  getFitV4Field,
  mapV3FieldToV4,
  validateFitV4FieldMap,
} from '../../src/domain/fit-v4-contract.mjs';

const FIELD_MAP_PATH = new URL('../../data/architecture-v2/policies/fit-v4-field-map.json', import.meta.url);
const RIGHTS_PATH = new URL('../../data/architecture-v2/policies/product-data-field-rights-dictionary.json', import.meta.url);
const FOUR_CATEGORIES = ['dishwasher', 'dryer', 'refrigerator', 'washing_machine'];

async function rawFieldMap() {
  return JSON.parse(await readFile(FIELD_MAP_PATH, 'utf8'));
}

test('hard fields are derived exhaustively from definitions without a drifting raw list', async () => {
  const raw = await rawFieldMap();
  assert.equal(Object.hasOwn(raw, 'hardFields'), false);
  const map = validateFitV4FieldMap(raw);
  assert.equal(map.version, FIT_V4_FIELD_MAP_VERSION);
  assert.deepEqual([...new Set(map.hardFields.map((row) => row.category))].sort(), FOUR_CATEGORIES);
  assert.ok(map.fields.length >= 85);
  assert.ok(map.hardFields.length >= 200);
  for (const hard of map.hardFields) {
    const field = getFitV4Field(map, hard.fieldId);
    assert.ok(field.fitClass.startsWith('hard_'));
    assert.ok(field.applicability.categories.includes(hard.category));
  }
});

test('every field relation is executable for its normalized value type and operand direction', async () => {
  const map = validateFitV4FieldMap(await rawFieldMap());
  const allowed = {
    finite_number: new Set(['MIN_REQUIRED', 'MAX_ALLOWED', 'WITHIN_RANGE']),
    integer: new Set(['MIN_REQUIRED', 'MAX_ALLOWED', 'WITHIN_RANGE']),
    closed_range: new Set(['WITHIN_RANGE', 'CONTAINS']),
    boolean: new Set(['REQUIRES_TRUE']),
    string: new Set(['EXACT_MATCH']),
    enum: new Set(['EXACT_MATCH']),
    connector: new Set(['EXACT_MATCH']),
    enum_set: new Set(['NOT_MEMBER_OF', 'SET_CONTAINS']),
    box3: new Set(['CONTAINS', 'REQUIRED_CONTAINS', 'PROHIBITED_ZONE', 'NO_INTERSECTION']),
    polygon2: new Set(['CONTAINS', 'REQUIRED_CONTAINS', 'PROHIBITED_ZONE', 'NO_INTERSECTION']),
    route3: new Set(['CONTAINS', 'PROHIBITED_ZONE', 'NO_INTERSECTION']),
    sweep3: new Set(['CONTAINS', 'PROHIBITED_ZONE', 'NO_INTERSECTION']),
  };
  for (const field of map.fields) {
    for (const relation of field.permittedRelations) {
      assert.equal(allowed[field.value.type]?.has(relation), true, `${field.id} cannot execute ${relation} for ${field.value.type}`);
    }
  }

  assert.deepEqual(getFitV4Field(map, 'envelope.closed.width').permittedRelations, ['MIN_REQUIRED']);
  assert.deepEqual(getFitV4Field(map, 'operation.door.sweep').permittedRelations, ['CONTAINS']);
  assert.deepEqual(getFitV4Field(map, 'water.route.permittedZone').permittedRelations, ['REQUIRED_CONTAINS']);
  assert.deepEqual(getFitV4Field(map, 'drain.route.permittedZone').permittedRelations, ['REQUIRED_CONTAINS']);
  assert.deepEqual(getFitV4Field(map, 'dryer.technology').permittedRelations, ['EXACT_MATCH']);
  assert.deepEqual(getFitV4Field(map, 'power.connection.circuitDedicated').permittedRelations, ['REQUIRES_TRUE']);
  assert.deepEqual(getFitV4Field(map, 'environment.location.prohibited').permittedRelations, ['NOT_MEMBER_OF']);
  assert.deepEqual(getFitV4Field(map, 'delivery.removableComponents').permittedRelations, ['SET_CONTAINS']);
});

test('closed envelope and body geometry are distinct and only product-closed V3 fields map losslessly', async () => {
  const map = validateFitV4FieldMap(await rawFieldMap());
  for (const axis of ['width', 'height', 'depth']) {
    const closed = getFitV4Field(map, `envelope.closed.${axis}`);
    const body = getFitV4Field(map, `envelope.body.${axis}`);
    assert.equal(closed.coordinateFrame.geometry, 'product_closed_extent');
    assert.notEqual(body.coordinateFrame.geometry, closed.coordinateFrame.geometry);
    assert.ok(closed.v3Mapping);
    assert.equal(body.v3Mapping, undefined);
  }
  const mapped = mapV3FieldToV4(map, {
    fieldId: 'closedEnvelope.widthMm', value: 600, unit: 'mm', relation: 'CONTAINS',
    coordinateFrameId: 'installed_appliance', scope: 'product_closed',
  });
  assert.equal(mapped.fieldId, 'envelope.closed.width');
  assert.equal(mapped.sourceRelation, 'CONTAINS');
  assert.equal(mapped.relation, 'MIN_REQUIRED');
  assert.throws(() => mapV3FieldToV4(map, {
    fieldId: 'closedEnvelope.widthMm', value: 600, unit: 'mm', relation: 'CONTAINS',
    coordinateFrameId: 'installed_appliance', scope: 'body_extent',
  }), /lossy|scope/i);
});

test('every EXACT rights mapping matches dictionary unit, value shape and scope', async () => {
  const map = validateFitV4FieldMap(await rawFieldMap());
  const dictionary = JSON.parse(await readFile(RIGHTS_PATH, 'utf8'));
  const byId = new Map(dictionary.fields.map((field) => [field.id, field]));
  const exact = map.fields.filter((field) => field.rights.mappingStatus === 'EXACT');
  const blocked = map.fields.filter((field) => field.rights.mappingStatus === 'UNMAPPED_BLOCKED');
  assert.ok(exact.length > 15);
  assert.ok(blocked.length > exact.length);
  for (const field of exact) {
    const dictionaryField = byId.get(field.rights.dictionaryFieldId);
    assert.ok(dictionaryField, field.id);
    assert.deepEqual(field.rights.compatibility, {
      unit: dictionaryField.unit ?? null,
      valueShape: dictionaryField.valueShape,
      scope: dictionaryField.scope,
    });
    assert.equal(field.value.unit ?? null, dictionaryField.unit ?? null);
    assert.equal({ finite_number: 'scalar', closed_range: 'range' }[field.value.type], dictionaryField.valueShape);
    assert.ok(field.rights.requiredActions.length > 0);
  }
  for (const id of [
    'envelope.body.width', 'delivery.package.weight', 'cabinet.support.minimumLoad',
    'dryer.duct.maximumLength', 'ventilation.roomVolume.minimum', 'water.connection.type',
    'water.route.permittedZone', 'power.socket.permittedZone', 'drain.route.permittedZone',
  ]) {
    const field = getFitV4Field(map, id);
    assert.equal(field.rights.mappingStatus, 'UNMAPPED_BLOCKED');
    assert.equal(field.rights.dictionaryFieldId, null);
    assert.deepEqual(field.rights.requiredActions, []);
  }
});

test('field map rejects incompatible rights claims, omissions, duplicates and unsafe names or paths', async () => {
  const map = await rawFieldMap();
  assert.throws(() => assertFitV4ContextPath(map, '__proto__.polluted'), /context path/i);
  assert.throws(() => assertFitV4ContextPath(map, 'site.constructor.value'), /context path/i);
  assert.throws(() => assertFitV4ContextPath(map, 'site.prototype.value'), /context path/i);
  assert.throws(() => assertFitV4ContextPath(map, 'site.address'), /context path/i);

  const incompatible = structuredClone(map);
  const body = incompatible.fields.find((field) => field.id === 'envelope.body.width');
  body.rights = {
    mappingStatus: 'EXACT', dictionaryFieldId: 'closedEnvelope.widthMm',
    requiredActions: ['cache_source'],
    compatibility: { unit: 'mm', valueShape: 'scalar', scope: 'product_closed' },
  };
  assert.throws(() => validateFitV4FieldMap(incompatible), /incompatible|approved EXACT|rights/i);

  for (const mutate of [
    (copy) => copy.allowedContextPaths.push(copy.allowedContextPaths[0]),
    (copy) => copy.allowedContextPaths.push('site.__proto__.value'),
    (copy) => copy.configurationVariables.push(copy.configurationVariables[0]),
    (copy) => copy.configurationVariables.push('constructor'),
    (copy) => copy.selectorDomains.installationMode.push('prototype'),
    (copy) => copy.selectorDomains.installationMode.push(copy.selectorDomains.installationMode[0]),
  ]) {
    const copy = structuredClone(map);
    mutate(copy);
    assert.throws(() => validateFitV4FieldMap(copy), /duplicate|unsafe|prototype|constructor/i);
  }

  const missingCategory = structuredClone(map);
  for (const field of missingCategory.fields) {
    field.applicability.categories = field.applicability.categories.filter((category) => category !== 'dryer');
  }
  assert.throws(() => validateFitV4FieldMap(missingCategory), /four categories|dryer/i);
});

test('V3 mappings still reject unknown, name-only and unit-lossy fields', async () => {
  const map = validateFitV4FieldMap(await rawFieldMap());
  assert.throws(() => mapV3FieldToV4(map, {
    fieldId: 'operationEnvelope.widthMm', value: 900, unit: 'mm', relation: 'CONTAINS',
    coordinateFrameId: 'installed_appliance', scope: 'door_drawer_or_lid_open',
  }), /lossless|mapping/i);
  assert.throws(() => mapV3FieldToV4(map, {
    fieldId: 'closedEnvelope.widthMm', value: 600, unit: 'cm', relation: 'CONTAINS',
    coordinateFrameId: 'installed_appliance', scope: 'product_closed',
  }), /lossy|unit/i);
});
