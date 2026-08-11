#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  loadActiveRetailRelease,
  validateActiveRetailReleaseDescriptor,
} from '../../src/domain/active-retail-release.mjs';
import { buildActiveRetailPrivacySuccessor } from '../../src/domain/active-retail-privacy-successor.mjs';

const defaultRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const descriptorRelativePath = 'data/architecture-v2/decisions/active-retail-release.json';
const sanitizerRelativePath = 'src/domain/public-projection.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function buildPrivacySuccessorDescriptor(result) {
  const releaseCandidateId = result.manifest.releaseCandidateId;
  const releaseDirectory = `data/architecture-v2/releases/${releaseCandidateId}`;
  return validateActiveRetailReleaseDescriptor({
    schemaVersion: 2,
    policyVersion: 'active-retail-release-v2',
    releaseKind: 'PRIVACY_SANITIZATION_SUCCESSOR',
    releaseCandidateId,
    predecessorReleaseCandidateId: result.manifest.predecessor.releaseCandidateId,
    activatedAt: result.manifest.generatedAt,
    artifacts: {
      publicProjection: {
        path: `${releaseDirectory}/public-catalog-projection.json`,
        sha256: sha256(result.catalogBytes),
      },
      historicalReference: {
        path: `${releaseDirectory}/historical-appliance-reference.json`,
        sha256: sha256(result.historicalReferenceBytes),
      },
      authorizationManifest: {
        path: `${releaseDirectory}/authorization-manifest.json`,
        sha256: sha256(result.manifestBytes),
      },
      predecessorAuthorizationManifest: {
        path: `${releaseDirectory}/predecessor-authorization-manifest.json`,
        sha256: sha256(result.predecessorAuthorizationManifestBytes),
      },
    },
    recovery: {
      status: 'EXTERNAL_PRIVATE_RECOVERY_BOUND',
      manifestSha256: result.manifest.sourceBindings.recoveryManifestSha256,
      archiveSha256: result.manifest.sourceBindings.recoveryArchiveSha256,
      predecessorPublicProjectionSha256: result.manifest.predecessor.publicProjectionSha256,
    },
  });
}

function parseArgs(args) {
  const options = { write: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--write') options.write = true;
    else if (argument === '--recovery-manifest') options.recoveryManifestPath = args[++index];
    else if (argument === '--generated-at') options.generatedAt = args[++index];
    else if (argument === '--predecessor-projection') options.predecessorCatalogPath = args[++index];
    else if (argument === '--predecessor-authorization-manifest') {
      options.predecessorAuthorizationManifestPath = args[++index];
    } else if (argument === '--predecessor-reference') options.historicalReferencePath = args[++index];
    else throw new TypeError(`unknown argument: ${argument}`);
  }
  if (!options.recoveryManifestPath) throw new TypeError('--recovery-manifest required');
  if (!options.generatedAt) throw new TypeError('--generated-at required');
  return options;
}

export async function buildActiveRetailPrivacySuccessorRelease({
  root = defaultRoot,
  recoveryManifestPath,
  generatedAt,
  write = false,
  predecessorCatalogPath = null,
  predecessorAuthorizationManifestPath = null,
  historicalReferencePath = null,
}) {
  const descriptorPath = resolve(root, descriptorRelativePath);
  const explicitPaths = [
    predecessorCatalogPath,
    predecessorAuthorizationManifestPath,
    historicalReferencePath,
  ];
  const explicitPathCount = explicitPaths.filter(Boolean).length;
  if (explicitPathCount !== 0 && explicitPathCount !== explicitPaths.length) {
    throw new TypeError('all explicit predecessor artifact paths are required together');
  }
  if (explicitPathCount === 0) {
    const predecessorDescriptor = validateActiveRetailReleaseDescriptor(
      JSON.parse(await readFile(descriptorPath, 'utf8')),
    );
    if (predecessorDescriptor.schemaVersion !== 1) {
      throw new Error('schema-2 repair requires explicit predecessor artifact paths');
    }
    const predecessor = await loadActiveRetailRelease({ root, descriptorPath });
    predecessorCatalogPath = predecessor.paths.catalog;
    predecessorAuthorizationManifestPath = predecessor.paths.manifest;
    historicalReferencePath = predecessor.paths.reference;
  }
  const [predecessorCatalogBytes, historicalReferenceBytes, predecessorAuthorizationManifestBytes,
    sanitizerImplementationBytes, recoveryManifestBytes] = await Promise.all([
    readFile(resolve(predecessorCatalogPath)),
    readFile(resolve(historicalReferencePath)),
    readFile(resolve(predecessorAuthorizationManifestPath)),
    readFile(resolve(root, sanitizerRelativePath)),
    readFile(resolve(recoveryManifestPath)),
  ]);
  const result = buildActiveRetailPrivacySuccessor({
    predecessorCatalogBytes,
    predecessorAuthorizationManifestBytes,
    historicalReferenceBytes,
    sanitizerImplementationBytes,
    recoveryManifestBytes,
    generatedAt,
  });
  const descriptor = buildPrivacySuccessorDescriptor(result);
  const descriptorBytes = Buffer.from(`${JSON.stringify(descriptor, null, 2)}\n`);
  if (write) {
    const releaseDirectory = resolve(root, `data/architecture-v2/releases/${descriptor.releaseCandidateId}`);
    await mkdir(releaseDirectory);
    await Promise.all([
      writeFile(resolve(releaseDirectory, 'public-catalog-projection.json'), result.catalogBytes, { flag: 'wx' }),
      writeFile(
        resolve(releaseDirectory, 'historical-appliance-reference.json'),
        result.historicalReferenceBytes,
        { flag: 'wx' },
      ),
      writeFile(resolve(releaseDirectory, 'authorization-manifest.json'), result.manifestBytes, { flag: 'wx' }),
      writeFile(
        resolve(releaseDirectory, 'predecessor-authorization-manifest.json'),
        result.predecessorAuthorizationManifestBytes,
        { flag: 'wx' },
      ),
    ]);
    const temporaryDescriptorPath = `${descriptorPath}.privacy-successor-${process.pid}`;
    await writeFile(temporaryDescriptorPath, descriptorBytes, { flag: 'wx' });
    await loadActiveRetailRelease({ root, descriptorPath: temporaryDescriptorPath });
    await rename(temporaryDescriptorPath, descriptorPath);
  }
  return Object.freeze({
    descriptor,
    manifest: result.manifest,
    summary: Object.freeze({
      products: result.manifest.invariants.productsAfter,
      changedProducts: result.manifest.invariants.changedProducts,
      removedRetailerRows: result.manifest.invariants.removedRetailerRows,
      currentRetailProductsBefore: result.manifest.invariants.currentRetailProductsBefore,
      currentRetailProductsAfter: result.manifest.invariants.currentRetailProductsAfter,
      written: write,
    }),
  });
}

export async function runCli(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const result = await buildActiveRetailPrivacySuccessorRelease(options);
  process.stdout.write(`${JSON.stringify({
    releaseCandidateId: result.descriptor.releaseCandidateId,
    predecessorReleaseCandidateId: result.descriptor.predecessorReleaseCandidateId,
    authorization: result.manifest.authorization.status,
    ...result.summary,
  }, null, 2)}\n`);
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
