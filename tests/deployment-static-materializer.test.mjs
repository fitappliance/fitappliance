import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MODULE_URL = pathToFileURL(path.resolve('scripts/deployment/reviewed-static-deployment.mjs')).href;

async function loadSubject() {
  return import(MODULE_URL);
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function initFixture(files = { 'index.html': '<h1>fixture</h1>\n' }) {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'fit-static-deploy-'));
  git(repoRoot, ['init', '-q']);
  git(repoRoot, ['config', 'user.email', 'fixture@example.invalid']);
  git(repoRoot, ['config', 'user.name', 'Fixture']);
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(repoRoot, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
  }
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-qm', 'fixture']);
  return repoRoot;
}

function rowFor(repoRoot, relativePath, overrides = {}) {
  const bytes = readFileSync(path.join(repoRoot, relativePath));
  const [mode, blobOid] = git(repoRoot, ['ls-files', '-s', '--', relativePath]).split(/\s+/);
  return {
    path: relativePath,
    mode,
    size: bytes.length,
    sha256: sha256(bytes),
    blobOid,
    rightsReviewRowId: sha256(`review:${relativePath}`),
    dependencyDecisionIds: [sha256(`decision:${relativePath}`)],
    ...overrides,
  };
}

function approvedManifest(repoRoot, paths, overrides = {}) {
  return {
    schemaVersion: 2,
    status: 'APPROVED',
    inventoryId: sha256('fixture-inventory'),
    rightsReviewId: sha256('fixture-review'),
    limits: { maxFiles: 20, maxFileBytes: 1024 * 1024, maxTotalBytes: 2 * 1024 * 1024, maxPathBytes: 240 },
    rows: paths.map((relativePath) => rowFor(repoRoot, relativePath)),
    ...overrides,
  };
}

function assertCode(expectedCode) {
  return (error) => {
    assert.equal(error?.code, expectedCode);
    return true;
  };
}

