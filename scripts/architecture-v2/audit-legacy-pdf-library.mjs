#!/usr/bin/env node

import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { buildLegacyPdfLibraryAudit } from '../../src/domain/legacy-pdf-library-audit.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readLegacySummaries(directory) {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(names.map(async (name) => ({
    relativePath: relative(root, resolve(directory, name)).split(sep).join('/'),
    data: await readJson(resolve(directory, name)),
  })));
}

function extractionState(expressions, hasResearchGaps) {
  if (!expressions.length) return hasResearchGaps ? 'PARSER_GAP' : 'NO_DIMENSION_EXPRESSION';
  const safeAxes = new Set(expressions.flatMap((entry) => entry.safeAxes ?? []));
  if (['width', 'height', 'depth'].every((axis) => safeAxes.has(axis))) {
    const hasRange = expressions.some((entry) => /(?:minimum|maximum|range|–|\bto\b)/i.test(
      `${entry.sourceLabel ?? ''} ${entry.sourceValue ?? ''}`,
    ));
    return hasRange ? 'ALL_AXIS_RANGE' : 'ALL_AXIS_SCALAR';
  }
  return safeAxes.size > 0 ? 'PARTIAL_AXIS' : 'PARSER_GAP';
}

function identityScope(expression) {
  if (expression.modelBinding === 'SAME_PAGE_EXACT_MODEL') return 'PAGE_SCOPED_EXACT';
  if (expression.modelBinding === 'DOCUMENT_EXACT_MODEL') return 'EXACT_MODEL';
  if ((expression.boundModels ?? []).length > 0) return 'DOCUMENT_FAMILY';
  return 'UNPROVEN';
}

function grammarDocumentsFromKnowledge(knowledge) {
  const byHash = new Map();
  for (const category of knowledge.categories ?? []) {
    for (const brand of category.brands ?? []) {
      for (const family of brand.families ?? []) {
        const expressionsByHash = new Map();
        for (const expression of family.expressions ?? []) {
          if (!expressionsByHash.has(expression.pdfSha256)) expressionsByHash.set(expression.pdfSha256, []);
          expressionsByHash.get(expression.pdfSha256).push(expression);
        }
        const gapHashes = new Set((family.researchGaps ?? []).map((entry) => entry.pdfSha256));
        for (const hash of family.pdfSha256s ?? []) {
          const expressions = expressionsByHash.get(hash) ?? [];
          const parserReplays = (family.parserReplays ?? []).filter((entry) => entry.pdfSha256 === hash);
          const syntaxExtractionState = extractionState(expressions, gapHashes.has(hash));
          const current = byHash.get(hash) ?? {
            sourcePdfSha256: hash,
            extractionStates: [],
            grammarProfileIds: [],
            modelLinks: [],
          };
          current.extractionStates.push(...(parserReplays.length
            ? parserReplays.map((entry) => entry.extractionState)
            : [syntaxExtractionState]));
          current.grammarProfileIds.push(...(family.parserProfileIds ?? []));
          const replayKeys = new Set(parserReplays.map((entry) => (
            `${entry.category}\0${entry.brand.toLowerCase()}\0${entry.model.toLowerCase()}`
          )));
          for (const replay of parserReplays) current.modelLinks.push({
            category: replay.category,
            brand: replay.brand,
            model: replay.model,
            identityScope: replay.identityScope,
            extractionState: replay.extractionState,
          });
          for (const expression of expressions) {
            for (const identity of expression.identities ?? []) {
              const key = `${identity.category ?? category.category}\0${String(identity.brand ?? brand.canonicalBrand).toLowerCase()}\0${String(identity.model).toLowerCase()}`;
              if (replayKeys.has(key)) continue;
              current.modelLinks.push({
                category: identity.category ?? category.category,
                brand: identity.brand ?? brand.canonicalBrand,
                model: identity.model,
                identityScope: identityScope(expression),
                extractionState: syntaxExtractionState,
              });
            }
          }
          if (!expressions.length) {
            for (const model of family.models ?? []) {
              const key = `${category.category}\0${brand.canonicalBrand.toLowerCase()}\0${String(model).toLowerCase()}`;
              if (replayKeys.has(key)) continue;
              current.modelLinks.push({
                category: category.category,
                brand: brand.canonicalBrand,
                model,
                identityScope: 'DOCUMENT_FAMILY',
                extractionState: syntaxExtractionState,
              });
            }
          }
          byHash.set(hash, current);
        }
      }
    }
  }
  const rank = ['ALL_AXIS_SCALAR', 'ALL_AXIS_RANGE', 'PARTIAL_AXIS', 'PARSER_GAP', 'NO_DIMENSION_EXPRESSION', 'NOT_PARSED'];
  return [...byHash.values()].map((entry) => ({
    sourcePdfSha256: entry.sourcePdfSha256,
    extractionState: [...entry.extractionStates].sort((left, right) => rank.indexOf(left) - rank.indexOf(right))[0],
    grammarProfileIds: [...new Set(entry.grammarProfileIds)].sort(),
    modelLinks: entry.modelLinks,
  })).sort((left, right) => left.sourcePdfSha256.localeCompare(right.sourcePdfSha256));
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

async function main(args) {
  const outputPath = resolve(option(args, '--output') ?? resolveArchitectureV2Path(root, 'legacyPdfLibraryAudit'));
  const generatedAt = option(args, '--generated-at') ?? new Date().toISOString();
  const [baseline, historicalReference, sourceDocumentArtifact, knowledge, acceptanceBundle, legacySummaries] = await Promise.all([
    readJson(resolveArchitectureV2Path(root, 'historicalModelPdfBaseline')),
    readJson(resolveArchitectureV2Path(root, 'historicalApplianceReference')),
    readJson(resolveArchitectureV2Path(root, 'sourceDocuments')),
    readJson(resolve(root, 'data/architecture-v2/generated/dimension-expression-observations.json')),
    readJson(resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryAcceptanceBundle')),
    readLegacySummaries(resolve(root, 'data/pdf-evidence-raw')),
  ]);
  const audit = buildLegacyPdfLibraryAudit({
    generatedAt,
    historicalRecords: historicalReference.records,
    legacySummaries,
    sourceDocuments: sourceDocumentArtifact.documents,
    pdfInventory: {
      entries: baseline.semantic.pdfDocuments,
      invalidFiles: baseline.semantic.invalidPdfFiles,
    },
    mineruIndexes: baseline.semantic.mineruIndexes,
    grammarDocuments: grammarDocumentsFromKnowledge(knowledge),
    receiptEntries: acceptanceBundle.entries,
  });
  await atomicWrite(outputPath, audit);
  process.stdout.write(`${JSON.stringify({
    output: relative(root, outputPath).split(sep).join('/'),
    summary: audit.summary,
    duplicateLegacyModelKeys: audit.duplicateLegacyModelKeys.length,
  }, null, 2)}\n`);
}

await main(process.argv.slice(2));
