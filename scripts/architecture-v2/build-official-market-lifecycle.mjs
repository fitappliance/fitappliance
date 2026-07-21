#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { buildOfficialMarketLifecycle } from '../../src/domain/official-market-lifecycle.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function readJsonWithHash(path) {
  const bytes = await readFile(path);
  return {
    document: JSON.parse(bytes),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export async function buildOfficialMarketLifecycleFromRepository({
  root = defaultRoot,
  publicProjectionPath = resolveArchitectureV2Path(root, 'publicProjection'),
  historicalReferencePath = resolveArchitectureV2Path(root, 'historicalApplianceReference'),
  output = resolveArchitectureV2Path(root, 'officialMarketLifecycle'),
} = {}) {
  const [publicProjection, historicalReference, officialIdentityEvidence, releasePolicy] = await Promise.all([
    readJsonWithHash(publicProjectionPath),
    readJsonWithHash(historicalReferencePath),
    readJsonWithHash(resolveArchitectureV2Path(root, 'retailerIdentityOfficialEvidence')),
    readJsonWithHash(resolveArchitectureV2Path(root, 'retailLifecycleReleasePolicy')),
  ]);
  const projection = buildOfficialMarketLifecycle({
    publicProjection: publicProjection.document,
    publicProjectionSha256: publicProjection.sha256,
    historicalReference: historicalReference.document,
    historicalReferenceSha256: historicalReference.sha256,
    officialIdentityEvidence: officialIdentityEvidence.document,
    officialIdentityEvidenceSha256: officialIdentityEvidence.sha256,
    asOf: releasePolicy.document.asOf,
  });
  await atomicJson(output, projection);
  return projection;
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

export async function runCli(args = process.argv.slice(2)) {
  const supported = ['--root', '--output', '--public-projection', '--historical-reference'];
  if (args.some((value, index) => index % 2 === 0 && !supported.includes(value))) {
    throw new TypeError('unknown official market lifecycle argument');
  }
  const root = resolve(option(args, '--root') ?? defaultRoot);
  const output = resolve(option(args, '--output') ?? resolveArchitectureV2Path(root, 'officialMarketLifecycle'));
  const publicProjectionPath = resolve(
    option(args, '--public-projection') ?? resolveArchitectureV2Path(root, 'publicProjection'),
  );
  const historicalReferencePath = resolve(
    option(args, '--historical-reference') ?? resolveArchitectureV2Path(root, 'historicalApplianceReference'),
  );
  const projection = await buildOfficialMarketLifecycleFromRepository({
    root,
    publicProjectionPath,
    historicalReferencePath,
    output,
  });
  process.stdout.write(`${JSON.stringify({
    output,
    projectionId: projection.projectionId,
    summary: projection.summary,
  }, null, 2)}\n`);
  return projection;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
