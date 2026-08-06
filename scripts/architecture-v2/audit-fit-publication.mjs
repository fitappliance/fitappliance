#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { auditPublicFitProjection } from '../../src/domain/geometry-publication.mjs';
import { auditInstallationFitPublication } from '../../src/domain/installation-evidence-pipeline.mjs';
import { loadActiveRetailRelease } from '../../src/domain/active-retail-release.mjs';

const defaultRoot = resolve(new URL('../..', import.meta.url).pathname);

export async function runFitPublicationAudit({
  root = defaultRoot,
  projectionPath,
  outputPath = resolveArchitectureV2Path(root, 'fitPublicationAudit'),
} = {}) {
  if (!projectionPath) {
    projectionPath = (await loadActiveRetailRelease({ root })).paths.catalog;
  }
  const projection = JSON.parse(await readFile(projectionPath, 'utf8'));
  const audit = auditPublicFitProjection(projection);
  const receiptBundle = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/reviews/automated/installation-evidence-receipts.json'), 'utf8'));
  const replayAuditBytes = await readFile(resolve(root, 'data/architecture-v2/reviews/automated/installation-evidence-receipt-replay-audit.json'));
  const replayAudit = JSON.parse(replayAuditBytes);
  const controlPlane = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/generated/installation-evidence-pipeline.json'), 'utf8'));
  const installation = auditInstallationFitPublication({
    projection,
    receiptBundle,
    replayAudit,
    replayAuditSha256: createHash('sha256').update(replayAuditBytes).digest('hex'),
    controlPlane,
  });
  const combined = { ...audit, installation };
  await writeFile(outputPath, `${JSON.stringify(combined, null, 2)}\n`);
  if (audit.summary.violations || installation.summary.violations) {
    throw new Error(`${audit.summary.violations + installation.summary.violations} unsafe public fit classifications`);
  }
  return combined;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const combined = await runFitPublicationAudit();
  console.log(JSON.stringify({ geometry: combined.summary, installation: combined.installation.summary }));
}
