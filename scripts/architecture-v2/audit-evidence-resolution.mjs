#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertEvidenceResolutionAudit, auditEvidenceResolution } from '../../src/domain/evidence-resolution-audit.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [input, manifest] = await Promise.all([
  readFile(resolveArchitectureV2Path(root, 'evidenceResolutionInput'), 'utf8').then(JSON.parse),
  readFile(resolveArchitectureV2Path(root, 'evidenceResolutionManifest'), 'utf8').then(JSON.parse),
]);
const audit = auditEvidenceResolution(input, manifest, {
  asOf: process.env.EVIDENCE_AS_OF ?? new Date().toISOString(),
});
process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
assertEvidenceResolutionAudit(audit);
