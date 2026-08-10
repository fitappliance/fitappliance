import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateSchema2Manifest } from '../../src/domain/static-publication-rights.mjs';

const ROOT_STATIC_FILES = new Set([
  'index.html',
  'google32758d7798f4a670.html',
  'google5keGnUyvuq31_mxZ9pNVPIsh7BzKBbM7aHdxUTZZDJM.html',
]);
const ALLOWED_ENV = [
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_GIT_COMMIT_SHA',
  'VERCEL_GIT_COMMIT_REF',
  'VERCEL_GIT_REPO_ID',
  'VERCEL_GIT_REPO_OWNER',
  'VERCEL_GIT_REPO_SLUG',
  'VERCEL_TARGET_ENV',
  'VERCEL_URL',
];
const FORBIDDEN_SEGMENTS = new Set([
  'api',
  'architecture-v2',
  'docs',
  'pdf-evidence',
  'pdf-evidence-raw',
  'private',
  'reports',
  'review',
  'reviews',
  'src',
  'tests',
]);
const EXPECTED_FUNCTION_ROUTES = ['/api/error', '/api/rum', '/api/subscribe'];
const DEFERRED_B2_ROUTE = { route: '/service-worker.js', target: 'public/service-worker.js' };
const DEFAULT_MANIFEST = 'deployment/reviewed-static-source-manifest.json';
const DEFAULT_CONTRACT = 'deployment/toolchain-contract.json';
const DEFAULT_OUTPUT_MANIFEST = '.deployment-private/deployment-output-manifest.json';
const LEGACY_SERVICE_WORKER_WITNESS = 'public/service-worker.js';
const REQUIRED_EXECUTABLE_BINDINGS = [
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
];

export class DeploymentContractError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'DeploymentContractError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new DeploymentContractError(code, message, details);
}

