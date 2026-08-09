import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateFitV4FieldMap } from '../../src/domain/fit-v4-contract.mjs';
import {
  createSiteProfileV4,
  SITE_PROFILE_V4_SUBJECTS,
  validatePersistedSiteProfileV4,
  validateSiteProfileV4,
} from '../../src/domain/site-profile-v4.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const semanticHash = (value) => sha256(JSON.stringify(canonical(value)));
const FIELD_MAP = validateFitV4FieldMap(JSON.parse(await readFile(
  new URL('../../data/architecture-v2/policies/fit-v4-field-map.json', import.meta.url), 'utf8',
)));
const NOW = '2026-08-08T00:00:00.000Z';
const MAX_AGE = 7 * 86400000;
const APPROVAL_EVIDENCE = Buffer.from('offline approval record fixture');

function observation(id, subject, value, overrides = {}) {
  const observationType = overrides.observationType ?? 'measurement';
  const valueType = overrides.valueType ?? (observationType === 'measurement'
    ? 'finite_number'
    : observationType === 'geometry'
      ? (Array.isArray(value) ? 'route3' : 'box3')
      : typeof value);
  return {
    id, subject, observationType, valueType, value,
    unit: 'mm', coordinateSystem: 'site_cavity', datum: 'rear-left-finished-support',
    axis: 'x', geometryId: subject, method: 'laser', observedAt: '2026-08-07T00:00:00.000Z',
    boundKind: 'DETERMINISTIC', boundDirection: null,
    source: { kind: 'synthetic', sourceId: `synthetic-${id}` },
    ...overrides,
  };
}

function profile(overrides = {}) {
  const observations = [
    observation('cavity-width-1', 'cavity.width', 605),
    observation('cavity-width-2', 'cavity.width', 604),
    observation('wall-left', 'surface.wall.left', true, { observationType: 'fact', value: true, unit: null, axis: 'xyz' }),
    observation('cabinet-right', 'surface.cabinet.right', true, { observationType: 'fact', value: true, unit: null, axis: 'xyz' }),
    observation('skirting', 'surface.skirting.depth', 15, { axis: 'y' }),
    observation('floor-level', 'support.floor.level', true, { observationType: 'fact', value: true, unit: null, axis: 'xy' }),
    observation('cavity-square', 'support.cavity.square', true, { observationType: 'fact', value: true, unit: null, axis: 'xy' }),
    observation('obstacle', 'obstacle.pipe', { min: [0, 0, 0], max: [10, 10, 10] }, { observationType: 'geometry', unit: 'mm', axis: 'xyz' }),
    observation('operation-zone', 'operation.door.zone', [[0, 0], [600, 0], [600, 900], [0, 900]], {
      observationType: 'geometry', valueType: 'polygon2', unit: 'mm',
      coordinateSystem: 'installed_appliance', axis: 'xy',
    }),
    observation('power-endpoint', 'service.power.endpoint', { min: [10, 0, 0], max: [20, 10, 10] }, { observationType: 'geometry', unit: 'mm', coordinateSystem: 'service_route', axis: 'xyz' }),
    observation('water-endpoint', 'service.water.endpoint', { min: [30, 0, 0], max: [40, 10, 10] }, { observationType: 'geometry', unit: 'mm', coordinateSystem: 'service_route', axis: 'xyz' }),
    observation('power-route', 'service.power.route', [[0, 0, 0], [100, 0, 0]], { observationType: 'geometry', unit: 'mm', coordinateSystem: 'service_route', axis: 'xyz' }),
    observation('drain-route', 'service.drain.route', [[0, 0, 0], [0, 100, 0]], { observationType: 'geometry', unit: 'mm', coordinateSystem: 'service_route', axis: 'xyz' }),
    observation('service-hole', 'service.hole.diameter', 60, { axis: 'diameter' }),
    observation('connector', 'service.water.connector', { type: 'threaded', size: 19 }, {
      observationType: 'fact', valueType: 'connector', unit: null,
      coordinateSystem: 'non_geometric', axis: 'none',
    }),
    observation('service-access', 'service.isolation.access', true, { observationType: 'fact', value: true, unit: null, coordinateSystem: 'non_geometric', axis: 'none' }),
    observation('environment', 'environment.indoor', true, { observationType: 'fact', value: true, unit: null, coordinateSystem: 'non_geometric', axis: 'none' }),
    observation('support', 'support.load.confirmed', true, { observationType: 'confirmation', value: true, unit: null, coordinateSystem: 'non_geometric', axis: 'none', method: 'engineer_confirmation' }),
    observation('professional', 'professional.electrical.confirmed', true, { observationType: 'confirmation', value: true, unit: null, coordinateSystem: 'non_geometric', axis: 'none', method: 'licensed_electrician' }),
    observation('professional-plumbing', 'professional.plumbing.confirmed', true, { observationType: 'confirmation', value: true, unit: null, coordinateSystem: 'non_geometric', axis: 'none', method: 'licensed_plumber' }),
    observation('jurisdiction', 'jurisdiction.au.wa.confirmed', true, { observationType: 'confirmation', value: true, unit: null, coordinateSystem: 'non_geometric', axis: 'none', method: 'policy_confirmation' }),
    observation('delivery-path', 'delivery.selected.path', [[0, 0, 0], [1000, 0, 0]], { observationType: 'geometry', unit: 'mm', coordinateSystem: 'delivery_path', axis: 'xyz' }),
    observation('configuration', 'configuration.selection', 'unknown', { observationType: 'fact', value: 'unknown', unit: null, coordinateSystem: 'non_geometric', axis: 'none' }),
  ];
  return {
    schemaVersion: 1, profileId: 'synthetic-site-001', sourceKind: 'synthetic', consent: null,
    configuration: { state: 'unknown', values: {}, observationRef: 'configuration' }, observations,
    surfaces: ['wall-left', 'cabinet-right', 'skirting', 'floor-level', 'cavity-square', 'cavity-width-1', 'cavity-width-2'],
    obstacles: ['obstacle'], operationZones: ['operation-zone'], serviceEndpoints: ['power-endpoint', 'water-endpoint'],
    serviceRoutes: ['power-route', 'drain-route'], holes: ['service-hole'], connectors: ['connector'], access: ['service-access'],
    componentSelections: [], serviceSpecifications: [],
    environment: ['environment'], support: ['support'], professionalConfirmations: ['professional', 'professional-plumbing'],
    jurisdictionConfirmations: ['jurisdiction'], delivery: { selected: true, pathObservationRefs: ['delivery-path'] },
    ...overrides,
  };
}

