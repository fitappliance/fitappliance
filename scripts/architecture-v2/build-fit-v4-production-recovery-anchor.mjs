import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { validateActiveRetailReleaseDescriptor } from '../../src/domain/active-retail-release.mjs';
import {
  inspectProductionGitTree,
  productionRecoveryAnchorSemanticSha256,
  PRODUCTION_RECOVERY_CAPABILITIES,
  PRODUCTION_RECOVERY_GAPS,
  validateProductionDeploymentCapture,
  validateProductionRecoveryAnchor,
} from '../../src/domain/fit-v4-production-recovery-anchor.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';

const execFileAsync = promisify(execFile);
const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultCapturePath = 'data/architecture-v2/observations/vercel-production-deployment-capture.json';
const defaultOutputPath = 'data/architecture-v2/reviews/automated/fit-v4-production-recovery-anchor.json';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function gitBytes(root, args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: root,
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      LANG: 'C',
      LC_ALL: 'C',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_OPTIONAL_LOCKS: '0',
    },
  });
  return Buffer.from(stdout);
}

async function gitJson(root, commit, path) {
  const bytes = await gitBytes(root, ['show', `${commit}:${path}`]);
  return { bytes, document: JSON.parse(bytes) };
}

function sectionBinding(value) {
  const section = value ?? [];
  return { count: section.length, semanticSha256: canonicalJsonSha256(section) };
}

function artifactBinding(path, bytes) {
  return {
    path,
    bytesSha256: sha256(bytes),
    semanticSha256: canonicalJsonSha256(JSON.parse(bytes)),
  };
}

export async function buildProductionRecoveryAnchor({ root = defaultRoot, capture } = {}) {
  const checkedCapture = validateProductionDeploymentCapture(capture);
  const { commit, tree } = checkedCapture.source;
  const inventory = await inspectProductionGitTree({ repoRoot: root, commit, expectedTree: tree });
  if (inventory.fileCount !== checkedCapture.source.inventory.blobCount
    || inventory.totalBytes !== checkedCapture.source.inventory.totalBytes) {
    throw new Error('captured source inventory does not match local Git objects');
  }
  await gitBytes(root, ['merge-base', '--is-ancestor', commit, 'HEAD']);

  const vercel = await gitJson(root, commit, 'vercel.json');
  const configuration = checkedCapture.configuration;
  const actualConfiguration = {
    vercelJsonBytesSha256: sha256(vercel.bytes),
    vercelJsonSemanticSha256: canonicalJsonSha256(vercel.document),
    redirects: sectionBinding(vercel.document.redirects),
    rewrites: sectionBinding(vercel.document.rewrites),
    headers: sectionBinding(vercel.document.headers),
    cleanUrls: vercel.document.cleanUrls,
    trailingSlash: vercel.document.trailingSlash,
    regions: [...(vercel.document.regions ?? [])].sort(),
    buildCommand: vercel.document.buildCommand,
    outputDirectory: vercel.document.outputDirectory ?? null,
  };
  if (canonicalJsonSha256(actualConfiguration) !== canonicalJsonSha256(configuration)) {
    throw new Error('captured Vercel route/header configuration does not match production commit');
  }

  const descriptorPath = 'data/architecture-v2/decisions/active-retail-release.json';
  const descriptorSource = await gitJson(root, commit, descriptorPath);
  const descriptor = validateActiveRetailReleaseDescriptor(descriptorSource.document);
  const artifacts = {};
  for (const [name, artifact] of Object.entries(descriptor.artifacts)) {
    const bytes = await gitBytes(root, ['show', `${commit}:${artifact.path}`]);
    const binding = artifactBinding(artifact.path, bytes);
    if (binding.bytesSha256 !== artifact.sha256) throw new Error(`active release ${name} hash mismatch`);
    artifacts[name] = binding;
  }

  const workerPath = 'public/service-worker.js';
  const workerBytes = await gitBytes(root, ['show', `${commit}:${workerPath}`]);
  const workerText = workerBytes.toString('utf8');
  const trackedCacheVersion = workerText.match(/const CACHE_VERSION = '([^']+)'/)?.[1];
  if (trackedCacheVersion !== checkedCapture.serviceWorker.trackedCacheVersion) {
    throw new Error('captured tracked service-worker cache version mismatch');
  }

  const semantic = {
    schemaVersion: 1,
    policyVersion: 'fit-v4-production-recovery-anchor-v1',
    status: 'BASELINE_RECOVERY_ANCHOR_ONLY',
    capturedAt: checkedCapture.capturedAt,
    capture: checkedCapture,
    sourceTree: {
      commit,
      tree,
      fileCount: inventory.fileCount,
      totalBytes: inventory.totalBytes,
      inventorySha256: inventory.inventorySha256,
      ancestorOfCurrentHead: true,
    },
    vercelConfiguration: {
      bytesSha256: actualConfiguration.vercelJsonBytesSha256,
      semanticSha256: actualConfiguration.vercelJsonSemanticSha256,
      document: vercel.document,
    },
    activeRetailRelease: {
      releaseCandidateId: descriptor.releaseCandidateId,
      descriptorPath,
      descriptorBytesSha256: sha256(descriptorSource.bytes),
      artifacts,
    },
    trackedServiceWorker: {
      path: workerPath,
      bytesSha256: sha256(workerBytes),
      cacheVersion: trackedCacheVersion,
      matchesLiveBytes: sha256(workerBytes) === checkedCapture.serviceWorker.liveBytesSha256,
    },
    capabilities: [...PRODUCTION_RECOVERY_CAPABILITIES],
    gaps: [...PRODUCTION_RECOVERY_GAPS],
  };
  const anchor = { ...semantic, semanticSha256: productionRecoveryAnchorSemanticSha256(semantic) };
  return validateProductionRecoveryAnchor(anchor);
}

async function main() {
  const capturePath = resolve(defaultRoot, process.argv[2] ?? defaultCapturePath);
  const outputPath = resolve(defaultRoot, process.argv[3] ?? defaultOutputPath);
  const capture = JSON.parse(await readFile(capturePath, 'utf8'));
  const anchor = await buildProductionRecoveryAnchor({ root: defaultRoot, capture });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(anchor, null, 2)}\n`, 'utf8');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