function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function byteSort(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readJson(absolutePath, code = 'INVALID_JSON') {
  try {
    return JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    fail(code, `Cannot read canonical JSON at ${absolutePath}`, { cause: error.message });
  }
}

function git(repoRoot, args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { HOME: '', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    fail('GIT_PROVENANCE_UNAVAILABLE', `Git provenance command failed: git ${args.join(' ')}`, {
      stderr: String(error.stderr ?? '').trim(),
    });
  }
}

function isEligiblePath(relativePath) {
  return relativePath !== LEGACY_SERVICE_WORKER_WITNESS
    && (ROOT_STATIC_FILES.has(relativePath)
      || relativePath.startsWith('public/')
      || relativePath.startsWith('pages/'));
}

function normalizedCollisionKey(relativePath) {
  return relativePath.normalize('NFKC').toLowerCase();
}

function validateRelativePath(relativePath) {
  if (typeof relativePath !== 'string'
    || relativePath.length === 0
    || relativePath.includes('\\')
    || relativePath.includes('\0')
    || path.posix.isAbsolute(relativePath)
    || relativePath.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    fail('MANIFEST_PATH_FORBIDDEN', `Manifest path is not canonical: ${String(relativePath)}`);
  }
  if (relativePath !== relativePath.normalize('NFC')) {
    fail('MANIFEST_PATH_FORBIDDEN', `Manifest path is not NFC-normalized: ${relativePath}`);
  }
  const segments = relativePath.split('/');
  if (segments.some((segment) => segment.startsWith('.')) || !isEligiblePath(relativePath)) {
    fail('MANIFEST_PATH_FORBIDDEN', `Manifest path is outside the eligible static roots: ${relativePath}`);
  }
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  if (lowerSegments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) {
    fail('MANIFEST_PATH_FORBIDDEN', `Manifest path belongs to a forbidden family: ${relativePath}`);
  }
}

export function validateManifestShape(manifest) {
  if (!manifest || manifest.schemaVersion !== 2 || !Array.isArray(manifest.rows)) {
    fail('MANIFEST_SCHEMA_INVALID', 'Reviewed source manifest schema is invalid');
  }
  if (manifest.status !== 'APPROVED') {
    fail('SOURCE_MANIFEST_BLOCKED', 'Reviewed source manifest is not approved', {
      blockers: Array.isArray(manifest.blockers) ? manifest.blockers.map((row) => row?.code).filter(Boolean) : [],
    });
  }
  const seen = new Map();
  for (const row of manifest.rows) {
    const key = typeof row?.path === 'string' ? normalizedCollisionKey(row.path) : '';
    if (seen.has(key)) {
      fail('MANIFEST_PATH_COLLISION', `Manifest paths collide by case or Unicode normalization: ${seen.get(key)} and ${row.path}`);
    }
    validateRelativePath(row?.path);
    seen.set(key, row.path);
  }
  return validateSchema2Manifest(manifest);
}

function workingMode(stat) {
  return (stat.mode & 0o111) === 0 ? '100644' : '100755';
}

function eligibleGitPaths(repoRoot) {
  const output = git(repoRoot, [
    'ls-files',
    '--cached',
    '--others',
    '--',
    ...ROOT_STATIC_FILES,
    'public',
    'pages',
  ]);
  const trackedWitness = git(repoRoot, ['ls-files', '--cached', '--', LEGACY_SERVICE_WORKER_WITNESS]) === LEGACY_SERVICE_WORKER_WITNESS;
  return output
    ? [...new Set(output.split('\n').filter((relativePath) => relativePath && (relativePath !== LEGACY_SERVICE_WORKER_WITNESS || !trackedWitness)))].sort(byteSort)
    : [];
}

function lstatContainedSource(repoRoot, relativePath) {
  const segments = relativePath.split('/');
  let current = repoRoot;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (error.code === 'ENOENT') fail('SOURCE_MISSING', `Approved source is missing: ${relativePath}`);
      throw error;
    }
    const isLeaf = index === segments.length - 1;
    if (stat.isSymbolicLink() || (isLeaf ? !stat.isFile() : !stat.isDirectory())) {
      fail('SOURCE_NOT_REGULAR', `Approved source contains a link or special path component: ${relativePath}`);
    }
    if (isLeaf) return stat;
  }
  fail('SOURCE_NOT_REGULAR', `Approved source is not a regular file: ${relativePath}`);
}

