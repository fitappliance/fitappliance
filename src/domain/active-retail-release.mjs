import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateActiveRetailPrivacySuccessorManifest,
  validateLoadedActiveRetailPrivacySuccessor,
} from './active-retail-privacy-successor.mjs';
import { validateRetailLifecycleReleaseCandidate } from './retail-lifecycle-release-candidate.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const descriptorRelativePath = 'data/architecture-v2/decisions/active-retail-release.json';
const SHA256 = /^[a-f0-9]{64}$/;
const RELEASE_ID = /^retail_lifecycle_release_[a-f0-9]{24}$/;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function validateArtifact(artifact, expectedPath, label) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    throw new TypeError(`${label} artifact required`);
  }
  const path = required(artifact.path, `${label} path`);
  if (isAbsolute(path) || path.includes('\\') || posix.normalize(path) !== path || path !== expectedPath) {
    throw new Error(`${label} must stay inside the active release directory`);
  }
  const digest = required(artifact.sha256, `${label} SHA-256`).toLowerCase();
  if (!SHA256.test(digest)) throw new TypeError(`${label} SHA-256 invalid`);
  return Object.freeze({ path, sha256: digest });
}

function validateReleaseId(value, label) {
  const result = required(value, label);
  if (!RELEASE_ID.test(result)) throw new TypeError(`${label} invalid`);
  return result;
}

function validateArtifactHash(value, label) {
  const digest = required(value, label).toLowerCase();
  if (!SHA256.test(digest)) throw new TypeError(`${label} invalid`);
  return digest;
}

function validateSchema1Descriptor(value) {
  const releaseCandidateId = required(value.releaseCandidateId, 'active release candidate ID');
  if (!RELEASE_ID.test(releaseCandidateId)) throw new TypeError('active release candidate ID invalid');
  const activatedAt = new Date(required(value.activatedAt, 'active release timestamp'));
  if (Number.isNaN(activatedAt.valueOf())) throw new TypeError('active release timestamp invalid');
  const releaseDirectory = `data/architecture-v2/releases/${releaseCandidateId}`;
  const artifacts = Object.freeze({
    publicProjection: validateArtifact(
      value.artifacts?.publicProjection,
      `${releaseDirectory}/public-catalog-projection.json`,
      'public projection',
    ),
    historicalReference: validateArtifact(
      value.artifacts?.historicalReference,
      `${releaseDirectory}/historical-appliance-reference.json`,
      'historical reference',
    ),
    authorizationManifest: validateArtifact(
      value.artifacts?.authorizationManifest,
      `${releaseDirectory}/authorization-manifest.json`,
      'authorization manifest',
    ),
  });
  if (value.rollback?.status !== 'PROVEN_BYTE_IDENTICAL'
    || !SHA256.test(String(value.rollback?.baselinePublicProjectionSha256 ?? ''))) {
    throw new TypeError('active release rollback proof required');
  }
  return Object.freeze({
    schemaVersion: 1,
    policyVersion: value.policyVersion,
    releaseCandidateId,
    activatedAt: activatedAt.toISOString(),
    artifacts,
    rollback: Object.freeze({
      status: value.rollback.status,
      baselinePublicProjectionSha256: value.rollback.baselinePublicProjectionSha256,
    }),
  });
}

function validateSchema2Descriptor(value) {
  if (value.policyVersion !== 'active-retail-release-v2'
    || value.releaseKind !== 'PRIVACY_SANITIZATION_SUCCESSOR') {
    throw new TypeError('active retail release privacy successor schema v2 required');
  }
  const releaseCandidateId = validateReleaseId(value.releaseCandidateId, 'active release candidate ID');
  const predecessorReleaseCandidateId = validateReleaseId(
    value.predecessorReleaseCandidateId,
    'active predecessor release candidate ID',
  );
  if (releaseCandidateId === predecessorReleaseCandidateId) {
    throw new TypeError('active privacy successor must use a new release ID');
  }
  const activatedAt = new Date(required(value.activatedAt, 'active release timestamp'));
  if (Number.isNaN(activatedAt.valueOf())) throw new TypeError('active release timestamp invalid');
  const releaseDirectory = `data/architecture-v2/releases/${releaseCandidateId}`;
  const artifacts = Object.freeze({
    publicProjection: validateArtifact(
      value.artifacts?.publicProjection,
      `${releaseDirectory}/public-catalog-projection.json`,
      'public projection',
    ),
    historicalReference: validateArtifact(
      value.artifacts?.historicalReference,
      `${releaseDirectory}/historical-appliance-reference.json`,
      'historical reference',
    ),
    authorizationManifest: validateArtifact(
      value.artifacts?.authorizationManifest,
      `${releaseDirectory}/authorization-manifest.json`,
      'authorization manifest',
    ),
    predecessorAuthorizationManifest: validateArtifact(
      value.artifacts?.predecessorAuthorizationManifest,
      `${releaseDirectory}/predecessor-authorization-manifest.json`,
      'predecessor authorization manifest',
    ),
  });
  if (value.recovery?.status !== 'EXTERNAL_PRIVATE_RECOVERY_BOUND') {
    throw new TypeError('active privacy successor recovery binding required');
  }
  return Object.freeze({
    schemaVersion: 2,
    policyVersion: value.policyVersion,
    releaseKind: value.releaseKind,
    releaseCandidateId,
    predecessorReleaseCandidateId,
    activatedAt: activatedAt.toISOString(),
    artifacts,
    recovery: Object.freeze({
      status: value.recovery.status,
      manifestSha256: validateArtifactHash(
        value.recovery.manifestSha256,
        'private recovery manifest SHA-256',
      ),
      archiveSha256: validateArtifactHash(
        value.recovery.archiveSha256,
        'private recovery archive SHA-256',
      ),
      predecessorPublicProjectionSha256: validateArtifactHash(
        value.recovery.predecessorPublicProjectionSha256,
        'private recovery predecessor projection SHA-256',
      ),
    }),
  });
}

