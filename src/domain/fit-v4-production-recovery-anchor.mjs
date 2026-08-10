import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  access, chmod, lstat, mkdtemp, readdir, readFile, rename, rm,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, posix, resolve } from 'node:path';
import { TextDecoder } from 'node:util';

import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const GIT_OID = /^[a-f0-9]{40}$/;
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const FUNCTION_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;
const SECRET_KEY = /(?:api[_-]?key|auth(?:orization)?[_-]?(?:header|token)|cookie|credential|password|private[_-]?key|secret|token)$/i;
const SECRET_VALUE = /(?:\bBearer\s+[A-Za-z0-9._~+\/-]{16,}|\b(?:sk|ghp|github_pat|vercel)_[A-Za-z0-9_-]{16,})/i;
const MODES = new Map([['100644', 0o644], ['100755', 0o755]]);
const CAPABILITIES = Object.freeze([
  'OFFLINE_GIT_SOURCE_RECONSTRUCTION',
  'REMOTE_PROMOTION_CANDIDATE_POINT_IN_TIME',
]);
const GAPS = Object.freeze([
  'CLIENT_CACHE_STATE_NOT_CAPTURED',
  'EXACT_REMOTE_OUTPUT_BYTES_NOT_CAPTURED',
  'OFFLINE_DEPENDENCY_INSTALL_NOT_PROVEN',
  'OVERBROAD_STATIC_OUTPUT_CONFIRMED',
  'REMOTE_FILE_TREE_UNAVAILABLE',
]);
const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 12000,
  maxTotalBytes: 512 * 1024 * 1024,
  maxFileBytes: 32 * 1024 * 1024,
  maxPathBytes: 1024,
});

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} object required`);
  }
  return value;
}

function exactKeys(value, label, keys) {
  object(value, label);
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  const unknown = actual.filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !actual.includes(key));
  if (unknown.length || missing.length) {
    throw new TypeError(`${label} unknown field or missing field: ${[...unknown, ...missing].join(', ')}`);
  }
}

function scanSecrets(value, path = '$') {
  if (typeof value === 'string' && SECRET_VALUE.test(value)) {
    throw new TypeError(`${path} contains a secret-shaped value`);
  }
  if (Array.isArray(value)) return value.forEach((entry, index) => scanSecrets(entry, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) throw new TypeError(`${path}.${key} is a secret-shaped key`);
      scanSecrets(entry, `${path}.${key}`);
    }
  }
  return undefined;
}

function text(value, label, pattern) {
  if (typeof value !== 'string' || !value || (pattern && !pattern.test(value))) {
    throw new TypeError(`${label} invalid`);
  }
  return value;
}

function integer(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${label} invalid`);
  }
  return value;
}

function sha(value, label) {
  return text(value, label, SHA256);
}

function iso(value, label) {
  const date = new Date(text(value, label));
  if (Number.isNaN(date.valueOf()) || date.toISOString() !== value) throw new TypeError(`${label} invalid`);
  return value;
}

