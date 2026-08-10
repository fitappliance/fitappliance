import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadActiveRetailRelease } from '../../src/domain/active-retail-release.mjs';
import { buildFitV4UniverseReconciliation } from '../../src/domain/fit-v4-universe-reconciliation.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultOutput = 'data/architecture-v2/reviews/automated/fit-v4-universe-reconciliation.json';

export async function buildRealFitV4UniverseReconciliation({
  root = repoRoot,
  outputPath = resolve(root, defaultOutput),
} = {}) {
  const active = await loadActiveRetailRelease({ root });
  const artifact = buildFitV4UniverseReconciliation({
    releaseBinding: {
      releaseCandidateId: active.descriptor.releaseCandidateId,
      activatedAt: active.descriptor.activatedAt,
      catalogSha256: active.descriptor.artifacts.publicProjection.sha256,
      historicalReferenceSha256: active.descriptor.artifacts.historicalReference.sha256,
    },
    catalogDocument: active.catalog,
    historicalReferenceDocument: active.reference,
    explicitMappings: [],
    rightsDispositions: [],
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  return artifact;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const artifact = await buildRealFitV4UniverseReconciliation();
  process.stdout.write(`${JSON.stringify({
    output: defaultOutput,
    summary: artifact.summary,
    semanticSha256: artifact.semanticSha256,
  }, null, 2)}\n`);
}