export function validateActiveRetailReleaseDescriptor(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('active retail release descriptor required');
  }
  if (value.schemaVersion === 1 && value.policyVersion === 'active-retail-release-v1') {
    return validateSchema1Descriptor(value);
  }
  if (value.schemaVersion === 2) return validateSchema2Descriptor(value);
  throw new TypeError('active retail release descriptor schema v1 or v2 required');
}

async function readBoundArtifact(root, artifact, label) {
  const path = resolve(root, artifact.path);
  const bytes = await readFile(path);
  if (sha256(bytes) !== artifact.sha256) throw new Error(`${label} hash drift`);
  return { path, bytes, document: JSON.parse(bytes) };
}

export async function loadActiveRetailRelease({
  root = defaultRoot,
  descriptorPath = resolve(root, descriptorRelativePath),
} = {}) {
  const descriptor = validateActiveRetailReleaseDescriptor(
    JSON.parse(await readFile(descriptorPath, 'utf8')),
  );
  const artifactReads = [
    readBoundArtifact(root, descriptor.artifacts.publicProjection, 'active public projection'),
    readBoundArtifact(root, descriptor.artifacts.historicalReference, 'active historical reference'),
    readBoundArtifact(root, descriptor.artifacts.authorizationManifest, 'active authorization manifest'),
  ];
  if (descriptor.schemaVersion === 2) artifactReads.push(readBoundArtifact(
    root,
    descriptor.artifacts.predecessorAuthorizationManifest,
    'active predecessor authorization manifest',
  ));
  const [catalogArtifact, referenceArtifact, manifestArtifact, predecessorManifestArtifact] =
    await Promise.all(artifactReads);
  let manifest;
  let predecessorManifest = null;
  if (descriptor.schemaVersion === 1) {
    manifest = validateRetailLifecycleReleaseCandidate(manifestArtifact.document);
    if (manifest.releaseCandidateId !== descriptor.releaseCandidateId
      || manifest.authorization.status !== 'READY_FOR_CUTOVER') {
      throw new Error('active release authorization mismatch');
    }
    if (manifest.sourceBindings.finalCandidateProjectionSha256
        !== descriptor.artifacts.publicProjection.sha256
      || manifest.sourceBindings.historicalReferenceCandidateSha256
        !== descriptor.artifacts.historicalReference.sha256) {
      throw new Error('active release artifact binding mismatch');
    }
    if (manifest.sourceBindings.finalCandidateProjectionSemanticSha256
        !== semanticSha256(catalogArtifact.document)
      || manifest.sourceBindings.historicalReferenceCandidateSemanticSha256
        !== semanticSha256(referenceArtifact.document)) {
      throw new Error('active release semantic binding mismatch');
    }
    if (manifest.rollback.status !== descriptor.rollback.status
      || manifest.rollback.restoredBaselineSha256
        !== descriptor.rollback.baselinePublicProjectionSha256) {
      throw new Error('active release rollback binding mismatch');
    }
  } else {
    manifest = validateActiveRetailPrivacySuccessorManifest(manifestArtifact.document);
    predecessorManifest = validateRetailLifecycleReleaseCandidate(predecessorManifestArtifact.document);
    if (manifest.releaseCandidateId !== descriptor.releaseCandidateId
      || manifest.predecessor.releaseCandidateId !== descriptor.predecessorReleaseCandidateId
      || manifest.sourceBindings.sanitizedPublicProjectionSha256
        !== descriptor.artifacts.publicProjection.sha256
      || manifest.sourceBindings.historicalReferenceSha256
        !== descriptor.artifacts.historicalReference.sha256
      || manifest.sourceBindings.recoveryManifestSha256 !== descriptor.recovery.manifestSha256
      || manifest.sourceBindings.recoveryArchiveSha256 !== descriptor.recovery.archiveSha256
      || manifest.predecessor.publicProjectionSha256
        !== descriptor.recovery.predecessorPublicProjectionSha256) {
      throw new Error('active privacy successor descriptor binding mismatch');
    }
    if (manifest.predecessor.authorizationManifestSha256
      !== descriptor.artifacts.predecessorAuthorizationManifest.sha256) {
      throw new Error('predecessor authorization manifest binding mismatch');
    }
    validateLoadedActiveRetailPrivacySuccessor({
      manifest,
      catalog: catalogArtifact.document,
      catalogBytesSha256: descriptor.artifacts.publicProjection.sha256,
      historicalReference: referenceArtifact.document,
      historicalReferenceBytesSha256: descriptor.artifacts.historicalReference.sha256,
      predecessorManifest,
      predecessorManifestBytesSha256: descriptor.artifacts.predecessorAuthorizationManifest.sha256,
    });
  }
  if (!Array.isArray(catalogArtifact.document.products)
    || !Array.isArray(referenceArtifact.document.records)) {
    throw new TypeError('active release catalogue and historical reference required');
  }
  return Object.freeze({
    descriptor,
    descriptorPath,
    releaseDirectory: dirname(catalogArtifact.path),
    catalog: catalogArtifact.document,
    reference: referenceArtifact.document,
    manifest,
    ...(predecessorManifest ? { predecessorManifest } : {}),
    paths: Object.freeze({
      catalog: catalogArtifact.path,
      reference: referenceArtifact.path,
      manifest: manifestArtifact.path,
    }),
  });
}