test('B0 closes the build environment without retaining secrets or UGREEN state', async () => {
  const { createClosedBuildEnvironment, validateClosedBuildEnvironment } = await loadSubject();
  const closed = createClosedBuildEnvironment({
    PATH: '/bin',
    HOME: '/Users/example',
    TZ: 'Australia/Perth',
    SECRET_TOKEN: 'must-not-survive',
    UGREEN_ROOT: '/Volumes/UGREEN-1TB',
    VERCEL: '1',
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_SHA: 'abc123',
    VERCEL_URL: 'candidate.example',
  });

  assert.deepEqual(closed, {
    HOME: '',
    LANG: 'C',
    LC_ALL: 'C',
    TZ: 'UTC',
    VERCEL: '1',
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_SHA: 'abc123',
    VERCEL_URL: 'candidate.example',
    WP0B_CLOSED_ENV: '1',
  });
  assert.doesNotMatch(JSON.stringify(closed), /SECRET_TOKEN|UGREEN|\/Volumes\//);
  assert.equal(validateClosedBuildEnvironment({ env: closed, repoRoot: '/tmp/repository' }), true);
  assert.throws(
    () => validateClosedBuildEnvironment({ env: { ...closed, HOME: '/Users/example' }, repoRoot: '/tmp/repository' }),
    assertCode('BUILD_ENVIRONMENT_DRIFT')
  );
  assert.throws(
    () => validateClosedBuildEnvironment({ env: closed, repoRoot: '/Volumes/UGREEN-1TB/repository' }),
    assertCode('EXTERNAL_VOLUME_DEPENDENCY')
  );
});

test('B0 rejects toolchain version and bound-file drift', async () => {
  const { validateToolchainContract } = await loadSubject();
  const repoRoot = initFixture({ 'package-lock.json': '{}\n', 'vercel.json': '{}\n' });
  const contract = {
    schemaVersion: 1,
    node: '1.2.3',
    vercelNodeMajor: '22.x',
    npm: '4.5.6',
    vercel: '7.8.9',
    environment: {
      TZ: 'UTC',
      LANG: 'C',
      LC_ALL: 'C',
      HOME: '',
      optionalExternalVolumes: [],
      forbiddenDependencies: ['/Volumes/UGREEN-1TB'],
      allowedVercelVariables: [
        'VERCEL',
        'VERCEL_ENV',
        'VERCEL_GIT_COMMIT_SHA',
        'VERCEL_GIT_COMMIT_REF',
        'VERCEL_GIT_REPO_ID',
        'VERCEL_GIT_REPO_OWNER',
        'VERCEL_GIT_REPO_SLUG',
        'VERCEL_TARGET_ENV',
        'VERCEL_URL',
      ],
    },
    dependencyAvailability: {
      localVercelCliVerified: true,
      offlinePackageBytesRetained: false,
      gapCode: 'OFFLINE_DEPENDENCY_BYTES_NOT_RETAINED',
    },
    boundFiles: [
      { path: 'package-lock.json', sha256: sha256(readFileSync(path.join(repoRoot, 'package-lock.json'))) },
      { path: 'vercel.json', sha256: sha256(readFileSync(path.join(repoRoot, 'vercel.json'))) },
    ],
  };

  assert.throws(
    () => validateToolchainContract({ repoRoot, contract, versions: { node: '1.2.4', npm: '4.5.6', vercel: '7.8.9' } }),
    assertCode('TOOLCHAIN_VERSION_DRIFT')
  );
  writeFileSync(path.join(repoRoot, 'vercel.json'), '{"changed":true}\n');
  assert.throws(
    () => validateToolchainContract({ repoRoot, contract, versions: { node: '1.2.3', npm: '4.5.6', vercel: '7.8.9' } }),
    assertCode('TOOLCHAIN_FILE_DRIFT')
  );

  const environmentDrift = structuredClone(contract);
  environmentDrift.environment.allowedVercelVariables = ['UNREVIEWED_OUTPUT_INPUT'];
  assert.throws(
    () => validateToolchainContract({ repoRoot, contract: environmentDrift, versions: { node: '1.2.3', npm: '4.5.6', vercel: '7.8.9' } }),
    assertCode('TOOLCHAIN_CONTRACT_INVALID')
  );
});

test('B0 repository contract pins local tools and every output-affecting deployment file', async () => {
  const { selectManagedVercelNodeMode, validateToolchainContract } = await loadSubject();
  const repoRoot = process.cwd();
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const contract = JSON.parse(readFileSync(path.join(repoRoot, 'deployment/toolchain-contract.json'), 'utf8'));
  const vercelConfig = JSON.parse(readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));
  const vercelPackage = JSON.parse(readFileSync(path.join(repoRoot, 'node_modules/vercel/package.json'), 'utf8'));
  const boundPaths = contract.boundFiles.map((row) => row.path);

  assert.equal(contract.schemaVersion, 2);
  assert.equal(packageJson.engines.node, contract.vercelNodeMajor);
  assert.equal(process.versions.node, contract.node);
  assert.equal(packageJson.packageManager, `npm@${contract.npm}`);
  assert.equal(packageJson.devDependencies.vercel, contract.vercel);
  assert.deepEqual(boundPaths, [
    'package-lock.json',
    'package.json',
    'vercel.json',
    'scripts/deployment/reviewed-static-deployment.mjs',
    'src/domain/static-publication-rights.mjs',
    'scripts/deployment/build-static-rights-review.mjs',
    'scripts/deployment/verify-static-rights-gate.mjs',
    'scripts/deployment/prepare-static-rights-signing-candidate.mjs',
    'scripts/deployment/prepare-owner-attestation-request.mjs',
    'deployment/static-owner-trust-anchor.json',
    'src/domain/owner-attestation-request-contract.mjs',
    'src/domain/offline-owner-signer-contract.mjs',
    'scripts/deployment/offline-owner-secure-io.mjs',
    'scripts/deployment/sign-owner-attestation.mjs',
    'scripts/deployment/accept-owner-attestation.mjs',
    'scripts/deployment/offline-signer-bootstrap.sh',
    'scripts/deployment/run-offline-owner-signer.sh',
    'deployment/offline-owner-signer-contract.json',
    'src/domain/reviewer-artifact-request-contract.mjs',
    'src/domain/offline-reviewer-signer-contract.mjs',
    'src/domain/offline-signer-bootstrap-contract.mjs',
    'scripts/deployment/prepare-reviewer-artifact-request.mjs',
    'scripts/deployment/sign-static-rights-reviewer-artifact.mjs',
    'scripts/deployment/finalize-static-rights-generation.mjs',
    'scripts/deployment/run-offline-reviewer-signer.sh',
    'deployment/offline-reviewer-signer-contract.json',
  ]);
  assert.equal(contract.executableBindingSetVersion, 2);
  assert.equal(contract.dependencyAvailability.offlinePackageBytesRetained, false);
  assert.equal(contract.dependencyAvailability.gapCode, 'OFFLINE_DEPENDENCY_BYTES_NOT_RETAINED');
  assert.equal(contract.environment.forbiddenDependencies.includes('/Volumes/UGREEN-1TB'), true);
  assert.equal(packageJson.scripts['build:deploy'], 'node scripts/deployment/reviewed-static-deployment.mjs');
  assert.equal(packageJson.scripts['build:b1-replayed-provenance'], 'node scripts/deployment/build-replayed-static-provenance.mjs');
  assert.equal(packageJson.scripts['review:b1-rights'], 'node scripts/deployment/build-static-rights-review.mjs');
  assert.equal(packageJson.scripts['verify:b1-rights-gate'], 'node scripts/deployment/verify-static-rights-gate.mjs');
  assert.doesNotMatch(packageJson.scripts['build:deploy'], /acquire|catalog|publish|pointer|generate|curl|wget|fetch/i);
  assert.equal(vercelConfig.buildCommand, 'npm run build:deploy -- --managed-vercel-node');
  assert.equal(selectManagedVercelNodeMode({ argv: ['node', 'build'], env: { VERCEL: '1' } }), false);
  assert.equal(selectManagedVercelNodeMode({
    argv: ['node', 'build', '--managed-vercel-node'],
    env: { VERCEL: '1' },
  }), true);
  assert.throws(
    () => selectManagedVercelNodeMode({ argv: ['node', 'build', '--managed-vercel-node'], env: {} }),
    assertCode('MANAGED_VERCEL_MODE_INVALID'),
  );
  assert.equal(validateToolchainContract({
    repoRoot,
    contract,
    versions: { node: process.versions.node, npm: contract.npm, vercel: vercelPackage.version },
  }), true);
  const alternateManagedPatch = process.versions.node === '22.22.2' ? '22.23.1' : '22.22.2';
  assert.equal(validateToolchainContract({
    repoRoot,
    contract,
    versions: { node: alternateManagedPatch, npm: contract.npm, vercel: vercelPackage.version },
    managedVercelNode: true,
  }), true);
  assert.throws(
    () => validateToolchainContract({
      repoRoot,
      contract,
      versions: { node: alternateManagedPatch, npm: contract.npm, vercel: vercelPackage.version },
    }),
    assertCode('TOOLCHAIN_VERSION_DRIFT'),
  );
  assert.throws(
    () => validateToolchainContract({
      repoRoot,
      contract,
      versions: { node: '20.19.0', npm: contract.npm, vercel: vercelPackage.version },
      managedVercelNode: true,
    }),
    assertCode('TOOLCHAIN_VERSION_DRIFT'),
  );
  for (const [name, value] of [['npm', '0.0.0'], ['vercel', '0.0.0']]) {
    assert.throws(
      () => validateToolchainContract({
        repoRoot,
        contract,
        versions: {
          node: alternateManagedPatch,
          npm: contract.npm,
          vercel: vercelPackage.version,
          [name]: value,
        },
        managedVercelNode: true,
      }),
      assertCode('TOOLCHAIN_VERSION_DRIFT'),
    );
  }
  assert.throws(
    () => validateToolchainContract({
      repoRoot,
      contract,
      versions: { node: alternateManagedPatch, npm: contract.npm, vercel: vercelPackage.version },
      managedVercelNode: true,
      historicalReadOnly: true,
    }),
    assertCode('MANAGED_VERCEL_MODE_INVALID'),
  );
  const managedBindingDrift = structuredClone(contract);
  managedBindingDrift.boundFiles[0].sha256 = '0'.repeat(64);
  assert.throws(
    () => validateToolchainContract({
      repoRoot,
      contract: managedBindingDrift,
      versions: { node: alternateManagedPatch, npm: contract.npm, vercel: vercelPackage.version },
      managedVercelNode: true,
    }),
    assertCode('TOOLCHAIN_FILE_DRIFT'),
  );

  for (const invalidRows of [
    contract.boundFiles.slice(1),
    [...contract.boundFiles, contract.boundFiles[0]],
    [...contract.boundFiles, { path: 'deployment/static-rights-review.json', sha256: '0'.repeat(64) }],
  ]) {
    assert.throws(
      () => validateToolchainContract({
        repoRoot,
        contract: { ...contract, boundFiles: invalidRows },
        versions: { node: process.versions.node, npm: contract.npm, vercel: vercelPackage.version },
      }),
      assertCode('TOOLCHAIN_EXECUTABLE_BINDINGS_INVALID')
    );
  }

  const historical = { ...contract, executableBindingSetVersion: 1, boundFiles: contract.boundFiles.slice(0, 10) };
  assert.throws(() => validateToolchainContract({
    repoRoot, contract: historical,
    versions: { node: process.versions.node, npm: contract.npm, vercel: vercelPackage.version },
  }), assertCode('TOOLCHAIN_EXECUTABLE_BINDINGS_HISTORICAL_ONLY'));
  assert.equal(validateToolchainContract({
    repoRoot, contract: historical,
    versions: { node: process.versions.node, npm: contract.npm, vercel: vercelPackage.version },
    historicalReadOnly: true,
  }), true);
});

