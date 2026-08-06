#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { buildHistoricalDocumentFamilyGraph } from '../../src/domain/historical-document-family-graph.mjs';
import { loadHistoricalRecoveryActiveRelease } from '../../src/domain/historical-recovery-active-release.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

async function readJson(key) {
  return JSON.parse(await readFile(resolveArchitectureV2Path(root, key), 'utf8'));
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export async function runCli(args = process.argv.slice(2)) {
  const [activeRecovery, dimensionKnowledge, legacyPdfAudit, classification] = await Promise.all([
    loadHistoricalRecoveryActiveRelease({ root }),
    readJson('dimensionExpressionObservations'),
    readJson('legacyPdfLibraryAudit'),
    readJson('historicalModelEvidenceClassification'),
  ]);
  const generatedAt = option(args, '--generated-at') ?? dimensionKnowledge.generatedAt;
  const graph = buildHistoricalDocumentFamilyGraph({
    generatedAt,
    historicalReference: activeRecovery.reference,
    dimensionKnowledge,
    legacyPdfAudit,
    classification,
  });
  const output = resolve(option(args, '--output')
    ?? resolveArchitectureV2Path(root, 'historicalDocumentFamilyGraph'));
  await atomicJson(output, graph);
  process.stdout.write(`${JSON.stringify({
    output,
    semanticGraphSha256: graph.semanticGraphSha256,
    summary: graph.summary,
  }, null, 2)}\n`);
  return graph;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
