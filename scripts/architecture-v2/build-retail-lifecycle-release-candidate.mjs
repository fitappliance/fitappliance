#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { hashHistoricalCatalogBinding } from '../../src/domain/historical-catalog-binding.mjs';
import { historicalReferenceIdFor } from '../../src/domain/historical-appliance-reference.mjs';
import { buildHistoricalEvidencePublication } from '../../src/domain/historical-evidence-publication.mjs';
import { filterHistoricalAcceptanceBundleByReceiptReplayAudit } from '../../src/domain/historical-evidence-recovery-audit.mjs';
import {
  buildRetailLifecycleReleaseCandidate,
} from '../../src/domain/retail-lifecycle-release-candidate.mjs';
import {
  applyRetailLifecycleCutover,
  buildRetailLifecycleShadow,
} from '../../src/domain/retail-lifecycle-shadow.mjs';
import {
  buildHistoricalReferenceFromOfficialSnapshots,
  HISTORICAL_REFERENCE_CATEGORIES,
} from './build-historical-appliance-reference.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

async function readJsonWithHash(path) {
  const bytes = await readFile(path);
  return { document: JSON.parse(bytes), bytes, sha256: sha256(bytes) };
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

async function commitArtifacts(entries) {
  const staged = [];
  try {
    for (const [path, bytes] of entries) {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, bytes, { flag: 'wx' });
      if (sha256(await readFile(temporary)) !== sha256(bytes)) {
        throw new Error(`candidate temporary hash mismatch: ${path}`);
      }
      staged.push([temporary, path]);
    }
    for (const [temporary, path] of staged) await rename(temporary, path);
  } catch (error) {
    await Promise.all(staged.map(([temporary]) => rm(temporary, { force: true })));
    throw error;
  }
}

export function validateCandidateReference(reference, finalCandidate) {
  if (!reference || reference.schemaVersion !== 1 || !Array.isArray(reference.records)) {
    throw new TypeError('candidate historical reference schema v1 required');
  }
  const expectedCatalogHash = hashHistoricalCatalogBinding(finalCandidate);
  if (reference.sourceSnapshotHashes?.['fitappliance:catalog'] !== expectedCatalogHash) {
    throw new Error('candidate historical reference top-level catalog binding drift');
  }
  if (reference.summary?.records !== reference.records.length) {
    throw new Error('candidate historical reference summary records mismatch');
  }
  const finalById = new Map(finalCandidate.products.map((product) => [String(product.id), product]));
  const expectedCatalogIds = new Set(finalCandidate.products
    .filter((product) => HISTORICAL_REFERENCE_CATEGORIES.includes(product.cat))
    .map((product) => String(product.id)));
  const seenReferenceIds = new Set();
  const seenCatalogIds = new Set();
  const summaryFields = ['lifecycleState', 'evidenceState', 'lookupAction'];
  const summaryNames = ['byLifecycle', 'byEvidence', 'byLookupAction'];
  const summaryCounts = Object.fromEntries(summaryNames.map((name) => [name, {}]));
  for (const record of reference.records) {
    const referenceId = required(record.referenceId, 'candidate historical reference ID');
    if (seenReferenceIds.has(referenceId)) {
      throw new Error(`candidate historical reference contains duplicate reference ID: ${referenceId}`);
    }
    seenReferenceIds.add(referenceId);
    if (referenceId !== historicalReferenceIdFor(record.category, record.brand, record.model)) {
      throw new Error(`candidate historical reference identity drift: ${referenceId}`);
    }
    const productIds = (record.catalogProductIds ?? []).map(String);
    if (new Set(productIds).size !== productIds.length) {
      throw new Error(`candidate historical reference contains duplicate catalog ID: ${referenceId}`);
    }
    const catalogSources = (record.sources ?? []).filter((source) => (
      source.sourceId === 'fitappliance:catalog'
    ));
    if (productIds.length > 0
      && (catalogSources.length !== 1 || catalogSources[0].snapshotSha256 !== expectedCatalogHash)) {
      throw new Error(`candidate historical reference catalog binding missing or stale: ${referenceId}`);
    }
    if (productIds.length === 0 && catalogSources.length > 0) {
      throw new Error(`candidate historical reference has unscoped catalog binding: ${referenceId}`);
    }
    for (const productId of productIds) {
      if (seenCatalogIds.has(productId)) {
        throw new Error(`candidate historical reference contains duplicate catalog ID: ${productId}`);
      }
      seenCatalogIds.add(productId);
      const product = finalById.get(productId);
      if (!product) {
        throw new Error(`candidate historical reference contains removed catalog ID: ${productId}`);
      }
      if (!expectedCatalogIds.has(productId)
        || product.cat !== record.category
        || product.brand !== record.brand
        || product.model !== record.model) {
        throw new Error(`candidate historical reference catalog identity drift: ${productId}`);
      }
    }
    for (let index = 0; index < summaryFields.length; index += 1) {
      const key = required(record[summaryFields[index]], `candidate historical ${summaryFields[index]}`);
      const counts = summaryCounts[summaryNames[index]];
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  const missingCatalogIds = [...expectedCatalogIds].filter((id) => !seenCatalogIds.has(id));
  if (missingCatalogIds.length > 0) {
    throw new Error(`candidate historical reference missing catalog IDs: ${missingCatalogIds.join(', ')}`);
  }
  for (const name of summaryNames) {
    const actual = Object.fromEntries(Object.entries(summaryCounts[name]).sort(([left], [right]) => (
      left.localeCompare(right)
    )));
    const expected = Object.fromEntries(Object.entries(reference.summary?.[name] ?? {})
      .sort(([left], [right]) => left.localeCompare(right)));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`candidate historical reference summary ${name} mismatch`);
    }
  }
  return reference;
}

