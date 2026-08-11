import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  assertHistoricalRecoveryActiveRelease,
  buildHistoricalRecoveryActiveReleaseView,
} from '../../src/domain/historical-recovery-active-release.mjs';
import { runHistoricalRecoveryActiveReleaseAudit } from '../../scripts/architecture-v2/audit-historical-recovery-active-release.mjs';

function releaseFixture() {
  return {
    descriptor: {
      releaseCandidateId: 'retail_lifecycle_release_aaaaaaaaaaaaaaaaaaaaaaaa',
      artifacts: {
        publicProjection: { sha256: 'a'.repeat(64) },
        historicalReference: { sha256: 'b'.repeat(64) },
      },
    },
    catalog: {
      products: [
        { id: 'current', retailLifecycle: { lifecycleState: 'CURRENT_RETAIL' } },
        { id: 'archived', retailLifecycle: { lifecycleState: 'CATALOG_ARCHIVED' } },
        { id: 'unknown', retailLifecycle: { lifecycleState: 'UNKNOWN_RETAIL' } },
      ],
    },
    reference: {
      schemaVersion: 1,
      generatedAt: '2026-07-30T00:00:00.000Z',
      records: [
        { referenceId: 'ref-current', lifecycleState: 'UNKNOWN_RETAIL', catalogProductIds: ['current'] },
        { referenceId: 'ref-archived', lifecycleState: 'CURRENT_RETAIL', catalogProductIds: ['archived'] },
        { referenceId: 'ref-unknown', lifecycleState: 'CATALOG_ARCHIVED', catalogProductIds: ['unknown'] },
        { referenceId: 'ref-unbound', lifecycleState: 'REGISTRY_ONLY', catalogProductIds: [] },
      ],
    },
  };
}

test('active recovery view overlays only catalogue-bound lifecycle decisions', () => {
  const view = buildHistoricalRecoveryActiveReleaseView(releaseFixture());

  assert.deepEqual(view.reference.records.map(({ referenceId, lifecycleState }) => ({
    referenceId,
    lifecycleState,
  })), [
    { referenceId: 'ref-current', lifecycleState: 'CURRENT_RETAIL' },
    { referenceId: 'ref-archived', lifecycleState: 'CATALOG_ARCHIVED' },
    { referenceId: 'ref-unknown', lifecycleState: 'UNKNOWN_RETAIL' },
    { referenceId: 'ref-unbound', lifecycleState: 'REGISTRY_ONLY' },
  ]);
  assert.equal(view.referencesById.get('ref-current').lifecycleState, 'CURRENT_RETAIL');
  assert.equal(view.referencesById.get('ref-archived').lifecycleState, 'CATALOG_ARCHIVED');
  assert.equal(view.summary.references, 4);
  assert.equal(view.summary.boundReferences, 3);
  assert.equal(view.summary.unboundReferences, 1);
});

test('privacy successor archives a bound product whose private lifecycle evidence was withheld', () => {
  const release = releaseFixture();
  release.descriptor.schemaVersion = 2;
  release.descriptor.releaseKind = 'PRIVACY_SANITIZATION_SUCCESSOR';
  release.catalog.products[0] = {
    id: 'current',
    unavailable: true,
    retailers: [],
  };

  const view = buildHistoricalRecoveryActiveReleaseView(release);
  const reference = view.referencesById.get('ref-current');

  assert.equal(reference.lifecycleState, 'CATALOG_ARCHIVED');
  assert.deepEqual(reference.retailLifecycle.reasonCodes, [
    'LIFECYCLE_NOT_RELEASED_IN_PRIVACY_SUCCESSOR',
  ]);
});

test('active recovery view rejects missing, multiple, conflicting and duplicate bindings', () => {
  const missing = releaseFixture();
  missing.reference.records[0].catalogProductIds = ['missing'];
  assert.throws(() => buildHistoricalRecoveryActiveReleaseView(missing), /missing catalogue product/i);

  const multiple = releaseFixture();
  multiple.reference.records[0].catalogProductIds = ['current', 'archived'];
  assert.throws(() => buildHistoricalRecoveryActiveReleaseView(multiple), /multiple catalogue products/i);

  const conflicting = releaseFixture();
  conflicting.catalog.products.push({
    id: 'conflicting-current',
    retailLifecycle: { lifecycleState: 'CURRENT_RETAIL' },
  });
  conflicting.reference.records[0].catalogProductIds = ['current', 'conflicting-current'];
  assert.throws(() => buildHistoricalRecoveryActiveReleaseView(conflicting), /multiple catalogue products/i);

  const duplicate = releaseFixture();
  duplicate.reference.records.push({ ...duplicate.reference.records[0] });
  assert.throws(() => buildHistoricalRecoveryActiveReleaseView(duplicate), /duplicate reference ID/i);
});

