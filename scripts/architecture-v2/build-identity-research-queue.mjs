#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { buildIdentityResearchQueue } from '../../src/domain/identity-research-queue.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const phase8Selection = await readJson('data/architecture-v2/reviews/phase-08/evidence-pilot.json');
const phase8ReviewInput = await readJson('data/architecture-v2/reviews/phase-08/evidence-pilot-review-input.json');
const phase8Bundles = await readJson('data/architecture-v2/generated/evidence-review-bundles.json');
const phase10Manifest = await readJson('data/architecture-v2/generated/phase10-evidence-review-manifest.json');
const recoveryBatch = await readJson(
  'data/architecture-v2/reviews/automated/identity-range-recovery-acceptance-batch.json',
);
const recoveryResults = await readJson(
  'data/architecture-v2/reviews/automated/identity-range-recovery-acceptance-results.json',
);
const reviewedAt = [phase8ReviewInput.reviewedAt, phase10Manifest.reviewedAt].filter(Boolean).sort().at(-1);
const queue = buildIdentityResearchQueue({
  phase8Selection,
  phase8ReviewInput,
  phase8Bundles,
  phase10Outcomes: phase10Manifest.outcomes,
  recoveryBatch,
  recoveryResults,
  generatedAt: `${reviewedAt}T00:00:00.000Z`,
});
await writeFile(resolveArchitectureV2Path(root, 'identityResearchQueue'), `${JSON.stringify(queue, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(queue.summary)}\n`);
