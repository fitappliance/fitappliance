#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { reviewPhase10Evidence } from '../../src/domain/phase10-evidence-review.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const readJson = async (key) => JSON.parse(await readFile(resolveArchitectureV2Path(root, key), 'utf8'));
const result = reviewPhase10Evidence({
  selection: await readJson('phase10EvidenceBatch'),
  acquisition: await readJson('phase10Acquisition'),
  input: await readJson('phase10ReviewInput'),
});
await writeFile(resolveArchitectureV2Path(root, 'phase10ReviewManifest'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.summary));
