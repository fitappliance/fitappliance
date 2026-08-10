import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, chmod, lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { loadActiveRetailRelease } from '../../src/domain/active-retail-release.mjs';
import {
  inspectProductionGitTree,
  productionRecoveryAnchorSemanticSha256,
  reconstructProductionGitTree,
  validateProductionDeploymentCapture,
  validateProductionRecoveryAnchor,
  verifyReconstructedProductionTree,
} from '../../src/domain/fit-v4-production-recovery-anchor.mjs';
import {
  buildProductionRecoveryAnchor,
} from '../../scripts/architecture-v2/build-fit-v4-production-recovery-anchor.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CAPTURE_PATH = join(ROOT, 'data/architecture-v2/observations/vercel-production-deployment-capture.json');
const ANCHOR_PATH = join(ROOT, 'data/architecture-v2/reviews/automated/fit-v4-production-recovery-anchor.json');
const COMMIT = '35a4ea0a180f0f9f2d4c35b281cf618d8c93023a';
const TREE = '901ca311f85a00600457185bb51d121b6b4398f3';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function legalCapture() {
  return {
    schemaVersion: 1,
    policyVersion: 'fit-v4-production-deployment-capture-v1',
    capturedAt: '2026-08-09T08:10:01.000Z',
    project: {
      projectId: 'prj_BnXUk2ZckCJMmbBwPRAd4AcszAd9',
      teamId: 'team_kMmQZPK2xArpjMZUlw96wI9E',
    },
    deployment: {
      deploymentId: 'dpl_BY3B3AatSC56LXVeMKnX2cr5F22M',
      deploymentUrl: 'https://fitappliance-bmwpa6ziw-fitappliances-projects.vercel.app',
      target: 'production',
      readyState: 'READY',
      createdAt: 1785339020883,
      aliases: [
        'fitappliance-fitappliances-projects.vercel.app',
        'fitappliance-git-main-fitappliances-projects.vercel.app',
        'fitappliance.com.au',
        'fitappliance.vercel.app',
        'www.fitappliance.com.au',
      ],
    },
    source: {
      provider: 'github',
      ref: 'main',
      commit: COMMIT,
      tree: TREE,
      inventory: { blobCount: 7941, totalBytes: 383780028 },
      ancestorOfCaptureHead: true,
    },
    runtime: {
      nodeVersion: '24.x',
      regions: ['syd1'],
      functions: [
        {
          path: 'api/error',
          digest: '4'.repeat(64),
          mode: 49590,
          size: 6790,
          runtime: 'nodejs24.x',
          regions: ['syd1'],
        },
      ],
    },
    configuration: {
      vercelJsonBytesSha256: '1'.repeat(64),
      vercelJsonSemanticSha256: '2'.repeat(64),
      redirects: { count: 1, semanticSha256: '3'.repeat(64) },
      rewrites: { count: 1, semanticSha256: '4'.repeat(64) },
      headers: { count: 1, semanticSha256: '5'.repeat(64) },
      cleanUrls: true,
      trailingSlash: false,
      regions: ['syd1'],
      buildCommand: 'npm run build',
      outputDirectory: null,
    },
    remoteFileTree: { available: false, statusCode: 404, message: 'File tree not found' },
    isolatedBuild: {
      status: 'SUCCEEDED_OVERBROAD',
      fileCount: 7953,
      approximateBytes: 399507456,
      outputDirectory: '.',
      confirmedExposurePaths: ['/README.md'],
    },
    liveFingerprints: [{
      path: '/',
      status: 200,
      contentType: 'text/html; charset=utf-8',
      bytes: 162178,
      sha256: '6'.repeat(64),
    }],
    serviceWorker: {
      liveCacheVersion: '35a4ea0',
      trackedCacheVersion: 'e69bbe0',
      trackedSourceIsDeployedByte: false,
      liveBytesSha256: '7'.repeat(64),
    },
  };
}

test('capture validator accepts a hand-authored fixture and rejects unknown or secret-shaped data', () => {
  assert.equal(validateProductionDeploymentCapture(legalCapture()).deployment.target, 'production');

  const unknown = legalCapture();
  unknown.deployment.extra = true;
  assert.throws(() => validateProductionDeploymentCapture(unknown), /unknown field/i);

  const secretKey = legalCapture();
  secretKey.apiToken = 'not-allowed';
  assert.throws(() => validateProductionDeploymentCapture(secretKey), /secret-shaped|unknown field/i);

  const secretValue = legalCapture();
  secretValue.remoteFileTree.message = 'Bearer abcdefghijklmnopqrstuvwxyz';
  assert.throws(() => validateProductionDeploymentCapture(secretValue), /secret-shaped/i);
});

