#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { buildRetailLifecycleShadow } from '../../src/domain/retail-lifecycle-shadow.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function validateReleasePolicy(policy) {
  if (!policy || policy.schemaVersion !== 1
    || policy.policyVersion !== 'retail-lifecycle-release-v1') {
    throw new TypeError('retail lifecycle release policy schema v1 required');
  }
  if (policy.mode !== 'SHADOW_ONLY') {
    throw new Error('tracked retail lifecycle release policy must remain SHADOW_ONLY until cutover');
  }
  if (Number.isNaN(Date.parse(policy.asOf))) {
    throw new TypeError('retail lifecycle release policy asOf must be an ISO timestamp');
  }
  const requirements = policy.cutoverRequirements;
  if (!requirements || !Number.isInteger(requirements.expectedLegacyCurrentProducts)
    || requirements.expectedLegacyCurrentProducts < 0
    || requirements.maximumUnresolvedLegacyCurrentProducts !== 0
    || requirements.maximumUnsafeRemovedLegacyCurrentProducts !== 0
    || requirements.atomicDownstreamRebuildRequired !== true) {
    throw new TypeError('retail lifecycle cutover requirements are incomplete');
  }
  return policy;
}

async function readJsonWithHash(path) {
  const bytes = await readFile(path);
  return { document: JSON.parse(bytes), sha256: sha256(bytes) };
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export async function buildRetailLifecycleShadowFromRepository({
  root = defaultRoot,
  output = resolveArchitectureV2Path(root, 'retailLifecycleShadow'),
} = {}) {
  const [
    publicProjection,
    officialMarketLifecycle,
    retailerLedger,
    sourcePolicy,
    releasePolicySource,
  ] = await Promise.all([
    readJsonWithHash(resolveArchitectureV2Path(root, 'publicProjection')),
    readJsonWithHash(resolveArchitectureV2Path(root, 'officialMarketLifecycle')),
    readJsonWithHash(resolveArchitectureV2Path(root, 'retailerObservations')),
    readJsonWithHash(resolveArchitectureV2Path(root, 'retailerSourcePolicy')),
    readJsonWithHash(resolveArchitectureV2Path(root, 'retailLifecycleReleasePolicy')),
  ]);
  const releasePolicy = validateReleasePolicy(releasePolicySource.document);
  const shadow = buildRetailLifecycleShadow({
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    officialMarketLifecycle: officialMarketLifecycle.document,
    officialMarketLifecycleSha256: officialMarketLifecycle.sha256,
    retailerLedger: retailerLedger.document,
    retailerLedgerSha256: retailerLedger.sha256,
    sourcePolicy: sourcePolicy.document,
    sourcePolicySha256: sourcePolicy.sha256,
    releasePolicySha256: releasePolicySource.sha256,
    releaseEpoch: required(releasePolicy.releaseEpoch, 'retail lifecycle release epoch'),
    asOf: releasePolicy.asOf,
    retailLifecyclePolicyVersion: required(
      releasePolicy.retailLifecyclePolicyVersion,
      'retail lifecycle policy version',
    ),
  });
  if (shadow.summary.legacyCurrentProducts
    !== releasePolicy.cutoverRequirements.expectedLegacyCurrentProducts) {
    throw new Error('legacy-current population drift from release policy');
  }
  await atomicJson(output, shadow);
  return shadow;
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

export async function runCli(args = process.argv.slice(2)) {
  const supported = new Set(['--root', '--output']);
  for (let index = 0; index < args.length; index += 2) {
    if (!supported.has(args[index])) throw new TypeError(`unknown argument: ${args[index]}`);
  }
  const root = resolve(option(args, '--root') ?? defaultRoot);
  const output = resolve(option(args, '--output') ?? resolveArchitectureV2Path(root, 'retailLifecycleShadow'));
  const shadow = await buildRetailLifecycleShadowFromRepository({ root, output });
  process.stdout.write(`${JSON.stringify({
    output,
    shadowId: shadow.shadowId,
    summary: shadow.summary,
    cutover: {
      status: shadow.cutover.status,
      unresolvedLegacyCurrentProducts: shadow.cutover.unresolvedLegacyCurrentIds.length,
      unsafeRemovedLegacyCurrentProducts: shadow.cutover.unsafeRemovedLegacyCurrentIds.length,
    },
  }, null, 2)}\n`);
  return shadow;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
