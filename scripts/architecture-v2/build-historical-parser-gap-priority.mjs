#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  buildHistoricalParserGapPriority,
  validateHistoricalParserGapPriority,
} from '../../src/domain/historical-parser-gap-priority.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultFixtureCorpora = [
  'electrolux-washer-total-depth-v1.json',
  'lg-dryer-dimension-diagram-v1.json',
].map((name) => resolve(root, 'tests/fixtures/architecture-v2/historical-parser-gaps', name));

function option(args, name) {
  const matches = args.flatMap((raw, index) => {
    if (raw === name) return [{ value: args[index + 1], consumesNext: true }];
    if (raw.startsWith(`${name}=`)) return [{ value: raw.slice(name.length + 1), consumesNext: false }];
    return [];
  });
  if (matches.length > 1) throw new TypeError(`${name} may be provided only once`);
  if (!matches.length) return null;
  const value = String(matches[0].value ?? '').trim();
  if (!value || (matches[0].consumesNext && value.startsWith('--'))) {
    throw new TypeError(`${name} requires a value`);
  }
  return value;
}

function validateArgs(args) {
  const supported = new Set(['--output', '--fixture-corpus', '--generated-at']);
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index];
    const flag = raw.split('=', 1)[0];
    if (!supported.has(flag)) throw new TypeError(`unknown argument: ${raw}`);
    if (!raw.includes('=')) index += 1;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readFixtureCorpora(paths) {
  const corpora = await Promise.all(paths.map(readJson));
  return {
    schemaVersion: 1,
    profiles: corpora.flatMap((corpus) => {
      if (corpus?.schemaVersion !== 1 || !Array.isArray(corpus.profiles)) {
        throw new TypeError('historical parser fixture corpus schema v1 required');
      }
      return corpus.profiles;
    }),
  };
}

function latestTimestamp(values) {
  const dates = values.map((value) => new Date(value));
  if (dates.some((date) => Number.isNaN(date.valueOf()))) {
    throw new TypeError('parser priority input timestamp invalid');
  }
  return new Date(Math.max(...dates.map((date) => date.valueOf()))).toISOString();
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export async function runCli(args = process.argv.slice(2)) {
  validateArgs(args);
  const output = resolve(option(args, '--output')
    ?? resolveArchitectureV2Path(root, 'historicalParserGapPriority'));
  const explicitFixturePath = option(args, '--fixture-corpus');
  const fixturePaths = explicitFixturePath ? [resolve(explicitFixturePath)] : defaultFixtureCorpora;
  const [dimensionKnowledge, documentGraph, classification, fixtureCorpus] = await Promise.all([
    readJson(resolveArchitectureV2Path(root, 'dimensionExpressionObservations')),
    readJson(resolveArchitectureV2Path(root, 'historicalDocumentFamilyGraph')),
    readJson(resolveArchitectureV2Path(root, 'historicalModelEvidenceClassification')),
    readFixtureCorpora(fixturePaths),
  ]);
  const priority = buildHistoricalParserGapPriority({
    generatedAt: option(args, '--generated-at') ?? latestTimestamp([
      dimensionKnowledge.generatedAt,
      documentGraph.generatedAt,
      classification.generatedAt,
    ]),
    dimensionKnowledge,
    documentGraph,
    classification,
    fixtureCorpus,
  });
  validateHistoricalParserGapPriority(priority);
  await atomicJson(output, priority);
  process.stdout.write(`${JSON.stringify({
    output,
    semanticQueueSha256: priority.semanticQueueSha256,
    selectedFamilyId: priority.selectedFamilyId,
    summary: priority.summary,
  }, null, 2)}\n`);
  return priority;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
