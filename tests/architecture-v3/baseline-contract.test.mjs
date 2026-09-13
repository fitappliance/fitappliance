import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  auditV3Baseline,
  inventoryDirtyRecovery,
  runCli,
} from '../../scripts/architecture-v3/audit-baseline.mjs';

const execFile = promisify(execFileCallback);
const RELEASE_PREFIX = 'retail_lifecycle_release_';
const CODE_SCOPE = Object.freeze([
  ['audit-baseline', 'scripts/architecture-v3/audit-baseline.mjs'],
  ['active-release-loader', 'src/domain/active-retail-release.mjs'],
  ['release-candidate-validator', 'src/domain/retail-lifecycle-release-candidate.mjs'],
  ['default-fit-publication-audit', 'scripts/architecture-v2/audit-fit-publication.mjs'],
  ['architecture-v2-paths', 'src/domain/architecture-v2-paths.mjs'],
  ['runtime-publisher', 'scripts/architecture-v2/publish-runtime-projection.js'],
  ['active-publication-boundary', 'scripts/architecture-v2/publish-active-retail-release.mjs'],
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function semanticSha256(value) {
  return sha256(JSON.stringify(canonical(value)));
}

function artifact(owner, path, document, { pretty = false } = {}) {
  const bytes = Buffer.from(pretty ? `${JSON.stringify(document, null, 2)}\n` : JSON.stringify(document));
  return { source: 'repository', owner, path, bytes, sha256: sha256(bytes) };
}

function artifactBytes(owner, path, bytes) {
  const value = Buffer.from(bytes);
  return { source: 'repository', owner, path, bytes: value, sha256: sha256(value) };
}

function unavailableArtifact(owner, path) {
  return {
    source: 'repository', owner, path, unavailable: true,
    reason: 'FIXTURE_MIGRATION_INPUT_UNAVAILABLE',
  };
}

function releaseManifest({
  legacy,
  active,
  historical,
  candidateBase,
  identityMigration,
  candidateShadow,
  officialMarket,
  releasePolicy,
  identityMigrationSemanticSha256 = semanticSha256(JSON.parse(identityMigration.bytes)),
  candidateShadowSemanticSha256 = semanticSha256(JSON.parse(candidateShadow.bytes)),
  officialMarketSemanticSha256 = semanticSha256(JSON.parse(officialMarket.bytes)),
  baselineProducts,
  finalCandidateProducts,
  currentRetailIds,
  blocked = false,
}) {
  const removedLegacyRuntimeIds = Array.from(
    { length: Math.max(0, baselineProducts - finalCandidateProducts) },
    (_, index) => `legacy-removed-${index + 1}`,
  );
  const addedLegacyRuntimeIds = Array.from(
    { length: Math.max(0, finalCandidateProducts - baselineProducts) },
    (_, index) => `legacy-added-${index + 1}`,
  );
  const unresolvedIds = blocked ? ['fa_prod_fixture_unresolved'] : [];
  const accountedLegacyCurrentProducts = currentRetailIds.length + unresolvedIds.length;
  const document = {
    schemaVersion: 1,
    policyVersion: 'retail-lifecycle-release-candidate-v1',
    mode: 'SHADOW_ONLY',
    releaseEpoch: 'fixture-release-epoch',
    generatedAt: '2026-01-01T00:00:00.000Z',
    sourceBindings: {
      baselinePublicProjectionSha256: legacy.sha256,
      baselinePublicProjectionSemanticSha256: semanticSha256(JSON.parse(legacy.bytes)),
      candidateBaseProjectionSha256: candidateBase.sha256,
      candidateBaseProjectionSemanticSha256: semanticSha256(JSON.parse(candidateBase.bytes)),
      finalCandidateProjectionSha256: active.sha256,
      finalCandidateProjectionSemanticSha256: semanticSha256(JSON.parse(active.bytes)),
      identityMigrationSha256: identityMigration.sha256,
      identityMigrationSemanticSha256,
      candidateShadowSha256: candidateShadow.sha256,
      candidateShadowSemanticSha256,
      officialMarketLifecycleSha256: officialMarket.sha256,
      officialMarketLifecycleSemanticSha256: officialMarketSemanticSha256,
      historicalReferenceCandidateSha256: historical.sha256,
      historicalReferenceCandidateSemanticSha256: semanticSha256(JSON.parse(historical.bytes)),
      releasePolicySha256: releasePolicy.sha256,
    },
    partition: {
      expectedLegacyCurrentProducts: accountedLegacyCurrentProducts,
      accountedLegacyCurrentProducts,
      currentRetailIds,
      explicitUnavailableIds: [],
      marketReferenceIds: [],
      identityMergeIds: [],
      identityQuarantineIds: [],
      unresolvedIds,
      unsafeRemovedIds: [],
    },
    membership: {
      baselineProducts,
      candidateBaseProducts: finalCandidateProducts,
      finalCandidateProducts,
      removedLegacyRuntimeIds,
      addedLegacyRuntimeIds,
      identityMergeRemovedLegacyRuntimeIds: removedLegacyRuntimeIds,
      identityQuarantineRemovedLegacyRuntimeIds: [],
      unexplainedRemovedLegacyRuntimeIds: [],
      unexplainedIdentityChanges: [],
    },
    publicationAudit: {
      unsafeCurrentIds: [],
      unsafeMarketReferenceIds: [],
      unsafePublicControlPlaneIds: [],
      fitPublicationViolations: 0,
    },
    authorization: { status: blocked ? 'BLOCKED' : 'READY_FOR_CUTOVER', reasonCodes: [] },
    rollback: { status: 'PROVEN_BYTE_IDENTICAL', restoredBaselineSha256: legacy.sha256 },
  };
  const semantic = semanticSha256(document);
  return {
    ...document,
    releaseCandidateId: `${RELEASE_PREFIX}${semantic.slice(0, 24)}`,
    semanticSha256: semantic,
  };
}

async function git(root, args) {
  await execFile('git', args, { cwd: root });
}

async function gitBuffer(root, args) {
  const { stdout } = await execFile('git', args, { cwd: root, encoding: 'buffer' });
  return Buffer.from(stdout);
}

async function createDirtyRecovery(t, { sensitive = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-g0a-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await git(root, ['init', '--quiet']);
  await writeFile(join(root, 'tracked.json'), '{"before":true}\n');
  if (sensitive) await writeFile(join(root, '.env'), 'TOKEN=before\n');
  await git(root, ['add', 'tracked.json']);
  if (sensitive) await git(root, ['add', '.env']);
  await git(root, ['-c', 'user.name=G0a Test', '-c', 'user.email=g0a@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  await writeFile(join(root, 'tracked.json'), '{"after":true}\n');
  if (sensitive) await writeFile(join(root, '.env'), 'TOKEN=after\n');
  await writeFile(join(root, 'untracked.json'), '{"untracked":true}\n');
  return root;
}

async function createPaddedPathRecovery(t) {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-g0a-padded-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await git(root, ['init', '--quiet']);
  await writeFile(join(root, ' padded.txt '), 'padded-before\n');
  await writeFile(join(root, 'padded.txt'), 'plain-before\n');
  await git(root, ['add', '-A']);
  await git(root, ['-c', 'user.name=G0a Test', '-c', 'user.email=g0a@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  await writeFile(join(root, ' padded.txt '), 'padded-after\n');
  await writeFile(join(root, 'padded.txt'), 'plain-after\n');
  return root;
}

async function createLiteralPathspecRecovery(t) {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-g0a-literal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await git(root, ['init', '--quiet']);
  await writeFile(join(root, '.env'), 'TOKEN=before\n');
  await writeFile(join(root, '*'), 'star-before\n');
  await git(root, ['add', '-A']);
  await git(root, ['-c', 'user.name=G0a Test', '-c', 'user.email=g0a@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  await writeFile(join(root, '.env'), 'TOKEN=after\n');
  await writeFile(join(root, '*'), 'star-after\n');
  return root;
}

async function createFixture(t, {
  activeDocument = {
    products: [
      {
        id: 'active-current', canonicalProductId: 'fa_prod_fixture_current', unavailable: false,
        lifecycleVisibility: 'CURRENT_OUTPUT', retailLifecycle: { lifecycleState: 'CURRENT_RETAIL' },
      },
      {
        id: 'active-archived', canonicalProductId: 'fa_prod_fixture_archived', unavailable: true,
        lifecycleVisibility: 'HISTORICAL_INPUT_ONLY', retailLifecycle: { lifecycleState: 'CATALOG_ARCHIVED' },
      },
    ],
  },
  legacyDocument = {
    products: [{ id: 'legacy-current' }, { id: 'legacy-archived' }, { id: 'legacy-removed' }],
  },
  manifestBaselineProducts = legacyDocument.products.length,
  blocked = false,
  identityMigrationArtifact = null,
  identityMigrationSemanticSha256 = null,
  candidateShadowArtifact = null,
  candidateShadowSemanticSha256 = null,
  officialMarketArtifact = null,
  officialMarketSemanticSha256 = null,
} = {}) {
  const legacy = artifact(
    'legacy-default-audit-input',
    'data/architecture-v2/generated/public-catalog-projection.json',
    legacyDocument,
    { pretty: true },
  );
  const historicalDocument = { records: [{ id: 'historical-fixture' }] };
  const candidateBase = artifact('manifest-candidate-base', 'data/architecture-v2/generated/public-catalog-projection-migration-candidate.json', activeDocument);
  const identityMigration = identityMigrationArtifact ?? artifact('manifest-identity-migration', 'data/architecture-v2/reviews/automated/retailer-identity-migration.json', { kind: 'identity' });
  const candidateShadow = candidateShadowArtifact ?? artifact('manifest-candidate-shadow', 'data/architecture-v2/reviews/automated/retail-lifecycle-shadow-migration-candidate.json', { kind: 'shadow' });
  const officialMarket = officialMarketArtifact ?? artifact('manifest-official-market', 'data/architecture-v2/generated/official-market-lifecycle-migration-candidate.json', { kind: 'market' });
  const releasePolicy = artifact('manifest-release-policy', 'data/architecture-v2/policies/retail-lifecycle-release-policy.json', { mode: 'SHADOW_ONLY' });
  const provisionalActive = artifact('active-release-public-projection', 'provisional', activeDocument, { pretty: true });
  const provisionalHistorical = artifact('active-release-historical-reference', 'provisional', historicalDocument, { pretty: true });
  const manifestDocument = releaseManifest({
    legacy,
    active: provisionalActive,
    historical: provisionalHistorical,
    candidateBase,
    identityMigration,
    candidateShadow,
    officialMarket,
    releasePolicy,
    identityMigrationSemanticSha256: identityMigrationSemanticSha256 ?? semanticSha256(JSON.parse(identityMigration.bytes)),
    candidateShadowSemanticSha256: candidateShadowSemanticSha256 ?? semanticSha256(JSON.parse(candidateShadow.bytes)),
    officialMarketSemanticSha256: officialMarketSemanticSha256 ?? semanticSha256(JSON.parse(officialMarket.bytes)),
    baselineProducts: manifestBaselineProducts,
    finalCandidateProducts: activeDocument.products.length,
    currentRetailIds: activeDocument.products
      .filter((row) => row.unavailable === false
        && row.lifecycleVisibility === 'CURRENT_OUTPUT'
        && row.retailLifecycle?.lifecycleState === 'CURRENT_RETAIL')
      .map((row) => row.canonicalProductId)
      .sort(),
    blocked,
  });
  const releaseDirectory = `data/architecture-v2/releases/${manifestDocument.releaseCandidateId}`;
  const active = artifact('active-release-public-projection', `${releaseDirectory}/public-catalog-projection.json`, activeDocument, { pretty: true });
  const historical = artifact('active-release-historical-reference', `${releaseDirectory}/historical-appliance-reference.json`, historicalDocument, { pretty: true });
  const manifest = artifact('active-release-manifest', `${releaseDirectory}/authorization-manifest.json`, manifestDocument, { pretty: true });
  const descriptor = artifact('active-release-descriptor', 'data/architecture-v2/decisions/active-retail-release.json', {
    schemaVersion: 1,
    policyVersion: 'active-retail-release-v1',
    releaseCandidateId: manifestDocument.releaseCandidateId,
    activatedAt: '2026-01-01T00:00:00.000Z',
    artifacts: {
      publicProjection: { path: active.path, sha256: active.sha256 },
      historicalReference: { path: historical.path, sha256: historical.sha256 },
      authorizationManifest: { path: manifest.path, sha256: manifest.sha256 },
    },
    rollback: { status: 'PROVEN_BYTE_IDENTICAL', baselinePublicProjectionSha256: legacy.sha256 },
  }, { pretty: true });
  const runtime = artifact('runtime-public-projection', 'public/data/appliances.json', activeDocument);
  const marker = artifact('runtime-projection-marker', 'public/data/catalog-projection.json', {
    schemaVersion: 2,
    activeProjection: 'v2',
    productCount: activeDocument.products.length,
  });
  const dirtyRoot = await createDirtyRecovery(t);
  return {
    input: {
      activeDescriptor: descriptor,
      manifest: {
        artifact: manifest,
        activeProjection: active,
        historicalReference: historical,
        sourceBindings: {
          legacy,
          candidateBase,
          identityMigration: identityMigrationArtifact ?? unavailableArtifact(
            'manifest-identity-migration',
            'data/architecture-v2/reviews/automated/retailer-identity-migration.json',
          ),
          candidateShadow: candidateShadowArtifact ?? unavailableArtifact(
            'manifest-candidate-shadow',
            'data/architecture-v2/reviews/automated/retail-lifecycle-shadow-migration-candidate.json',
          ),
          officialMarket: officialMarketArtifact ?? unavailableArtifact(
            'manifest-official-market',
            'data/architecture-v2/generated/official-market-lifecycle-migration-candidate.json',
          ),
          releasePolicy,
        },
      },
      runtime: { projection: runtime, marker },
      legacyAudit: {
        projection: legacy,
        receiptBundle: artifact('legacy-default-audit-receipts', 'data/architecture-v2/reviews/automated/installation-evidence-receipts.json', { receipts: [] }),
        replayAudit: artifact('legacy-default-audit-replay-audit', 'data/architecture-v2/reviews/automated/installation-evidence-receipt-replay-audit.json', { replay: [] }),
        controlPlane: artifact('legacy-default-audit-control-plane', 'data/architecture-v2/generated/installation-evidence-pipeline.json', { stages: [] }),
      },
      code: {
        baselineCommit: 'a'.repeat(40),
        files: CODE_SCOPE.map(([owner, path]) => artifact(`code-${owner}`, path, { owner })),
      },
      policies: {
        fieldRights: artifact('policy-field-rights', 'data/architecture-v2/policies/product-data-field-rights-dictionary.json', { fields: [] }),
        manufacturerSource: artifact('policy-manufacturer-source', 'data/architecture-v2/policies/manufacturer-source-policy.json', { sources: [] }),
        applicabilityMatrix: artifact('policy-applicability-matrix', 'data/architecture-v2/generated/installation-evidence-applicability-matrix.json', { rows: [] }),
      },
      dirtyRecovery: { root: dirtyRoot },
    },
    expected: { active: active.sha256, legacy: legacy.sha256, runtime: runtime.sha256 },
  };
}

async function checkedInMigrationArtifact(owner, path) {
  const bytes = await readFile(new URL(`../../${path}`, import.meta.url));
  return Object.freeze({
    artifact: artifactBytes(owner, path, bytes),
    document: JSON.parse(bytes),
  });
}

test('binds active release separately from legacy default audit and derives fixture denominators', async (t) => {
  const { input, expected } = await createFixture(t);
  const before = await inventoryDirtyRecovery(input.dirtyRecovery);

  const result = await auditV3Baseline(input);
  const after = await inventoryDirtyRecovery(input.dirtyRecovery);

  assert.equal(result.activeReleaseDescriptorSha256, input.activeDescriptor.sha256);
  assert.equal(result.activeManifestSha256, input.manifest.artifact.sha256);
  assert.equal(result.runtimeProjectionSha256, expected.runtime);
  assert.equal(result.legacyAuditInputSha256, expected.legacy);
  assert.deepEqual(result.denominatorsByArtifact, {
    activeRelease: { products: 2, currentRetailProducts: 1 },
    historicalReference: { records: 1 },
    legacyDefaultAudit: { products: 3 },
    runtimeProjection: { products: 2 },
  });
  assert.notEqual(result.runtimeProjectionSha256, expected.active);
  assert.equal(
    result.inputHashes.runtimeProjection.semanticSha256,
    result.inputHashes.activeReleasePublicProjection.semanticSha256,
  );
  assert.equal(after.snapshotSha256, before.snapshotSha256);
});

test('uses validated producer semantics for correct bound migration inputs', async (t) => {
  const [identity, shadow, market] = await Promise.all([
    checkedInMigrationArtifact(
      'manifest-identity-migration',
      'data/architecture-v2/reviews/automated/retailer-identity-migration.json',
    ),
    checkedInMigrationArtifact(
      'manifest-candidate-shadow',
      'data/architecture-v2/reviews/automated/retail-lifecycle-shadow-migration-candidate.json',
    ),
    checkedInMigrationArtifact(
      'manifest-official-market',
      'data/architecture-v2/generated/official-market-lifecycle-migration-candidate.json',
    ),
  ]);
  assert.notEqual(semanticSha256(identity.document), identity.document.semanticSha256);
  const { input } = await createFixture(t, {
    identityMigrationArtifact: identity.artifact,
    identityMigrationSemanticSha256: identity.document.semanticSha256,
    candidateShadowArtifact: shadow.artifact,
    candidateShadowSemanticSha256: shadow.document.semanticSha256,
    officialMarketArtifact: market.artifact,
    officialMarketSemanticSha256: market.document.semanticSha256,
  });

  const result = await auditV3Baseline(input);
  const byBinding = new Map(result.inputHashes.sourceBindings.map((binding) => [binding.binding, binding]));

  for (const [binding, document] of [
    ['identityMigrationSha256', identity.document],
    ['candidateShadowSha256', shadow.document],
    ['officialMarketLifecycleSha256', market.document],
  ]) {
    assert.equal(byBinding.get(binding).actualSemanticSha256, document.semanticSha256);
    assert.equal(byBinding.get(binding).disposition, 'CURRENT_MIGRATION_INPUT_MATCH');
  }
});

test('exported audit rejects a valid manifest that is not ready for cutover', async (t) => {
  const { input } = await createFixture(t, { blocked: true });

  await assert.rejects(auditV3Baseline(input), /READY_FOR_CUTOVER/);
});

test('exported audit rejects a descriptor whose rollback proof differs from the manifest', async (t) => {
  const { input } = await createFixture(t);
  const descriptor = JSON.parse(input.activeDescriptor.bytes);
  descriptor.rollback.baselinePublicProjectionSha256 = 'b'.repeat(64);
  input.activeDescriptor = artifact(
    'active-release-descriptor',
    'data/architecture-v2/decisions/active-retail-release.json',
    descriptor,
    { pretty: true },
  );

  await assert.rejects(auditV3Baseline(input), /rollback binding mismatch/);
});

test('keeps same-byte active and legacy artifacts as distinct owners and reports the manifest baseline separately', async (t) => {
  const sameDocument = {
    products: [
      {
        id: 'same-current', canonicalProductId: 'fa_prod_fixture_current', unavailable: false,
        lifecycleVisibility: 'CURRENT_OUTPUT', retailLifecycle: { lifecycleState: 'CURRENT_RETAIL' },
      },
      {
        id: 'same-archived', canonicalProductId: 'fa_prod_fixture_archived', unavailable: true,
        lifecycleVisibility: 'HISTORICAL_INPUT_ONLY', retailLifecycle: { lifecycleState: 'CATALOG_ARCHIVED' },
      },
    ],
  };
  const { input } = await createFixture(t, {
    activeDocument: sameDocument,
    legacyDocument: sameDocument,
    manifestBaselineProducts: 3,
  });

  const result = await auditV3Baseline(input);

  assert.equal(result.denominatorsByArtifact.activeRelease.products, 2);
  assert.equal(result.denominatorsByArtifact.legacyDefaultAudit.products, 2);
  assert.equal(result.manifestHistoricalBaseline.declaredProducts, 3);
  assert.equal(result.manifestHistoricalBaseline.disposition, 'BOUND');
});

test('reports malformed lifecycle rows as unknown instead of classifying them as archived', async (t) => {
  const activeDocument = {
    products: [
      {
        id: 'current', canonicalProductId: 'fa_prod_fixture_current', unavailable: false,
        lifecycleVisibility: 'CURRENT_OUTPUT', retailLifecycle: { lifecycleState: 'CURRENT_RETAIL' },
      },
      {
        id: 'archived', canonicalProductId: 'fa_prod_fixture_archived', unavailable: true,
        lifecycleVisibility: 'HISTORICAL_INPUT_ONLY', retailLifecycle: { lifecycleState: 'CATALOG_ARCHIVED' },
      },
      {
        id: 'unknown', canonicalProductId: 'fa_prod_fixture_unknown', unavailable: null,
        lifecycleVisibility: 'CURRENT_OUTPUT', retailLifecycle: { lifecycleState: 'UNKNOWN_RETAIL' },
      },
    ],
  };
  const { input } = await createFixture(t, { activeDocument });

  const result = await auditV3Baseline(input);

  assert.equal(result.populationDetail.activeRelease.currentRetailProducts, 1);
  assert.equal(result.populationDetail.activeRelease.archivedProducts, 1);
  assert.equal(result.populationDetail.activeRelease.marketReferenceProducts, 0);
  assert.equal(result.populationDetail.activeRelease.unknownOrConflictingProducts, 1);
  assert.equal(result.denominatorsByArtifact.activeRelease.products, 3);
  assert.equal(result.denominatorsByArtifact.runtimeProjection.products, 3);
});

test('dirty inventory marks protected files unread and excludes them from its tracked aggregate', async (t) => {
  const root = await createDirtyRecovery(t, { sensitive: true });

  const inventory = await inventoryDirtyRecovery({ root });

  const protectedRow = inventory.rows.find((row) => row.path === '.env');
  assert.deepEqual(protectedRow, {
    statusCode: ' M',
    path: '.env',
    indexSha256: null,
    worktreeSha256: null,
    disposition: 'INVENTORY_GAP',
    unresolvedReason: 'PROTECTED_PATH_NOT_READ;PROTECTED_PATH_NOT_READ',
  });
  assert.deepEqual(inventory.trackedAggregate.excludedSensitivePaths, ['.env']);
});

test('preserves leading and trailing whitespace in distinct Git file identities', async (t) => {
  const root = await createPaddedPathRecovery(t);

  const inventory = await inventoryDirtyRecovery({ root });
  const padded = inventory.rows.find((row) => row.path === ' padded.txt ');
  const plain = inventory.rows.find((row) => row.path === 'padded.txt');

  assert.equal(padded.indexSha256, sha256('padded-before\n'));
  assert.equal(padded.worktreeSha256, sha256('padded-after\n'));
  assert.equal(plain.indexSha256, sha256('plain-before\n'));
  assert.equal(plain.worktreeSha256, sha256('plain-after\n'));
  assert.notEqual(padded.worktreeSha256, plain.worktreeSha256);
});

test('uses literal Git pathspecs so a star filename cannot re-include protected paths', async (t) => {
  const root = await createLiteralPathspecRecovery(t);

  const inventory = await inventoryDirtyRecovery({ root });
  const expectedDiff = await gitBuffer(root, [
    'diff', '--no-ext-diff', '--no-textconv', '--binary', 'HEAD', '--', ':(literal)*',
  ]);

  assert.deepEqual(inventory.trackedAggregate.includedTrackedPaths, ['*']);
  assert.deepEqual(inventory.trackedAggregate.excludedSensitivePaths, ['.env']);
  assert.equal(inventory.trackedDiffSha256, sha256(expectedDiff));
});

test('dirty inventory fails closed when a later scan differs from its expected snapshot', async (t) => {
  const root = await createDirtyRecovery(t);
  const first = await inventoryDirtyRecovery({ root });
  await writeFile(join(root, 'tracked.json'), '{"changed-again":true}\n');

  await assert.rejects(
    inventoryDirtyRecovery({ root, expectedSnapshotSha256: first.snapshotSha256 }),
    /snapshot changed since expected inventory/,
  );
});

test('rejects a descriptor that claims the legacy hash for its active release artifact', async (t) => {
  const { input } = await createFixture(t);
  const descriptor = JSON.parse(input.activeDescriptor.bytes);
  descriptor.artifacts.publicProjection.sha256 = input.legacyAudit.projection.sha256;
  input.activeDescriptor = artifact(
    'active-release-descriptor',
    'data/architecture-v2/decisions/active-retail-release.json',
    descriptor,
    { pretty: true },
  );

  await assert.rejects(auditV3Baseline(input), /active release public projection byte binding mismatch/);
});

test('rejects malformed artifact hashes, a bad runtime marker, and traversal metadata', async (t) => {
  const missing = await createFixture(t);
  missing.input.runtime.projection = undefined;
  await assert.rejects(auditV3Baseline(missing.input), /runtime projection artifact required/);

  const malformed = await createFixture(t);
  malformed.input.runtime.projection.sha256 = 'not-a-sha256';
  await assert.rejects(auditV3Baseline(malformed.input), /lowercase SHA-256/);

  const marker = await createFixture(t);
  marker.input.runtime.marker = artifact('runtime-projection-marker', 'public/data/catalog-projection.json', {
    schemaVersion: 2,
    activeProjection: 'v2',
    productCount: 999,
  });
  await assert.rejects(auditV3Baseline(marker.input), /runtime projection marker mismatch/);

  const traversal = await createFixture(t);
  traversal.input.policies.fieldRights = artifact('policy-field-rights', '../policy.json', { fields: [] });
  await assert.rejects(auditV3Baseline(traversal.input), /repository-relative/);
});

test('check-only CLI rejects unknown and incomplete arguments before reading inputs', async () => {
  await assert.rejects(runCli(['--unexpected']), /unknown argument/);
  await assert.rejects(runCli([]), /--check-only required/);
  await assert.rejects(runCli(['--check-only', '--root']), /--root requires a path/);
});