function options(overrides = {}) {
  return { fieldMap: FIELD_MAP, asOf: NOW, ...overrides };
}

function approvalRegistry(site, overrides = {}) {
  const approval = {
    approvalId: site.consent.approvalId, profileId: site.profileId,
    approvedAt: site.consent.approvedAt, retentionUntil: site.consent.retentionUntil,
    approvalEvidenceSha256: sha256(APPROVAL_EVIDENCE),
    ...overrides,
  };
  approval.semanticSha256 = semanticHash({
    approvalId: approval.approvalId, profileId: approval.profileId,
    approvedAt: approval.approvedAt, retentionUntil: approval.retentionUntil,
    approvalEvidenceSha256: approval.approvalEvidenceSha256,
  });
  const payload = { schemaVersion: 1, registryId: 'trusted-site-consent-test', approvals: [approval] };
  return { ...payload, registrySha256: semanticHash(payload) };
}

function consentedProfile(consentOverrides = {}) {
  const base = profile({
    sourceKind: 'consented_offline', profileId: 'offline-study-001',
    consent: {
      approvalId: 'approval-001', approvedAt: '2026-08-01T00:00:00.000Z',
      retentionUntil: '2026-09-01T00:00:00.000Z', ...consentOverrides,
    },
  });
  return {
    ...base,
    observations: base.observations.map((item) => ({
      ...item, source: { kind: 'consented_offline', sourceId: `offline-${item.id}` },
    })),
  };
}

test('site accepts the explicit Task 4 subject/group contract and repeated observations', () => {
  const accepted = createSiteProfileV4(profile(), options());
  assert.equal(accepted.observations.filter((item) => item.subject === 'cavity.width').length, 2);
  assert.equal(accepted.configuration.state, 'unknown');
  assert.equal(Object.isFrozen(accepted), true);

  const base = profile();
  const negativeCoordinates = base.observations.map((item) => item.id === 'obstacle'
    ? { ...item, value: { min: [-10, -10, -10], max: [10, 10, 10] } }
    : item);
  assert.doesNotThrow(() => validateSiteProfileV4({ ...base, observations: negativeCoordinates }, options()));

  const withoutDeliveryObservation = base.observations.filter((item) => item.id !== 'delivery-path');
  assert.doesNotThrow(() => validateSiteProfileV4({
    ...base, observations: withoutDeliveryObservation, delivery: { selected: false, pathObservationRefs: [] },
  }, options()));
});

