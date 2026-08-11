import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateRetailLifecycleReleaseCandidate,
} from '../../src/domain/retail-lifecycle-release-candidate.mjs';
import {
  buildRetailLifecycleReleaseCandidateFromRepository,
  validateCandidateReference,
} from '../../scripts/architecture-v2/build-retail-lifecycle-release-candidate.mjs';

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url));
const parse = (relative) => JSON.parse(read(relative));

const activeDescriptor = parse('data/architecture-v2/decisions/active-retail-release.json');
const activeReleaseRoot = `data/architecture-v2/releases/${activeDescriptor.releaseCandidateId}`;
const paths = {
  predecessorManifest: `${activeReleaseRoot}/predecessor-authorization-manifest.json`,
  activeCatalog: `${activeReleaseRoot}/public-catalog-projection.json`,
  activeReference: `${activeReleaseRoot}/historical-appliance-reference.json`,
};
const candidateArtifacts = [
  'data/architecture-v2/generated/public-catalog-release-candidate.json',
  'data/architecture-v2/generated/historical-appliance-reference-release-candidate.json',
  'data/architecture-v2/reviews/automated/retail-lifecycle-shadow-migration-candidate.json',
  'data/architecture-v2/reviews/automated/retail-lifecycle-refresh-inventory-migration-candidate.json',
  'data/architecture-v2/reviews/automated/retail-lifecycle-release-candidate.json',
];

test('blocked lifecycle leaves the atomic tracked candidate set unmaterialized', async () => {
  for (const path of candidateArtifacts) assert.equal(existsSync(path), false, path);

  await assert.rejects(
    buildRetailLifecycleReleaseCandidateFromRepository(),
    /lifecycle cutover is blocked|release candidate remains blocked/i,
  );

  for (const path of candidateArtifacts) assert.equal(existsSync(path), false, path);
});

test('normal architecture build does not materialize a blocked lifecycle candidate', () => {
  const scripts = parse('package.json').scripts;
  assert.doesNotMatch(
    scripts['build:architecture-v2'],
    /build:retail-lifecycle-release-candidate|build:retail-lifecycle-refresh-inventory:candidate/,
  );
  assert.match(
    scripts['build:retail-lifecycle-release-candidate'],
    /build-retail-lifecycle-release-candidate\.mjs/,
  );
});

test('candidate validation rejects an omitted identity disposition even after re-signing', () => {
  const manifest = parse(paths.predecessorManifest);
  manifest.partition.identityQuarantineIds = [];
  manifest.partition.accountedLegacyCurrentProducts -= 1;
  delete manifest.releaseCandidateId;
  delete manifest.semanticSha256;

  assert.throws(
    () => validateRetailLifecycleReleaseCandidate(manifest, { allowUnsigned: true }),
    /partition|account/i,
  );
});

test('candidate validation requires the public control-plane leakage gate', () => {
  const manifest = parse(paths.predecessorManifest);
  delete manifest.publicationAudit.unsafePublicControlPlaneIds;
  delete manifest.releaseCandidateId;
  delete manifest.semanticSha256;

  assert.throws(
    () => validateRetailLifecycleReleaseCandidate(manifest, { allowUnsigned: true }),
    /control-plane/i,
  );
});

test('candidate historical reference is complete, unique, and bound to the candidate catalogue', () => {
  const finalCandidate = parse(paths.activeCatalog);
  const reference = parse(paths.activeReference);
  assert.equal(validateCandidateReference(reference, finalCandidate), reference);

  const wrongTopLevelBinding = structuredClone(reference);
  wrongTopLevelBinding.sourceSnapshotHashes['fitappliance:catalog'] = 'f'.repeat(64);
  assert.throws(
    () => validateCandidateReference(wrongTopLevelBinding, finalCandidate),
    /catalog.*binding/i,
  );

  const wrongSummary = structuredClone(reference);
  wrongSummary.summary.records -= 1;
  assert.throws(
    () => validateCandidateReference(wrongSummary, finalCandidate),
    /summary.*records/i,
  );

  const duplicateReference = structuredClone(reference);
  duplicateReference.records.push(structuredClone(duplicateReference.records[0]));
  duplicateReference.summary.records += 1;
  assert.throws(
    () => validateCandidateReference(duplicateReference, finalCandidate),
    /duplicate.*reference/i,
  );

  const missingCatalogProduct = structuredClone(reference);
  const linkedRecord = missingCatalogProduct.records.find((record) => (
    (record.catalogProductIds?.length ?? 0) === 1
  ));
  assert.ok(linkedRecord);
  linkedRecord.catalogProductIds = [];
  linkedRecord.sources = linkedRecord.sources.filter((source) => source.sourceId !== 'fitappliance:catalog');
  assert.throws(
    () => validateCandidateReference(missingCatalogProduct, finalCandidate),
    /missing.*catalog/i,
  );

  const duplicateCatalogProduct = structuredClone(reference);
  const linkedRecords = duplicateCatalogProduct.records.filter((record) => (
    (record.catalogProductIds?.length ?? 0) > 0
  ));
  linkedRecords[1].catalogProductIds.push(linkedRecords[0].catalogProductIds[0]);
  assert.throws(
    () => validateCandidateReference(duplicateCatalogProduct, finalCandidate),
    /duplicate.*catalog/i,
  );
});