async function rollbackDrill({ baselineBytes, candidateBytes, directory }) {
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, `retail-lifecycle-rollback-${process.pid}.json`);
  try {
    await writeFile(path, candidateBytes, { flag: 'wx' });
    if (sha256(await readFile(path)) !== sha256(candidateBytes)) {
      throw new Error('candidate rollback drill write mismatch');
    }
    await writeFile(path, baselineBytes);
    return sha256(await readFile(path));
  } finally {
    await rm(path, { force: true });
  }
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

function validateArgs(args) {
  const supportedFlags = new Set(['--materialize-reference']);
  const supportedOptions = new Set(['--root', '--storage-root']);
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (supportedFlags.has(value)) continue;
    if (supportedOptions.has(value)) {
      index += 1;
      if (!args[index] || args[index].startsWith('--')) throw new TypeError(`${value} requires a value`);
      continue;
    }
    throw new TypeError(`unknown release candidate argument: ${value}`);
  }
}

export async function buildRetailLifecycleReleaseCandidateFromRepository({
  root = defaultRoot,
  storageRoot = null,
  materializeReference = false,
} = {}) {
  const paths = {
    baseline: resolveArchitectureV2Path(root, 'publicProjection'),
    baseCandidate: resolveArchitectureV2Path(root, 'publicProjectionMigrationCandidate'),
    officialMarketCandidate: resolveArchitectureV2Path(root, 'officialMarketLifecycleMigrationCandidate'),
    officialIdentityEvidence: resolveArchitectureV2Path(root, 'retailerIdentityOfficialEvidence'),
    historicalReference: resolveArchitectureV2Path(root, 'historicalApplianceReference'),
    ledger: resolveArchitectureV2Path(root, 'retailerObservations'),
    sourcePolicy: resolveArchitectureV2Path(root, 'retailerSourcePolicy'),
    releasePolicy: resolveArchitectureV2Path(root, 'retailLifecycleReleasePolicy'),
    identityMigration: resolveArchitectureV2Path(root, 'retailerIdentityMigration'),
    shadowCandidate: resolveArchitectureV2Path(root, 'retailLifecycleShadowMigrationCandidate'),
    finalCandidate: resolveArchitectureV2Path(root, 'publicProjectionReleaseCandidate'),
    referenceCandidate: resolveArchitectureV2Path(root, 'historicalApplianceReferenceReleaseCandidate'),
    manifest: resolveArchitectureV2Path(root, 'retailLifecycleReleaseCandidate'),
  };
  const [
    baseline,
    baseCandidate,
    officialMarketCandidate,
    officialIdentityEvidence,
    historicalReference,
    ledger,
    sourcePolicy,
    releasePolicy,
    identityMigration,
  ] = await Promise.all([
    readJsonWithHash(paths.baseline),
    readJsonWithHash(paths.baseCandidate),
    readJsonWithHash(paths.officialMarketCandidate),
    readJsonWithHash(paths.officialIdentityEvidence),
    readJsonWithHash(paths.historicalReference),
    readJsonWithHash(paths.ledger),
    readJsonWithHash(paths.sourcePolicy),
    readJsonWithHash(paths.releasePolicy),
    readJsonWithHash(paths.identityMigration),
  ]);
  if (releasePolicy.document.mode !== 'SHADOW_ONLY') {
    throw new Error('candidate generation requires tracked SHADOW_ONLY release policy');
  }
  if (officialMarketCandidate.document.sourceBindings.officialIdentityEvidenceSha256
      !== officialIdentityEvidence.sha256
    || officialMarketCandidate.document.sourceBindings.historicalReferenceSha256
      !== historicalReference.sha256) {
    throw new Error('candidate official market upstream source binding drift');
  }
  const shadow = buildRetailLifecycleShadow({
    publicProjection: baseCandidate.document,
    publicProjectionSha256: baseCandidate.sha256,
    officialMarketLifecycle: officialMarketCandidate.document,
    officialMarketLifecycleSha256: officialMarketCandidate.sha256,
    retailerLedger: ledger.document,
    retailerLedgerSha256: ledger.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    releasePolicySha256: releasePolicy.sha256,
    releaseEpoch: required(releasePolicy.document.releaseEpoch, 'release epoch'),
    asOf: releasePolicy.document.asOf,
    retailLifecyclePolicyVersion: required(
      releasePolicy.document.retailLifecyclePolicyVersion,
      'retail lifecycle policy version',
    ),
  });
  const finalCandidate = applyRetailLifecycleCutover({
    publicProjection: baseCandidate.document,
    publicProjectionSha256: baseCandidate.sha256,
    shadow,
  });
  const shadowBytes = jsonBytes(shadow);
  const finalCandidateBytes = jsonBytes(finalCandidate);

  let referenceCandidate;
  let referenceCandidateBytes;
  if (materializeReference) {
    const normalizedStorageRoot = required(storageRoot, 'candidate historical reference storage root');
    const [snapshots, recoveryBundle, replayAudit] = await Promise.all([
      readJsonWithHash(resolveArchitectureV2Path(root, 'officialRegistrySnapshots')),
      readJsonWithHash(resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryAcceptanceBundle')),
      readJsonWithHash(resolveArchitectureV2Path(root, 'historicalAcceptanceReceiptReplayAudit')),
    ]);
    const safeRecoveryBundle = filterHistoricalAcceptanceBundleByReceiptReplayAudit(
      recoveryBundle.document,
      replayAudit.document,
    ).bundle;
    const recoveryPublication = buildHistoricalEvidencePublication({
      bundle: safeRecoveryBundle,
      products: finalCandidate.products,
      lifecycleMode: 'OBSERVATION_CUTOVER',
    });
    referenceCandidate = await buildHistoricalReferenceFromOfficialSnapshots({
      snapshotsDocument: snapshots.document,
      catalog: finalCandidate,
      historicalEvidenceProjection: recoveryPublication.historicalEvidenceProjection,
      lifecycleMode: 'OBSERVATION_DECISIONS',
      storageRoot: normalizedStorageRoot,
    });
    referenceCandidateBytes = jsonBytes(referenceCandidate);
  } else {
    const trackedReference = await readJsonWithHash(paths.referenceCandidate);
    referenceCandidate = trackedReference.document;
    referenceCandidateBytes = trackedReference.bytes;
  }
  validateCandidateReference(referenceCandidate, finalCandidate);
  const restoredBaselineSha256 = await rollbackDrill({
    baselineBytes: baseline.bytes,
    candidateBytes: finalCandidateBytes,
    directory: dirname(paths.manifest),
  });
  const manifest = buildRetailLifecycleReleaseCandidate({
    baselinePublicProjection: baseline.document,
    baselinePublicProjectionSha256: baseline.sha256,
    candidateBaseProjection: baseCandidate.document,
    candidateBaseProjectionSha256: baseCandidate.sha256,
    finalCandidateProjection: finalCandidate,
    finalCandidateProjectionSha256: sha256(finalCandidateBytes),
    identityMigration: identityMigration.document,
    identityMigrationSha256: identityMigration.sha256,
    candidateShadow: shadow,
    candidateShadowSha256: sha256(shadowBytes),
    releasePolicy: releasePolicy.document,
    releasePolicySha256: releasePolicy.sha256,
    historicalReferenceCandidate: referenceCandidate,
    historicalReferenceCandidateSha256: sha256(referenceCandidateBytes),
    restoredBaselineSha256,
  });
  if (manifest.authorization.status !== 'READY_FOR_CUTOVER') {
    throw new Error(`release candidate remains blocked: ${manifest.authorization.reasonCodes.join(', ')}`);
  }
  const entries = [
    [paths.shadowCandidate, shadowBytes],
    [paths.finalCandidate, finalCandidateBytes],
    ...(materializeReference ? [[paths.referenceCandidate, referenceCandidateBytes]] : []),
    // The manifest is the commit marker and must be renamed last.
    [paths.manifest, jsonBytes(manifest)],
  ];
  await commitArtifacts(entries);
  return { paths, shadow, finalCandidate, referenceCandidate, manifest };
}

export async function runCli(args = process.argv.slice(2), environment = process.env) {
  validateArgs(args);
  const root = resolve(option(args, '--root') ?? defaultRoot);
  const materializeReference = args.includes('--materialize-reference');
  const storageRoot = option(args, '--storage-root') ?? environment.FITAPPLIANCE_STORAGE_ROOT ?? null;
  const result = await buildRetailLifecycleReleaseCandidateFromRepository({
    root,
    materializeReference,
    storageRoot,
  });
  process.stdout.write(`${JSON.stringify({
    manifest: result.paths.manifest,
    releaseCandidateId: result.manifest.releaseCandidateId,
    authorization: result.manifest.authorization,
    partition: {
      expected: result.manifest.partition.expectedLegacyCurrentProducts,
      accounted: result.manifest.partition.accountedLegacyCurrentProducts,
      unresolved: result.manifest.partition.unresolvedIds.length,
      unsafeRemoved: result.manifest.partition.unsafeRemovedIds.length,
    },
    products: result.finalCandidate.products.length,
    historicalReferenceRecords: result.referenceCandidate.records.length,
  }, null, 2)}\n`);
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