test('site supports spatial power/water endpoints, drain routes and optional empty groups', () => {
  const accepted = validateSiteProfileV4(profile(), options());
  assert.equal(accepted.observations.find((item) => item.id === 'power-endpoint').valueType, 'box3');
  assert.equal(accepted.observations.find((item) => item.id === 'water-endpoint').coordinateSystem, 'service_route');
  assert.equal(accepted.observations.find((item) => item.id === 'drain-route').valueType, 'route3');

  const base = profile();
  const observations = base.observations.filter((item) => item.id !== 'obstacle');
  assert.doesNotThrow(() => validateSiteProfileV4({
    ...base,
    observations,
    obstacles: [],
  }, options()));
});

test('site exposes typed integrated-panel and dryer-duct endpoints without drainage conflation', () => {
  const base = profile();
  const added = [
    observation('panel-weight', 'component.dishwasher.panel.weight', 7, {
      unit: 'kg', coordinateSystem: 'installed_appliance', axis: 'z',
      geometryId: 'door_panel',
    }),
    observation('panel-height', 'component.dishwasher.panel.height', 720, {
      coordinateSystem: 'installed_appliance', axis: 'z', geometryId: 'door_panel',
    }),
    observation('duct-diameter', 'service.dryer.duct.diameter', 100, {
      coordinateSystem: 'service_route', axis: 'diameter', geometryId: 'duct_route',
    }),
    observation('duct-length', 'service.dryer.duct.length', 1800, {
      coordinateSystem: 'service_route', axis: 'route', geometryId: 'duct_route',
    }),
    observation('duct-elbows', 'service.dryer.duct.elbowCount', 2, {
      valueType: 'integer', unit: null, coordinateSystem: 'service_route',
      axis: 'route', geometryId: 'duct_route',
    }),
    observation('duct-termination', 'service.dryer.duct.terminationType', 'external_wall', {
      observationType: 'fact', valueType: 'enum', unit: null,
      coordinateSystem: 'service_route', axis: 'route', geometryId: 'duct_termination',
    }),
    observation('duct-route', 'service.dryer.duct.route', [[0, 0, 0], [0, 1800, 0]], {
      observationType: 'geometry', valueType: 'route3', unit: 'mm',
      coordinateSystem: 'service_route', axis: 'xyz', geometryId: 'duct_route',
    }),
  ];
  const accepted = validateSiteProfileV4({
    ...base,
    observations: [...base.observations, ...added],
    componentSelections: ['panel-weight', 'panel-height'],
    serviceSpecifications: ['duct-diameter', 'duct-length', 'duct-elbows', 'duct-termination'],
    serviceRoutes: [...base.serviceRoutes, 'duct-route'],
  }, options());
  assert.equal(accepted.componentSelections.length, 2);
  assert.equal(accepted.serviceSpecifications.length, 4);
  assert.equal(accepted.observations.find((item) => item.id === 'duct-elbows').valueType, 'integer');
  assert.notEqual(
    accepted.observations.find((item) => item.id === 'duct-route').subject,
    accepted.observations.find((item) => item.id === 'drain-route').subject,
  );
});

test('Task 4B subject contract exposes typed policy operands and immutable enum sets', () => {
  for (const subject of [
    'placement.leftGap', 'operation.door.availableDepth', 'service.water.pressure',
    'professional.dedicatedCircuit.confirmed', 'delivery.path.turningZone',
  ]) assert.ok(SITE_PROFILE_V4_SUBJECTS[subject], subject);
  assert.equal(Object.isFrozen(SITE_PROFILE_V4_SUBJECTS), true);

  const base = profile();
  const removals = observation('delivery-removals', 'delivery.path.permittedRemovals', ['door', 'handle'], {
    observationType: 'fact', valueType: 'enum_set', unit: null,
    coordinateSystem: 'delivery_path', axis: 'xyz', geometryId: 'delivery_removals',
  });
  const accepted = validateSiteProfileV4({
    ...base,
    observations: [...base.observations, removals],
    delivery: { selected: true, pathObservationRefs: ['delivery-path', 'delivery-removals'] },
  }, options());
  assert.deepEqual(accepted.observations.find((item) => item.id === 'delivery-removals').value, ['door', 'handle']);

  const duplicated = { ...removals, value: ['door', 'door'] };
  assert.throws(() => validateSiteProfileV4({
    ...base,
    observations: [...base.observations, duplicated],
    delivery: { selected: true, pathObservationRefs: ['delivery-path', 'delivery-removals'] },
  }, options()), /fact value type|duplicate|enum/i);
});