test('active recovery audit rejects identity loss, orphaned receipts and archived current lanes', () => {
  const view = buildHistoricalRecoveryActiveReleaseView(releaseFixture());
  const classification = {
    records: view.reference.records.map((row) => ({
      referenceId: row.referenceId,
      lifecycleState: row.lifecycleState,
    })),
  };
  assert.doesNotThrow(() => assertHistoricalRecoveryActiveRelease({
    view,
    classification,
    acceptanceBundle: { entries: [{ referenceId: 'ref-current' }] },
    acquisitionQueue: {
      activeReleaseSourceBinding: {
        releaseCandidateId: view.releaseCandidateId,
        ...view.sourceBindings,
      },
      records: [],
    },
    executableQueue: { targets: [], discoveryTargets: [] },
    targetState: { records: [] },
    boundedBatches: { manifests: [] },
    scaleControl: { decision: { status: 'COMPLETE', allowedManifestId: null } },
  }));

  classification.records.pop();
  assert.throws(() => assertHistoricalRecoveryActiveRelease({
    view,
    classification,
    acceptanceBundle: { entries: [{ referenceId: 'missing' }] },
    acquisitionQueue: { records: [{ referenceId: 'ref-archived', priority: 'P0_CURRENT_RETAIL' }] },
    executableQueue: { targets: [], discoveryTargets: [] },
    targetState: { records: [] },
    boundedBatches: { manifests: [] },
    scaleControl: { decision: { status: 'COMPLETE', allowedManifestId: null } },
  }), /identity set|orphaned receipt|current lane/i);
});

test('active recovery audit rejects missing or stale acquisition release bindings', () => {
  const view = buildHistoricalRecoveryActiveReleaseView(releaseFixture());
  const classification = {
    records: view.reference.records.map((row) => ({
      referenceId: row.referenceId,
      lifecycleState: row.lifecycleState,
    })),
  };
  const input = {
    view,
    classification,
    acceptanceBundle: { entries: [] },
    executableQueue: { targets: [], discoveryTargets: [] },
    targetState: { records: [] },
    boundedBatches: { manifests: [] },
    scaleControl: { decision: { status: 'COMPLETE', allowedManifestId: null } },
  };

  assert.throws(() => assertHistoricalRecoveryActiveRelease({
    ...input,
    acquisitionQueue: { records: [] },
  }), /acquisition.*binding/i);
  assert.throws(() => assertHistoricalRecoveryActiveRelease({
    ...input,
    acquisitionQueue: {
      activeReleaseSourceBinding: {
        releaseCandidateId: view.releaseCandidateId,
        ...view.sourceBindings,
        publicProjectionSha256: 'f'.repeat(64),
      },
      records: [],
    },
  }), /acquisition.*binding/i);
});

test('recovery and normal builds cannot publish generated legacy history', async () => {
  const scripts = JSON.parse(await readFile('package.json', 'utf8')).scripts;
  assert.doesNotMatch(scripts['refresh:historical-evidence-recovery:inputs'], /build-public-projection|build:historical-reference|publish:historical-reference/);
  assert.match(scripts['refresh:historical-evidence-recovery:inputs'], /audit:active-retail-release/);
  assert.doesNotMatch(scripts['build:architecture-v2'], /publish:historical-reference/);
  assert.equal(scripts['publish:historical-reference'], undefined);
});

test('acquisition queue builder reads catalog and reference through the active release view', async () => {
  const source = await readFile(
    'scripts/architecture-v2/build-historical-model-pdf-acquisition-queue.mjs',
    'utf8',
  );
  assert.match(source, /loadHistoricalRecoveryActiveRelease/);
  assert.doesNotMatch(source, /readJson\('historicalApplianceReference'\)|readJson\('publicProjection'\)/);
});

test('committed recovery control graph is bound to the active release', async () => {
  const activeDescriptor = JSON.parse(await readFile(
    'data/architecture-v2/decisions/active-retail-release.json',
    'utf8',
  ));
  const audit = await runHistoricalRecoveryActiveReleaseAudit({ write: false });
  assert.equal(audit.releaseCandidateId, activeDescriptor.releaseCandidateId);
  assert.equal(audit.summary.activeReferences, 8087);
  assert.equal(audit.summary.generatedOnlyIdentities, 2);
  assert.ok(audit.identityDispositions.every((row) => row.disposition === 'QUARANTINED_GENERATED_ONLY'));
  assert.equal(audit.summary.issues, 0);
});