test('B1 rejects undeclared roots, dotfiles, traversal, and forbidden families', async () => {
  const { validateManifestShape } = await loadSubject();
  const base = {
    schemaVersion: 2,
    status: 'APPROVED',
    inventoryId: sha256('fixture-inventory'),
    rightsReviewId: sha256('fixture-review'),
    limits: { maxFiles: 20, maxFileBytes: 100, maxTotalBytes: 100, maxPathBytes: 240 },
  };
  for (const candidate of [
    'README.md',
    'public/.secret',
    'public/../index.html',
    'public/service-worker.js',
    'public/data/pdf-evidence/manual.pdf',
    'pages/reviews/private.html',
    'api/error.js',
    'data/architecture-v2/control.json',
  ]) {
    const row = {
      path: candidate,
      mode: '100644',
      size: 1,
      sha256: '0'.repeat(64),
      blobOid: '1'.repeat(40),
      rightsReviewRowId: '2'.repeat(64),
      dependencyDecisionIds: ['3'.repeat(64)],
    };
    assert.throws(() => validateManifestShape({ ...base, rows: [row] }), assertCode('MANIFEST_PATH_FORBIDDEN'), candidate);
  }
});

test('B1 permits the reviewed public scripts family while root source scripts remain forbidden', async () => {
  const { validateManifestShape } = await loadSubject();
  const repoRoot = initFixture({ 'public/scripts/app.js': 'app\n' });
  const manifest = approvedManifest(repoRoot, ['public/scripts/app.js']);

  assert.equal(validateManifestShape(manifest)[0].path, 'public/scripts/app.js');
  const rootScript = { ...manifest.rows[0], path: 'scripts/app.js' };
  assert.throws(
    () => validateManifestShape({ ...manifest, rows: [rootScript] }),
    assertCode('MANIFEST_PATH_FORBIDDEN')
  );
});