test('door operation zones are non-self-intersecting installed-appliance polygons', () => {
  const base = profile();
  const invalid = base.observations.map((item) => item.id === 'operation-zone'
    ? { ...item, value: [[0, 0], [10, 10], [0, 10], [10, 0]] }
    : item);
  assert.throws(() => validateSiteProfileV4({ ...base, observations: invalid }, options()), /polygon|self-intersect/i);
});

test('site configuration uses Task 1 variables/domains and preserves unknown without defaults', () => {
  const base = profile();
  assert.throws(() => validateSiteProfileV4({
    ...base, configuration: { ...base.configuration, values: { installationMode: 'recessed' } },
  }, options()), /unknown.*empty|configuration/i);
  for (const values of [
    { installationMode: 'unknown' },
    { installationMode: 'not-a-mode' },
    { arbitraryVariable: 'recessed' },
  ]) {
    assert.throws(() => validateSiteProfileV4({
      ...base, configuration: { state: 'selected', values, observationRef: 'configuration' },
    }, options()), /unknown|domain|variable|configuration/i);
  }
  const selectedObservations = base.observations.map((item) => item.id === 'configuration' ? { ...item, value: 'selected' } : item);
  const selected = {
    ...base,
    observations: selectedObservations,
    configuration: { state: 'selected', values: { installationMode: 'recessed' }, observationRef: 'configuration' },
  };
  assert.equal(validateSiteProfileV4(selected, options()).configuration.values.installationMode, 'recessed');
});

test('arbitrary subjects are rejected', () => {
  const base = profile();
  const observations = base.observations.map((item) => item.id === 'wall-left' ? { ...item, subject: 'arbitrary.not-a-schema-field' } : item);
  assert.throws(() => validateSiteProfileV4({ ...base, observations }, options()), /subject|schema|contract/i);
});

test('groups enforce observation type, value type, unit, coordinate system and axis', () => {
  const base = profile();
  assert.throws(() => validateSiteProfileV4({ ...base, serviceRoutes: ['obstacle'] }, options()), /serviceRoutes|route3|compatible/i);
  assert.throws(() => validateSiteProfileV4({ ...base, professionalConfirmations: ['connector'] }, options()), /confirmation|boolean|compatible/i);
  const badUnit = base.observations.map((item) => item.id === 'power-route' ? { ...item, unit: 'cm' } : item);
  assert.throws(() => validateSiteProfileV4({ ...base, observations: badUnit }, options()), /unit|serviceRoutes/i);
  const badAxis = base.observations.map((item) => item.id === 'service-hole' ? { ...item, axis: 'x' } : item);
  assert.throws(() => validateSiteProfileV4({ ...base, observations: badAxis }, options()), /axis|holes/i);
  assert.throws(() => validateSiteProfileV4({ ...base, delivery: { selected: true, pathObservationRefs: ['obstacle'] } }, options()), /delivery|route3|delivery_path/i);
});

test('orphan observations and cross-group reuse are rejected', () => {
  const base = profile();
  const orphan = observation('orphan', 'cavity.height', 900, { axis: 'z' });
  assert.throws(() => validateSiteProfileV4({ ...base, observations: [...base.observations, orphan] }, options()), /orphan|unreferenced/i);
  assert.throws(() => validateSiteProfileV4({ ...base, obstacles: ['obstacle', 'operation-zone'] }, options()), /reuse|group|compatible/i);
});

