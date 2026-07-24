import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

export function validateActiveRetailReleaseDescriptor(value) {
  if (!value || value.schemaVersion !== 1 || value.policyVersion !== 'active-retail-release-v1') {
    throw new TypeError('active retail release descriptor schema v1 required');
  }
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
  const [catalogArtifact, referenceArtifact, manifestArtifact] = await Promise.all([
    readBoundArtifact(root, descriptor.artifacts.publicProjection, 'active public projection'),
    readBoundArtifact(root, descriptor.artifacts.historicalReference, 'active historical reference'),
    readBoundArtifact(root, descriptor.artifacts.authorizationManifest, 'active authorization manifest'),
  ]);
  const manifest = validateRetailLifecycleReleaseCandidate(manifestArtifact.document);
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
    paths: Object.freeze({
      catalog: catalogArtifact.path,
      reference: referenceArtifact.path,
      manifest: manifestArtifact.path,
    }),
  });
}

function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${label} invalid`);
  return value;
}

export function validateActiveRetailReleaseAudits({
  activeRelease,
  replacementAudit,
  fitPublicationAudit,
}) {
  if (!activeRelease?.descriptor || !Array.isArray(activeRelease.catalog?.products)
    || !Array.isArray(activeRelease.reference?.records)) {
    throw new TypeError('loaded active retail release required');
  }
  if (replacementAudit?.schemaVersion !== 1 || !Array.isArray(replacementAudit.issues)) {
    throw new TypeError('active release replacement audit schema v1 required');
  }
  if (fitPublicationAudit?.schemaVersion !== 1 || !Array.isArray(fitPublicationAudit.violations)) {
    throw new TypeError('active release Fit publication audit schema v1 required');
  }
  const replacement = replacementAudit.summary ?? {};
  const fit = fitPublicationAudit.summary ?? {};
  const referenceCount = activeRelease.reference.records.length;
  const catalogCount = activeRelease.catalog.products.length;
  if (nonNegativeInteger(
    replacement.referenceRecords,
    'active release replacement reference count',
  ) !== referenceCount) {
    throw new Error('active release replacement reference count mismatch');
  }
  if (nonNegativeInteger(
    replacement.publicRecords,
    'active release replacement public count',
  ) !== referenceCount) {
    throw new Error('active release replacement public count mismatch');
  }
  if (nonNegativeInteger(
    replacement.currentCatalogProducts,
    'active release replacement catalog count',
  ) !== catalogCount) {
    throw new Error('active release replacement catalog count mismatch');
  }
  if (nonNegativeInteger(replacement.issueCount, 'active release replacement issue count')
    !== replacementAudit.issues.length) {
    throw new Error('active release replacement issue accounting mismatch');
  }
  if (nonNegativeInteger(fit.products, 'active release Fit product count') !== catalogCount) {
    throw new Error('active release Fit product count mismatch');
  }
  if (nonNegativeInteger(fit.violations, 'active release Fit violation count')
    !== fitPublicationAudit.violations.length) {
    throw new Error('active release Fit violation accounting mismatch');
  }
  return Object.freeze({ replacementAudit, fitPublicationAudit });
}

export async function loadActiveRetailReleaseAudits({
  activeRelease,
} = {}) {
  const release = activeRelease ?? await loadActiveRetailRelease();
  if (!release?.releaseDirectory) throw new TypeError('active release directory required');
  const replacementPath = resolve(release.releaseDirectory, 'historical-replacement-audit.json');
  const fitPath = resolve(release.releaseDirectory, 'fit-publication-audit.json');
  const [replacementBytes, fitBytes] = await Promise.all([
    readFile(replacementPath),
    readFile(fitPath),
  ]);
  const audits = validateActiveRetailReleaseAudits({
    activeRelease: release,
    replacementAudit: JSON.parse(replacementBytes),
    fitPublicationAudit: JSON.parse(fitBytes),
  });
  return Object.freeze({
    ...audits,
    paths: Object.freeze({
      replacementAudit: replacementPath,
      fitPublicationAudit: fitPath,
    }),
    sourceBindings: Object.freeze({
      releaseCandidateId: release.descriptor.releaseCandidateId,
      publicProjectionSha256: release.descriptor.artifacts.publicProjection.sha256,
      historicalReferenceSha256: release.descriptor.artifacts.historicalReference.sha256,
      replacementAuditSha256: sha256(replacementBytes),
      fitPublicationAuditSha256: sha256(fitBytes),
    }),
  });
}