test('capture validator rejects unsafe identity, route/header gaps and contradictory observations', () => {
  const unsafeAlias = legalCapture();
  unsafeAlias.deployment.aliases[0] = 'https://evil.example/path';
  assert.throws(() => validateProductionDeploymentCapture(unsafeAlias), /alias/i);

  const foreignAlias = legalCapture();
  foreignAlias.deployment.aliases[0] = 'evil.example';
  assert.throws(() => validateProductionDeploymentCapture(foreignAlias), /alias/i);

  const badUrl = legalCapture();
  badUrl.deployment.deploymentUrl = 'http://fitappliance.vercel.app';
  assert.throws(() => validateProductionDeploymentCapture(badUrl), /deployment URL/i);

  const missingHeaders = legalCapture();
  delete missingHeaders.configuration.headers;
  assert.throws(() => validateProductionDeploymentCapture(missingHeaders), /unknown field|headers/i);

  const duplicateFunction = legalCapture();
  duplicateFunction.runtime.functions.push({ ...duplicateFunction.runtime.functions[0] });
  assert.throws(() => validateProductionDeploymentCapture(duplicateFunction), /duplicate function/i);

  const contradiction = legalCapture();
  contradiction.remoteFileTree.available = true;
  assert.throws(() => validateProductionDeploymentCapture(contradiction), /contradict/i);

  const badId = legalCapture();
  badId.project.projectId = 'dpl_wrong_kind';
  assert.throws(() => validateProductionDeploymentCapture(badId), /project ID/i);

  const badHash = legalCapture();
  badHash.configuration.headers.semanticSha256 = 'not-a-hash';
  assert.throws(() => validateProductionDeploymentCapture(badHash), /SHA-256/i);

  const badTimestamp = legalCapture();
  badTimestamp.capturedAt = '2026-08-09';
  assert.throws(() => validateProductionDeploymentCapture(badTimestamp), /timestamp/i);
});

test('anchor validator rejects capability overclaims and hashes everything except semanticSha256', async () => {
  const committed = JSON.parse(await readFile(ANCHOR_PATH, 'utf8'));
  const checked = validateProductionRecoveryAnchor(committed);
  assert.equal(checked.status, 'BASELINE_RECOVERY_ANCHOR_ONLY');
  assert.deepEqual(checked.capabilities, [
    'OFFLINE_GIT_SOURCE_RECONSTRUCTION',
    'REMOTE_PROMOTION_CANDIDATE_POINT_IN_TIME',
  ]);
  assert.deepEqual(checked.gaps, [
    'CLIENT_CACHE_STATE_NOT_CAPTURED',
    'EXACT_REMOTE_OUTPUT_BYTES_NOT_CAPTURED',
    'OFFLINE_DEPENDENCY_INSTALL_NOT_PROVEN',
    'OVERBROAD_STATIC_OUTPUT_CONFIRMED',
    'REMOTE_FILE_TREE_UNAVAILABLE',
  ]);

  const overclaim = structuredClone(committed);
  overclaim.capabilities.push('EXACT_REMOTE_OUTPUT_BYTES_CAPTURED');
  assert.throws(() => validateProductionRecoveryAnchor(overclaim), /capabilities|unknown field/i);

  const drift = structuredClone(committed);
  drift.capture.liveFingerprints[0].bytes += 1;
  assert.throws(() => validateProductionRecoveryAnchor(drift), /semantic SHA-256/i);

  const contradictory = structuredClone(committed);
  contradictory.sourceTree.fileCount += 1;
  contradictory.semanticSha256 = productionRecoveryAnchorSemanticSha256(contradictory);
  assert.throws(() => validateProductionRecoveryAnchor(contradictory), /contradicts capture/i);

  const nestedUnknown = structuredClone(committed);
  nestedUnknown.activeRetailRelease.artifacts.publicProjection.remoteUrl = 'https://example.com';
  nestedUnknown.semanticSha256 = productionRecoveryAnchorSemanticSha256(nestedUnknown);
  assert.throws(() => validateProductionRecoveryAnchor(nestedUnknown), /unknown field/i);
});