export function validateReviewedSourceManifest({ repoRoot, manifest }) {
  const rows = validateManifestShape(manifest);
  for (const row of rows) {
    const absolutePath = path.join(repoRoot, ...row.path.split('/'));
    const stat = lstatContainedSource(repoRoot, row.path);
    if (workingMode(stat) !== row.mode) fail('SOURCE_MODE_DRIFT', `Approved source mode changed: ${row.path}`);
    const bytes = readFileSync(absolutePath);
    if (bytes.length !== row.size || hashBytes(bytes) !== row.sha256) {
      fail('SOURCE_CHANGED', `Approved source bytes changed: ${row.path}`);
    }
    const indexRow = git(repoRoot, ['ls-files', '-s', '--', row.path]);
    const [indexMode, indexBlob] = indexRow.split(/\s+/);
    if (!indexRow || indexMode !== row.mode || indexBlob !== row.blobOid) {
      fail('GIT_PROVENANCE_DRIFT', `Approved Git provenance changed: ${row.path}`);
    }
    if (git(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all', '--', row.path])) {
      fail('GIT_PROVENANCE_DRIFT', `Approved source has working-tree or index drift: ${row.path}`);
    }
  }

  const declared = rows.map((row) => row.path);
  const eligible = eligibleGitPaths(repoRoot);
  if (declared.length !== eligible.length || declared.some((value, index) => value !== eligible[index])) {
    fail('ELIGIBLE_SOURCE_SET_DRIFT', 'Eligible static source set differs from the reviewed manifest', {
      missingFromManifest: eligible.filter((value) => !declared.includes(value)),
      absentFromSourceSet: declared.filter((value) => !eligible.includes(value)),
    });
  }
  return rows;
}

export function createClosedBuildEnvironment(source = process.env) {
  const closed = { HOME: '', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' };
  for (const name of ALLOWED_ENV) {
    if (typeof source[name] === 'string') closed[name] = source[name];
  }
  closed.WP0B_CLOSED_ENV = '1';
  return closed;
}

export function validateClosedBuildEnvironment({ env = process.env, repoRoot }) {
  const required = { HOME: '', LANG: 'C', LC_ALL: 'C', TZ: 'UTC', WP0B_CLOSED_ENV: '1' };
  for (const [name, value] of Object.entries(required)) {
    if (env[name] !== value) fail('BUILD_ENVIRONMENT_DRIFT', `Closed build environment requires ${name}=${JSON.stringify(value)}`);
  }
  const allowedNames = new Set([...Object.keys(required), ...ALLOWED_ENV]);
  const unexpected = Object.keys(env).filter((name) => !allowedNames.has(name));
  if (unexpected.length > 0) {
    fail('BUILD_ENVIRONMENT_DRIFT', 'Closed build environment contains non-allowlisted variables', { names: unexpected.sort(byteSort) });
  }
  const root = path.resolve(repoRoot);
  const forbiddenRoot = path.resolve('/Volumes/UGREEN-1TB');
  if (root === forbiddenRoot || root.startsWith(`${forbiddenRoot}${path.sep}`)) {
    fail('EXTERNAL_VOLUME_DEPENDENCY', 'Deployment build cannot depend on /Volumes/UGREEN-1TB');
  }
  return true;
}

export function validateToolchainContract({ repoRoot, contract, versions }) {
  if (!contract || ![1, 2].includes(contract.schemaVersion) || !Array.isArray(contract.boundFiles)) {
    fail('TOOLCHAIN_CONTRACT_INVALID', 'Toolchain contract schema is invalid');
  }
  if (contract.schemaVersion === 2 && contract.executableBindingSetVersion !== 1) {
    fail('TOOLCHAIN_EXECUTABLE_BINDINGS_INVALID', 'Toolchain schema 2 requires the executable binding set');
  }
  if (contract.vercelNodeMajor !== '22.x'
    || contract.environment?.TZ !== 'UTC'
    || contract.environment?.LANG !== 'C'
    || contract.environment?.LC_ALL !== 'C'
    || contract.environment?.HOME !== ''
    || !Array.isArray(contract.environment?.optionalExternalVolumes)
    || contract.environment.optionalExternalVolumes.length !== 0
    || JSON.stringify(contract.environment?.forbiddenDependencies) !== JSON.stringify(['/Volumes/UGREEN-1TB'])
    || JSON.stringify(contract.environment?.allowedVercelVariables) !== JSON.stringify(ALLOWED_ENV)
    || contract.dependencyAvailability?.localVercelCliVerified !== true
    || contract.dependencyAvailability?.offlinePackageBytesRetained !== false
    || contract.dependencyAvailability?.gapCode !== 'OFFLINE_DEPENDENCY_BYTES_NOT_RETAINED') {
    fail('TOOLCHAIN_CONTRACT_INVALID', 'Toolchain environment or dependency boundary is invalid');
  }
  for (const name of ['node', 'npm', 'vercel']) {
    if (versions[name] !== contract[name]) {
      fail('TOOLCHAIN_VERSION_DRIFT', `${name} version drift: expected ${contract[name]}, received ${versions[name]}`);
    }
  }
  if (contract.executableBindingSetVersion === 1) {
    const actualPaths = contract.boundFiles.map((row) => row?.path);
    if (actualPaths.length !== REQUIRED_EXECUTABLE_BINDINGS.length
      || actualPaths.some((value, index) => value !== REQUIRED_EXECUTABLE_BINDINGS[index])
      || new Set(actualPaths).size !== actualPaths.length) {
      fail('TOOLCHAIN_EXECUTABLE_BINDINGS_INVALID', 'Toolchain successor must bind the exact executable file set');
    }
  }
  for (const row of contract.boundFiles) {
    if (typeof row?.path !== 'string' || !/^[0-9a-f]{64}$/.test(row.sha256 ?? '')) {
      fail('TOOLCHAIN_CONTRACT_INVALID', 'Bound file row is invalid');
    }
    const absolutePath = path.resolve(repoRoot, row.path);
    if (!absolutePath.startsWith(`${path.resolve(repoRoot)}${path.sep}`)) {
      fail('TOOLCHAIN_CONTRACT_INVALID', `Bound file escapes the repository: ${row.path}`);
    }
    let actual;
    try {
      actual = hashBytes(readFileSync(absolutePath));
    } catch {
      fail('TOOLCHAIN_FILE_DRIFT', `Bound file is unavailable: ${row.path}`);
    }
    if (actual !== row.sha256) fail('TOOLCHAIN_FILE_DRIFT', `Bound file hash drift: ${row.path}`);
  }
  return true;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compileRoutePattern(pattern) {
  const names = [];
  const pieces = String(pattern).split('/').map((part) => {
    if (part.startsWith(':') && part.endsWith('*')) {
      names.push(part.slice(1, -1));
      return '(.*)';
    }
    if (part.startsWith(':')) {
      names.push(part.slice(1));
      return '([^/]+)';
    }
    return escapeRegExp(part);
  });
  return { regex: new RegExp(`^${pieces.join('/')}\/?$`), names };
}

function matchRoute(pattern, route) {
  const compiled = compileRoutePattern(pattern);
  const match = compiled.regex.exec(route);
  if (!match) return null;
  return Object.fromEntries(compiled.names.map((name, index) => [name, match[index + 1]]));
}

function fillRoute(pattern, values) {
  return String(pattern).replace(/:([A-Za-z0-9_]+)(\*)?/g, (_, name) => values[name] ?? '');
}

function staticRouteCandidates(route, cleanUrls) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(route, 'https://local.invalid').pathname);
  } catch {
    fail('ROUTE_INVALID', `Route cannot be parsed: ${route}`);
  }
  const relative = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!relative) return ['index.html'];
  if (relative.split('/').some((part) => part === '.' || part === '..' || part.startsWith('.'))) {
    fail('ROUTE_INVALID', `Route is not canonical: ${route}`);
  }
  const candidates = [relative];
  if (cleanUrls !== false && !path.posix.extname(relative)) candidates.push(`${relative}.html`);
  candidates.push(`${relative}/index.html`);
  return candidates;
}

