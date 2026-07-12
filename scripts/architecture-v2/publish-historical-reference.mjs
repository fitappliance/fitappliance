#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  HISTORICAL_REFERENCE_PUBLIC_FILES,
  buildHistoricalReferencePublication,
  serializeHistoricalReferenceDocument,
} from '../../src/domain/historical-reference-publication.mjs';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function attributionFromSnapshots(snapshotsDocument) {
  const metadata = snapshotsDocument?.snapshots?.find((snapshot) => (
    snapshot?.manifest?.sourceId === 'energy-rating:metadata'
  ));
  const manifest = metadata?.manifest;
  const licence = manifest?.licence;
  if (!manifest || !licence || licence.permitsRepositoryDerivatives !== true) {
    throw new TypeError('Energy Rating metadata snapshot with derivative licence is required');
  }
  return {
    sourceName: 'Australian Government Energy Rating dataset',
    sourceUrl: manifest.sourceUrl,
    licenceId: licence.id,
    licenceName: licence.name,
    licenceUrl: licence.url,
    attribution: licence.attribution,
  };
}

async function atomicWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, bytes);
  const written = await readFile(temporaryPath);
  if (sha256(written) !== sha256(bytes)) throw new Error(`temporary publication hash mismatch: ${path}`);
  await rename(temporaryPath, path);
}

export async function publishHistoricalReference({ repoRoot }) {
  const referencePath = resolveArchitectureV2Path(repoRoot, 'historicalApplianceReference');
  const snapshotsPath = resolveArchitectureV2Path(repoRoot, 'officialRegistrySnapshots');
  const manifestPath = resolveArchitectureV2Path(repoRoot, 'historicalReferencePublicationManifest');
  const [reference, snapshotsDocument] = await Promise.all([
    readFile(referencePath, 'utf8').then(JSON.parse),
    readFile(snapshotsPath, 'utf8').then(JSON.parse),
  ]);
  const publication = buildHistoricalReferencePublication(reference, {
    attribution: attributionFromSnapshots(snapshotsDocument),
  });
  const publicDirectory = resolve(repoRoot, 'public/data/replacement-reference');

  for (const category of Object.keys(HISTORICAL_REFERENCE_PUBLIC_FILES)) {
    const bytes = serializeHistoricalReferenceDocument(publication.documents[category]);
    const expected = publication.manifest.files[category];
    if (sha256(bytes) !== expected.contentSha256 || Buffer.byteLength(bytes) !== expected.byteLength) {
      throw new Error(`publication manifest mismatch for ${category}`);
    }
    await atomicWrite(resolve(publicDirectory, HISTORICAL_REFERENCE_PUBLIC_FILES[category]), bytes);
  }

  const metaBytes = `${JSON.stringify(publication.meta)}\n`;
  const manifest = {
    ...publication.manifest,
    meta: {
      path: 'public/data/replacement-reference/meta.json',
      url: '/data/replacement-reference/meta.json',
      byteLength: Buffer.byteLength(metaBytes),
      contentSha256: sha256(metaBytes),
    },
  };
  await atomicWrite(resolve(publicDirectory, 'meta.json'), metaBytes);
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { publication, manifest };
}

export async function runCli() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const { manifest } = await publishHistoricalReference({ repoRoot });
  process.stdout.write(`${JSON.stringify({
    generatedAt: manifest.generatedAt,
    files: manifest.files,
    meta: manifest.meta,
  }, null, 2)}\n`);
  return manifest;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli();
}
