#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadHistoricalRecoveryActiveRelease } from '../../src/domain/historical-recovery-active-release.mjs';

import {
  buildDimensionExpressionKnowledge,
  renderDimensionExpressionKnowledgeMarkdown,
} from '../../src/domain/dimension-expression-knowledge.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DEFAULT_JSON = join(ROOT, 'data/architecture-v2/generated/dimension-expression-observations.json');
const DEFAULT_MARKDOWN = join(ROOT, 'docs/architecture-v2/appliance-dimension-expression-knowledge-base.md');

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function normalizedText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function identityKey(value) {
  return `${normalizedText(value.category)}\0${normalizedText(value.brand).toLowerCase()}\0${normalizedText(value.model).toLowerCase()}`;
}

function uniqueIdentities(values) {
  return [...new Map(values.filter((value) => (
    value?.category && value?.brand && value?.model
  )).map((value) => [identityKey(value), {
    category: normalizedText(value.category),
    brand: normalizedText(value.brand),
    model: normalizedText(value.model),
  }])).values()].sort((left, right) => identityKey(left).localeCompare(identityKey(right)));
}

async function readJson(path) {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

async function atomicWrite(path, bytes) {
  await fs.mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await fs.writeFile(temporary, bytes);
  await fs.rename(temporary, path);
}

function safeStoragePath(storageRoot, relativePath) {
  const root = resolve(storageRoot);
  const candidate = resolve(root, relativePath);
  if (!candidate.startsWith(`${root}${sep}`)) throw new TypeError('evidence path escapes storage root');
  return candidate;
}

async function existingPath(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isFile()) return candidate;
    } catch {
      // Try the next content-addressed layout.
    }
  }
  return null;
}

async function walkFiles(root, fileName) {
  const result = [];
  async function visit(path) {
    let entries;
    try { entries = await fs.readdir(path, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile() && entry.name === fileName) result.push(child);
    }
  }
  await visit(root);
  return result.sort();
}

function addMetadata(map, pdfSha256, value) {
  const current = map.get(pdfSha256) ?? { sourceUrls: [], identities: [], objectPaths: [] };
  current.sourceUrls.push(...(value.sourceUrls ?? []).filter(Boolean));
  current.identities.push(...(value.identities ?? []));
  current.objectPaths.push(...(value.objectPaths ?? []).filter(Boolean));
  map.set(pdfSha256, current);
}

function productIdentityMaps(products, historicalRecords) {
  const byProductId = new Map();
  for (const product of products) {
    const identity = { category: product.cat, brand: product.brand, model: product.model };
    if (product.id) byProductId.set(product.id, identity);
    if (product.canonicalProductId) byProductId.set(product.canonicalProductId, identity);
  }
  for (const record of historicalRecords) {
    const identity = { category: record.category, brand: record.brand, model: record.model };
    for (const productId of record.catalogProductIds ?? []) {
      if (!byProductId.has(productId)) byProductId.set(productId, identity);
    }
  }
  return byProductId;
}

async function trackedObjectMetadata({ evidenceIndex, productById }) {
  const result = new Map();
  for (const document of evidenceIndex.documents ?? []) {
    const identities = [];
    for (const link of document.productLinks ?? []) {
      identities.push(productById.get(link.canonicalProductId), productById.get(link.legacyRuntimeId));
    }
    addMetadata(result, document.sha256, {
      sourceUrls: document.sourceUrls,
      identities: identities.filter(Boolean),
      objectPaths: [document.paths?.pdf],
    });
  }
  return result;
}