function exactStringArray(value, expected, label) {
  if (!Array.isArray(value) || JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contradictory or incomplete`);
  }
  return Object.freeze([...value]);
}

function sortedUniqueStrings(value, label, validator = (entry) => entry) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError(`${label} required`);
  const entries = value.map((entry) => validator(entry));
  const sorted = [...entries].sort();
  if (new Set(entries).size !== entries.length || JSON.stringify(entries) !== JSON.stringify(sorted)) {
    throw new TypeError(`${label} must be sorted and unique`);
  }
  return Object.freeze(entries);
}

function pathValue(value, label, { leadingSlash = false } = {}) {
  const result = text(value, label);
  if (result.includes('\\') || result.includes('\0') || isAbsolute(result) !== leadingSlash) {
    throw new TypeError(`${label} unsafe path`);
  }
  const normalized = leadingSlash ? posix.normalize(result) : posix.normalize(result);
  if (normalized !== result || result.split('/').some((part) => part === '..')) {
    throw new TypeError(`${label} unsafe path`);
  }
  return result;
}

function validateSectionBinding(value, label) {
  exactKeys(value, label, ['count', 'semanticSha256']);
  return Object.freeze({
    count: integer(value.count, `${label} count`),
    semanticSha256: sha(value.semanticSha256, `${label} semantic SHA-256`),
  });
}

export function productionRecoveryAnchorSemanticSha256(value) {
  const semantic = structuredClone(value);
  delete semantic.semanticSha256;
  return canonicalJsonSha256(semantic);
}

export function validateProductionDeploymentCapture(value) {
  scanSecrets(value);
  exactKeys(value, 'production deployment capture', [
    'schemaVersion', 'policyVersion', 'capturedAt', 'project', 'deployment', 'source',
    'runtime', 'configuration', 'remoteFileTree', 'isolatedBuild', 'liveFingerprints',
    'serviceWorker',
  ]);
  if (value.schemaVersion !== 1 || value.policyVersion !== 'fit-v4-production-deployment-capture-v1') {
    throw new TypeError('production deployment capture schema v1 required');
  }

  exactKeys(value.project, 'project', ['projectId', 'teamId']);
  const capturedAt = iso(value.capturedAt, 'capture timestamp');
  const project = Object.freeze({
    projectId: text(value.project.projectId, 'project ID', /^prj_[A-Za-z0-9]+$/),
    teamId: text(value.project.teamId, 'team ID', /^team_[A-Za-z0-9]+$/),
  });

  exactKeys(value.deployment, 'deployment', [
    'deploymentId', 'deploymentUrl', 'target', 'readyState', 'createdAt', 'aliases',
  ]);
  let deploymentUrl;
  try {
    deploymentUrl = new URL(value.deployment.deploymentUrl);
  } catch {
    throw new TypeError('deployment URL invalid');
  }
  if (deploymentUrl.protocol !== 'https:' || deploymentUrl.username || deploymentUrl.password
    || deploymentUrl.port || deploymentUrl.pathname !== '/' || deploymentUrl.search || deploymentUrl.hash
    || !deploymentUrl.hostname.endsWith('.vercel.app')) {
    throw new TypeError('deployment URL unsafe');
  }
  const aliases = sortedUniqueStrings(value.deployment.aliases, 'deployment aliases', (alias) => {
    const result = text(alias, 'deployment alias', HOST);
    if (result.includes('/') || result.includes(':')
      || (!result.endsWith('.vercel.app')
        && result !== 'fitappliance.com.au'
        && result !== 'www.fitappliance.com.au')) {
      throw new TypeError('deployment alias unsafe');
    }
    return result;
  });
  if (value.deployment.target !== 'production' || value.deployment.readyState !== 'READY') {
    throw new TypeError('deployment target and ready state contradict production capture');
  }
  const deployment = Object.freeze({
    deploymentId: text(value.deployment.deploymentId, 'deployment ID', /^dpl_[A-Za-z0-9]+$/),
    deploymentUrl: deploymentUrl.href.replace(/\/$/, ''),
    target: value.deployment.target,
    readyState: value.deployment.readyState,
    createdAt: integer(value.deployment.createdAt, 'deployment createdAt', { min: 1 }),
    aliases,
  });
  if (new Date(deployment.createdAt).valueOf() > new Date(capturedAt).valueOf()) {
    throw new TypeError('deployment creation time contradicts capture timestamp');
  }

  exactKeys(value.source, 'source', [
    'provider', 'ref', 'commit', 'tree', 'inventory', 'ancestorOfCaptureHead',
  ]);
  exactKeys(value.source.inventory, 'source inventory', ['blobCount', 'totalBytes']);
  if (value.source.provider !== 'github' || value.source.ref !== 'main'
    || value.source.ancestorOfCaptureHead !== true) {
    throw new TypeError('source identity contradicts production capture');
  }
  const source = Object.freeze({
    provider: value.source.provider,
    ref: value.source.ref,
    commit: text(value.source.commit, 'source commit', GIT_OID),
    tree: text(value.source.tree, 'source tree', GIT_OID),
    inventory: Object.freeze({
      blobCount: integer(value.source.inventory.blobCount, 'source blob count', { min: 1 }),
      totalBytes: integer(value.source.inventory.totalBytes, 'source total bytes', { min: 1 }),
    }),
    ancestorOfCaptureHead: true,
  });

  exactKeys(value.runtime, 'runtime', ['nodeVersion', 'regions', 'functions']);
  if (!/^\d+\.x$/.test(value.runtime.nodeVersion)) throw new TypeError('Node version invalid');
  const runtimeRegions = sortedUniqueStrings(value.runtime.regions, 'runtime regions', (region) => text(region, 'region', /^[a-z]{3}\d$/));
  if (!Array.isArray(value.runtime.functions) || value.runtime.functions.length === 0) {
    throw new TypeError('runtime functions required');
  }
  const functionPaths = new Set();
  const functions = value.runtime.functions.map((entry, index) => {
    const label = `runtime function ${index}`;
    exactKeys(entry, label, ['path', 'digest', 'mode', 'size', 'runtime', 'regions']);
    const functionPath = text(entry.path, `${label} path`, FUNCTION_PATH);
    if (functionPaths.has(functionPath)) throw new TypeError(`duplicate function path ${functionPath}`);
    functionPaths.add(functionPath);
    return Object.freeze({
      path: functionPath,
      digest: sha(entry.digest, `${label} digest`),
      mode: integer(entry.mode, `${label} mode`, { max: 0xffff }),
      size: integer(entry.size, `${label} size`, { min: 1 }),
      runtime: text(entry.runtime, `${label} runtime`, /^nodejs\d+\.x$/),
      regions: sortedUniqueStrings(entry.regions, `${label} regions`, (region) => text(region, 'region', /^[a-z]{3}\d$/)),
    });
  });

  exactKeys(value.configuration, 'configuration', [
    'vercelJsonBytesSha256', 'vercelJsonSemanticSha256', 'redirects', 'rewrites',
    'headers', 'cleanUrls', 'trailingSlash', 'regions', 'buildCommand', 'outputDirectory',
  ]);
  if (typeof value.configuration.cleanUrls !== 'boolean'
    || typeof value.configuration.trailingSlash !== 'boolean'
    || value.configuration.outputDirectory !== null) {
    throw new TypeError('configuration route semantics incomplete');
  }
  const configuration = Object.freeze({
    vercelJsonBytesSha256: sha(value.configuration.vercelJsonBytesSha256, 'vercel.json bytes SHA-256'),
    vercelJsonSemanticSha256: sha(value.configuration.vercelJsonSemanticSha256, 'vercel.json semantic SHA-256'),
    redirects: validateSectionBinding(value.configuration.redirects, 'redirects'),
    rewrites: validateSectionBinding(value.configuration.rewrites, 'rewrites'),
    headers: validateSectionBinding(value.configuration.headers, 'headers'),
    cleanUrls: value.configuration.cleanUrls,
    trailingSlash: value.configuration.trailingSlash,
    regions: sortedUniqueStrings(value.configuration.regions, 'configuration regions', (region) => text(region, 'region', /^[a-z]{3}\d$/)),
    buildCommand: text(value.configuration.buildCommand, 'build command'),
    outputDirectory: null,
  });

  exactKeys(value.remoteFileTree, 'remote file tree', ['available', 'statusCode', 'message']);
  if (value.remoteFileTree.available !== false || value.remoteFileTree.statusCode !== 404
    || value.remoteFileTree.message !== 'File tree not found') {
    throw new TypeError('remote file tree observation contradicts unavailable state');
  }
  const remoteFileTree = Object.freeze({ ...value.remoteFileTree });

  exactKeys(value.isolatedBuild, 'isolated build', [
    'status', 'fileCount', 'approximateBytes', 'outputDirectory', 'confirmedExposurePaths',
  ]);
  if (value.isolatedBuild.status !== 'SUCCEEDED_OVERBROAD' || value.isolatedBuild.outputDirectory !== '.') {
    throw new TypeError('isolated build observation contradicts overbroad output');
  }
  const isolatedBuild = Object.freeze({
    status: value.isolatedBuild.status,
    fileCount: integer(value.isolatedBuild.fileCount, 'isolated build file count', { min: 1 }),
    approximateBytes: integer(value.isolatedBuild.approximateBytes, 'isolated build bytes', { min: 1 }),
    outputDirectory: '.',
    confirmedExposurePaths: sortedUniqueStrings(
      value.isolatedBuild.confirmedExposurePaths,
      'confirmed exposure paths',
      (entry) => pathValue(entry, 'confirmed exposure path', { leadingSlash: true }),
    ),
  });

  if (!Array.isArray(value.liveFingerprints) || value.liveFingerprints.length === 0) {
    throw new TypeError('live fingerprints required');
  }
  const fingerprintPaths = new Set();
  const liveFingerprints = value.liveFingerprints.map((entry, index) => {
    const label = `live fingerprint ${index}`;
    exactKeys(entry, label, ['path', 'status', 'contentType', 'bytes', 'sha256']);
    const fingerprintPath = pathValue(entry.path, `${label} path`, { leadingSlash: true });
    if (fingerprintPaths.has(fingerprintPath)) throw new TypeError(`duplicate live fingerprint path ${fingerprintPath}`);
    fingerprintPaths.add(fingerprintPath);
    return Object.freeze({
      path: fingerprintPath,
      status: integer(entry.status, `${label} status`, { min: 100, max: 599 }),
      contentType: text(entry.contentType, `${label} content type`),
      bytes: integer(entry.bytes, `${label} bytes`, { min: 1 }),
      sha256: sha(entry.sha256, `${label} SHA-256`),
    });
  });

  exactKeys(value.serviceWorker, 'service worker', [
    'liveCacheVersion', 'trackedCacheVersion', 'trackedSourceIsDeployedByte', 'liveBytesSha256',
  ]);
  if (value.serviceWorker.trackedSourceIsDeployedByte !== false
    || value.serviceWorker.liveCacheVersion === value.serviceWorker.trackedCacheVersion) {
    throw new TypeError('service worker observation contradicts tracked/deployed distinction');
  }
  const serviceWorker = Object.freeze({
    liveCacheVersion: text(value.serviceWorker.liveCacheVersion, 'live cache version', /^[a-f0-9]{7}$/),
    trackedCacheVersion: text(value.serviceWorker.trackedCacheVersion, 'tracked cache version', /^[a-f0-9]{7}$/),
    trackedSourceIsDeployedByte: false,
    liveBytesSha256: sha(value.serviceWorker.liveBytesSha256, 'live service worker SHA-256'),
  });

  return Object.freeze({
    schemaVersion: 1,
    policyVersion: value.policyVersion,
    capturedAt,
    project,
    deployment,
    source,
    runtime: Object.freeze({ nodeVersion: value.runtime.nodeVersion, regions: runtimeRegions, functions: Object.freeze(functions) }),
    configuration,
    remoteFileTree,
    isolatedBuild,
    liveFingerprints: Object.freeze(liveFingerprints),
    serviceWorker,
  });
}

export function validateProductionRecoveryAnchor(value) {
  scanSecrets(value);
  exactKeys(value, 'production recovery anchor', [
    'schemaVersion', 'policyVersion', 'status', 'capturedAt', 'capture', 'sourceTree',
    'vercelConfiguration', 'activeRetailRelease', 'trackedServiceWorker', 'capabilities',
    'gaps', 'semanticSha256',
  ]);
  if (value.schemaVersion !== 1 || value.policyVersion !== 'fit-v4-production-recovery-anchor-v1'
    || value.status !== 'BASELINE_RECOVERY_ANCHOR_ONLY') {
    throw new TypeError('production recovery anchor status/schema invalid');
  }
  exactStringArray(value.capabilities, CAPABILITIES, 'anchor capabilities');
  exactStringArray(value.gaps, GAPS, 'anchor gaps');
  const capture = validateProductionDeploymentCapture(value.capture);
  exactKeys(value.sourceTree, 'anchor source tree', [
    'commit', 'tree', 'fileCount', 'totalBytes', 'inventorySha256', 'ancestorOfCurrentHead',
  ]);
  text(value.sourceTree.commit, 'anchor source commit', GIT_OID);
  text(value.sourceTree.tree, 'anchor source tree', GIT_OID);
  integer(value.sourceTree.fileCount, 'anchor file count', { min: 1 });
  integer(value.sourceTree.totalBytes, 'anchor total bytes', { min: 1 });
  sha(value.sourceTree.inventorySha256, 'anchor inventory SHA-256');
  if (value.sourceTree.ancestorOfCurrentHead !== true) throw new TypeError('anchor source ancestry required');
  if (value.sourceTree.commit !== capture.source.commit || value.sourceTree.tree !== capture.source.tree
    || value.sourceTree.fileCount !== capture.source.inventory.blobCount
    || value.sourceTree.totalBytes !== capture.source.inventory.totalBytes) {
    throw new Error('anchor source tree contradicts capture');
  }
  exactKeys(value.vercelConfiguration, 'anchor Vercel configuration', ['bytesSha256', 'semanticSha256', 'document']);
  sha(value.vercelConfiguration.bytesSha256, 'anchor Vercel bytes SHA-256');
  sha(value.vercelConfiguration.semanticSha256, 'anchor Vercel semantic SHA-256');
  object(value.vercelConfiguration.document, 'anchor Vercel document');
  const vercelDocument = value.vercelConfiguration.document;
  const expectedConfiguration = capture.configuration;
  if (value.vercelConfiguration.bytesSha256 !== expectedConfiguration.vercelJsonBytesSha256
    || value.vercelConfiguration.semanticSha256 !== expectedConfiguration.vercelJsonSemanticSha256
    || canonicalJsonSha256(vercelDocument) !== value.vercelConfiguration.semanticSha256
    || canonicalJsonSha256(vercelDocument.redirects ?? []) !== expectedConfiguration.redirects.semanticSha256
    || (vercelDocument.redirects ?? []).length !== expectedConfiguration.redirects.count
    || canonicalJsonSha256(vercelDocument.rewrites ?? []) !== expectedConfiguration.rewrites.semanticSha256
    || (vercelDocument.rewrites ?? []).length !== expectedConfiguration.rewrites.count
    || canonicalJsonSha256(vercelDocument.headers ?? []) !== expectedConfiguration.headers.semanticSha256
    || (vercelDocument.headers ?? []).length !== expectedConfiguration.headers.count
    || vercelDocument.cleanUrls !== expectedConfiguration.cleanUrls
    || vercelDocument.trailingSlash !== expectedConfiguration.trailingSlash
    || canonicalJsonSha256([...(vercelDocument.regions ?? [])].sort())
      !== canonicalJsonSha256(expectedConfiguration.regions)
    || vercelDocument.buildCommand !== expectedConfiguration.buildCommand
    || (vercelDocument.outputDirectory ?? null) !== expectedConfiguration.outputDirectory) {
    throw new Error('anchor Vercel configuration contradicts capture');
  }
  exactKeys(value.activeRetailRelease, 'anchor active retail release', [
    'releaseCandidateId', 'descriptorPath', 'descriptorBytesSha256', 'artifacts',
  ]);
  text(value.activeRetailRelease.releaseCandidateId, 'anchor release candidate ID', /^retail_lifecycle_release_[a-f0-9]{24}$/);
  if (pathValue(value.activeRetailRelease.descriptorPath, 'anchor descriptor path')
    !== 'data/architecture-v2/decisions/active-retail-release.json') {
    throw new Error('anchor descriptor path invalid');
  }
  sha(value.activeRetailRelease.descriptorBytesSha256, 'anchor descriptor bytes SHA-256');
  exactKeys(value.activeRetailRelease.artifacts, 'anchor release artifacts', [
    'publicProjection', 'historicalReference', 'authorizationManifest',
  ]);
  const artifactFileNames = {
    publicProjection: 'public-catalog-projection.json',
    historicalReference: 'historical-appliance-reference.json',
    authorizationManifest: 'authorization-manifest.json',
  };
  for (const [name, artifact] of Object.entries(value.activeRetailRelease.artifacts)) {
    exactKeys(artifact, `anchor release artifact ${name}`, ['path', 'bytesSha256', 'semanticSha256']);
    const expectedPath = `data/architecture-v2/releases/${value.activeRetailRelease.releaseCandidateId}/${artifactFileNames[name]}`;
    if (pathValue(artifact.path, `anchor release artifact ${name} path`) !== expectedPath) {
      throw new Error(`anchor release artifact ${name} path invalid`);
    }
    sha(artifact.bytesSha256, `anchor release artifact ${name} bytes SHA-256`);
    sha(artifact.semanticSha256, `anchor release artifact ${name} semantic SHA-256`);
  }
  exactKeys(value.trackedServiceWorker, 'anchor tracked service worker', [
    'path', 'bytesSha256', 'cacheVersion', 'matchesLiveBytes',
  ]);
  if (pathValue(value.trackedServiceWorker.path, 'tracked service worker path') !== 'public/service-worker.js') {
    throw new Error('tracked service worker path invalid');
  }
  sha(value.trackedServiceWorker.bytesSha256, 'tracked service worker SHA-256');
  text(value.trackedServiceWorker.cacheVersion, 'tracked service worker cache version', /^[a-f0-9]{7}$/);
  if (value.trackedServiceWorker.matchesLiveBytes !== false) throw new TypeError('tracked service worker cannot claim live byte match');
  iso(value.capturedAt, 'anchor capture timestamp');
  if (value.capturedAt !== capture.capturedAt
    || value.trackedServiceWorker.cacheVersion !== capture.serviceWorker.trackedCacheVersion
    || value.trackedServiceWorker.bytesSha256 === capture.serviceWorker.liveBytesSha256) {
    throw new Error('anchor service-worker or capture binding contradicts observation');
  }
  sha(value.semanticSha256, 'anchor semantic SHA-256');
  if (productionRecoveryAnchorSemanticSha256(value) !== value.semanticSha256) {
    throw new Error('anchor semantic SHA-256 mismatch');
  }
  return Object.freeze(structuredClone(value));
}

function safeGitEnvironment() {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    LANG: 'C',
    LC_ALL: 'C',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_OPTIONAL_LOCKS: '0',
  };
}

function run(command, args, { cwd, encoding = null } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: safeGitEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(' ')} failed: ${Buffer.concat(stderr).toString('utf8').trim()}`));
        return;
      }
      const bytes = Buffer.concat(stdout);
      resolvePromise(encoding ? bytes.toString(encoding) : bytes);
    });
  });
}