test('B1 rejects case-fold and Unicode-normalization collisions', async () => {
  const { validateManifestShape } = await loadSubject();
  const makeRow = (relativePath) => ({
    path: relativePath,
    mode: '100644',
    size: 1,
    sha256: '0'.repeat(64),
    blobOid: '1'.repeat(40),
    rightsReviewRowId: '2'.repeat(64),
    dependencyDecisionIds: ['3'.repeat(64)],
  });
  const base = {
    schemaVersion: 2,
    status: 'APPROVED',
    inventoryId: sha256('fixture-inventory'),
    rightsReviewId: sha256('fixture-review'),
    limits: { maxFiles: 20, maxFileBytes: 100, maxTotalBytes: 100, maxPathBytes: 240 },
  };

  assert.throws(
    () => validateManifestShape({ ...base, rows: [makeRow('public/A.txt'), makeRow('public/a.txt')] }),
    assertCode('MANIFEST_PATH_COLLISION')
  );
  assert.throws(
    () => validateManifestShape({ ...base, rows: [makeRow('public/caf\u00e9.txt'), makeRow('public/cafe\u0301.txt')] }),
    assertCode('MANIFEST_PATH_COLLISION')
  );
});

test('B1 rejects schema-1 free-text ALLOWED rights and a typed blocked production manifest', async () => {
  const { validateManifestShape } = await loadSubject();
  const repoRoot = initFixture();
  const legacy = approvedManifest(repoRoot, ['index.html']);
  legacy.schemaVersion = 1;
  legacy.rows[0].publicRights = { disposition: 'ALLOWED', basis: 'arbitrary free text' };

  assert.throws(() => validateManifestShape(legacy), assertCode('MANIFEST_SCHEMA_INVALID'));
  assert.throws(
    () => validateManifestShape({ schemaVersion: 2, status: 'BLOCKED', inventoryId: '1'.repeat(64), rightsReviewId: '2'.repeat(64), blockers: [{ code: 'PUBLIC_RIGHTS_REVIEW_REQUIRED', scope: 'ALL' }], rows: [] }),
    assertCode('SOURCE_MANIFEST_BLOCKED')
  );
});

