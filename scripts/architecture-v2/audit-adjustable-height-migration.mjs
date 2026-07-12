#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { buildAdjustableHeightMigrationAudit } from '../../src/domain/adjustable-height-migration.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const mineruAudit = await readJson('data/architecture-v2/reviews/automated/historical-mineru-backfill-audit.json');
const audit = buildAdjustableHeightMigrationAudit({
  phase8Selection: await readJson('data/architecture-v2/reviews/phase-08/evidence-pilot.json'),
  phase8ReviewInput: await readJson('data/architecture-v2/reviews/phase-08/evidence-pilot-review-input.json'),
  publicProjection: await readJson('data/architecture-v2/generated/public-catalog-projection.json'),
  mineruAudit,
  generatedAt: mineruAudit.generatedAt,
});
await writeFile(resolveArchitectureV2Path(root, 'adjustableHeightMigrationAudit'), `${JSON.stringify(audit, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(audit.summary)}\n`);