function existingStaticPath(distRoot, route, cleanUrls) {
  for (const candidate of staticRouteCandidates(route, cleanUrls)) {
    const absolutePath = path.join(distRoot, ...candidate.split('/'));
    if (existsSync(absolutePath) && lstatSync(absolutePath).isFile()) return candidate;
  }
  return null;
}

function listTree(root, prefix = '') {
  const rows = [];
  for (const entry of readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a, b) => byteSort(a.name, b.name))) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
      fail('OUTPUT_NOT_REGULAR', `Output contains a link or special file: ${relativePath}`);
    }
    if (entry.isDirectory()) rows.push(...listTree(root, relativePath));
    else rows.push(relativePath);
  }
  return rows;
}

function routesFromSitemap(distRoot, sitemapPath) {
  if (!sitemapPath) return [];
  const absolutePath = path.join(distRoot, ...sitemapPath.split('/'));
  if (!existsSync(absolutePath)) fail('SITEMAP_MISSING', `Materialized sitemap is missing: ${sitemapPath}`);
  const xml = readFileSync(absolutePath, 'utf8');
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((match) => {
    try {
      return new URL(match[1]).pathname;
    } catch {
      fail('SITEMAP_URL_INVALID', `Sitemap URL is invalid: ${match[1]}`);
    }
  });
}

