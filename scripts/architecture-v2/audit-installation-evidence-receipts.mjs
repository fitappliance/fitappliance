#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

import {
  auditInstallationEvidenceBundle,
  validateInstallationEvidenceBundle,
  validateInstallationEvidenceReplayAudit,
} from '../../src/domain/installation-evidence-pipeline.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const bundlePath = resolve(root, 'data/architecture-v2/reviews/automated/installation-evidence-receipts.json');
const auditPath = resolve(root, 'data/architecture-v2/reviews/automated/installation-evidence-receipt-replay-audit.json');
const mineruIndexPath = resolve(root, 'data/architecture-v2/reviews/automated/historical-mineru-backfill-audit.json');
const online = process.argv.includes('--online');

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const bundle = validateInstallationEvidenceBundle(await json(bundlePath));
if (bundle.summary.conflictingFields > 0) throw new Error('installation evidence bundle contains conflicting fields');

if (!online) {
  const result = validateInstallationEvidenceReplayAudit(bundle, await json(auditPath));
  console.log(JSON.stringify(result));
  process.exit(0);
}

const storageRoot = resolve(process.env.FITAPPLIANCE_STORAGE_ROOT || '/Volumes/UGREEN-1TB/FitAppliance');
const mineruIndex = await json(mineruIndexPath);
const indexByPdf = new Map(mineruIndex.entries.map((entry) => [entry.sourcePdfSha256, entry]));
const contexts = new Map();
for (const receipt of bundle.receipts) {
  const relativePath = receipt.evidence.mineru.objectPath;
  if (isAbsolute(relativePath)) throw new Error('MinerU object path must be storage-root relative');
  const absolutePath = resolve(storageRoot, relativePath);
  if (absolutePath !== storageRoot && !absolutePath.startsWith(`${storageRoot}${sep}`)) {
    throw new Error('MinerU object path escaped storage root');
  }
  contexts.set(receipt.receiptId, {
    indexEntry: indexByPdf.get(receipt.evidence.pdfSha256),
    jsonBytes: await readFile(absolutePath),
  });
}
const auditedAtIndex = process.argv.indexOf('--audited-at');
const auditedAt = auditedAtIndex >= 0 ? process.argv[auditedAtIndex + 1] : new Date().toISOString();
const audit = auditInstallationEvidenceBundle(bundle, {
  auditedAt,
  readEvidence: (receipt) => contexts.get(receipt.receiptId),
});
validateInstallationEvidenceReplayAudit(bundle, audit);
await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit.summary));