async function recoveryStateMetadata({ storageRoot }) {
  const result = new Map();
  const states = await walkFiles(join(storageRoot, 'runs/historical-evidence-recovery'), 'state.json');
  for (const statePath of states) {
    const state = await readJson(statePath);
    const targetById = new Map();
    for (const [targetId, targetState] of Object.entries(state.targets ?? {})) {
      const identity = targetState?.outcome?.candidateInventory?.identity;
      if (identity?.brand && identity?.model && identity?.category) targetById.set(targetId, identity);
    }
    const batchPath = join(dirname(statePath), 'batch.json');
    try {
      const batch = await readJson(batchPath);
      for (const target of batch.targets ?? []) {
        targetById.set(target.targetId, { category: target.category, brand: target.brand, model: target.model });
      }
    } catch {
      // Older diagnostic runs may not retain an input slice.
    }
    for (const artifact of Object.values(state.artifacts ?? {})) {
      const record = artifact?.artifactRecord;
      if (!record?.contentSha256) continue;
      const identities = (artifact.job?.targetIds ?? []).map((targetId) => targetById.get(targetId)).filter(Boolean);
      addMetadata(result, record.contentSha256, {
        sourceUrls: [record.sourceUrl, record.requestedUrl, record.finalUrl],
        identities,
        objectPaths: [record.objectPath],
      });
    }
  }
  return result;
}

function mergeMetadata(...maps) {
  const result = new Map();
  for (const map of maps) {
    for (const [hash, value] of map) addMetadata(result, hash, value);
  }
  for (const value of result.values()) {
    value.sourceUrls = [...new Set(value.sourceUrls.filter(Boolean))].sort();
    value.identities = uniqueIdentities(value.identities);
    value.objectPaths = [...new Set(value.objectPaths.filter(Boolean))].sort();
  }
  return result;
}

async function verifyPdf(storageRoot, pdfSha256, objectPaths) {
  const candidates = [
    ...objectPaths.map((path) => safeStoragePath(storageRoot, path)),
    join(storageRoot, `evidence/objects/sha256/${pdfSha256.slice(0, 2)}/${pdfSha256}.pdf`),
    join(storageRoot, `evidence/web/sha256/${pdfSha256.slice(0, 2)}/${pdfSha256.slice(2, 4)}/${pdfSha256}.pdf`),
  ];
  const path = await existingPath(candidates);
  if (!path) return null;
  const bytes = await fs.readFile(path);
  if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error(`source PDF magic invalid for ${pdfSha256}`);
  if (sha256(bytes) !== pdfSha256) throw new Error(`source PDF hash mismatch for ${pdfSha256}`);
  return path;
}

export async function loadMineruDocuments({ storageRoot, metadata }) {
  const indexRoot = join(storageRoot, 'cache/mineru-index');
  const names = (await fs.readdir(indexRoot)).filter((name) => name.endsWith('.json')).sort();
  const documents = [];
  const invalidDocuments = [];
  for (const name of names) {
    const index = await readJson(join(indexRoot, name));
    const pdfSha256 = normalizedText(index.sourcePdfSha256).toLowerCase();
    if (`${pdfSha256}.json` !== name) throw new Error(`MinerU index filename mismatch: ${name}`);
    if (index.derivedArtifact?.sourcePdfSha256 !== pdfSha256) throw new Error(`MinerU source binding mismatch: ${name}`);
    const derived = index.derivedArtifact;
    const contentPath = safeStoragePath(storageRoot, derived.objectPath);
    const contentBytes = await fs.readFile(contentPath);
    if (sha256(contentBytes) !== derived.contentSha256) throw new Error(`MinerU content hash mismatch: ${name}`);
    const contentList = JSON.parse(contentBytes);
    const source = metadata.get(pdfSha256) ?? { sourceUrls: [], identities: [], objectPaths: [] };
    const mineruObject = {
      schemaVersion: Number.isInteger(derived.schemaVersion) ? derived.schemaVersion : 1,
      format: derived.format ?? 'content_list_v2',
      parserName: derived.parserName ?? 'MinerU',
      parserVersion: derived.parserVersion ?? index.parserVersion ?? null,
      modelRevision: derived.modelRevision ?? index.modelRevision ?? null,
      sourcePdfSha256: pdfSha256,
      contentSha256: derived.contentSha256,
      objectPath: derived.objectPath,
      byteSize: Number.isInteger(derived.byteSize) ? derived.byteSize : contentBytes.length,
      pageCount: Number.isInteger(derived.pageCount) ? derived.pageCount : null,
    };
    const sourcePdfPath = await verifyPdf(storageRoot, pdfSha256, source.objectPaths);
    const mappingStatus = source.identities.length ? 'MAPPED_TARGET_IDENTITY' : 'UNMAPPED_SOURCE_PDF';
    if (!sourcePdfPath) {
      invalidDocuments.push({
        indexFile: name,
        pdfSha256,
        contentSha256: derived.contentSha256,
        reason: 'ORPHANED_SOURCE_PDF',
        mappingStatus,
        sourceUrls: source.sourceUrls,
        identities: source.identities,
        parserVersion: index.parserVersion,
        modelRevision: index.modelRevision,
        mineruObject,
      });
      continue;
    }
    documents.push({
      pdfSha256,
      contentSha256: derived.contentSha256,
      parserVersion: index.parserVersion,
      modelRevision: index.modelRevision,
      mappingStatus,
      sourceUrls: source.sourceUrls,
      identities: source.identities,
      mineruObject,
      contentList,
    });
  }
  if (documents.length + invalidDocuments.length !== names.length) {
    throw new Error('MinerU index accounting invariant failed');
  }
  return { totalIndexes: names.length, documents, invalidDocuments };
}