async function defaultGit(args, { repoRoot } = {}) {
  return run('git', args, { cwd: repoRoot });
}

function validateRelativeTreePath(filePath, limits) {
  if (!filePath || isAbsolute(filePath) || filePath.includes('\\') || filePath.includes('\0')
    || posix.normalize(filePath) !== filePath
    || filePath.split('/').some((part) => part === '.' || part === '..' || !part)
    || Buffer.byteLength(filePath) > limits.maxPathBytes) {
    throw new Error(`unsafe path in production tree: ${filePath}`);
  }
  return filePath;
}

export async function inspectProductionGitTree({
  repoRoot = process.cwd(),
  commit,
  expectedTree,
  limits = {},
  git = defaultGit,
} = {}) {
  const effectiveLimits = { ...DEFAULT_LIMITS, ...limits };
  text(commit, 'production commit', GIT_OID);
  text(expectedTree, 'expected production tree', GIT_OID);
  const tree = String(await git(['rev-parse', `${commit}^{tree}`], { repoRoot })).trim();
  if (tree !== expectedTree) throw new Error('production source tree mismatch');
  const listing = Buffer.from(await git(['ls-tree', '-r', '-z', '-l', commit], { repoRoot }));
  let decodedListing;
  try {
    decodedListing = new TextDecoder('utf-8', { fatal: true }).decode(listing);
  } catch {
    throw new Error('production tree contains a non-UTF-8 path');
  }
  const entries = [];
  const normalizedPaths = new Set();
  const foldedPaths = new Set();
  let totalBytes = 0;
  for (const recordBytes of decodedListing.split('\0')) {
    if (!recordBytes) continue;
    const match = /^(\d{6}) ([a-z]+) ([a-f0-9]{40})\s+(\d+|-)\t([\s\S]+)$/.exec(recordBytes);
    if (!match) throw new Error('invalid git tree record');
    const [, mode, type, oid, sizeText, rawPath] = match;
    if (type !== 'blob' || !MODES.has(mode) || sizeText === '-') {
      throw new Error(`unsupported git tree mode/type for ${rawPath}`);
    }
    const filePath = validateRelativeTreePath(rawPath, effectiveLimits);
    const normalized = filePath.normalize('NFC');
    if (normalizedPaths.has(normalized)) throw new Error(`Unicode NFC collision: ${filePath}`);
    normalizedPaths.add(normalized);
    const folded = normalized.toLowerCase();
    if (foldedPaths.has(folded)) throw new Error(`case-fold collision: ${filePath}`);
    foldedPaths.add(folded);
    const size = Number(sizeText);
    if (size > effectiveLimits.maxFileBytes) throw new Error(`single-file size limit exceeded: ${filePath}`);
    totalBytes += size;
    if (totalBytes > effectiveLimits.maxTotalBytes) throw new Error('total size limit exceeded');
    entries.push(Object.freeze({ path: filePath, mode, modeNumber: MODES.get(mode), oid, size }));
    if (entries.length > effectiveLimits.maxFiles) throw new Error('file count limit exceeded');
  }
  const inventory = entries.map(({ path, mode, oid, size }) => ({ path, mode, oid, size }));
  return Object.freeze({
    commit,
    tree,
    fileCount: entries.length,
    totalBytes,
    inventorySha256: canonicalJsonSha256(inventory),
    entries: Object.freeze(entries),
  });
}

