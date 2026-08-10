#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { validateOfficialIdentityEvidenceManifest } from '../../src/domain/official-identity-evidence.mjs';
import { advanceRetailLifecycleShadowEpoch } from '../../src/domain/retail-lifecycle-release-epoch.mjs';
import {
  normalizeRetailerSourcePolicy,
  validateRetailerObservationLedger,
} from '../../src/domain/retailer-observation-ledger.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

async function readJsonWithHash(path) {
  const bytes = await readFile(path);
  return {
    document: JSON.parse(bytes),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function legacyCurrentProducts(publicProjection) {
  if (!publicProjection || !Array.isArray(publicProjection.products)) {
    throw new TypeError('public projection products required for shadow epoch advancement');
  }
  return publicProjection.products.filter((product) => (
    product?.unavailable === false
      && Array.isArray(product?.retailers)
      && product.retailers.length > 0
  )).length;
}

export async function advanceRetailLifecycleShadowEpochFromRepository({ root = defaultRoot } = {}) {
  const policyPath = resolveArchitectureV2Path(root, 'retailLifecycleReleasePolicy');
  const ledgerPath = resolveArchitectureV2Path(root, 'retailerObservations');
  const officialEvidencePath = resolveArchitectureV2Path(root, 'retailerIdentityOfficialEvidence');
  const sourcePolicyPath = resolveArchitectureV2Path(root, 'retailerSourcePolicy');
  const publicProjectionPath = resolveArchitectureV2Path(root, 'publicProjection');
  const [releasePolicy, retailerLedger, officialIdentityEvidence, sourcePolicy, publicProjection] = await Promise.all([
    readFile(policyPath, 'utf8').then(JSON.parse),
    readFile(ledgerPath, 'utf8').then(JSON.parse),
    readFile(officialEvidencePath, 'utf8').then(JSON.parse),
    readJsonWithHash(sourcePolicyPath),
    readJsonWithHash(publicProjectionPath),
  ]);
  validateRetailerObservationLedger(retailerLedger);
  validateOfficialIdentityEvidenceManifest(officialIdentityEvidence);
  normalizeRetailerSourcePolicy(sourcePolicy.document);
  const result = advanceRetailLifecycleShadowEpoch({
    releasePolicy,
    retailerLedger,
    officialIdentityEvidence,
    sourcePolicySha256: sourcePolicy.sha256,
    baselinePublicProjectionSha256: publicProjection.sha256,
    expectedLegacyCurrentProducts: legacyCurrentProducts(publicProjection.document),
  });
  if (result.changed) await atomicJson(policyPath, result.policy);
  return { ...result, policyPath };
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

export async function runCli(args = process.argv.slice(2)) {
  if (args.some((value, index) => index % 2 === 0 && value !== '--root')) {
    throw new TypeError(`unknown argument: ${args.find((value, index) => index % 2 === 0 && value !== '--root')}`);
  }
  const result = await advanceRetailLifecycleShadowEpochFromRepository({
    root: resolve(option(args, '--root') ?? defaultRoot),
  });
  process.stdout.write(`${JSON.stringify({
    policyPath: result.policyPath,
    changed: result.changed,
    releaseEpoch: result.policy.releaseEpoch,
    asOf: result.policy.asOf,
    mode: result.policy.mode,
    expectedLegacyCurrentProducts:
      result.policy.cutoverRequirements.expectedLegacyCurrentProducts,
  }, null, 2)}\n`);
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