test('B1 rejects changed, missing, untracked, and undeclared eligible files', async () => {
  const { validateReviewedSourceManifest } = await loadSubject();
  const repoRoot = initFixture({
    'index.html': 'home\n',
    'public/app.js': 'app\n',
    'public/service-worker.js': 'legacy worker\n',
  });
  const complete = approvedManifest(repoRoot, ['index.html', 'public/app.js']);

  assert.equal(validateReviewedSourceManifest({ repoRoot, manifest: complete }).length, 2);

  writeFileSync(path.join(repoRoot, 'public/app.js'), 'changed\n');
  assert.throws(() => validateReviewedSourceManifest({ repoRoot, manifest: complete }), assertCode('SOURCE_CHANGED'));
  writeFileSync(path.join(repoRoot, 'public/app.js'), 'app\n');
  rmSync(path.join(repoRoot, 'public/app.js'));
  assert.throws(() => validateReviewedSourceManifest({ repoRoot, manifest: complete }), assertCode('SOURCE_MISSING'));
  writeFileSync(path.join(repoRoot, 'public/app.js'), 'app\n');
  writeFileSync(path.join(repoRoot, 'public/untracked.js'), 'extra\n');
  assert.throws(() => validateReviewedSourceManifest({ repoRoot, manifest: complete }), assertCode('ELIGIBLE_SOURCE_SET_DRIFT'));
  rmSync(path.join(repoRoot, 'public/untracked.js'));
  assert.throws(
    () => validateReviewedSourceManifest({ repoRoot, manifest: approvedManifest(repoRoot, ['index.html']) }),
    assertCode('ELIGIBLE_SOURCE_SET_DRIFT')
  );
});

test('B1 rejects symlinks, special files, mode drift, and resource overflows', async () => {
  const { validateReviewedSourceManifest } = await loadSubject();
  const repoRoot = initFixture({ 'index.html': 'home\n', 'public/app.js': 'app\n' });
  const manifest = approvedManifest(repoRoot, ['index.html', 'public/app.js']);

  rmSync(path.join(repoRoot, 'public/app.js'));
  symlinkSync('../index.html', path.join(repoRoot, 'public/app.js'));
  assert.throws(() => validateReviewedSourceManifest({ repoRoot, manifest }), assertCode('SOURCE_NOT_REGULAR'));

  rmSync(path.join(repoRoot, 'public'), { recursive: true });
  const linkedDirectory = mkdtempSync(path.join(os.tmpdir(), 'fit-static-linked-'));
  writeFileSync(path.join(linkedDirectory, 'app.js'), 'app\n');
  symlinkSync(linkedDirectory, path.join(repoRoot, 'public'));
  assert.throws(() => validateReviewedSourceManifest({ repoRoot, manifest }), assertCode('SOURCE_NOT_REGULAR'));

  rmSync(path.join(repoRoot, 'public'));
  mkdirSync(path.join(repoRoot, 'public'));
  execFileSync('mkfifo', [path.join(repoRoot, 'public/app.js')]);
  assert.throws(() => validateReviewedSourceManifest({ repoRoot, manifest }), assertCode('SOURCE_NOT_REGULAR'));

  rmSync(path.join(repoRoot, 'public/app.js'));
  writeFileSync(path.join(repoRoot, 'public/app.js'), 'app\n');
  chmodSync(path.join(repoRoot, 'public/app.js'), 0o755);
  assert.throws(() => validateReviewedSourceManifest({ repoRoot, manifest }), assertCode('SOURCE_MODE_DRIFT'));

  chmodSync(path.join(repoRoot, 'public/app.js'), 0o644);
  const limited = approvedManifest(repoRoot, ['index.html', 'public/app.js'], {
    limits: { maxFiles: 1, maxFileBytes: 3, maxTotalBytes: 3, maxPathBytes: 10 },
  });
  assert.throws(() => validateReviewedSourceManifest({ repoRoot, manifest: limited }), assertCode('RESOURCE_LIMIT_EXCEEDED'));
});