test('git tree preflight rejects unsafe modes, paths, collisions and resource limits', async () => {
  const base = `100644 blob ${'a'.repeat(40)} 3\tgood.txt\0`;
  const inspect = (listing, limits = {}) => inspectProductionGitTree({
    commit: COMMIT,
    expectedTree: TREE,
    limits,
    git: async (args) => {
      if (args[0] === 'rev-parse') return `${TREE}\n`;
      if (args[0] === 'ls-tree') return Buffer.from(listing);
      throw new Error(`unexpected git command ${args.join(' ')}`);
    },
  });

  assert.equal((await inspect(base)).fileCount, 1);
  await assert.rejects(() => inspect(`120000 blob ${'a'.repeat(40)} 3\tlink\0`), /mode/i);
  await assert.rejects(() => inspect(`100644 blob ${'a'.repeat(40)} 3\t..\/bad\0`), /unsafe path/i);
  await assert.rejects(
    () => inspect(`${base}100644 blob ${'b'.repeat(40)} 3\tGOOD.TXT\0`),
    /case-fold collision/i,
  );
  await assert.rejects(() => inspect(base, { maxFiles: 0 }), /file count/i);
  await assert.rejects(() => inspect(base, { maxFileBytes: 2 }), /single-file/i);
});

test('offline reconstruction rejects existing targets and leaves no partial target on failure', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'fit-v4-recovery-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const target = join(parent, 'target');
  await writeFile(target, 'occupied');
  await assert.rejects(
    () => reconstructProductionGitTree({ repoRoot: ROOT, commit: COMMIT, expectedTree: TREE, target }),
    /target must not exist/i,
  );
  await rm(target);

  await assert.rejects(
    () => reconstructProductionGitTree({
      repoRoot: ROOT,
      commit: COMMIT,
      expectedTree: TREE,
      target,
      extractArchive: async ({ staging }) => {
        await writeFile(join(staging, 'partial'), 'partial');
        throw new Error('injected extraction failure');
      },
    }),
    /injected extraction failure/i,
  );
  await assert.rejects(() => access(target));
});

test('committed production anchor rebuilds deterministically and reconstructs a read-only active release', async (t) => {
  const implementationSources = await Promise.all([
    readFile(join(ROOT, 'src/domain/fit-v4-production-recovery-anchor.mjs'), 'utf8'),
    readFile(join(ROOT, 'scripts/architecture-v2/build-fit-v4-production-recovery-anchor.mjs'), 'utf8'),
  ]);
  const implementationText = implementationSources.join('\n');
  assert.doesNotMatch(implementationText, /from ['"]node:(?:dns|http|https|net|tls)['"]/);
  assert.doesNotMatch(implementationText, /\bfetch\s*\(/);
  assert.doesNotMatch(implementationText, /FITAPPLIANCE_STORAGE_ROOT|UGREEN-1TB/);

  const capture = JSON.parse(await readFile(CAPTURE_PATH, 'utf8'));
  const committed = JSON.parse(await readFile(ANCHOR_PATH, 'utf8'));
  assert.deepEqual(await buildProductionRecoveryAnchor({ root: ROOT, capture }), committed);

  const parent = await mkdtemp(join(tmpdir(), 'fit-v4-production-tree-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  await chmod(parent, 0o700);
  const target = join(parent, 'restored');
  const previousStorageRoot = process.env.FITAPPLIANCE_STORAGE_ROOT;
  const previousHome = process.env.HOME;
  process.env.FITAPPLIANCE_STORAGE_ROOT = '/Volumes/UGREEN-1TB/forbidden-wp0b-a';
  process.env.HOME = join(parent, 'unavailable-home');
  t.after(() => {
    if (previousStorageRoot === undefined) delete process.env.FITAPPLIANCE_STORAGE_ROOT;
    else process.env.FITAPPLIANCE_STORAGE_ROOT = previousStorageRoot;
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  });
  const before = await reconstructProductionGitTree({
    repoRoot: ROOT,
    commit: COMMIT,
    expectedTree: TREE,
    target,
  });
  const beforeDescriptor = await readFile(
    join(target, 'data/architecture-v2/decisions/active-retail-release.json'),
  );
  const release = await loadActiveRetailRelease({ root: target });
  const productionInventory = await inspectProductionGitTree({
    repoRoot: ROOT,
    commit: COMMIT,
    expectedTree: TREE,
  });
  const after = await verifyReconstructedProductionTree({ target, inventory: productionInventory });
  const afterDescriptor = await readFile(
    join(target, 'data/architecture-v2/decisions/active-retail-release.json'),
  );

  assert.equal(release.descriptor.releaseCandidateId, committed.activeRetailRelease.releaseCandidateId);
  assert.equal(before.tree, after.tree);
  assert.equal(before.inventorySha256, after.inventorySha256);
  assert.equal(sha256(beforeDescriptor), sha256(afterDescriptor));
  assert.doesNotMatch(target, /UGREEN-1TB/);
  const targetStat = await lstat(target);
  assert.equal(targetStat.isDirectory(), true);
});
