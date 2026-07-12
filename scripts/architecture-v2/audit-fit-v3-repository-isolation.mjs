#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { auditFitV3Pilot } from '../../src/domain/fit-v3-pilot-audit.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const report = auditFitV3Pilot({
  enforceBaselineHashes: false,
  snapshots: await readJson(resolveArchitectureV2Path(root, 'officialRegistrySnapshots')),
  reconciliation: await readJson(resolveArchitectureV2Path(root, 'officialRegistryReconciliation')),
  pilot: await readJson(resolveArchitectureV2Path(root, 'installationKnowledgePilot')),
  researchQueue: await readJson(resolveArchitectureV2Path(root, 'installationResearchQueue')),
  fitV3Audit: await readJson(resolveArchitectureV2Path(root, 'fitV3ShadowAudit')),
  publicCatalog: await readJson(resolveArchitectureV2Path(root, 'publicProjection')),
});
console.log(JSON.stringify(report.summary));
if (!report.passed) throw new Error(`Fit V3 repository isolation failed with ${report.violations.length} violation(s): ${report.violations.map((row) => row.code).join(', ')}`);
