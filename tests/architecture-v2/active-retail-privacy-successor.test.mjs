import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  loadActiveRetailRelease,
  validateActiveRetailReleaseDescriptor,
} from '../../src/domain/active-retail-release.mjs';
import {
  buildActiveRetailPrivacySuccessor,
  validateActiveRetailPrivacySuccessorManifest,
} from '../../src/domain/active-retail-privacy-successor.mjs';
import { assertNoPrivateRetailerFeedPublication } from '../../src/domain/public-projection.mjs';
import { hashHistoricalCatalogBinding } from '../../src/domain/historical-catalog-binding.mjs';
import { buildPrivacySuccessorDescriptor } from '../../scripts/architecture-v2/build-active-retail-privacy-successor.mjs';
import { verifyPrivateRecoveryArtifacts } from '../../scripts/architecture-v2/build-active-retail-privacy-successor.mjs';

const HASH = 'a'.repeat(64);

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

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function candidateManifest({ catalog, catalogBytes, reference, referenceBytes }) {
  const document = {
    schemaVersion: 1,
    policyVersion: 'retail-lifecycle-release-candidate-v1',
    mode: 'SHADOW_ONLY',
    releaseEpoch: 'test-epoch',
    generatedAt: '2026-08-10T19:13:03.000Z',
    sourceBindings: {
      baselinePublicProjectionSha256: HASH,
      baselinePublicProjectionSemanticSha256: HASH,
      candidateBaseProjectionSha256: HASH,
      candidateBaseProjectionSemanticSha256: HASH,
      finalCandidateProjectionSha256: sha256(catalogBytes),
      finalCandidateProjectionSemanticSha256: semanticSha256(catalog),
      identityMigrationSha256: HASH,
      identityMigrationSemanticSha256: HASH,
      candidateShadowSha256: HASH,
      candidateShadowSemanticSha256: HASH,
      officialMarketLifecycleSha256: HASH,
      officialMarketLifecycleSemanticSha256: HASH,
      historicalReferenceCandidateSha256: sha256(referenceBytes),
      historicalReferenceCandidateSemanticSha256: semanticSha256(reference),
      releasePolicySha256: HASH,
    },
    partition: {
      expectedLegacyCurrentProducts: 0,
      accountedLegacyCurrentProducts: 0,
      currentRetailIds: [],
      explicitUnavailableIds: [],
      marketReferenceIds: [],
      identityMergeIds: [],
      identityQuarantineIds: [],
      unresolvedIds: [],
      unsafeRemovedIds: [],
    },
    membership: {
      baselineProducts: 2,
      candidateBaseProducts: 2,
      finalCandidateProducts: 2,
      removedLegacyRuntimeIds: [],
      addedLegacyRuntimeIds: [],
      identityMergeRemovedLegacyRuntimeIds: [],
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
    authorization: { status: 'READY_FOR_CUTOVER', reasonCodes: [] },
    rollback: { status: 'PROVEN_BYTE_IDENTICAL', restoredBaselineSha256: HASH },
  };
  const semantic = semanticSha256(document);
  document.releaseCandidateId = `retail_lifecycle_release_${semantic.slice(0, 24)}`;
  document.semanticSha256 = semantic;
  return document;
}

function fixture() {
  const privateRetailer = {
    n: 'The Good Guys',
    sourceType: 'affiliate_feed',
    adapterId: 'the-good-guys-partnerize-feed-v1',
    affiliate_network: 'partnerize',
    affiliate_url: 'https://prf.hn/private',
  };
  const publicRetailer = {
    n: 'Appliances Online',
    source: 'appliances-online-api',
    url: 'https://www.appliancesonline.com.au/product/public',
  };
  const catalog = {
    schema_version: 3,
    products: [
      {
        id: 'private-only',
        canonicalProductId: 'fa_prod_private',
        cat: 'fridge',
        brand: 'Test',
        model: 'PRIVATE-1',
        unavailable: false,
        price: 999,
        retailers: [privateRetailer],
        retailLifecycle: {
          schemaVersion: 1,
          policyVersion: 'retail-lifecycle-v1',
          asOf: '2026-08-10T19:13:03.000Z',
          canonicalProductId: 'fa_prod_private',
          catalogState: 'LISTED_UNVERIFIED',
          lifecycleState: 'CURRENT_RETAIL',
          authorizingObservation: privateRetailer,
          latestObservations: [privateRetailer],
          observationConflicts: [],
          collectionAttempts: [],
          reasonCodes: ['FRESH_AVAILABLE_OBSERVATION'],
        },
      },
      {
        id: 'mixed',
        canonicalProductId: 'fa_prod_mixed',
        cat: 'dishwasher',
        brand: 'Test',
        model: 'MIXED-1',
        unavailable: false,
        price: 899,
        retailers: [privateRetailer, publicRetailer],
        lifecycleVisibility: 'CURRENT_OUTPUT',
        retailLifecycle: {
          schemaVersion: 1,
          policyVersion: 'retail-lifecycle-v1',
          asOf: '2026-08-10T19:13:03.000Z',
          canonicalProductId: 'fa_prod_mixed',
          catalogState: 'LISTED_UNVERIFIED',
          lifecycleState: 'CURRENT_RETAIL',
          authorizingObservation: publicRetailer,
          latestObservations: [publicRetailer],
          observationConflicts: [],
          collectionAttempts: [],
          reasonCodes: ['FRESH_AVAILABLE_OBSERVATION'],
        },
      },
    ],
  };
  const predecessorCatalogBinding = hashHistoricalCatalogBinding(catalog);
  const reference = {
    schemaVersion: 1,
    sourceSnapshotHashes: { 'fitappliance:catalog': predecessorCatalogBinding },
    records: [
      {
        referenceId: 'ref-private',
        category: 'fridge',
        brand: 'Test',
        model: 'PRIVATE-1',
        lifecycleState: 'CURRENT_RETAIL',
        catalogProductIds: ['private-only'],
        sources: [{ sourceId: 'fitappliance:catalog', snapshotSha256: predecessorCatalogBinding }],
      },
      {
        referenceId: 'ref-mixed',
        category: 'dishwasher',
        brand: 'Test',
        model: 'MIXED-1',
        lifecycleState: 'CURRENT_RETAIL',
        catalogProductIds: ['mixed'],
        sources: [{ sourceId: 'fitappliance:catalog', snapshotSha256: predecessorCatalogBinding }],
      },
    ],
  };
  const catalogBytes = jsonBytes(catalog);
  const referenceBytes = jsonBytes(reference);
  const predecessorManifest = candidateManifest({
    catalog,
    catalogBytes,
    reference,
    referenceBytes,
  });
  const releasePath = `data/architecture-v2/releases/${predecessorManifest.releaseCandidateId}/public-catalog-projection.json`;
  const recoveryManifest = {
    schemaVersion: 1,
    state: 'PRIVATE_RECOVERY_ONLY',
    sourceCommit: '1'.repeat(40),
    archiveSha256: 'b'.repeat(64),
    paths: [releasePath],
  };
  return {
    predecessorCatalogBytes: catalogBytes,
    predecessorAuthorizationManifestBytes: jsonBytes(predecessorManifest),
    historicalReferenceBytes: referenceBytes,
    sanitizerImplementationBytes: Buffer.from('sanitizer implementation'),
    recoveryManifestBytes: jsonBytes(recoveryManifest),
    generatedAt: '2026-08-11T00:00:00.000Z',
  };
}

async function writePrivacyRelease(t, result, mutate = null) {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-private-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let catalogBytes = Buffer.from(result.catalogBytes);
  let manifestBytes = Buffer.from(result.manifestBytes);
  let predecessorManifestBytes = Buffer.from(result.predecessorAuthorizationManifestBytes);
  let referenceBytes = Buffer.from(result.historicalReferenceBytes);
  if (mutate) ({
    catalogBytes,
    manifestBytes,
    predecessorManifestBytes,
    referenceBytes,
  } = mutate({ catalogBytes, manifestBytes, predecessorManifestBytes, referenceBytes }));
  const manifest = JSON.parse(manifestBytes);
  const releaseCandidateId = manifest.releaseCandidateId;
  const releaseDirectory = join(root, 'data/architecture-v2/releases', releaseCandidateId);
  await mkdir(releaseDirectory, { recursive: true });
  const artifacts = {
    publicProjection: {
      path: `data/architecture-v2/releases/${releaseCandidateId}/public-catalog-projection.json`,
      sha256: sha256(catalogBytes),
    },
    historicalReference: {
      path: `data/architecture-v2/releases/${releaseCandidateId}/historical-appliance-reference.json`,
      sha256: sha256(referenceBytes),
    },
    authorizationManifest: {
      path: `data/architecture-v2/releases/${releaseCandidateId}/authorization-manifest.json`,
      sha256: sha256(manifestBytes),
    },
    predecessorAuthorizationManifest: {
      path: `data/architecture-v2/releases/${releaseCandidateId}/predecessor-authorization-manifest.json`,
      sha256: sha256(predecessorManifestBytes),
    },
  };
  const descriptor = {
    schemaVersion: 2,
    policyVersion: 'active-retail-release-v2',
    releaseKind: 'PRIVACY_SANITIZATION_SUCCESSOR',
    releaseCandidateId,
    predecessorReleaseCandidateId: manifest.predecessor.releaseCandidateId,
    activatedAt: manifest.generatedAt,
    artifacts,
    recovery: {
      status: 'EXTERNAL_PRIVATE_RECOVERY_BOUND',
      manifestSha256: manifest.sourceBindings.recoveryManifestSha256,
      archiveSha256: manifest.sourceBindings.recoveryArchiveSha256,
      predecessorPublicProjectionSha256: manifest.predecessor.publicProjectionSha256,
    },
  };
  const descriptorPath = join(root, 'data/architecture-v2/decisions/active-retail-release.json');
  await mkdir(join(root, 'data/architecture-v2/decisions'), { recursive: true });
  await Promise.all([
    writeFile(join(releaseDirectory, 'public-catalog-projection.json'), catalogBytes),
    writeFile(join(releaseDirectory, 'historical-appliance-reference.json'), referenceBytes),
    writeFile(join(releaseDirectory, 'authorization-manifest.json'), manifestBytes),
    writeFile(join(releaseDirectory, 'predecessor-authorization-manifest.json'), predecessorManifestBytes),
    writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`),
  ]);
  return { root, descriptor, descriptorPath };
}

test('privacy successor removes only private retailer evidence and preserves ordered identity', () => {
  const result = buildActiveRetailPrivacySuccessor(fixture());

  assert.equal(result.manifest.mode, 'PRIVACY_SANITIZATION_ONLY');
  assert.equal(result.manifest.authorization.status, 'READY_FOR_PRIVACY_SANITIZATION_ONLY');
  assert.equal(result.catalog.products.length, 2);
  assert.deepEqual(
    result.catalog.products.map(({ id, canonicalProductId, cat, brand, model }) => (
      { id, canonicalProductId, cat, brand, model }
    )),
    [
      {
        id: 'private-only',
        canonicalProductId: 'fa_prod_private',
        cat: 'fridge',
        brand: 'Test',
        model: 'PRIVATE-1',
      },
      {
        id: 'mixed',
        canonicalProductId: 'fa_prod_mixed',
        cat: 'dishwasher',
        brand: 'Test',
        model: 'MIXED-1',
      },
    ],
  );
  assert.equal(result.catalog.products[0].unavailable, true);
  assert.equal(result.catalog.products[0].price, null);
  assert.deepEqual(result.catalog.products[0].retailers, []);
  assert.equal(result.catalog.products[0].lifecycleVisibility, 'MARKET_REFERENCE_ONLY');
  assert.deepEqual(result.catalog.products[0].retailLifecycle, {
    schemaVersion: 1,
    policyVersion: 'retail-lifecycle-v1',
    asOf: '2026-08-10T19:13:03.000Z',
    canonicalProductId: 'fa_prod_private',
    catalogState: 'LISTED_UNVERIFIED',
    lifecycleState: 'UNKNOWN_RETAIL',
    authorizingObservation: null,
    latestObservations: [],
    observationConflicts: [],
    collectionAttempts: [],
    reasonCodes: [
      'PRIVATE_RETAILER_EVIDENCE_WITHHELD',
      'RETAIL_STATE_REQUIRES_REVALIDATION',
    ],
  });
  assert.equal(result.catalog.products[1].unavailable, false);
  assert.equal(result.catalog.products[1].price, null);
  assert.equal(result.catalog.products[1].retailers.length, 1);
  assert.equal(result.manifest.invariants.productsBefore, 2);
  assert.equal(result.manifest.invariants.productsAfter, 2);
  assert.equal(
    result.manifest.invariants.orderedIdentitySha256Before,
    result.manifest.invariants.orderedIdentitySha256After,
  );
  assert.equal(result.manifest.invariants.changedProducts, 2);
  assert.equal(result.manifest.invariants.removedRetailerRows, 2);
  const successorCatalogBinding = hashHistoricalCatalogBinding(result.catalog);
  assert.equal(
    result.historicalReference.sourceSnapshotHashes['fitappliance:catalog'],
    successorCatalogBinding,
  );
  assert.ok(result.historicalReference.records.every((record) => (
    record.sources[0].snapshotSha256 === successorCatalogBinding
  )));
  assert.equal(result.manifest.invariants.referencesBefore, 2);
  assert.equal(result.manifest.invariants.referencesAfter, 2);
  assert.equal(
    result.manifest.invariants.orderedReferenceIdentitySha256Before,
    result.manifest.invariants.orderedReferenceIdentitySha256After,
  );
  assert.equal(assertNoPrivateRetailerFeedPublication(result.catalog), true);
  assert.equal(validateActiveRetailPrivacySuccessorManifest(result.manifest), result.manifest);
});

test('privacy successor rejects a recovery receipt that does not bind the predecessor projection', () => {
  const input = fixture();
  const recovery = JSON.parse(input.recoveryManifestBytes);
  recovery.paths = [];
  input.recoveryManifestBytes = jsonBytes(recovery);

  assert.throws(
    () => buildActiveRetailPrivacySuccessor(input),
    /recovery manifest.*predecessor projection/i,
  );
});

test('privacy successor release builder verifies the bound recovery archive bytes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-private-recovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const archivePath = join(root, 'tracked-partnerize-data.tar');
  const manifestPath = join(root, 'manifest.json');
  const archiveBytes = Buffer.from('private recovery archive');
  const recoveryManifest = {
    schemaVersion: 1,
    state: 'PRIVATE_RECOVERY_ONLY',
    archiveSha256: sha256(archiveBytes),
    paths: ['data/architecture-v2/releases/example/public-catalog-projection.json'],
  };
  await Promise.all([
    writeFile(archivePath, archiveBytes),
    writeFile(manifestPath, jsonBytes(recoveryManifest)),
  ]);

  const verified = await verifyPrivateRecoveryArtifacts(manifestPath);
  assert.equal(verified.archiveSha256, recoveryManifest.archiveSha256);
  assert.equal(sha256(verified.manifestBytes), sha256(jsonBytes(recoveryManifest)));

  await writeFile(archivePath, Buffer.from('tampered archive'));
  await assert.rejects(
    verifyPrivateRecoveryArtifacts(manifestPath),
    /recovery archive hash mismatch/i,
  );

  await rm(archivePath);
  await assert.rejects(
    verifyPrivateRecoveryArtifacts(manifestPath),
    /recovery archive/i,
  );
});

test('privacy successor manifest cannot claim lifecycle cutover authorization', () => {
  const result = buildActiveRetailPrivacySuccessor(fixture());
  const tampered = structuredClone(result.manifest);
  tampered.authorization.status = 'READY_FOR_CUTOVER';

  assert.throws(
    () => validateActiveRetailPrivacySuccessorManifest(tampered),
    /privacy sanitization authorization/i,
  );
});

test('privacy successor manifest rejects ordered identity drift', () => {
  const result = buildActiveRetailPrivacySuccessor(fixture());
  const tampered = structuredClone(result.manifest);
  tampered.invariants.orderedIdentitySha256After = 'f'.repeat(64);

  assert.throws(
    () => validateActiveRetailPrivacySuccessorManifest(tampered),
    /ordered identity/i,
  );
});

test('privacy successor descriptor binds every clean and predecessor artifact', () => {
  const result = buildActiveRetailPrivacySuccessor(fixture());
  const descriptor = buildPrivacySuccessorDescriptor(result);

  assert.equal(descriptor.schemaVersion, 2);
  assert.equal(descriptor.releaseCandidateId, result.manifest.releaseCandidateId);
  assert.equal(
    descriptor.predecessorReleaseCandidateId,
    result.manifest.predecessor.releaseCandidateId,
  );
  assert.equal(
    descriptor.artifacts.publicProjection.sha256,
    result.manifest.sourceBindings.sanitizedPublicProjectionSha256,
  );
  assert.equal(
    descriptor.artifacts.predecessorAuthorizationManifest.sha256,
    result.manifest.predecessor.authorizationManifestSha256,
  );
  assert.equal(validateActiveRetailReleaseDescriptor(descriptor).schemaVersion, 2);
});

test('active release loader accepts a privacy-only successor without treating it as lifecycle cutover', async (t) => {
  const result = buildActiveRetailPrivacySuccessor(fixture());
  const written = await writePrivacyRelease(t, result);

  assert.equal(validateActiveRetailReleaseDescriptor(written.descriptor).schemaVersion, 2);
  const release = await loadActiveRetailRelease({
    root: written.root,
    descriptorPath: written.descriptorPath,
  });

  assert.equal(release.manifest.authorization.status, 'READY_FOR_PRIVACY_SANITIZATION_ONLY');
  assert.equal(release.predecessorManifest.authorization.status, 'READY_FOR_CUTOVER');
  assert.equal(release.catalog.products.length, 2);
  assert.equal(release.catalog.products.filter((product) => product.unavailable === false).length, 1);
  assert.equal(assertNoPrivateRetailerFeedPublication(release.catalog), true);
});

test('active release loader rejects a private marker even when successor hashes are rebound', async (t) => {
  const result = buildActiveRetailPrivacySuccessor(fixture());
  const written = await writePrivacyRelease(t, result, (files) => {
    const catalog = JSON.parse(files.catalogBytes);
    catalog.products[0].affiliate_network = 'partnerize';
    const catalogBytes = jsonBytes(catalog);
    const manifest = JSON.parse(files.manifestBytes);
    manifest.sourceBindings.sanitizedPublicProjectionSha256 = sha256(catalogBytes);
    manifest.sourceBindings.sanitizedPublicProjectionSemanticSha256 = semanticSha256(catalog);
    const payload = structuredClone(manifest);
    delete payload.releaseCandidateId;
    delete payload.semanticSha256;
    const semantic = semanticSha256(payload);
    manifest.releaseCandidateId = `retail_lifecycle_release_${semantic.slice(0, 24)}`;
    manifest.semanticSha256 = semantic;
    return { ...files, catalogBytes, manifestBytes: jsonBytes(manifest) };
  });

  await assert.rejects(
    () => loadActiveRetailRelease({ root: written.root, descriptorPath: written.descriptorPath }),
    /private retailer feed/i,
  );
});

test('active release loader rejects a rebound predecessor authorization hash', async (t) => {
  const result = buildActiveRetailPrivacySuccessor(fixture());
  const written = await writePrivacyRelease(t, result, (files) => ({
    ...files,
    predecessorManifestBytes: Buffer.concat([files.predecessorManifestBytes, Buffer.from(' ')]),
  }));

  await assert.rejects(
    () => loadActiveRetailRelease({ root: written.root, descriptorPath: written.descriptorPath }),
    /predecessor authorization manifest binding/i,
  );
});