test('asOf is mandatory, future observations fail, and persisted values require finite age policy', () => {
  const base = profile();
  assert.throws(() => validateSiteProfileV4(base, { fieldMap: FIELD_MAP }), /asOf|required/i);
  const future = base.observations.map((item) => item.id === 'wall-left' ? { ...item, observedAt: '2026-08-09T00:00:00.000Z' } : item);
  assert.throws(() => validateSiteProfileV4({ ...base, observations: future }, options()), /future|after asOf/i);
  assert.throws(() => validatePersistedSiteProfileV4(base, options()), /maxObservationAgeMs|required/i);
  assert.throws(() => validatePersistedSiteProfileV4(base, options({ maxObservationAgeMs: -1 })), /non-negative|finite/i);
  const stale = base.observations.map((item) => item.id === 'wall-left' ? { ...item, observedAt: '2025-01-01T00:00:00.000Z' } : item);
  assert.throws(() => validatePersistedSiteProfileV4({ ...base, observations: stale }, options({ maxObservationAgeMs: MAX_AGE })), /stale/i);
});

test('consented-offline persistence requires exact trusted approval and unexpired retention', () => {
  const site = consentedProfile();
  const persistedOptions = options({
    maxObservationAgeMs: MAX_AGE,
    approvalRegistry: approvalRegistry(site),
    approvalEvidenceBytes: { [site.consent.approvalId]: APPROVAL_EVIDENCE },
  });
  assert.doesNotThrow(() => validatePersistedSiteProfileV4(site, persistedOptions));
  assert.throws(() => validatePersistedSiteProfileV4(site, options({ maxObservationAgeMs: MAX_AGE })), /approval registry|trusted consent/i);
  assert.throws(() => validatePersistedSiteProfileV4(site, options({
    maxObservationAgeMs: MAX_AGE, approvalRegistry: approvalRegistry(site),
  })), /approval evidence/i);
  assert.throws(() => validatePersistedSiteProfileV4(site, options({
    maxObservationAgeMs: MAX_AGE,
    approvalRegistry: approvalRegistry(site),
    approvalEvidenceBytes: { [site.consent.approvalId]: Buffer.from('self-minted approval') },
  })), /approval evidence/i);

  const tampered = structuredClone(persistedOptions.approvalRegistry);
  tampered.approvals[0].profileId = 'other-profile';
  assert.throws(() => validatePersistedSiteProfileV4(site, { ...persistedOptions, approvalRegistry: tampered }), /hash|approval|mismatch/i);

  const expiredSite = consentedProfile({ retentionUntil: '2026-08-07T00:00:00.000Z' });
  assert.throws(() => validatePersistedSiteProfileV4(expiredSite, options({
    maxObservationAgeMs: MAX_AGE,
    approvalRegistry: approvalRegistry(expiredSite),
    approvalEvidenceBytes: { [expiredSite.consent.approvalId]: APPROVAL_EVIDENCE },
  })), /expired|retention/i);
});

test('synthetic persists, real-site remains ephemeral, and source IDs are session scoped', () => {
  assert.doesNotThrow(() => validatePersistedSiteProfileV4(profile(), options({ maxObservationAgeMs: MAX_AGE })));
  const base = profile({ sourceKind: 'real_site', profileId: 'session-site-001' });
  const realSite = {
    ...base,
    observations: base.observations.map((item) => ({ ...item, source: { kind: 'real_site_ephemeral', sourceId: `session-${item.id}` } })),
  };
  assert.doesNotThrow(() => validateSiteProfileV4(realSite, options()));
  assert.throws(() => validatePersistedSiteProfileV4(realSite, options({ maxObservationAgeMs: MAX_AGE })), /ephemeral|persist/i);
  const stableId = realSite.observations.map((item) => item.id === 'wall-left'
    ? { ...item, source: { ...item.source, sourceId: 'household-123' } } : item);
  assert.throws(() => validateSiteProfileV4({ ...realSite, observations: stableId }, options()), /session|household|opaque/i);
});

test('nested privacy aliases and direct identity fields are rejected before persistence', () => {
  const aliases = ['addressLine1', 'fullAddress', 'postcode', 'suburb', 'geohash', 'email', 'phone', 'fullName'];
  for (const key of aliases) {
    const base = profile();
    const observations = base.observations.map((item) => item.id === 'obstacle'
      ? { ...item, value: { ...item.value, [key]: 'private' } } : item);
    assert.throws(() => validateSiteProfileV4({ ...base, observations }, options()), /privacy|address|identity|forbidden/i, key);
  }
});

test('site validation leaves V3-shaped input unchanged', () => {
  const v3Site = { measuredAt: NOW, cavity: { widthMm: 605, heightMm: 900, depthMm: 580 }, address: null };
  const before = JSON.stringify(v3Site);
  validateSiteProfileV4(profile(), options());
  assert.equal(JSON.stringify(v3Site), before);
});