async function walkFiles(root, relative = '') {
  const directory = join(root, relative);
  const names = await readdir(directory);
  const files = [];
  for (const name of names.sort()) {
    const childRelative = relative ? `${relative}/${name}` : name;
    const child = join(root, ...childRelative.split('/'));
    const stat = await lstat(child);
    if (stat.isSymbolicLink()) throw new Error(`restored symlink forbidden: ${childRelative}`);
    if (stat.isDirectory()) files.push(...await walkFiles(root, childRelative));
    else if (stat.isFile()) files.push({ path: childRelative, stat });
    else throw new Error(`restored special entry forbidden: ${childRelative}`);
  }
  return files;
}

export async function verifyReconstructedProductionTree({ target, inventory }) {
  const actualFiles = await walkFiles(target);
  const expectedByPath = new Map(inventory.entries.map((entry) => [entry.path, entry]));
  if (actualFiles.length !== inventory.fileCount) throw new Error('restored file count mismatch');
  for (const { path: filePath, stat } of actualFiles) {
    const expected = expectedByPath.get(filePath);
    if (!expected) throw new Error(`unexpected restored path: ${filePath}`);
    if (stat.size !== expected.size) throw new Error(`restored size mismatch: ${filePath}`);
    if ((stat.mode & 0o777) !== expected.modeNumber) throw new Error(`restored mode mismatch: ${filePath}`);
    const bytes = await readFile(join(target, ...filePath.split('/')));
    if (shaBlob(bytes) !== expected.oid) throw new Error(`restored blob mismatch: ${filePath}`);
    expectedByPath.delete(filePath);
  }
  if (expectedByPath.size) throw new Error(`missing restored path: ${expectedByPath.keys().next().value}`);
  return Object.freeze({
    tree: inventory.tree,
    fileCount: inventory.fileCount,
    totalBytes: inventory.totalBytes,
    inventorySha256: inventory.inventorySha256,
  });
}