export async function main(args = process.argv.slice(2), environment = process.env) {
  const storageRoot = resolve(option(args, '--storage-root') ?? environment.FITAPPLIANCE_STORAGE_ROOT ?? '');
  if (!storageRoot || storageRoot === resolve('')) throw new TypeError('--storage-root or FITAPPLIANCE_STORAGE_ROOT required');
  const explicitGeneratedAt = option(args, '--generated-at');
  const useReferenceTimestamp = args.includes('--generated-at-from-reference');
  if (explicitGeneratedAt && useReferenceTimestamp) {
    throw new TypeError('choose either --generated-at or --generated-at-from-reference');
  }
  const activeRecovery = await loadHistoricalRecoveryActiveRelease({ root: ROOT });
  const historical = activeRecovery.reference;
  const generatedAt = explicitGeneratedAt ?? (useReferenceTimestamp ? historical.generatedAt : null);
  if (!generatedAt) throw new TypeError('--generated-at is required for deterministic output');
  const outputJson = resolve(option(args, '--output-json') ?? DEFAULT_JSON);
  const outputMarkdown = resolve(option(args, '--output-markdown') ?? DEFAULT_MARKDOWN);

  const [publicCatalog, evidenceIndex, brandCanon] = await Promise.all([
    Promise.resolve(activeRecovery.catalog),
    readJson(join(ROOT, 'data/architecture-v2/generated/evidence-object-index.json')),
    readJson(join(ROOT, 'data/brand-canon.json')),
  ]);
  const productById = productIdentityMaps(publicCatalog.products, historical.records);
  const tracked = await trackedObjectMetadata({ evidenceIndex, productById });
  const recovery = await recoveryStateMetadata({ storageRoot });
  const metadata = mergeMetadata(tracked, recovery);
  const loaded = await loadMineruDocuments({ storageRoot, metadata });
  const knowledge = buildDimensionExpressionKnowledge({
    generatedAt,
    historicalRecords: historical.records,
    documents: loaded.documents,
    invalidDocuments: loaded.invalidDocuments,
    brandAliasMap: brandCanon.policies?.alias_map ?? {},
  });
  if (knowledge.summary.mineruDocuments !== loaded.totalIndexes) {
    throw new Error('knowledge-base MinerU accounting invariant failed');
  }
  await atomicWrite(outputJson, `${JSON.stringify(knowledge, null, 2)}\n`);
  await atomicWrite(outputMarkdown, renderDimensionExpressionKnowledgeMarkdown(knowledge));
  process.stdout.write(`${JSON.stringify({
    outputJson,
    outputMarkdown,
    summary: knowledge.summary,
  }, null, 2)}\n`);
  return knowledge;
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
