#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  buildHistoricalEvidenceProgramStatus,
  renderHistoricalEvidenceProgramStatusMarkdown,
} from '../../src/domain/historical-evidence-program-status.mjs';

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

async function atomicText(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, value, { flag: 'wx' });
  await rename(temporary, path);
}

function latestGeneratedAt(artifacts) {
  const values = artifacts
    .map((artifact) => new Date(artifact?.generatedAt).valueOf())
    .filter(Number.isFinite);
  if (!values.length) throw new TypeError('at least one input generatedAt required');
  return new Date(Math.max(...values)).toISOString();
}

export async function runCli(args = process.argv.slice(2)) {
  const [
    classification,
    knowledge,
    documentGraph,
    acquisitionQueue,
    executableQueue,
    acceptanceBundle,
    attemptLedger,
    targetState,
    mineruBackfillAudit,
    receiptReplayAudit,
    replacementAudit,
    fitPublicationAudit,
  ] = await Promise.all([
    readJson('historicalModelEvidenceClassification'),
    readJson('dimensionExpressionObservations'),
    readJson('historicalDocumentFamilyGraph'),
    readJson('historicalModelPdfAcquisitionQueue'),
    readJson('historicalExecutableEvidenceRecoveryQueue'),
    readJson('historicalEvidenceRecoveryAcceptanceBundle'),
    readJson('historicalEvidenceRecoveryAttemptLedger'),
    readJson('historicalEvidenceTargetState'),
    readJson('historicalMineruBackfillAudit'),
    readJson('historicalAcceptanceReceiptReplayAudit'),
    readJson('historicalReplacementAudit'),
    readJson('fitPublicationAudit'),
  ]);
  const artifacts = [
    classification,
    knowledge,
    documentGraph,
    acquisitionQueue,
    executableQueue,
    acceptanceBundle,
    attemptLedger,
    targetState,
    mineruBackfillAudit,
    receiptReplayAudit,
    replacementAudit,
    fitPublicationAudit,
  ];
  const generatedAt = option(args, '--generated-at') ?? latestGeneratedAt(artifacts);
  const status = buildHistoricalEvidenceProgramStatus({
    generatedAt,
    classification,
    knowledge,
    documentGraph,
    acquisitionQueue,
    executableQueue,
    acceptanceBundle,
    attemptLedger,
    targetState,
    mineruBackfillAudit,
    receiptReplayAudit,
    replacementAudit,
    fitPublicationAudit,
  });
  const output = resolve(option(args, '--output')
    ?? resolveArchitectureV2Path(root, 'historicalEvidenceProgramStatus'));
  const markdownOutput = resolve(option(args, '--markdown-output')
    ?? resolve(root, 'docs/architecture-v2/historical-evidence-program-status.md'));
  await atomicText(output, `${JSON.stringify(status, null, 2)}\n`);
  await atomicText(markdownOutput, renderHistoricalEvidenceProgramStatusMarkdown(status));
  process.stdout.write(`${JSON.stringify({
    output,
    markdownOutput,
    historicalModelReferences: status.inventory.historicalModelReferences,
    metrics: status.metrics.length,
    diagnostics: status.diagnostics.length,
  }, null, 2)}\n`);
  return status;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
