#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildFitV4Phase10Replay } from '../../src/domain/fit-v4-phase10-replay.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const manifest = await readJson(resolveArchitectureV2Path(root, 'phase10ReviewManifest'));
const report = buildFitV4Phase10Replay(manifest);
const output = resolveArchitectureV2Path(root, 'fitV4Phase10ReplayAudit');
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report.summary)}\n`);
if (report.summary.verifiedFit !== 0) {
  throw new Error('Phase 10 replay produced an unsafe VERIFIED_FIT result');
}
