#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { validateOfficialIdentityEvidenceManifest } from '../../src/domain/official-identity-evidence.mjs';
import { advanceRetailLifecycleShadowEpoch } from '../../src/domain/retail-lifecycle-release-epoch.mjs';
import { validateRetailerObservationLedger } from '../../src/domain/retailer-observation-ledger.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export async function advanceRetailLifecycleShadowEpochFromRepository({ root = defaultRoot } = {}) {
  const policyPath = resolveArchitectureV2Path(root, 'retailLifecycleReleasePolicy');
  const ledgerPath = resolveArchitectureV2Path(root, 'retailerObservations');
  const officialEvidencePath = resolveArchitectureV2Path(root, 'retailerIdentityOfficialEvidence');
  const [releasePolicy, retailerLedger, officialIdentityEvidence] = await Promise.all([
    readFile(policyPath, 'utf8').then(JSON.parse),
    readFile(ledgerPath, 'utf8').then(JSON.parse),
    readFile(officialEvidencePath, 'utf8').then(JSON.parse),
  ]);
  validateRetailerObservationLedger(retailerLedger);
  validateOfficialIdentityEvidenceManifest(officialIdentityEvidence);
  const result = advanceRetailLifecycleShadowEpoch({
    releasePolicy,
    retailerLedger,
    officialIdentityEvidence,
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
  }, null, 2)}\n`);
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
