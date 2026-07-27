#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { architectureV2Paths } from '../../src/domain/architecture-v2-paths.mjs';
import { buildPdfBaselineParserReplay } from '../../src/domain/pdf-baseline-parser-replay.mjs';
import {
  createEvidenceObjectStore,
  verifyEvidenceStorageRoot,
} from '../../src/domain/evidence-recovery-state-store.mjs';

const execFile = promisify(execFileCallback);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseArgs(argv) {
  let storageRoot = process.env.FITAPPLIANCE_STORAGE_ROOT ?? null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--storage-root' || !argv[index + 1]) {
      throw new TypeError(`unknown or incomplete argument: ${argv[index]}`);
    }
    storageRoot = argv[index + 1];
    index += 1;
  }
  if (!storageRoot) throw new TypeError('--storage-root or FITAPPLIANCE_STORAGE_ROOT required');
  return { storageRoot };
}

async function mountedVolumeUuid(path) {
  const { stdout: dfOutput } = await execFile('df', ['-P', path], { timeout: 10_000 });
  const device = dfOutput.trim().split('\n').at(-1)?.trim().split(/\s+/)[0];
  if (!device) throw new Error('df did not report the storage device');
  const { stdout } = await execFile('diskutil', ['info', device], { timeout: 10_000 });
  const value = /^\s*Volume UUID:\s*(\S+)\s*$/im.exec(stdout)?.[1];
  if (!value) throw new Error('diskutil did not report a mounted volume UUID');
  return value;
}

async function atomicWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, bytes, { flag: 'wx' });
  await rename(temporary, path);
}

function markdown(report, artifactSha256) {
  const outcomes = Object.entries(report.summary.byOutcome)
    .map(([outcome, count]) => `| ${outcome} | ${count} |`).join('\n');
  const families = report.familyBacklog.rankedForParserResearch.length
    ? report.familyBacklog.rankedForParserResearch.map((family, index) => (
      `| ${index + 1} | ${family.brand} | ${family.category} | ${family.candidateTargets} | ${family.representativeSampleIds.join(', ')} |`
    )).join('\n')
    : '| - | - | - | 0 | No eligible parser family |';
  return `# WP8 Frozen PDF Parser Replay

**Built:** ${report.builtOn}

**Artifact SHA-256:** \`${artifactSha256}\`

Every indexed object was re-hashed before the existing production parser ran. Official
error payloads, identity failures and missing machine-readable structures are separated
from real parser grammar gaps.

| Outcome | Samples |
| --- | ---: |
${outcomes}

## Parser Research Backlog

| Rank | Brand | Category | Legacy upper bound | Representative sample |
| ---: | --- | --- | ---: | --- |
${families}

These counts are research priorities, not publication authority. A shared rule remains
blocked until at least ${report.familyBacklog.eligibilityThresholdExactModelReceipts}
exact-model canary receipts pass. This replay publishes no catalog or FitDecision data.
`;
}

async function main(argv) {
  const { storageRoot } = parseArgs(argv);
  const storageIdentity = await verifyEvidenceStorageRoot(storageRoot, {
    getVolumeUuid: mountedVolumeUuid,
  });
  const objectStore = createEvidenceObjectStore(storageIdentity.root);
  const originalBytes = await readFile(join(root, architectureV2Paths.pdfFailureBaseline100));
  const rerunBytes = await readFile(join(root, architectureV2Paths.pdfFailureBaselineWp7a));
  const rerunSha256 = sha256(rerunBytes);
  const expectedSha256 = (await readFile(
    join(root, architectureV2Paths.pdfFailureBaselineWp7aSha256),
    'utf8',
  )).trim().split(/\s+/)[0];
  if (rerunSha256 !== expectedSha256) throw new Error('WP7A rerun SHA-256 drift');

  const report = await buildPdfBaselineParserReplay({
    originalBaseline: JSON.parse(originalBytes),
    wp7aRerun: JSON.parse(rerunBytes),
    sourceRerunSha256: rerunSha256,
    builtOn: new Date().toISOString().slice(0, 10),
    loadObject: objectStore.readObject,
  });
  const serialized = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  const artifactSha256 = sha256(serialized);
  await atomicWrite(join(root, architectureV2Paths.pdfFailureBaselineWp8Replay), serialized);
  await atomicWrite(join(root, architectureV2Paths.pdfFailureBaselineWp8ReplaySha256),
    Buffer.from(`${artifactSha256}  pdf-failure-baseline-100-wp8-replay.json\n`));
  await atomicWrite(join(root, 'docs/architecture-v2/pdf-failure-baseline-100-wp8-replay.md'),
    Buffer.from(markdown(report, artifactSha256)));
  process.stdout.write(`${JSON.stringify({ artifactSha256, summary: report.summary,
    rankedForParserResearch: report.familyBacklog.rankedForParserResearch }, null, 2)}\n`);
}

await main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