test('B1 rejects an existing target and leaves it untouched', async () => {
  const { materializeReviewedStatic } = await loadSubject();
  const repoRoot = initFixture();
  const targetDir = path.join(repoRoot, 'dist');
  mkdirSync(targetDir);
  writeFileSync(path.join(targetDir, 'owner.txt'), 'not ours\n');

  await assert.rejects(
    materializeReviewedStatic({
      repoRoot,
      manifest: approvedManifest(repoRoot, ['index.html']),
      targetDir,
      outputManifestPath: path.join(repoRoot, '.deployment-private/output.json'),
      validateRoutes: false,
    }),
    assertCode('TARGET_EXISTS')
  );
  assert.equal(readFileSync(path.join(targetDir, 'owner.txt'), 'utf8'), 'not ours\n');
});

test('B1 copies only approved rows and emits byte-identical canonical private manifests', async () => {
  const { materializeReviewedStatic } = await loadSubject();
  const repoRoot = initFixture({ 'index.html': 'home\n', 'public/app.js': 'app\n' });
  const manifest = approvedManifest(repoRoot, ['index.html', 'public/app.js']);
  const targetDir = path.join(repoRoot, 'dist');
  const outputManifestPath = path.join(repoRoot, '.deployment-private/output.json');

  await materializeReviewedStatic({ repoRoot, manifest, targetDir, outputManifestPath, validateRoutes: false });
  const first = readFileSync(outputManifestPath);
  assert.equal(readFileSync(path.join(targetDir, 'public/app.js'), 'utf8'), 'app\n');
  assert.equal(lstatSync(path.join(targetDir, 'index.html')).isFile(), true);
  assert.equal(lstatSync(path.join(targetDir, 'api'), { throwIfNoEntry: false }), undefined);

  const { cleanGeneratedStatic } = await loadSubject();
  cleanGeneratedStatic({ repoRoot, targetDir, outputManifestPath });
  await materializeReviewedStatic({ repoRoot, manifest, targetDir, outputManifestPath, validateRoutes: false });
  assert.deepEqual(readFileSync(outputManifestPath), first);
  assert.doesNotMatch(first.toString('utf8'), /generatedAt|HOME|VERCEL|SECRET|UGREEN/);
});

test('B1 refuses to overwrite a pre-existing private output manifest', async () => {
  const { materializeReviewedStatic } = await loadSubject();
  const repoRoot = initFixture();
  const targetDir = path.join(repoRoot, 'dist');
  const outputManifestPath = path.join(repoRoot, '.deployment-private/output.json');
  mkdirSync(path.dirname(outputManifestPath), { recursive: true });
  writeFileSync(outputManifestPath, '{"owner":"external"}\n');

  await assert.rejects(
    materializeReviewedStatic({
      repoRoot,
      manifest: approvedManifest(repoRoot, ['index.html']),
      targetDir,
      outputManifestPath,
      validateRoutes: false,
    }),
    assertCode('OUTPUT_MANIFEST_EXISTS')
  );
  assert.equal(readFileSync(outputManifestPath, 'utf8'), '{"owner":"external"}\n');
  assert.equal(lstatSync(targetDir, { throwIfNoEntry: false }), undefined);
});

