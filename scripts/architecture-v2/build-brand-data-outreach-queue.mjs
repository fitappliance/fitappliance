#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildBrandDataOutreachQueue } from '../../src/domain/brand-data-outreach.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const pilot = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'installationKnowledgePilot'), 'utf8'));
const queue = buildBrandDataOutreachQueue(pilot);
await writeFile(resolveArchitectureV2Path(root, 'brandDataOutreachQueue'), `${JSON.stringify(queue, null, 2)}\n`);
console.log(JSON.stringify(queue.summary));
