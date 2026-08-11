import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  applyRetailerIdentityMigrationToCatalog,
  applyRetailerIdentityMigrationToLedger,
  buildRetailerIdentityMigration,
  rebindRetailerIdentityMigrationProjection,
  validateRetailerIdentityMigration,
} from '../../src/domain/retailer-identity-migration.mjs';
import { buildCanonicalRegistry } from '../../src/domain/canonical-registry.mjs';
import { buildRetailerObservationCoverage } from '../../src/domain/retailer-observation-coverage.mjs';
import {
  buildRetailerIdentityMigrationFromRepository,
} from '../../scripts/architecture-v2/build-retailer-identity-migration.mjs';
import {
  applyRetailerIdentityMigrationFromRepository,
} from '../../scripts/architecture-v2/apply-retailer-identity-migration.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);

async function json(path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function resealMigration(value) {
  const document = structuredClone(value);
  delete document.migrationId;
  delete document.semanticSha256;
  const semanticSha256 = digest(document);
  document.migrationId = `retailer_identity_migration_${semanticSha256.slice(0, 24)}`;
  document.semanticSha256 = semanticSha256;
  return document;
}

function bindResolutionToProjection(value, publicProjection) {
  const document = structuredClone(value);
  document.sourceBindings.publicProjectionSemanticSha256 = digest(publicProjection);
  delete document.resolutionId;
  delete document.semanticSha256;
  const semanticSha256 = digest(document);
  document.resolutionId = `retailer_identity_resolution_${semanticSha256.slice(0, 24)}`;
  document.semanticSha256 = semanticSha256;
  return document;
}

function countBy(items, selector) {
  const result = {};
  for (const item of items) {
    const key = selector(item);
    result[key] = (result[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function withOneUnresolvedCase(resolution) {
  const document = structuredClone(resolution);
  const unresolved = document.cases.find((item) => item.decision.status === 'RESOLVED');
  assert.ok(unresolved, 'fixture needs one resolved identity case');
  unresolved.decision = {
    status: 'UNRESOLVED',
    reasonCodes: ['SYNTHETIC_UNRESOLVED_CANARY'],
    linkDispositions: [],
  };
  document.summary = {
    cases: document.cases.length,
    resolved: document.cases.filter((item) => item.decision.status === 'RESOLVED').length,
    unresolved: document.cases.filter((item) => item.decision.status === 'UNRESOLVED').length,
    byAction: countBy(
      document.cases.filter((item) => item.decision.status === 'RESOLVED'),
      (item) => item.decision.action,
    ),
    byLinkAction: countBy(
      document.cases.flatMap((item) => item.decision.linkDispositions ?? []),
      (item) => item.action,
    ),
  };
  delete document.resolutionId;
  delete document.semanticSha256;
  const semantic = digest(document);
  document.resolutionId = `retailer_identity_resolution_${semantic.slice(0, 24)}`;
  document.semanticSha256 = semantic;
  return { document, unresolved };
}

async function fixture() {
  const [resolution, publicProjection, ledger, catalog, sourcePolicy, migration] = await Promise.all([
    json('data/architecture-v2/reviews/automated/retailer-identity-resolutions.json'),
    json('data/architecture-v2/generated/public-catalog-projection.json'),
    json('data/architecture-v2/observations/retailer-observations.json'),
    json('data/catalog-final.json'),
    json('data/architecture-v2/policies/retailer-source-policy.json'),
    json('data/architecture-v2/reviews/automated/retailer-identity-migration.json'),
  ]);
  return {
    resolution,
    publicProjection,
    ledger,
    catalog,
    sourcePolicy,
    migration,
  };
}

test('builds a declarative migration for every resolved case and leaves unresolved cases isolated', async () => {
  const { migration } = await fixture();
  assert.doesNotThrow(() => validateRetailerIdentityMigration(migration));
  assert.deepEqual(migration.sourceResolutionSummary, {
    cases: 2,
    resolved: 2,
    unresolved: 0,
    byAction: {
      MERGE_DUPLICATE_CANONICAL: 1,
      QUARANTINE_UNSUPPORTED_CANONICAL: 1,
    },
    byLinkAction: {
      REASSIGN_TO_EXISTING_CANONICAL: 2,
    },
  });
  assert.deepEqual(migration.summary, {
    cases: 2,
    canonicalCorrections: 0,
    canonicalMerges: 1,
    canonicalQuarantines: 1,
    linkEvents: 2,
    generatedObservations: 2,
    byLinkAction: {
      REASSIGN_TO_EXISTING_CANONICAL: 2,
    },
  });
  assert.ok(migration.linkEvents.filter((event) => event.action === 'INVALIDATE_WRONG_IDENTITY')
    .every((event) => event.observation === null && event.destinationCanonicalProductId === null));
  assert.equal(migration.sourceBindings.resolutionEpochs.length, 1);
  assert.equal(migration.canonicalQuarantines[0].sourceLegacyRuntimeId, 'f3');
  assert.deepEqual(
    migration.canonicalQuarantines[0].discardedUnverifiedRetailerLinks.map((row) => row.retailer),
    ['Harvey Norman', 'JB Hi-Fi'],
  );
});

test('builds a partial migration while preserving unresolved identity cases outside the mutation set', async () => {
  const { resolution, publicProjection, ledger } = await fixture();
  const partial = withOneUnresolvedCase(bindResolutionToProjection(resolution, publicProjection));
  const migration = buildRetailerIdentityMigration({
    resolution: partial.document,
    publicProjection,
    ledger,
  });

  assert.deepEqual(migration.sourceResolutionSummary, partial.document.summary);
  assert.equal(migration.summary.cases, partial.document.summary.resolved);
  assert.equal(migration.cases.some((item) => item.resolutionTaskId === partial.unresolved.resolutionTaskId), false);
  assert.equal(migration.linkEvents.some((event) => (
    partial.unresolved.mismatchSources.some((source) => source.baselineLinkId === event.baselineLinkId)
  )), false);
  assert.doesNotThrow(() => validateRetailerIdentityMigration(migration));
});

test('coverage consumes persisted identity events as terminal dispositions without inventing availability', async () => {
  const { ledger, migration, publicProjection, sourcePolicy } = await fixture();
  const migratedLedger = applyRetailerIdentityMigrationToLedger({ ledger, migration });
  const coverage = buildRetailerObservationCoverage({
    publicProjection,
    publicProjectionSha256: 'a'.repeat(64),
    ledger: migratedLedger,
    ledgerSha256: 'b'.repeat(64),
    sourcePolicy,
    sourcePolicySha256: 'c'.repeat(64),
  });
  const byLink = new Map(coverage.items.map((item) => [item.baselineLinkId, item]));
  const stateByAction = {
    ACCEPT_AFTER_CANONICAL_CORRECTION: 'IDENTITY_ACCEPTED_AFTER_CANONICAL_CORRECTION',
    REASSIGN_TO_EXISTING_CANONICAL: 'IDENTITY_REASSIGNED_TO_EXISTING_CANONICAL',
    INVALIDATE_WRONG_IDENTITY: 'IDENTITY_INVALIDATED_WRONG_MODEL',
  };
  for (const event of migration.linkEvents) {
    const item = byLink.get(event.baselineLinkId);
    if (!item) continue;
    assert.equal(item.terminalObservationState, stateByAction[event.action]);
    assert.equal(item.revalidation, null);
    assert.equal(item.typedObservation.kind, 'IDENTITY_RESOLUTION');
    assert.equal(item.typedObservation.eventId, event.id);
  }
  assert.ok(migration.linkEvents.every((event) => byLink.has(event.baselineLinkId)));
});

test('catalog migration changes only authorised identity presentation and removes merged duplicates', async () => {
  const { catalog, migration, resolution } = await fixture();
  const migrated = applyRetailerIdentityMigrationToCatalog({ catalog, migration });
  assert.equal(
    migrated.products.length,
    catalog.products.length - migration.canonicalMerges.length - migration.canonicalQuarantines.length,
  );
  for (const unresolved of resolution.cases.filter((item) => item.decision.status === 'UNRESOLVED')) {
    assert.ok(migrated.products.some((row) => String(row.id).toLowerCase() === unresolved.legacyRuntimeId));
  }
  for (const correction of migration.canonicalCorrections) {
    const before = catalog.products.find((row) => String(row.id).toLowerCase() === correction.legacyRuntimeId);
    const after = migrated.products.find((row) => String(row.id).toLowerCase() === correction.legacyRuntimeId);
    assert.equal(before.model, correction.fromModel);
    assert.equal(after.model, correction.toModel);
    for (const key of Object.keys(before).filter((key) => !['model', 'displayName', 'title'].includes(key))) {
      assert.deepEqual(after[key], before[key], `${correction.legacyRuntimeId}:${key}`);
    }
  }
  for (const merge of migration.canonicalMerges) {
    assert.equal(migrated.products.some((row) => String(row.id).toLowerCase() === merge.sourceLegacyRuntimeId), false);
    const beforeTarget = catalog.products.find((row) => String(row.id).toLowerCase() === merge.targetLegacyRuntimeId);
    const afterTarget = migrated.products.find((row) => String(row.id).toLowerCase() === merge.targetLegacyRuntimeId);
    assert.deepEqual(afterTarget, beforeTarget, 'merge must not copy fields from the dirty source product');
  }
  for (const quarantine of migration.canonicalQuarantines) {
    assert.equal(migrated.products.some((row) => (
      String(row.id).toLowerCase() === quarantine.sourceLegacyRuntimeId
    )), false);
    const beforeTarget = catalog.products.find((row) => (
      String(row.id).toLowerCase() === quarantine.targetLegacyRuntimeId
    ));
    const afterTarget = migrated.products.find((row) => (
      String(row.id).toLowerCase() === quarantine.targetLegacyRuntimeId
    ));
    assert.deepEqual(afterTarget, beforeTarget, 'quarantine must not donate any source fields');
  }
  assert.deepEqual(
    applyRetailerIdentityMigrationToCatalog({ catalog: migrated, migration }),
    migrated,
    'catalog migration replay must be idempotent',
  );
});

test('canonical registry preserves corrected IDs and maps merged legacy IDs to an existing target', async () => {
  const { catalog, migration } = await fixture();
  const migratedCatalog = applyRetailerIdentityMigrationToCatalog({ catalog, migration });
  const registry = buildCanonicalRegistry(migratedCatalog, { identityMigration: migration });
  const mapping = new Map(registry.identifierMappings.map((row) => [
    row.legacyRuntimeId,
    row.canonicalProductId,
  ]));

  for (const correction of migration.canonicalCorrections) {
    assert.equal(mapping.get(correction.legacyRuntimeId), correction.canonicalProductId);
    assert.equal(
      registry.products.find((row) => row.id === correction.canonicalProductId)?.model,
      correction.toModel,
    );
  }
  for (const merge of migration.canonicalMerges) {
    assert.equal(mapping.get(merge.sourceLegacyRuntimeId), merge.targetCanonicalProductId);
    assert.equal(mapping.get(merge.targetLegacyRuntimeId), merge.targetCanonicalProductId);
    const target = registry.products.find((row) => row.id === merge.targetCanonicalProductId);
    assert.ok(target.identifiers.some((identifier) => (
      identifier.scheme === 'legacy_runtime_id'
      && identifier.value === merge.sourceLegacyRuntimeId
    )));
  }
  for (const quarantine of migration.canonicalQuarantines) {
    assert.equal(mapping.has(quarantine.sourceLegacyRuntimeId), false);
    assert.equal(
      mapping.get(quarantine.targetLegacyRuntimeId),
      quarantine.targetCanonicalProductId,
    );
  }
});

test('canonical registry rejects manual identity decisions that conflict with machine migration', async () => {
  const { catalog, migration } = await fixture();
  const migratedCatalog = applyRetailerIdentityMigrationToCatalog({ catalog, migration });
  const migratedIdentity = migration.canonicalCorrections[0] ?? migration.canonicalMerges[0];
  const legacyRuntimeId = migratedIdentity.legacyRuntimeId ?? migratedIdentity.targetLegacyRuntimeId;
  assert.throws(() => buildCanonicalRegistry(migratedCatalog, {
    identityMigration: migration,
    identityDecisions: [{
      legacyRuntimeId,
      canonicalProductId: `fa_prod_${'f'.repeat(24)}`,
      status: 'approved',
      reviewer: 'Migration conflict canary',
      reviewedAt: '2026-07-21',
      rationale: 'Synthetic conflicting decision.',
    }],
  }), /identity migration.*(?:conflict|drift)/i);
});

test('tracked ledger contains every authorised disposition and migration replay is idempotent', async () => {
  const { ledger, migration } = await fixture();
  const migrated = applyRetailerIdentityMigrationToLedger({ ledger, migration });
  assert.equal(migrated.identityResolutionEvents.length, migration.linkEvents.length);
  const priorObservationIds = new Set(ledger.observations.map((row) => row.id));
  const newlyGenerated = migration.linkEvents.filter((event) => (
    event.observation != null && !priorObservationIds.has(event.observation.id)
  ));
  assert.equal(migrated.observations.length, ledger.observations.length + newlyGenerated.length);
  for (const epoch of migration.sourceBindings.resolutionEpochs) {
    assert.ok(migrated.sourceBindings.some((binding) => (
      binding.kind === 'IDENTITY_RESOLUTION' && binding.sha256 === epoch.semanticSha256
    )));
  }
  const generatedIds = new Set(migration.linkEvents.map((event) => event.observation?.id).filter(Boolean));
  assert.equal(generatedIds.size, migration.summary.generatedObservations);
  assert.equal(
    migrated.observations.filter((row) => generatedIds.has(row.id)).length,
    migration.summary.generatedObservations,
  );
  assert.deepEqual(applyRetailerIdentityMigrationToLedger({ ledger: migrated, migration }), migrated);
});

test('migration application fails closed on catalogue identity drift and a ledger from another epoch', async () => {
  const { catalog, ledger, migration } = await fixture();
  const driftedCatalog = structuredClone(catalog);
  const migratedIdentity = migration.canonicalCorrections[0] ?? migration.canonicalMerges[0];
  const legacyRuntimeId = migratedIdentity.legacyRuntimeId ?? migratedIdentity.sourceLegacyRuntimeId;
  driftedCatalog.products.find((row) => String(row.id).toLowerCase()
    === legacyRuntimeId).model = 'UNRELATED';
  assert.throws(() => applyRetailerIdentityMigrationToCatalog({ catalog: driftedCatalog, migration }), /identity drift/i);

  const driftedLedger = structuredClone(ledger);
  driftedLedger.semanticSha256 = '0'.repeat(64);
  assert.throws(() => applyRetailerIdentityMigrationToLedger({ ledger: driftedLedger, migration }), /integrity|epoch|drift/i);
});

test('repository scripts freeze one migration epoch and replay it idempotently', async (context) => {
  const { resolution, publicProjection, ledger, migration } = await fixture();
  const directory = await mkdtemp(join(tmpdir(), 'fitappliance-identity-migration-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const paths = {
    resolution: join(directory, 'resolution.json'),
    projection: join(directory, 'projection.json'),
    ledger: join(directory, 'ledger.json'),
    migratedLedger: join(directory, 'migrated-ledger.json'),
    migration: join(directory, 'migration.json'),
  };
  await Promise.all([
    writeFile(paths.resolution, JSON.stringify(resolution)),
    writeFile(paths.projection, JSON.stringify(publicProjection)),
    writeFile(paths.ledger, JSON.stringify(ledger)),
    writeFile(paths.migration, JSON.stringify(migration)),
  ]);
  const first = await buildRetailerIdentityMigrationFromRepository({
    output: paths.migration,
    resolutionInput: paths.resolution,
    publicProjectionInput: paths.projection,
    ledgerInput: paths.ledger,
  });
  const migrated = await applyRetailerIdentityMigrationFromRepository({
    migrationInput: paths.migration,
    ledgerInput: paths.ledger,
    output: paths.migratedLedger,
  });
  const replay = await buildRetailerIdentityMigrationFromRepository({
    output: paths.migration,
    resolutionInput: paths.resolution,
    publicProjectionInput: paths.projection,
    ledgerInput: paths.migratedLedger,
  });
  const appliedAgain = await applyRetailerIdentityMigrationFromRepository({
    migrationInput: paths.migration,
    ledgerInput: paths.migratedLedger,
    output: paths.migratedLedger,
  });

  assert.deepEqual(replay, first);
  assert.deepEqual(appliedAgain, migrated);
});

test('projection rebind accepts only a non-identity safety projection', async () => {
  const { publicProjection, migration } = await fixture();
  const priorProjection = structuredClone(publicProjection);
  priorProjection.products[0].retailers = [{
    n: 'Private fixture',
    url: 'https://retailer.example/private',
    source: 'partnerize-feed',
  }];
  priorProjection.products[0].unavailable = false;
  const priorBindings = structuredClone(migration.sourceBindings);
  delete priorBindings.projectionRebinds;
  const priorMigration = resealMigration({
    ...structuredClone(migration),
    sourceBindings: {
      ...priorBindings,
      publicProjectionSemanticSha256: digest(priorProjection),
    },
  });

  const rebound = rebindRetailerIdentityMigrationProjection({
    existingMigration: priorMigration,
    priorPublicProjection: priorProjection,
    nextPublicProjection: publicProjection,
  });
  assert.equal(
    rebound.sourceBindings.publicProjectionSemanticSha256,
    digest(publicProjection),
  );
  assert.equal(
    rebound.sourceBindings.projectionRebinds.at(-1).predecessorMigrationSemanticSha256,
    priorMigration.semanticSha256,
  );
  assert.doesNotThrow(() => validateRetailerIdentityMigration(rebound));

  const identityDrift = structuredClone(publicProjection);
  identityDrift.products[0].model = 'DIFFERENT-MODEL';
  assert.throws(() => rebindRetailerIdentityMigrationProjection({
    existingMigration: priorMigration,
    priorPublicProjection: priorProjection,
    nextPublicProjection: identityDrift,
  }), /identity inventory drift/i);
});
