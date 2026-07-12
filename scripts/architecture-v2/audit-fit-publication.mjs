#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { auditPublicFitProjection } from '../../src/domain/geometry-publication.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const projection = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'publicProjection'), 'utf8'));
const audit = auditPublicFitProjection(projection);
const output = resolve(root, 'data/architecture-v2/reviews/automated/fit-publication-audit.json');
await writeFile(output, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit.summary));
if (audit.summary.violations) throw new Error(`${audit.summary.violations} unsafe public fit classifications`);
