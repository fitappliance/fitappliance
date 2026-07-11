#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildResolutionManifest } from '../../src/domain/evidence-resolution-loop.mjs';
import { assertEvidenceResolutionAudit, auditEvidenceResolution } from '../../src/domain/evidence-resolution-audit.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const input = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'evidenceResolutionInput'), 'utf8'));
const asOf = process.env.EVIDENCE_AS_OF ?? new Date().toISOString();
const manifest = buildResolutionManifest(input, { asOf });
assertEvidenceResolutionAudit(auditEvidenceResolution(input, manifest, { asOf }));
const output = resolveArchitectureV2Path(root, 'evidenceResolutionManifest');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(manifest.summary)}\n`);
