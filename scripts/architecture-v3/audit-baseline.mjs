#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, posix, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import {
  loadActiveRetailRelease,
  validateActiveRetailReleaseDescriptor,
} from '../../src/domain/active-retail-release.mjs';
import { validateOfficialMarketLifecycle } from '../../src/domain/official-market-lifecycle.mjs';
import { validateRetailLifecycleReleaseCandidate } from '../../src/domain/retail-lifecycle-release-candidate.mjs';
import { validateRetailLifecycleShadow } from '../../src/domain/retail-lifecycle-shadow.mjs';
import { validateRetailerIdentityMigration } from '../../src/domain/retailer-identity-migration.mjs';

const execFile = promisify(execFileCallback);
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_COMMIT = /^[a-f0-9]{40,64}$/;
const REPOSITORY_SOURCE = 'repository';

const PATHS = Object.freeze({
  activeDescriptor: 'data/architecture-v2/decisions/active-retail-release.json',
  runtimeProjection: 'public/data/appliances.json',
  runtimeMarker: 'public/data/catalog-projection.json',
  legacyProjection: 'data/architecture-v2/generated/public-catalog-projection.json',
  legacyReceiptBundle: 'data/architecture-v2/reviews/automated/installation-evidence-receipts.json',
  legacyReplayAudit: 'data/architecture-v2/reviews/automated/installation-evidence-receipt-replay-audit.json',
  legacyControlPlane: 'data/architecture-v2/generated/installation-evidence-pipeline.json',
  fieldRights: 'data/architecture-v2/policies/product-data-field-rights-dictionary.json',
  manufacturerSource: 'data/architecture-v2/policies/manufacturer-source-policy.json',
  applicabilityMatrix: 'data/architecture-v2/generated/installation-evidence-applicability-matrix.json',
  candidateBase: 'data/architecture-v2/generated/public-catalog-projection-migration-candidate.json',
  identityMigration: 'data/architecture-v2/reviews/automated/retailer-identity-migration.json',
  candidateShadow: 'data/architecture-v2/reviews/automated/retail-lifecycle-shadow-migration-candidate.json',
  officialMarket: 'data/architecture-v2/generated/official-market-lifecycle-migration-candidate.json',
  releasePolicy: 'data/architecture-v2/policies/retail-lifecycle-release-policy.json',
});

const CODE_SCOPE = Object.freeze([
  ['code-audit-baseline', 'scripts/architecture-v3/audit-baseline.mjs'],
  ['code-active-release-loader', 'src/domain/active-retail-release.mjs'],
  ['code-release-candidate-validator', 'src/domain/retail-lifecycle-release-candidate.mjs'],
  ['code-default-fit-publication-audit', 'scripts/architecture-v2/audit-fit-publication.mjs'],
  ['code-architecture-v2-paths', 'src/domain/architecture-v2-paths.mjs'],
  ['code-runtime-publisher', 'scripts/architecture-v2/publish-runtime-projection.js'],
  ['code-active-publication-boundary', 'scripts/architecture-v2/publish-active-retail-release.mjs'],
]);

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

function canonicalJsonSha256(value) {
  return sha256(JSON.stringify(canonical(value)));
}

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function hash(value, label) {
  const result = required(value, label);
  if (result !== result.toLowerCase() || !SHA256.test(result)) {
    throw new TypeError(`${label} must be a lowercase SHA-256`);
  }
  return result;
}

