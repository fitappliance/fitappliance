#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { auditPublicFitProjection } from '../../src/domain/geometry-publication.mjs';
import { auditInstallationFitPublication } from '../../src/domain/installation-evidence-pipeline.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const projection = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'publicProjection'), 'utf8'));
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
const output = resolve(root, 'data/architecture-v2/reviews/automated/fit-publication-audit.json');
await writeFile(output, `${JSON.stringify(combined, null, 2)}\n`);
console.log(JSON.stringify({ geometry: audit.summary, installation: installation.summary }));
if (audit.summary.violations || installation.summary.violations) {
  throw new Error(`${audit.summary.violations + installation.summary.violations} unsafe public fit classifications`);
}
