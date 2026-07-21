#!/usr/bin/env node

import * as fs from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildHistoricalEvidenceBrandFunnel } from '../../src/domain/historical-evidence-brand-funnel.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
  const options = {
    state: null,
    output: resolve(repoRoot, 'data/architecture-v2/reviews/automated/historical-evidence-recovery-brand-funnel.json'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--state' || flag === '--output') {
      const value = argv[++index];
      if (!value) throw new TypeError(`${flag} value required`);
      options[flag.slice(2)] = resolve(value);
      continue;
    }
    throw new TypeError(`unknown argument: ${flag}`);
  }
  if (!options.state) throw new TypeError('--state is required');
  return options;
}

async function main(argv) {
  const options = parseArgs(argv);
  const state = JSON.parse(await fs.readFile(options.state, 'utf8'));
  const report = buildHistoricalEvidenceBrandFunnel(state);
  await fs.mkdir(dirname(options.output), { recursive: true });
  const temporary = `${options.output}.tmp-${process.pid}`;
  await fs.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`);
  await fs.rename(temporary, options.output);
  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
}

await main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
