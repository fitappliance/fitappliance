#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { createEvidenceObjectStore, verifyEvidenceStorageRoot } from '../../src/domain/evidence-recovery-state-store.mjs';
import { runMineruPdfToJson } from '../../src/domain/mineru-runner.mjs';
import { acquireOfficialIdentityEvidence } from '../../src/domain/official-identity-evidence.mjs';
import { fetchOfficialArtifactResilient } from '../../src/domain/official-artifact-transport.mjs';

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

async function mountedVolumeUuid(path) {
  const { stdout: dfOutput } = await execFile('df', ['-P', path], { timeout: 10_000 });
  const device = dfOutput.trim().split('\n').at(-1)?.trim().split(/\s+/)[0];
  if (!device) throw new Error('df did not report the official identity evidence storage device');
  const { stdout } = await execFile('diskutil', ['info', device], { timeout: 10_000 });
  const value = /^\s*Volume UUID:\s*(\S+)\s*$/im.exec(stdout)?.[1];
  if (!value) throw new Error('diskutil did not report the official identity evidence volume UUID');
  return value;
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

export async function acquireFromRepository({
  root = repoRoot,
  storageRoot,
  acquiredAt = new Date().toISOString(),
  fetchArtifact = null,
  processPdf = null,
  objectStore = null,
}) {
  const seedsDocument = JSON.parse(await readFile(
    resolveArchitectureV2Path(root, 'retailerIdentityOfficialEvidenceSeeds'),
    'utf8',
  ));
  const store = objectStore ?? createEvidenceObjectStore(storageRoot);
  return acquireOfficialIdentityEvidence({
    seedsDocument,
    acquiredAt,
    fetchArtifact: fetchArtifact ?? ((seed) => fetchOfficialArtifactResilient(
      seed.sourceUrl,
      seed.brand,
      {
        expectedModel: seed.model,
        expectedCategory: seed.category,
        allowCurlFallback: true,
        allowScraplingFallback: true,
      },
    )),
    processPdf: processPdf ?? ((bytes) => runMineruPdfToJson(bytes, { storageRoot })),
    writeObject: store.writeObject,
  });
}

export async function runCli(args = process.argv.slice(2), environment = process.env) {
  const storageRoot = resolve(required(
    args.includes('--storage-root') ? args[args.indexOf('--storage-root') + 1] : environment.FITAPPLIANCE_STORAGE_ROOT,
    '--storage-root or FITAPPLIANCE_STORAGE_ROOT',
  ));
  const acquiredAt = args.includes('--acquired-at')
    ? required(args[args.indexOf('--acquired-at') + 1], '--acquired-at')
    : new Date().toISOString();
  await verifyEvidenceStorageRoot(storageRoot, { getVolumeUuid: mountedVolumeUuid });
  const manifest = await acquireFromRepository({ storageRoot, acquiredAt });
  const output = resolveArchitectureV2Path(repoRoot, 'retailerIdentityOfficialEvidence');
  await atomicJson(output, manifest);
  process.stdout.write(`${JSON.stringify({ output, ...manifest.summary }, null, 2)}\n`);
  return manifest;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli();
}