test('B1 route validation resolves redirects, rewrites, clean URLs, functions, and sitemap URLs', async () => {
  const { validateRouteTerminations } = await loadSubject();
  const distRoot = mkdtempSync(path.join(os.tmpdir(), 'fit-routes-'));
  for (const relativePath of ['index.html', 'pages/products/widget.html', 'pages/location/perth/fridge.html', 'public/sitemap.xml']) {
    mkdirSync(path.dirname(path.join(distRoot, relativePath)), { recursive: true });
  }
  writeFileSync(path.join(distRoot, 'index.html'), 'home\n');
  writeFileSync(path.join(distRoot, 'pages/products/widget.html'), 'widget\n');
  writeFileSync(path.join(distRoot, 'pages/location/perth/fridge.html'), 'location\n');
  writeFileSync(path.join(distRoot, 'public/sitemap.xml'), '<urlset><url><loc>https://www.fitappliance.com.au/legacy</loc></url></urlset>\n');
  const config = {
    cleanUrls: true,
    redirects: [
      { source: '/legacy', destination: '/products/widget', permanent: true },
      { source: '/location/:city', destination: '/location/:city/fridge', permanent: true },
    ],
    rewrites: [
      { source: '/products/:slug', destination: '/pages/products/:slug' },
      { source: '/location/:city/:category', destination: '/pages/location/:city/:category' },
    ],
  };

  const result = validateRouteTerminations({
    distRoot,
    config,
    sitemapPath: 'public/sitemap.xml',
    expectedFunctionRoutes: ['/api/error', '/api/rum', '/api/subscribe'],
    explicitRoutes: ['/products/widget', '/api/error'],
  });
  assert.equal(result.ok, true);
  assert.equal(result.resolutions.every((row) => row.terminal === 'STATIC_2XX' || row.terminal === 'FUNCTION'), true);
  assert.equal(result.resolutions.some((row) => row.route === '/location/perth' && row.target === 'pages/location/perth/fridge.html'), true);
});

test('B1 route validation permits only explicitly bound B2 generated routes', async () => {
  const { validateRouteTerminations } = await loadSubject();
  const distRoot = mkdtempSync(path.join(os.tmpdir(), 'fit-generated-routes-'));
  const config = {
    cleanUrls: true,
    rewrites: [
      { source: '/service-worker.js', destination: '/public/service-worker.js' },
    ],
  };

  const result = validateRouteTerminations({
    distRoot,
    config,
    explicitRoutes: ['/service-worker.js'],
    expectedGeneratedRoutes: [
      { route: '/service-worker.js', target: 'public/service-worker.js' },
    ],
  });
  assert.deepEqual(result.resolutions, [{
    route: '/service-worker.js',
    terminal: 'DEFERRED_B2_ARTIFACT',
    target: 'public/service-worker.js',
  }]);

  assert.throws(() => validateRouteTerminations({
    distRoot,
    config,
    explicitRoutes: ['/service-worker.js'],
    expectedGeneratedRoutes: [
      { route: '/service-worker.js', target: 'public/other-worker.js' },
    ],
  }), assertCode('GENERATED_ROUTE_INVALID'));

  assert.throws(() => validateRouteTerminations({
    distRoot,
    config: {
      cleanUrls: true,
      rewrites: [{ source: '/arbitrary', destination: '/public/not-generated.js' }],
    },
    explicitRoutes: ['/arbitrary'],
    expectedGeneratedRoutes: [
      { route: '/arbitrary', target: 'public/not-generated.js' },
    ],
  }), assertCode('GENERATED_ROUTE_INVALID'));
});

test('B1 route validation rejects redirect cycles, depth overflow, and accidental 404s', async () => {
  const { validateRouteTerminations } = await loadSubject();
  const distRoot = mkdtempSync(path.join(os.tmpdir(), 'fit-routes-invalid-'));
  writeFileSync(path.join(distRoot, 'index.html'), 'home\n');

  assert.throws(
    () => validateRouteTerminations({
      distRoot,
      config: { redirects: [{ source: '/a', destination: '/b' }, { source: '/b', destination: '/a' }] },
      explicitRoutes: ['/a'],
      maxDepth: 8,
    }),
    assertCode('ROUTE_CYCLE')
  );
  assert.throws(
    () => validateRouteTerminations({
      distRoot,
      config: { redirects: [{ source: '/a', destination: '/b' }, { source: '/b', destination: '/c' }] },
      explicitRoutes: ['/a'],
      maxDepth: 1,
    }),
    assertCode('ROUTE_DEPTH_EXCEEDED')
  );
  assert.throws(
    () => validateRouteTerminations({ distRoot, config: {}, explicitRoutes: ['/missing'] }),
    assertCode('ROUTE_NOT_FOUND')
  );
});
