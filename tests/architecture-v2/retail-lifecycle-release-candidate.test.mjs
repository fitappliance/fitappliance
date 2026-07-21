import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateRetailLifecycleReleaseCandidate,
} from '../../src/domain/retail-lifecycle-release-candidate.mjs';
import {
  validateCandidateReference,
} from '../../scripts/architecture-v2/build-retail-lifecycle-release-candidate.mjs';

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url));
const parse = (relative) => JSON.parse(read(relative));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
const semanticSha256 = (value) => sha256(JSON.stringify(canonical(value)));

const paths = {
  baseline: 'data/architecture-v2/generated/public-catalog-projection.json',
  baseCandidate: 'data/architecture-v2/generated/public-catalog-projection-migration-candidate.json',
  finalCandidate: 'data/architecture-v2/generated/public-catalog-release-candidate.json',
  referenceCandidate: 'data/architecture-v2/generated/historical-appliance-reference-release-candidate.json',
  officialMarketCandidate: 'data/architecture-v2/generated/official-market-lifecycle-migration-candidate.json',
  identityMigration: 'data/architecture-v2/reviews/automated/retailer-identity-migration.json',
  shadowCandidate: 'data/architecture-v2/reviews/automated/retail-lifecycle-shadow-migration-candidate.json',
  releasePolicy: 'data/architecture-v2/policies/retail-lifecycle-release-policy.json',
  manifest: 'data/architecture-v2/reviews/automated/retail-lifecycle-release-candidate.json',
};

test('tracked candidate exhaustively closes the legacy-current population without mutating release bytes', () => {
  const baselineBytes = read(paths.baseline);
  const baseCandidate = parse(paths.baseCandidate);
  const finalCandidate = parse(paths.finalCandidate);
  const manifest = validateRetailLifecycleReleaseCandidate(parse(paths.manifest));

  assert.equal(manifest.authorization.status, 'READY_FOR_CUTOVER');
  assert.equal(manifest.partition.expectedLegacyCurrentProducts, 1384);
  assert.equal(manifest.partition.accountedLegacyCurrentProducts, 1384);
  assert.deepEqual(manifest.partition.unresolvedIds, []);
  assert.deepEqual(manifest.partition.unsafeRemovedIds, []);
  assert.deepEqual(manifest.publicationAudit.unsafePublicControlPlaneIds, []);
  assert.deepEqual(manifest.membership.removedLegacyRuntimeIds, ['f3', 'f7']);
  assert.deepEqual(manifest.partition.identityMergeIds, ['fa_prod_6d94b7fe6a48634212faaeb9']);
  assert.deepEqual(manifest.partition.identityQuarantineIds, ['fa_prod_aab8b0aaf2867bb908408b62']);
  assert.equal(baseCandidate.products.length, 3513);
  assert.equal(finalCandidate.products.length, 3513);
  assert.equal(finalCandidate.products.some((product) => ['f3', 'f7'].includes(product.id)), false);
  assert.equal(finalCandidate.products.some((product) => (
    product.unavailable === false
    && (!Array.isArray(product.retailers) || product.retailers.length === 0)
  )), false);
  assert.ok(
    read(paths.finalCandidate).byteLength < baselineBytes.byteLength * 2,
    'candidate public projection must not embed the full lifecycle control plane',
  );
  assert.equal(finalCandidate.products.some((product) => (
    (product.retailLifecycle?.collectionAttempts?.length ?? 0) > 0
    || (product.retailLifecycle?.observationConflicts?.length ?? 0) > 0
    || (product.unavailable === true
      && (product.retailLifecycle?.latestObservations?.length ?? 0) > 0)
  )), false);
  assert.equal(finalCandidate.products.some((product) => (
    product.lifecycleVisibility === 'MARKET_REFERENCE_ONLY'
    && (
      product.price !== null
      || Object.hasOwn(product, 'direct_url')
      || Object.hasOwn(product, 'affiliate_url')
      || product.discovery != null
    )
  )), false);
  assert.equal(manifest.rollback.status, 'PROVEN_BYTE_IDENTICAL');
  assert.equal(manifest.rollback.restoredBaselineSha256, sha256(baselineBytes));
  assert.equal(sha256(read(paths.baseline)), manifest.sourceBindings.baselinePublicProjectionSha256);
  assert.equal(
    semanticSha256(parse(paths.baseline)),
    manifest.sourceBindings.baselinePublicProjectionSemanticSha256,
  );
  assert.equal(
    sha256(read(paths.baseCandidate)),
    manifest.sourceBindings.candidateBaseProjectionSha256,
  );
  assert.equal(
    semanticSha256(baseCandidate),
    manifest.sourceBindings.candidateBaseProjectionSemanticSha256,
  );
  assert.equal(
    sha256(read(paths.finalCandidate)),
    manifest.sourceBindings.finalCandidateProjectionSha256,
  );
  assert.equal(
    semanticSha256(finalCandidate),
    manifest.sourceBindings.finalCandidateProjectionSemanticSha256,
  );
  for (const [path, byteBinding, semanticBinding, embeddedSemantic] of [
    [paths.identityMigration, 'identityMigrationSha256', 'identityMigrationSemanticSha256', true],
    [paths.shadowCandidate, 'candidateShadowSha256', 'candidateShadowSemanticSha256', true],
    [paths.officialMarketCandidate, 'officialMarketLifecycleSha256', 'officialMarketLifecycleSemanticSha256', true],
    [paths.referenceCandidate, 'historicalReferenceCandidateSha256', 'historicalReferenceCandidateSemanticSha256', false],
  ]) {
    const document = parse(path);
    assert.equal(sha256(read(path)), manifest.sourceBindings[byteBinding]);
    assert.equal(
      embeddedSemantic ? document.semanticSha256 : semanticSha256(document),
      manifest.sourceBindings[semanticBinding],
    );
  }
  assert.equal(
    sha256(read(paths.releasePolicy)),
    manifest.sourceBindings.releasePolicySha256,
  );
});

test('candidate validation rejects an omitted identity disposition even after re-signing', () => {
  const manifest = parse(paths.manifest);
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
  const manifest = parse(paths.manifest);
  delete manifest.publicationAudit.unsafePublicControlPlaneIds;
  delete manifest.releaseCandidateId;
  delete manifest.semanticSha256;

  assert.throws(
    () => validateRetailLifecycleReleaseCandidate(manifest, { allowUnsigned: true }),
    /control-plane/i,
  );
});

test('candidate historical reference is complete, unique, and bound to the candidate catalogue', () => {
  const finalCandidate = parse(paths.finalCandidate);
  const reference = parse(paths.referenceCandidate);
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