function shaBlob(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

async function defaultExtractArchive({ repoRoot, commit, staging }) {
  await new Promise((resolvePromise, reject) => {
    const env = safeGitEnvironment();
    const git = spawn('git', ['archive', '--format=tar', commit], {
      cwd: repoRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const tar = spawn('tar', ['-x', '-f', '-', '-C', staging], {
      cwd: repoRoot,
      env,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    const errors = [];
    let gitCode;
    let tarCode;
    git.stderr.on('data', (chunk) => errors.push(chunk));
    tar.stderr.on('data', (chunk) => errors.push(chunk));
    git.on('error', reject);
    tar.on('error', reject);
    git.stdout.pipe(tar.stdin);
    const done = () => {
      if (gitCode === undefined || tarCode === undefined) return;
      if (gitCode !== 0 || tarCode !== 0) {
        reject(new Error(`offline git archive extraction failed: ${Buffer.concat(errors).toString('utf8').trim()}`));
      } else resolvePromise();
    };
    git.on('close', (code) => { gitCode = code; done(); });
    tar.on('close', (code) => { tarCode = code; done(); });
  });
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function reconstructProductionGitTree({
  repoRoot = process.cwd(),
  commit,
  expectedTree,
  target,
  limits,
  git = defaultGit,
  extractArchive = defaultExtractArchive,
} = {}) {
  const destination = resolve(target);
  if (await exists(destination)) throw new Error('reconstruction target must not exist');
  const parent = dirname(destination);
  const parentStat = await lstat(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw new Error('reconstruction parent must be a real directory');
  const inventory = await inspectProductionGitTree({ repoRoot, commit, expectedTree, limits, git });
  let staging;
  try {
    staging = await mkdtemp(join(parent, `.${basename(destination)}.staging-`));
    await chmod(staging, 0o700);
    await extractArchive({ repoRoot, commit, staging });
    const verified = await verifyReconstructedProductionTree({ target: staging, inventory });
    if (await exists(destination)) throw new Error('reconstruction target appeared during staging');
    await rename(staging, destination);
    staging = null;
    return verified;
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
  }
}

export const PRODUCTION_RECOVERY_CAPABILITIES = CAPABILITIES;
export const PRODUCTION_RECOVERY_GAPS = GAPS;