function deriveDynamicRoutes(distRoot, rules, maxDynamicRoutes) {
  const staticRoutes = listTree(distRoot)
    .filter((relativePath) => relativePath.endsWith('.html'))
    .map((relativePath) => `/${relativePath.slice(0, -5)}`);
  const candidates = new Set(staticRoutes);
  const derived = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const rule of rules) {
      if (!String(rule.source).includes(':')) continue;
      for (const candidate of [...candidates]) {
        const values = matchRoute(rule.destination, candidate);
        if (!values) continue;
        const source = fillRoute(rule.source, values);
        if (candidates.has(source)) continue;
        candidates.add(source);
        derived.add(source);
        changed = true;
        if (derived.size > maxDynamicRoutes) fail('ROUTE_FAMILY_LIMIT_EXCEEDED', 'Dynamic route validation limit exceeded');
      }
    }
  }
  return [...derived];
}

export function validateRouteTerminations({
  distRoot,
  config,
  sitemapPath,
  expectedFunctionRoutes = [],
  expectedGeneratedRoutes = [],
  explicitRoutes = [],
  reviewedTombstones = [],
  maxDepth = 32,
  maxDynamicRoutes = 10000,
}) {
  const redirects = (config.redirects ?? []).filter((rule) => !rule.has && !/^https?:\/\//i.test(rule.destination));
  const rewrites = config.rewrites ?? [];
  const functionRoutes = new Set(expectedFunctionRoutes);
  const generatedRoutes = new Map();
  if (expectedGeneratedRoutes.length > 0
    && (expectedGeneratedRoutes.length !== 1
      || expectedGeneratedRoutes[0]?.route !== DEFERRED_B2_ROUTE.route
      || expectedGeneratedRoutes[0]?.target !== DEFERRED_B2_ROUTE.target
      || Object.keys(expectedGeneratedRoutes[0]).length !== 2)) {
    fail('GENERATED_ROUTE_INVALID', 'Only the exact deferred B2 service-worker route is permitted');
  }
  for (const row of expectedGeneratedRoutes) {
    if (!row || Object.keys(row).length !== 2 || typeof row.route !== 'string'
      || !row.route.startsWith('/') || typeof row.target !== 'string'
      || row.target.startsWith('/') || row.target.split('/').some((part) => !part || part === '.' || part === '..')
      || generatedRoutes.has(row.route)) {
      fail('GENERATED_ROUTE_INVALID', 'Expected generated routes must bind one canonical route to one relative target');
    }
    generatedRoutes.set(row.route, row.target);
  }
  const tombstones = new Set(reviewedTombstones);
  const routes = new Set([...explicitRoutes, ...routesFromSitemap(distRoot, sitemapPath)]);
  for (const rule of [...redirects, ...rewrites]) {
    if (!String(rule.source).includes(':') && !String(rule.source).includes('*')) routes.add(rule.source);
  }
  for (const route of deriveDynamicRoutes(distRoot, [...redirects, ...rewrites], maxDynamicRoutes)) routes.add(route);

  function resolve(start) {
    let current = start;
    const visited = new Set();
    for (let depth = 0; depth <= maxDepth; depth += 1) {
      if (visited.has(current)) fail('ROUTE_CYCLE', `Route cycle detected from ${start}`);
      visited.add(current);
      if (tombstones.has(current)) return { route: start, terminal: 'REVIEWED_TOMBSTONE', target: current };
      if (functionRoutes.has(current)) return { route: start, terminal: 'FUNCTION', target: current };

      const redirect = redirects.find((rule) => matchRoute(rule.source, current));
      if (redirect) {
        current = fillRoute(redirect.destination, matchRoute(redirect.source, current));
        continue;
      }
      const staticPath = existingStaticPath(distRoot, current, config.cleanUrls);
      if (staticPath) return { route: start, terminal: 'STATIC_2XX', target: staticPath };
      const rewrite = rewrites.find((rule) => matchRoute(rule.source, current));
      if (rewrite) {
        const next = fillRoute(rewrite.destination, matchRoute(rewrite.source, current));
        const generatedTarget = generatedRoutes.get(start);
        if (generatedTarget && next === `/${generatedTarget}`) {
          return { route: start, terminal: 'DEFERRED_B2_ARTIFACT', target: generatedTarget };
        }
        if (next === current) {
          const sameStaticPath = existingStaticPath(distRoot, next, config.cleanUrls);
          if (sameStaticPath) return { route: start, terminal: 'STATIC_2XX', target: sameStaticPath };
        }
        current = next;
        continue;
      }
      fail('ROUTE_NOT_FOUND', `Route terminates at an accidental 404: ${start}`, { target: current });
    }
    fail('ROUTE_DEPTH_EXCEEDED', `Route exceeds maximum resolution depth: ${start}`);
  }

  const resolutions = [...routes].sort(byteSort).map(resolve);
  return { ok: true, resolutions };
}

function verifyOutputTree(stageDir, rows) {
  const actualPaths = listTree(stageDir);
  const expectedPaths = rows.map((row) => row.path).sort(byteSort);
  if (actualPaths.length !== expectedPaths.length || actualPaths.some((value, index) => value !== expectedPaths[index])) {
    fail('OUTPUT_SET_DRIFT', 'Staged output differs from the exact approved source set');
  }
  return expectedPaths.map((relativePath) => {
    const sourceRow = rows.find((row) => row.path === relativePath);
    const absolutePath = path.join(stageDir, ...relativePath.split('/'));
    const stat = lstatSync(absolutePath);
    const bytes = readFileSync(absolutePath);
    const outputRow = { path: relativePath, mode: workingMode(stat), size: bytes.length, sha256: hashBytes(bytes) };
    if (outputRow.mode !== sourceRow.mode || outputRow.size !== sourceRow.size || outputRow.sha256 !== sourceRow.sha256) {
      fail('OUTPUT_BYTES_DRIFT', `Staged output differs from approved bytes: ${relativePath}`);
    }
    validateRelativePath(relativePath);
    return outputRow;
  });
}

export async function materializeReviewedStatic({
  repoRoot,
  manifest,
  targetDir = path.join(repoRoot, 'dist'),
  outputManifestPath = path.join(repoRoot, DEFAULT_OUTPUT_MANIFEST),
  vercelConfig = {},
  validateRoutes = true,
}) {
  if (existsSync(targetDir)) fail('TARGET_EXISTS', `Static target must be absent: ${targetDir}`);
  if (existsSync(outputManifestPath)) {
    fail('OUTPUT_MANIFEST_EXISTS', `Private output manifest must be absent: ${outputManifestPath}`);
  }
  const rows = validateReviewedSourceManifest({ repoRoot, manifest });
  mkdirSync(path.dirname(targetDir), { recursive: true });
  const stageDir = mkdtempSync(path.join(path.dirname(targetDir), `.${path.basename(targetDir)}.stage-`));
  try {
    for (const row of rows) {
      const sourcePath = path.join(repoRoot, ...row.path.split('/'));
      const destinationPath = path.join(stageDir, ...row.path.split('/'));
      mkdirSync(path.dirname(destinationPath), { recursive: true });
      copyFileSync(sourcePath, destinationPath);
      chmodSync(destinationPath, row.mode === '100755' ? 0o755 : 0o644);
    }
    const outputRows = verifyOutputTree(stageDir, rows);
    if (validateRoutes) {
      validateRouteTerminations({
        distRoot: stageDir,
        config: vercelConfig,
        sitemapPath: 'public/sitemap.xml',
        expectedFunctionRoutes: EXPECTED_FUNCTION_ROUTES,
      });
    }
    const output = { schemaVersion: 1, rows: outputRows };
    mkdirSync(path.dirname(outputManifestPath), { recursive: true });
    const privateTemp = `${outputManifestPath}.tmp-${process.pid}`;
    writeFileSync(privateTemp, canonicalJson(output), { mode: 0o600 });
    renameSync(privateTemp, outputManifestPath);
    renameSync(stageDir, targetDir);
    return output;
  } catch (error) {
    rmSync(stageDir, { recursive: true, force: true });
    throw error;
  }
}

export function cleanGeneratedStatic({
  repoRoot,
  targetDir = path.join(repoRoot, 'dist'),
  outputManifestPath = path.join(repoRoot, DEFAULT_OUTPUT_MANIFEST),
}) {
  if (!existsSync(targetDir) && !existsSync(outputManifestPath)) return false;
  if (!existsSync(targetDir) || !existsSync(outputManifestPath)) {
    fail('CLEANUP_OWNERSHIP_UNPROVEN', 'Both generated target and private output manifest are required for cleanup');
  }
  const output = readJson(outputManifestPath, 'CLEANUP_OWNERSHIP_UNPROVEN');
  if (output.schemaVersion !== 1 || !Array.isArray(output.rows)) {
    fail('CLEANUP_OWNERSHIP_UNPROVEN', 'Private output manifest schema is invalid');
  }
  const actualRows = verifyOutputTree(targetDir, output.rows);
  if (canonicalJson({ schemaVersion: 1, rows: actualRows }) !== canonicalJson(output)) {
    fail('CLEANUP_OWNERSHIP_UNPROVEN', 'Generated target no longer matches its private output manifest');
  }
  rmSync(targetDir, { recursive: true });
  rmSync(outputManifestPath);
  return true;
}

function installedVersions(repoRoot, npmVersion) {
  const vercelPackage = readJson(path.join(repoRoot, 'node_modules/vercel/package.json'), 'LOCAL_VERCEL_UNAVAILABLE');
  return { node: process.versions.node, npm: npmVersion, vercel: vercelPackage.version };
}

function runClosedBuild(repoRoot, npmVersion) {
  delete process.env.__CF_USER_TEXT_ENCODING;
  validateClosedBuildEnvironment({ env: process.env, repoRoot });
  const contract = readJson(path.join(repoRoot, DEFAULT_CONTRACT), 'TOOLCHAIN_CONTRACT_INVALID');
  validateToolchainContract({ repoRoot, contract, versions: installedVersions(repoRoot, npmVersion) });
  const manifest = readJson(path.join(repoRoot, DEFAULT_MANIFEST), 'MANIFEST_SCHEMA_INVALID');
  const vercelConfig = readJson(path.join(repoRoot, 'vercel.json'), 'VERCEL_CONFIG_INVALID');
  return materializeReviewedStatic({ repoRoot, manifest, vercelConfig });
}

function npmVersionFromHost() {
  return execFileSync('npm', ['--version'], { encoding: 'utf8', env: process.env }).trim();
}

async function main() {
  const repoRoot = process.cwd();
  if (process.argv.includes('--clean')) {
    cleanGeneratedStatic({ repoRoot });
    return;
  }
  const versionArg = process.argv.find((arg) => arg.startsWith('--npm-version='));
  if (process.env.WP0B_CLOSED_ENV === '1') {
    if (!versionArg) fail('TOOLCHAIN_VERSION_DRIFT', 'Closed build is missing the pinned npm version');
    await runClosedBuild(repoRoot, versionArg.slice('--npm-version='.length));
    return;
  }
  const npmVersion = npmVersionFromHost();
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--npm-version=${npmVersion}`], {
    cwd: repoRoot,
    env: createClosedBuildEnvironment(process.env),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error?.code ?? 'DEPLOYMENT_BUILD_FAILED';
    process.stderr.write(`${canonicalJson({ status: 'BLOCKED', code, message: error.message, details: error.details })}`);
    process.exitCode = 1;
  });
}