function artifactPath(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} path required`);
  const result = value;
  if (result.includes('\0') || isAbsolute(result) || result.includes('\\') || posix.normalize(result) !== result
    || result === '.' || result === '..' || result.startsWith('../')) {
    throw new TypeError(`${label} path must be a repository-relative path`);
  }
  return result;
}

function artifactBytes(record, { owner, path, label }) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError(`${label} artifact required`);
  }
  if (record.source !== REPOSITORY_SOURCE) {
    throw new TypeError(`${label} source must be ${REPOSITORY_SOURCE}`);
  }
  if (record.owner !== owner) throw new TypeError(`${label} owner mismatch`);
  const actualPath = artifactPath(record.path, label);
  if (path && actualPath !== path) throw new TypeError(`${label} path mismatch`);
  if (!Buffer.isBuffer(record.bytes) && !(record.bytes instanceof Uint8Array)) {
    throw new TypeError(`${label} bytes required`);
  }
  const bytes = Buffer.from(record.bytes);
  const actualHash = sha256(bytes);
  if (hash(record.sha256, `${label} claimed hash`) !== actualHash) {
    throw new Error(`${label} byte hash mismatch`);
  }
  return Object.freeze({
    source: record.source,
    owner,
    path: actualPath,
    bytes,
    sha256: actualHash,
  });
}

function parsedJsonArtifact(record, specification) {
  const artifact = artifactBytes(record, specification);
  try {
    return Object.freeze({
      ...artifact,
      document: JSON.parse(artifact.bytes.toString('utf8')),
    });
  } catch (error) {
    throw new TypeError(`${specification.label} JSON required: ${error.message}`);
  }
}

function jsonArtifact(record, specification) {
  const artifact = parsedJsonArtifact(record, specification);
  return Object.freeze({ ...artifact, semanticSha256: canonicalJsonSha256(artifact.document) });
}

function validatedProducerArtifact(record, specification, validator) {
  const artifact = parsedJsonArtifact(record, specification);
  const document = validator(artifact.document);
  return Object.freeze({
    ...artifact,
    document,
    semanticSha256: hash(document.semanticSha256, `${specification.label} producer semantic SHA-256`),
  });
}

function declaredByteBinding(artifact, declared, label) {
  if (artifact.sha256 !== hash(declared, `${label} declared hash`)) {
    throw new Error(`${label} byte binding mismatch`);
  }
}

function declaredSemanticBinding(artifact, declared, label) {
  if (artifact.semanticSha256 !== hash(declared, `${label} declared semantic hash`)) {
    throw new Error(`${label} semantic binding mismatch`);
  }
}

function products(document, label) {
  if (!document || !Array.isArray(document.products)) throw new TypeError(`${label} products required`);
  return document.products;
}

function records(document, label) {
  if (!document || !Array.isArray(document.records)) throw new TypeError(`${label} records required`);
  return document.records;
}

function populationSummary(rows) {
  let currentRetailProducts = 0;
  let archivedProducts = 0;
  let marketReferenceProducts = 0;
  let unknownOrConflictingProducts = 0;
  for (const row of rows) {
    const state = row?.retailLifecycle?.lifecycleState;
    if (row?.unavailable === false
      && row?.lifecycleVisibility === 'CURRENT_OUTPUT'
      && state === 'CURRENT_RETAIL') {
      currentRetailProducts += 1;
    } else if (row?.unavailable === true
      && row?.lifecycleVisibility === 'HISTORICAL_INPUT_ONLY'
      && state === 'CATALOG_ARCHIVED') {
      archivedProducts += 1;
    } else if (row?.unavailable === true
      && row?.lifecycleVisibility === 'MARKET_REFERENCE_ONLY'
      && state === 'UNKNOWN_RETAIL') {
      marketReferenceProducts += 1;
    } else {
      unknownOrConflictingProducts += 1;
    }
  }
  return Object.freeze({
    products: rows.length,
    currentRetailProducts,
    archivedProducts,
    marketReferenceProducts,
    unknownOrConflictingProducts,
  });
}

function sourceBindingInventory(manifest, bindings, legacy) {
  const baseline = jsonArtifact(bindings?.legacy, {
    owner: 'legacy-default-audit-input', path: PATHS.legacyProjection, label: 'manifest baseline legacy projection',
  });
  if (baseline.path !== legacy.path || baseline.sha256 !== legacy.sha256) {
    throw new Error('manifest baseline must be the legacy default audit input');
  }
  const baselineByteBound = baseline.sha256 === manifest.sourceBindings.baselinePublicProjectionSha256;
  const baselineSemanticBound = baseline.semanticSha256
    === manifest.sourceBindings.baselinePublicProjectionSemanticSha256;

  const optional = [
    ['candidateBase', 'candidateBaseProjectionSha256', 'candidateBaseProjectionSemanticSha256', 'manifest-candidate-base', PATHS.candidateBase],
    ['identityMigration', 'identityMigrationSha256', 'identityMigrationSemanticSha256', 'manifest-identity-migration', PATHS.identityMigration, validateRetailerIdentityMigration],
    ['candidateShadow', 'candidateShadowSha256', 'candidateShadowSemanticSha256', 'manifest-candidate-shadow', PATHS.candidateShadow, validateRetailLifecycleShadow],
    ['officialMarket', 'officialMarketLifecycleSha256', 'officialMarketLifecycleSemanticSha256', 'manifest-official-market', PATHS.officialMarket, validateOfficialMarketLifecycle],
    ['releasePolicy', 'releasePolicySha256', null, 'manifest-release-policy', PATHS.releasePolicy],
  ];
  const result = [Object.freeze({
    binding: 'baselinePublicProjection',
    path: baseline.path,
    expectedSha256: manifest.sourceBindings.baselinePublicProjectionSha256,
    actualSha256: baseline.sha256,
    expectedSemanticSha256: manifest.sourceBindings.baselinePublicProjectionSemanticSha256,
    actualSemanticSha256: baseline.semanticSha256,
    disposition: baselineByteBound && baselineSemanticBound
      ? 'BOUND_LEGACY_DEFAULT_AUDIT_INPUT'
      : 'STALE_LEGACY_DEFAULT_AUDIT_INPUT',
    ...(baselineByteBound && baselineSemanticBound ? {} : {
      unresolvedReason: 'CURRENT_LEGACY_BYTES_DO_NOT_MATCH_MANIFEST_BASELINE',
    }),
  })];
  for (const [key, rawKey, semanticKey, owner, path, validator] of optional) {
    const supplied = bindings?.[key];
    if (!supplied || supplied.unavailable === true) {
      result.push(Object.freeze({
        binding: rawKey,
        path,
        expectedSha256: manifest.sourceBindings[rawKey],
        actualSha256: null,
        expectedSemanticSha256: semanticKey ? manifest.sourceBindings[semanticKey] : null,
        actualSemanticSha256: null,
        disposition: 'UNAVAILABLE_MIGRATION_INPUT',
        unresolvedReason: supplied?.reason ?? 'LOCAL_MIGRATION_INPUT_UNAVAILABLE',
      }));
      continue;
    }
    const artifact = validator
      ? validatedProducerArtifact(supplied, { owner, path, label: `manifest ${key}` }, validator)
      : jsonArtifact(supplied, { owner, path, label: `manifest ${key}` });
    const rawMatches = artifact.sha256 === manifest.sourceBindings[rawKey];
    const semanticMatches = !semanticKey || artifact.semanticSha256 === manifest.sourceBindings[semanticKey];
    result.push(Object.freeze({
      binding: rawKey,
      path: artifact.path,
      expectedSha256: manifest.sourceBindings[rawKey],
      actualSha256: artifact.sha256,
      expectedSemanticSha256: semanticKey ? manifest.sourceBindings[semanticKey] : null,
      actualSemanticSha256: semanticKey ? artifact.semanticSha256 : null,
      disposition: rawMatches && semanticMatches ? 'CURRENT_MIGRATION_INPUT_MATCH' : 'STALE_MIGRATION_INPUT',
      ...(rawMatches && semanticMatches ? {} : { unresolvedReason: 'CURRENT_LOCAL_BYTES_DO_NOT_MATCH_RELEASE_BINDING' }),
    }));
  }
  return Object.freeze({
    bindings: Object.freeze(result),
    manifestHistoricalBaseline: Object.freeze({
      declaredProducts: releaseMembershipBaselineProducts(manifest),
      expectedSha256: manifest.sourceBindings.baselinePublicProjectionSha256,
      actualSha256: baseline.sha256,
      disposition: baselineByteBound && baselineSemanticBound ? 'BOUND' : 'STALE',
    }),
  });
}

function releaseMembershipBaselineProducts(manifest) {
  if (!Number.isInteger(manifest.membership?.baselineProducts) || manifest.membership.baselineProducts < 0) {
    throw new TypeError('manifest baseline product denominator required');
  }
  return manifest.membership.baselineProducts;
}

function codeRecord(code) {
  if (!code || typeof code !== 'object' || Array.isArray(code)) throw new TypeError('code record required');
  const baselineCommit = required(code.baselineCommit, 'baseline commit').toLowerCase();
  if (!GIT_COMMIT.test(baselineCommit)) throw new TypeError('baseline commit invalid');
  if (!Array.isArray(code.files) || code.files.length !== CODE_SCOPE.length) {
    throw new TypeError('bounded code scope required');
  }
  const byPath = new Map(code.files.map((file) => [file?.path, file]));
  const files = CODE_SCOPE.map(([owner, path]) => artifactBytes(byPath.get(path), {
    owner, path, label: owner,
  }));
  if (new Set(files.map((file) => file.path)).size !== CODE_SCOPE.length) {
    throw new TypeError('bounded code scope contains duplicates');
  }
  const codeSha256 = canonicalJsonSha256({
    baselineCommit,
    files: files.map((file) => ({ owner: file.owner, path: file.path, sha256: file.sha256 })),
  });
  return Object.freeze({ baselineCommit, files, codeSha256 });
}

function policyRecords(policies) {
  if (!policies || typeof policies !== 'object' || Array.isArray(policies)) {
    throw new TypeError('policy records required');
  }
  return Object.freeze({
    fieldRights: jsonArtifact(policies.fieldRights, {
      owner: 'policy-field-rights', path: PATHS.fieldRights, label: 'field-rights policy',
    }),
    manufacturerSource: jsonArtifact(policies.manufacturerSource, {
      owner: 'policy-manufacturer-source', path: PATHS.manufacturerSource, label: 'manufacturer-source policy',
    }),
    applicabilityMatrix: jsonArtifact(policies.applicabilityMatrix, {
      owner: 'policy-applicability-matrix', path: PATHS.applicabilityMatrix, label: 'applicability matrix',
    }),
  });
}

function summary(artifact) {
  return Object.freeze({
    source: artifact.source,
    owner: artifact.owner,
    path: artifact.path,
    sha256: artifact.sha256,
    ...(artifact.semanticSha256 ? { semanticSha256: artifact.semanticSha256 } : {}),
  });
}

function safeDirtyPath(value) {
  return artifactPath(value, 'dirty recovery');
}

function sensitiveDirtyPath(path) {
  return /(^|\/)(?:\.env(?:\..*)?|credentials?(?:\..*)?|secrets?(?:\..*)?|id_(?:rsa|ed25519)|[^/]+\.(?:pem|p12|pfx))$/i.test(path);
}

function inside(root, target) {
  const path = relative(root, target);
  return path === '' || (!path.startsWith(`..${posix.sep}`) && path !== '..' && !isAbsolute(path));
}

async function gitBuffer(root, args) {
  try {
    const { stdout } = await execFile('git', args, {
      cwd: root,
      encoding: 'buffer',
      maxBuffer: 50 * 1024 * 1024,
    });
    return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  } catch (error) {
    const stderr = Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8').trim() : String(error.stderr ?? '').trim();
    throw new Error(`dirty recovery git command failed: ${stderr || error.message}`);
  }
}

async function gitText(root, args) {
  return (await gitBuffer(root, args)).toString('utf8').trim();
}

async function stableDirectory(root, label) {
  const resolved = await realpath(resolve(required(root, `${label} root`)));
  const state = await lstat(resolved);
  if (!state.isDirectory()) throw new TypeError(`${label} root must be a directory`);
  return resolved;
}

async function gitRepositoryRoot(root, label) {
  const directory = await stableDirectory(root, label);
  const topLevel = await realpath(await gitText(directory, ['rev-parse', '--show-toplevel']));
  if (topLevel !== directory) throw new Error(`${label} root must be the git worktree root`);
  return directory;
}

async function fileIdentity(root, path, previousPath = null) {
  if (sensitiveDirtyPath(path) || (previousPath && sensitiveDirtyPath(previousPath))) {
    return Object.freeze({ sha256: null, reason: 'PROTECTED_PATH_NOT_READ' });
  }
  const target = resolve(root, safeDirtyPath(path));
  if (!inside(root, target)) return Object.freeze({ sha256: null, reason: 'PATH_ESCAPE_REJECTED' });
  try {
    const state = await lstat(target);
    if (state.isSymbolicLink()) return Object.freeze({ sha256: null, reason: 'SYMLINK_NOT_READ' });
    if (!state.isFile()) return Object.freeze({ sha256: null, reason: 'NON_FILE_IDENTITY_UNAVAILABLE' });
    const resolved = await realpath(target);
    if (!inside(root, resolved)) return Object.freeze({ sha256: null, reason: 'SYMLINK_ESCAPE_REJECTED' });
    return Object.freeze({ sha256: sha256(await readFile(resolved)), reason: null });
  } catch (error) {
    if (error.code === 'ENOENT') return Object.freeze({ sha256: null, reason: 'WORKTREE_FILE_MISSING' });
    return Object.freeze({ sha256: null, reason: 'WORKTREE_IDENTITY_UNREADABLE' });
  }
}

async function indexIdentity(root, path, untracked, previousPath = null) {
  if (untracked) return Object.freeze({ sha256: null, reason: null });
  if (sensitiveDirtyPath(path) || (previousPath && sensitiveDirtyPath(previousPath))) {
    return Object.freeze({ sha256: null, reason: 'PROTECTED_PATH_NOT_READ' });
  }
  try {
    return Object.freeze({ sha256: sha256(await gitBuffer(root, ['show', `:${safeDirtyPath(path)}`])), reason: null });
  } catch {
    return Object.freeze({ sha256: null, reason: 'INDEX_IDENTITY_UNAVAILABLE' });
  }
}

function parseStatus(buffer) {
  const fields = buffer.toString('utf8').split('\0');
  const result = [];
  for (let index = 0; index < fields.length - 1; index += 1) {
    const field = fields[index];
    if (!field) continue;
    if (field.length < 4 || field[2] !== ' ') throw new Error('dirty recovery status row malformed');
    const statusCode = field.slice(0, 2);
    const path = safeDirtyPath(field.slice(3));
    const renamedOrCopied = 'RC'.includes(statusCode[0]) || 'RC'.includes(statusCode[1]);
    const previousPath = renamedOrCopied ? safeDirtyPath(fields[++index]) : null;
    if (statusCode === '!!') continue;
    result.push(Object.freeze({ statusCode, path, previousPath }));
  }
  return result;
}

function dirtyDisposition(statusCode, worktree, index) {
  const reasons = [worktree.reason, index.reason].filter(Boolean);
  if (reasons.length > 0) return Object.freeze({
    disposition: 'INVENTORY_GAP',
    unresolvedReason: reasons.join(';'),
  });
  if (statusCode === '??') return Object.freeze({
    disposition: 'UNTRACKED_NONIGNORED',
    unresolvedReason: 'MIGRATION_DISPOSITION_NOT_ADJUDICATED',
  });
  return Object.freeze({
    disposition: 'TRACKED_EDIT',
    unresolvedReason: 'MIGRATION_DISPOSITION_NOT_ADJUDICATED',
  });
}

async function collectDirtyRecovery(root) {
  const [head, statusBytes] = await Promise.all([
    gitText(root, ['rev-parse', 'HEAD']),
    gitBuffer(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
  ]);
  if (!GIT_COMMIT.test(head)) throw new Error('dirty recovery HEAD invalid');
  const status = parseStatus(statusBytes);
  const rows = [];
  for (const row of status) {
    const untracked = row.statusCode === '??';
    const [worktree, index] = await Promise.all([
      fileIdentity(root, row.path, row.previousPath),
      indexIdentity(root, row.path, untracked, row.previousPath),
    ]);
    const disposition = dirtyDisposition(row.statusCode, worktree, index);
    rows.push(Object.freeze({
      statusCode: row.statusCode,
      path: row.path,
      ...(row.previousPath ? { previousPath: row.previousPath } : {}),
      indexSha256: index.sha256,
      worktreeSha256: worktree.sha256,
      disposition: disposition.disposition,
      unresolvedReason: disposition.unresolvedReason,
    }));
  }
  rows.sort((left, right) => `${left.path}\0${left.previousPath ?? ''}`.localeCompare(`${right.path}\0${right.previousPath ?? ''}`));
  const excludedSensitivePaths = rows
    .filter((row) => sensitiveDirtyPath(row.path) || (row.previousPath && sensitiveDirtyPath(row.previousPath)))
    .map((row) => row.path)
    .sort();
  const includedTrackedPaths = [...new Set(rows
    .filter((row) => row.statusCode !== '??'
      && !sensitiveDirtyPath(row.path)
      && (!row.previousPath || !sensitiveDirtyPath(row.previousPath)))
    .flatMap((row) => [row.path, ...(row.previousPath ? [row.previousPath] : [])]))].sort();
  const diffOptions = Object.freeze(['--no-ext-diff', '--no-textconv', '--binary']);
  const trackedDiffBytes = includedTrackedPaths.length === 0
    ? Buffer.alloc(0)
    : await gitBuffer(root, [
      'diff', ...diffOptions, 'HEAD', '--', ...includedTrackedPaths.map((path) => `:(literal)${path}`),
    ]);
  const statusSha256 = sha256(statusBytes);
  const trackedDiffSha256 = sha256(trackedDiffBytes);
  const trackedAggregate = Object.freeze({
    scope: 'NON_SENSITIVE_TRACKED_DIFF',
    pathspecMode: 'LITERAL',
    diffOptions,
    includedTrackedPaths: Object.freeze(includedTrackedPaths),
    excludedSensitivePaths: Object.freeze(excludedSensitivePaths),
  });
  const snapshotSha256 = canonicalJsonSha256({ head, statusSha256, trackedDiffSha256, trackedAggregate, rows });
  return Object.freeze({
    head,
    statusRows: rows.length,
    statusSha256,
    trackedDiffSha256,
    trackedAggregate,
    snapshotSha256,
    rows: Object.freeze(rows),
  });
}

export async function inventoryDirtyRecovery({ root, expectedSnapshotSha256 } = {}) {
  const stableRoot = await gitRepositoryRoot(root, 'dirty recovery');
  const first = await collectDirtyRecovery(stableRoot);
  const second = await collectDirtyRecovery(stableRoot);
  if (first.snapshotSha256 !== second.snapshotSha256) {
    throw new Error('dirty recovery changed during repeated inventory scan');
  }
  if (expectedSnapshotSha256 && first.snapshotSha256 !== hash(expectedSnapshotSha256, 'expected dirty recovery snapshot')) {
    throw new Error('dirty recovery snapshot changed since expected inventory');
  }
  return first;
}

export async function auditV3Baseline({
  activeDescriptor,
  manifest,
  runtime,
  legacyAudit,
  code,
  policies,
  dirtyRecovery,
} = {}) {
  const descriptorArtifact = jsonArtifact(activeDescriptor, {
    owner: 'active-release-descriptor', path: PATHS.activeDescriptor, label: 'active release descriptor',
  });
  const descriptor = validateActiveRetailReleaseDescriptor(descriptorArtifact.document);
  const releaseDirectory = `data/architecture-v2/releases/${descriptor.releaseCandidateId}`;
  const manifestArtifact = jsonArtifact(manifest?.artifact, {
    owner: 'active-release-manifest', path: `${releaseDirectory}/authorization-manifest.json`, label: 'active release manifest',
  });
  declaredByteBinding(manifestArtifact, descriptor.artifacts.authorizationManifest.sha256, 'active release manifest');
  const releaseManifest = validateRetailLifecycleReleaseCandidate(manifestArtifact.document);
  if (releaseManifest.releaseCandidateId !== descriptor.releaseCandidateId) {
    throw new Error('active release descriptor and manifest release IDs differ');
  }
  if (releaseManifest.authorization.status !== 'READY_FOR_CUTOVER') {
    throw new Error('active release manifest must be READY_FOR_CUTOVER');
  }
  if (descriptor.rollback.status !== releaseManifest.rollback.status
    || descriptor.rollback.baselinePublicProjectionSha256 !== releaseManifest.rollback.restoredBaselineSha256) {
    throw new Error('active descriptor and manifest rollback binding mismatch');
  }
  const activeProjection = jsonArtifact(manifest?.activeProjection, {
    owner: 'active-release-public-projection', path: `${releaseDirectory}/public-catalog-projection.json`, label: 'active release public projection',
  });
  const historicalReference = jsonArtifact(manifest?.historicalReference, {
    owner: 'active-release-historical-reference', path: `${releaseDirectory}/historical-appliance-reference.json`, label: 'active release historical reference',
  });
  declaredByteBinding(activeProjection, descriptor.artifacts.publicProjection.sha256, 'active release public projection');
  declaredByteBinding(historicalReference, descriptor.artifacts.historicalReference.sha256, 'active release historical reference');
  declaredByteBinding(activeProjection, releaseManifest.sourceBindings.finalCandidateProjectionSha256, 'active release public projection');
  declaredSemanticBinding(activeProjection, releaseManifest.sourceBindings.finalCandidateProjectionSemanticSha256, 'active release public projection');
  declaredByteBinding(historicalReference, releaseManifest.sourceBindings.historicalReferenceCandidateSha256, 'active release historical reference');
  declaredSemanticBinding(historicalReference, releaseManifest.sourceBindings.historicalReferenceCandidateSemanticSha256, 'active release historical reference');

  const legacyProjection = jsonArtifact(legacyAudit?.projection, {
    owner: 'legacy-default-audit-input', path: PATHS.legacyProjection, label: 'legacy default audit projection',
  });
  const legacyReceiptBundle = jsonArtifact(legacyAudit?.receiptBundle, {
    owner: 'legacy-default-audit-receipts', path: PATHS.legacyReceiptBundle, label: 'legacy default audit receipts',
  });
  const legacyReplayAudit = jsonArtifact(legacyAudit?.replayAudit, {
    owner: 'legacy-default-audit-replay-audit', path: PATHS.legacyReplayAudit, label: 'legacy default audit replay audit',
  });
  const legacyControlPlane = jsonArtifact(legacyAudit?.controlPlane, {
    owner: 'legacy-default-audit-control-plane', path: PATHS.legacyControlPlane, label: 'legacy default audit control plane',
  });
  const bindingInventory = sourceBindingInventory(releaseManifest, manifest?.sourceBindings, legacyProjection);

  const activeProducts = products(activeProjection.document, 'active release projection');
  const legacyProducts = products(legacyProjection.document, 'legacy default audit projection');
  const historicalRecords = records(historicalReference.document, 'active historical reference');
  if (releaseManifest.membership.finalCandidateProducts !== activeProducts.length) {
    throw new Error('manifest active denominator differs from active release artifact');
  }

  const runtimeProjection = jsonArtifact(runtime?.projection, {
    owner: 'runtime-public-projection', path: PATHS.runtimeProjection, label: 'runtime projection',
  });
  const runtimeMarker = jsonArtifact(runtime?.marker, {
    owner: 'runtime-projection-marker', path: PATHS.runtimeMarker, label: 'runtime projection marker',
  });
  const runtimeProducts = products(runtimeProjection.document, 'runtime projection');
  if (runtimeProjection.semanticSha256 !== activeProjection.semanticSha256) {
    throw new Error('runtime projection is not semantically equal to active release projection');
  }
  if (runtimeMarker.document.schemaVersion !== 2 || runtimeMarker.document.activeProjection !== 'v2'
    || runtimeMarker.document.productCount !== runtimeProducts.length
    || runtimeProducts.length !== activeProducts.length) {
    throw new Error('runtime projection marker mismatch');
  }

  const codeScope = codeRecord(code);
  const policyScope = policyRecords(policies);
  const dirtyMigrationInventory = await inventoryDirtyRecovery(dirtyRecovery);
  const activePopulation = populationSummary(activeProducts);
  const legacyPopulation = populationSummary(legacyProducts);

  return Object.freeze({
    baselineCommit: codeScope.baselineCommit,
    activeReleaseDescriptorSha256: descriptorArtifact.sha256,
    activeManifestSha256: manifestArtifact.sha256,
    runtimeProjectionSha256: runtimeProjection.sha256,
    legacyAuditInputSha256: legacyProjection.sha256,
    codeSha256: codeScope.codeSha256,
    inputHashes: Object.freeze({
      activeReleaseDescriptor: summary(descriptorArtifact),
      activeReleaseManifest: summary(manifestArtifact),
      activeReleasePublicProjection: summary(activeProjection),
      activeHistoricalReference: summary(historicalReference),
      runtimeProjection: summary(runtimeProjection),
      runtimeMarker: summary(runtimeMarker),
      legacyDefaultAuditInput: summary(legacyProjection),
      legacyDefaultAuditReceiptBundle: summary(legacyReceiptBundle),
      legacyDefaultAuditReplayAudit: summary(legacyReplayAudit),
      legacyDefaultAuditControlPlane: summary(legacyControlPlane),
      code: Object.freeze({
        baselineCommit: codeScope.baselineCommit,
        sha256: codeScope.codeSha256,
        files: Object.freeze(codeScope.files.map(summary)),
      }),
      policies: Object.freeze({
        fieldRights: summary(policyScope.fieldRights),
        manufacturerSource: summary(policyScope.manufacturerSource),
        applicabilityMatrix: summary(policyScope.applicabilityMatrix),
      }),
      sourceBindings: bindingInventory.bindings,
    }),
    denominatorsByArtifact: Object.freeze({
      activeRelease: Object.freeze({ products: activeProducts.length, currentRetailProducts: activePopulation.currentRetailProducts }),
      historicalReference: Object.freeze({ records: historicalRecords.length }),
      legacyDefaultAudit: Object.freeze({ products: legacyProducts.length }),
      runtimeProjection: Object.freeze({ products: runtimeProducts.length }),
    }),
    populationDetail: Object.freeze({ activeRelease: activePopulation, legacyDefaultAudit: legacyPopulation }),
    manifestHistoricalBaseline: bindingInventory.manifestHistoricalBaseline,
    artifactIdentity: Object.freeze({
      runtimeVsActiveRelease: Object.freeze({
        byteIdentity: runtimeProjection.sha256 === activeProjection.sha256 ? 'BYTE_IDENTICAL' : 'BYTE_DISTINCT',
        semanticIdentity: 'SEMANTIC_EQUAL',
      }),
    }),
    dirtyMigrationInventory,
    auditedAt: new Date().toISOString(),
  });
}

function parseCli(args) {
  const parsed = { checkOnly: false, root: null, dirtyRecoveryRoot: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--check-only') {
      if (parsed.checkOnly) throw new TypeError('--check-only supplied more than once');
      parsed.checkOnly = true;
      continue;
    }
    if (argument === '--root' || argument === '--dirty-recovery-root') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new TypeError(`${argument} requires a path`);
      const key = argument === '--root' ? 'root' : 'dirtyRecoveryRoot';
      if (parsed[key]) throw new TypeError(`${argument} supplied more than once`);
      parsed[key] = value;
      continue;
    }
    throw new TypeError(`unknown argument: ${argument}`);
  }
  if (!parsed.checkOnly) throw new TypeError('--check-only required');
  return parsed;
}

async function repositoryRootFromCwd() {
  try {
    return (await execFile('git', ['rev-parse', '--show-toplevel'], { cwd: process.cwd() })).stdout.trim();
  } catch (error) {
    throw new Error(`cannot resolve repository root: ${error.message}`);
  }
}

async function defaultDirtyRecoveryRoot(root) {
  const commonDirectory = await realpath(resolve(root, await gitText(root, ['rev-parse', '--git-common-dir'])));
  const recoveryRoot = await gitRepositoryRoot(dirname(commonDirectory), 'dirty recovery');
  const recoveryCommon = await realpath(resolve(
    recoveryRoot,
    await gitText(recoveryRoot, ['rev-parse', '--git-common-dir']),
  ));
  if (recoveryCommon !== commonDirectory) throw new Error('dirty recovery git common-dir mismatch');
  return recoveryRoot;
}

async function repositoryArtifact(root, path, owner, label) {
  const safePath = artifactPath(path, label);
  const target = resolve(root, safePath);
  if (!inside(root, target)) throw new Error(`${label} path escape rejected`);
  const state = await lstat(target);
  if (state.isSymbolicLink()) throw new Error(`${label} symlink input rejected`);
  const resolved = await realpath(target);
  if (!inside(root, resolved)) throw new Error(`${label} symlink escape rejected`);
  const bytes = await readFile(resolved);
  return Object.freeze({ source: REPOSITORY_SOURCE, owner, path: safePath, bytes, sha256: sha256(bytes) });
}

async function optionalRepositoryArtifact(root, path, owner, label) {
  try {
    return await repositoryArtifact(root, path, owner, label);
  } catch (error) {
    return Object.freeze({
      source: REPOSITORY_SOURCE,
      owner,
      path,
      unavailable: true,
      reason: 'LOCAL_MIGRATION_INPUT_UNAVAILABLE_OR_UNSAFE',
    });
  }
}

async function buildBaselineInput(root, dirtyRecoveryRoot) {
  const stableRoot = await stableDirectory(root, 'repository');
  const activeDescriptor = await repositoryArtifact(stableRoot, PATHS.activeDescriptor, 'active-release-descriptor', 'active release descriptor');
  const descriptor = validateActiveRetailReleaseDescriptor(JSON.parse(activeDescriptor.bytes));
  const releaseDirectory = `data/architecture-v2/releases/${descriptor.releaseCandidateId}`;
  await loadActiveRetailRelease({ root: stableRoot, descriptorPath: resolve(stableRoot, PATHS.activeDescriptor) });
  const [manifest, activeProjection, historicalReference, runtimeProjection, runtimeMarker, legacyProjection,
    legacyReceiptBundle, legacyReplayAudit, legacyControlPlane, fieldRights, manufacturerSource, applicabilityMatrix] = await Promise.all([
    repositoryArtifact(stableRoot, `${releaseDirectory}/authorization-manifest.json`, 'active-release-manifest', 'active release manifest'),
    repositoryArtifact(stableRoot, `${releaseDirectory}/public-catalog-projection.json`, 'active-release-public-projection', 'active release public projection'),
    repositoryArtifact(stableRoot, `${releaseDirectory}/historical-appliance-reference.json`, 'active-release-historical-reference', 'active release historical reference'),
    repositoryArtifact(stableRoot, PATHS.runtimeProjection, 'runtime-public-projection', 'runtime projection'),
    repositoryArtifact(stableRoot, PATHS.runtimeMarker, 'runtime-projection-marker', 'runtime marker'),
    repositoryArtifact(stableRoot, PATHS.legacyProjection, 'legacy-default-audit-input', 'legacy default audit projection'),
    repositoryArtifact(stableRoot, PATHS.legacyReceiptBundle, 'legacy-default-audit-receipts', 'legacy default audit receipts'),
    repositoryArtifact(stableRoot, PATHS.legacyReplayAudit, 'legacy-default-audit-replay-audit', 'legacy default audit replay audit'),
    repositoryArtifact(stableRoot, PATHS.legacyControlPlane, 'legacy-default-audit-control-plane', 'legacy default audit control plane'),
    repositoryArtifact(stableRoot, PATHS.fieldRights, 'policy-field-rights', 'field-rights policy'),
    repositoryArtifact(stableRoot, PATHS.manufacturerSource, 'policy-manufacturer-source', 'manufacturer-source policy'),
    repositoryArtifact(stableRoot, PATHS.applicabilityMatrix, 'policy-applicability-matrix', 'applicability matrix'),
  ]);
  const sourceBindings = {
    legacy: legacyProjection,
    candidateBase: await optionalRepositoryArtifact(stableRoot, PATHS.candidateBase, 'manifest-candidate-base', 'candidate-base migration input'),
    identityMigration: await optionalRepositoryArtifact(stableRoot, PATHS.identityMigration, 'manifest-identity-migration', 'identity migration input'),
    candidateShadow: await optionalRepositoryArtifact(stableRoot, PATHS.candidateShadow, 'manifest-candidate-shadow', 'candidate shadow input'),
    officialMarket: await optionalRepositoryArtifact(stableRoot, PATHS.officialMarket, 'manifest-official-market', 'official market migration input'),
    releasePolicy: await optionalRepositoryArtifact(stableRoot, PATHS.releasePolicy, 'manifest-release-policy', 'release policy input'),
  };
  const files = await Promise.all(CODE_SCOPE.map(async ([owner, path]) => repositoryArtifact(stableRoot, path, owner, owner)));
  return Object.freeze({
    activeDescriptor,
    manifest: { artifact: manifest, activeProjection, historicalReference, sourceBindings },
    runtime: { projection: runtimeProjection, marker: runtimeMarker },
    legacyAudit: { projection: legacyProjection, receiptBundle: legacyReceiptBundle, replayAudit: legacyReplayAudit, controlPlane: legacyControlPlane },
    code: { baselineCommit: await gitText(stableRoot, ['rev-parse', 'HEAD']), files },
    policies: { fieldRights, manufacturerSource, applicabilityMatrix },
    dirtyRecovery: { root: dirtyRecoveryRoot },
  });
}

export async function runCli(args = process.argv.slice(2)) {
  const parsed = parseCli(args);
  const root = parsed.root ? await stableDirectory(parsed.root, 'repository') : await stableDirectory(await repositoryRootFromCwd(), 'repository');
  const dirtyRecoveryRoot = parsed.dirtyRecoveryRoot
    ? await gitRepositoryRoot(parsed.dirtyRecoveryRoot, 'dirty recovery')
    : await defaultDirtyRecoveryRoot(root);
  const input = await buildBaselineInput(root, dirtyRecoveryRoot);
  const result = await auditV3Baseline(input);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
