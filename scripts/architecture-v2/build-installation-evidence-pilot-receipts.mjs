#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

import {
  assertInstallationBundleReplacementAllowed,
  auditInstallationEvidenceBundle,
  buildInstallationCanaryReceiptBundle,
  mergeInstallationEvidenceBundle,
} from '../../src/domain/installation-evidence-pipeline.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const storageRoot = resolve(process.env.FITAPPLIANCE_STORAGE_ROOT || '/Volumes/UGREEN-1TB/FitAppliance');
const pilotPath = resolve(root, 'data/architecture-v2/generated/installation-knowledge-pilot.json');
const recipePath = resolve(root, 'data/architecture-v2/policies/installation-evidence-canary-recipes.json');
const mineruIndexPath = resolve(root, 'data/architecture-v2/reviews/automated/historical-mineru-backfill-audit.json');
const bundlePath = resolve(root, 'data/architecture-v2/reviews/automated/installation-evidence-receipts.json');
const auditPath = resolve(root, 'data/architecture-v2/reviews/automated/installation-evidence-receipt-replay-audit.json');

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function objectPath(relativePath) {
  if (isAbsolute(relativePath)) throw new Error('MinerU object path must be storage-root relative');
  const absolute = resolve(storageRoot, relativePath);
  if (absolute !== storageRoot && !absolute.startsWith(`${storageRoot}${sep}`)) {
    throw new Error('MinerU object path escaped storage root');
  }
  return absolute;
}

function argumentValue(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const [pilot, recipes, mineruIndex] = await Promise.all([
  json(pilotPath),
  json(recipePath),
  json(mineruIndexPath),
]);
const indexByPdf = new Map(mineruIndex.entries.map((entry) => [entry.sourcePdfSha256, entry]));
const contexts = new Map();
const readObject = async (relativePath) => {
  const bytes = await readFile(objectPath(relativePath));
  contexts.set(relativePath, bytes);
  return bytes;
};
const canaryBundle = await buildInstallationCanaryReceiptBundle({ pilot, recipes, mineruIndex, readObject });
let current = null;
try {
  current = await json(bundlePath);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
const replace = process.argv.includes('--replace');
assertInstallationBundleReplacementAllowed({
  replace,
  expectedCurrentBundleSha256: argumentValue('--expected-current-bundle-sha'),
  currentBundle: current,
});
const bundle = replace || !current
  ? canaryBundle
  : mergeInstallationEvidenceBundle(current, canaryBundle.receipts, { generatedAt: recipes.generatedAt });

for (const receipt of bundle.receipts) {
  const relativePath = receipt.evidence.mineru.objectPath;
  if (!contexts.has(relativePath)) await readObject(relativePath);
}
const audit = auditInstallationEvidenceBundle(bundle, {
  auditedAt: recipes.generatedAt,
  readEvidence(receipt) {
    const indexEntry = indexByPdf.get(receipt.evidence.pdfSha256);
    const relativePath = receipt.evidence.mineru.objectPath;
    const jsonBytes = contexts.get(relativePath);
    if (!indexEntry || !jsonBytes) throw new Error(`canary replay context missing: ${receipt.receiptId}`);
    return { indexEntry, jsonBytes };
  },
});
if (bundle.summary.conflictingFields > 0 || audit.summary.failed > 0) {
  throw new Error(`installation canary receipts failed: ${JSON.stringify({ bundle: bundle.summary, replay: audit.summary })}`);
}
await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify({ bundle: bundle.summary, replay: audit.summary }));
