#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildBrandValidationManifest,
  buildBrandValidationRows,
  serializeBrandValidationCsv,
  sha256Text,
} from '../../src/domain/brand-validation-sample.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sourceKeys = [
  'installationKnowledgePilot',
  'canonicalRegistry',
  'publicProjection',
  'sourceDocuments',
];

const sources = await Promise.all(sourceKeys.map(async (key) => {
  const path = resolveArchitectureV2Path(root, key);
  const bytes = await readFile(path);
  return {
    key,
    path,
    relativePath: relative(root, path),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    value: JSON.parse(bytes),
  };
}));
const sourceByKey = new Map(sources.map((source) => [source.key, source]));

const rows = buildBrandValidationRows({
  pilot: sourceByKey.get('installationKnowledgePilot').value,
  canonicalRegistry: sourceByKey.get('canonicalRegistry').value,
  publicProjection: sourceByKey.get('publicProjection').value,
  sourceDocuments: sourceByKey.get('sourceDocuments').value,
});
const csv = serializeBrandValidationCsv(rows);
const csvPath = resolveArchitectureV2Path(root, 'brandValidationSampleCsv');
const manifestPath = resolveArchitectureV2Path(root, 'brandValidationSampleManifest');
const manifestSha256Path = resolveArchitectureV2Path(root, 'brandValidationSampleManifestSha256');
const manifest = buildBrandValidationManifest({
  rows,
  csv,
  csvPath: relative(root, csvPath),
  sourceFiles: sources.map((source) => ({ path: source.relativePath, sha256: source.sha256 })),
});
const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;

await Promise.all([
  mkdir(dirname(csvPath), { recursive: true }),
  mkdir(dirname(manifestPath), { recursive: true }),
]);
await Promise.all([
  writeFile(csvPath, csv),
  writeFile(manifestPath, manifestJson),
  writeFile(manifestSha256Path, `${sha256Text(manifestJson)}  ${relative(dirname(manifestSha256Path), manifestPath)}\n`),
]);

console.log(JSON.stringify({
  ...manifest.summary,
  csvSha256: manifest.csv.sha256,
  manifestSha256: sha256Text(manifestJson),
}));
