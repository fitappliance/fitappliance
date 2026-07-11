import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { constants } from 'node:fs';
import {
  access, copyFile, mkdir, readFile, rename, rm, stat, writeFile,
} from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildEvidenceObjectIndex,
  buildEvidenceObjectRecords,
} from '../../src/domain/evidence-object-store.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultSourceDirectory = resolve(repoRoot, 'tmp/pdfs/phase8');
const defaultIndexPath = resolveArchitectureV2Path(repoRoot, 'evidenceObjectIndex');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function pdfPageCount(path) {
  const { stdout } = await execFile('pdfinfo', [path]);
  const match = /^Pages:\s+(\d+)$/m.exec(stdout);
  if (!match) throw new Error(`could not read PDF page count: ${path}`);
  return Number(match[1]);
}

function resolveWithin(root, relativePath) {
  if (isAbsolute(relativePath)) throw new Error(`absolute evidence path rejected: ${relativePath}`);
  const normalizedRoot = resolve(root);
  const candidate = resolve(normalizedRoot, relativePath);
  if (candidate !== normalizedRoot && !candidate.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error(`evidence path escapes storage root: ${relativePath}`);
  }
  return candidate;
}

async function ensureImmutableCopy(source, target, expectedHash = null) {
  await mkdir(dirname(target), { recursive: true });
  try {
    await access(target, constants.F_OK);
    if (expectedHash && await sha256(target) !== expectedHash) {
      throw new Error(`existing evidence object has conflicting content: ${target}`);
    }
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const temporary = `${target}.tmp-${process.pid}`;
  await copyFile(source, temporary);
  if (expectedHash && await sha256(temporary) !== expectedHash) {
    await rm(temporary, { force: true });
    throw new Error(`copied evidence object hash mismatch: ${source}`);
  }
  await rename(temporary, target);
}

async function renderReviewPage(pdfPath, target, page) {
  try {
    const details = await stat(target);
    if (details.size < 8) throw new Error(`existing review render is empty: ${target}`);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(target), { recursive: true });
  const temporaryPrefix = `${target.slice(0, -4)}.tmp-${process.pid}`;
  const temporary = `${temporaryPrefix}.png`;
  try {
    await execFile('pdftoppm', [
      '-f', String(page), '-l', String(page), '-singlefile', '-png', '-r', '150',
      pdfPath, temporaryPrefix,
    ]);
    const details = await stat(temporary);
    if (details.size < 8) throw new Error(`review render is empty: ${target}`);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function importEvidenceObjects({
  storageRoot,
  sourceDirectory = defaultSourceDirectory,
  phase10SourceDirectory = resolve(storageRoot ?? '.', 'review-workspaces/phase-10/source'),
  indexPath = defaultIndexPath,
}) {
  if (!storageRoot) throw new TypeError('storage root required');
  await access(storageRoot, constants.W_OK);
  const dimensionReviews = (await readJson(resolveArchitectureV2Path(repoRoot, 'phase08DimensionInput'))).reviews;
  const spaceReviews = (await readJson(resolveArchitectureV2Path(repoRoot, 'phase09SpaceInput'))).reviews;
  const bundles = (await readJson(resolveArchitectureV2Path(repoRoot, 'evidenceReviewBundles'))).bundles;
  const phase10Acquisition = await readJson(resolveArchitectureV2Path(repoRoot, 'phase10Acquisition'));
  const phase10Candidates = await readJson(resolveArchitectureV2Path(repoRoot, 'phase10ReviewCandidates'));
  const fileFacts = new Map();

  for (const review of dimensionReviews) {
    const pdfPath = resolveWithin(sourceDirectory, `${review.id}.pdf`);
    const textPath = resolveWithin(sourceDirectory, `${review.id}.txt`);
    const actualHash = await sha256(pdfPath);
    if (actualHash !== review.hash) throw new Error(`source PDF hash mismatch for ${review.id}`);
    const actualPages = await pdfPageCount(pdfPath);
    if (actualPages !== review.pages) throw new Error(`source PDF page count mismatch for ${review.id}`);
    fileFacts.set(review.id, {
      byteSize: (await stat(pdfPath)).size,
      textSha256: await sha256(textPath),
      textByteSize: (await stat(textPath)).size,
    });
  }

  const records = buildEvidenceObjectRecords({ dimensionReviews, spaceReviews, bundles, fileFacts });
  const phase10CandidateByLegacy = new Map(phase10Candidates.documents.map((row) => [row.legacyRuntimeId, row]));
  for (const acquired of phase10Acquisition.entries.filter((row) => row.outcome === 'acquired')) {
    const pdfPath = resolveWithin(phase10SourceDirectory, `${acquired.legacyRuntimeId}.pdf`);
    const textPath = resolveWithin(phase10SourceDirectory, `${acquired.legacyRuntimeId}.txt`);
    const actualHash = await sha256(pdfPath);
    if (actualHash !== acquired.sha256) throw new Error(`Phase 10 source PDF hash mismatch for ${acquired.legacyRuntimeId}`);
    const actualPages = await pdfPageCount(pdfPath);
    if (actualPages !== acquired.pageCount) throw new Error(`Phase 10 source PDF page count mismatch for ${acquired.legacyRuntimeId}`);
    const candidate = phase10CandidateByLegacy.get(acquired.legacyRuntimeId);
    if (!candidate?.reviewPages?.length) throw new Error(`Phase 10 review pages missing for ${acquired.legacyRuntimeId}`);
    records.push({
      sha256: acquired.sha256,
      byteSize: (await stat(pdfPath)).size,
      textSha256: await sha256(textPath),
      textByteSize: (await stat(textPath)).size,
      pageCount: acquired.pageCount,
      sourceUrl: acquired.sourceUrl,
      legacyRuntimeId: acquired.legacyRuntimeId,
      canonicalProductId: acquired.canonicalProductId,
      reviewPages: candidate.reviewPages,
    });
  }
  const index = buildEvidenceObjectIndex(records);
  for (const document of index.documents) {
    const sourceId = document.productLinks[0].legacyRuntimeId;
    const phase10 = phase10CandidateByLegacy.has(sourceId);
    const sourceRoot = phase10 ? phase10SourceDirectory : sourceDirectory;
    const sourcePdf = resolveWithin(sourceRoot, `${sourceId}.pdf`);
    const sourceText = resolveWithin(sourceRoot, `${sourceId}.txt`);
    const targetPdf = resolveWithin(storageRoot, document.paths.pdf);
    const targetText = resolveWithin(storageRoot, document.paths.text);
    await access(sourceText, constants.R_OK);
    await ensureImmutableCopy(sourcePdf, targetPdf, document.sha256);
    await ensureImmutableCopy(sourceText, targetText, document.textSha256);
    for (const page of document.reviewPages) {
      const target = resolveWithin(storageRoot, `${document.paths.renderDirectory}/page-${String(page).padStart(4, '0')}.png`);
      await renderReviewPage(targetPdf, target, page);
    }
  }

  await mkdir(dirname(indexPath), { recursive: true });
  const temporaryIndex = `${indexPath}.tmp-${process.pid}`;
  await writeFile(temporaryIndex, `${JSON.stringify(index, null, 2)}\n`);
  await rename(temporaryIndex, indexPath);
  return index;
}

export async function verifyEvidenceObjects({ storageRoot, indexPath = defaultIndexPath }) {
  if (!storageRoot) throw new TypeError('storage root required');
  const index = await readJson(indexPath);
  for (const document of index.documents ?? []) {
    const pdfPath = resolveWithin(storageRoot, document.paths.pdf);
    const textPath = resolveWithin(storageRoot, document.paths.text);
    const details = await stat(pdfPath);
    if (details.size !== document.byteSize) throw new Error(`evidence object size mismatch: ${document.sha256}`);
    if (await sha256(pdfPath) !== document.sha256) throw new Error(`evidence object hash mismatch: ${document.sha256}`);
    if (await pdfPageCount(pdfPath) !== document.pageCount) throw new Error(`evidence object page count mismatch: ${document.sha256}`);
    const textDetails = await stat(textPath);
    if (textDetails.size !== document.textByteSize) throw new Error(`evidence text size mismatch: ${document.sha256}`);
    if (await sha256(textPath) !== document.textSha256) throw new Error(`evidence text hash mismatch: ${document.sha256}`);
    for (const page of document.reviewPages) {
      const renderPath = resolveWithin(storageRoot, `${document.paths.renderDirectory}/page-${String(page).padStart(4, '0')}.png`);
      if ((await stat(renderPath)).size < 8) throw new Error(`review render is empty: ${renderPath}`);
    }
  }
  return index.summary;
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(args) {
  const storageRoot = optionValue(args, '--storage-root') ?? process.env.FITAPPLIANCE_STORAGE_ROOT;
  const sourceDirectory = optionValue(args, '--source-dir') ?? defaultSourceDirectory;
  const phase10SourceDirectory = optionValue(args, '--phase10-source-dir')
    ?? resolve(storageRoot ?? '.', 'review-workspaces/phase-10/source');
  const indexPath = optionValue(args, '--index') ?? defaultIndexPath;
  const result = args.includes('--verify-only')
    ? await verifyEvidenceObjects({ storageRoot, indexPath })
    : (await importEvidenceObjects({ storageRoot, sourceDirectory, phase10SourceDirectory, indexPath })).summary;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
