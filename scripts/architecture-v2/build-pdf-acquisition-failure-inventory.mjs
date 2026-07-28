#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildPdfAcquisitionFailureInventory } from '../../src/domain/pdf-acquisition-failure-inventory.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function readJsonWithHash(path) {
  const bytes = await readFile(path);
  return {
    document: JSON.parse(bytes),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

export async function buildPdfAcquisitionFailureInventoryFromRepository({
  root = defaultRoot,
  checkpointPath = resolve(
    process.env.FITAPPLIANCE_STORAGE_ROOT || '/Volumes/UGREEN-1TB/FitAppliance',
    'runs/wp7a-pdf-baseline/wp7a-pdf-failure-baseline-20260727/checkpoint.json',
  ),
  outputPath = resolve(root, 'data/architecture-v2/reviews/automated/pdf-acquisition-failure-inventory.json'),
} = {}) {
  const paths = {
    wp7a: resolve(root, 'data/architecture-v2/reviews/automated/pdf-failure-baseline-100-wp7a.json'),
    strategy: resolve(root, 'data/architecture-v2/policies/manufacturer-document-strategies.json'),
    sourcePolicy: resolve(root, 'data/architecture-v2/policies/manufacturer-source-policy.json'),
    contactMatrix: resolve(root, 'data/architecture-v2/policies/brand-data-contact-matrix.json'),
    checkpoint: resolve(checkpointPath),
  };
  const [wp7a, checkpoint, strategy, sourcePolicy, contactMatrix] = await Promise.all([
    readJsonWithHash(paths.wp7a),
    readJsonWithHash(paths.checkpoint),
    readJsonWithHash(paths.strategy),
    readJsonWithHash(paths.sourcePolicy),
    readJsonWithHash(paths.contactMatrix),
  ]);
  if (checkpoint.document.baselineId !== wp7a.document.sourceBaselineId
    || checkpoint.document.baselineSha256 !== wp7a.document.sourceBaselineSha256) {
    throw new Error('WP7A checkpoint is not bound to the committed baseline report');
  }
  const inventory = buildPdfAcquisitionFailureInventory({
    wp7aReport: wp7a.document,
    checkpoint: checkpoint.document,
    contactMatrix: contactMatrix.document,
    sourceBindings: {
      wp7aReportSha256: wp7a.sha256,
      checkpointSha256: checkpoint.sha256,
      checkpointPolicySha256: checkpoint.document.policySha256,
      manufacturerStrategySha256: strategy.sha256,
      manufacturerSourcePolicySha256: sourcePolicy.sha256,
      contactMatrixSha256: contactMatrix.sha256,
    },
  });
  await atomicJson(outputPath, inventory);
  return inventory;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const supported = new Set(['--root', '--checkpoint', '--output']);
  for (let index = 0; index < args.length; index += 2) {
    if (!supported.has(args[index])) throw new TypeError(`unknown failure inventory argument: ${args[index]}`);
    if (!args[index + 1] || args[index + 1].startsWith('--')) {
      throw new TypeError(`${args[index]} requires a value`);
    }
  }
  const root = resolve(option(args, '--root') ?? defaultRoot);
  const inventory = await buildPdfAcquisitionFailureInventoryFromRepository({
    root,
    checkpointPath: option(args, '--checkpoint') ?? undefined,
    outputPath: resolve(option(args, '--output')
      ?? resolve(root, 'data/architecture-v2/reviews/automated/pdf-acquisition-failure-inventory.json')),
  });
  process.stdout.write(`${JSON.stringify({
    inventoryId: inventory.inventoryId,
    summary: inventory.summary,
    recoveryRanking: inventory.recoveryRanking,
  }, null, 2)}\n`);
}
