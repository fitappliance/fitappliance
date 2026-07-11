#!/usr/bin/env node
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findEvidenceReviewCandidates } from '../../src/domain/evidence-review-candidates.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function resolveWithin(root, relativePath) {
  if (isAbsolute(relativePath)) throw new Error(`absolute review path rejected: ${relativePath}`);
  const normalizedRoot = resolve(root);
  const candidate = resolve(normalizedRoot, relativePath);
  if (!candidate.startsWith(`${normalizedRoot}${sep}`)) throw new Error(`review path escapes storage root: ${relativePath}`);
  return candidate;
}

async function renderPage(pdfPath, outputPath, page) {
  await mkdir(dirname(outputPath), { recursive: true });
  const prefix = outputPath.slice(0, -4);
  await execFile('pdftoppm', ['-f', String(page), '-l', String(page), '-singlefile', '-png', '-r', '120', pdfPath, prefix]);
  if ((await stat(outputPath)).size < 8) throw new Error(`empty render for page ${page}`);
}

async function contactSheet(renderDirectory, outputPath, count) {
  const columns = Math.min(3, count);
  const rows = Math.ceil(count / columns);
  await mkdir(dirname(outputPath), { recursive: true });
  await rm(outputPath, { force: true });
  await execFile('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-pattern_type', 'glob', '-i', `${renderDirectory}/page-*.png`,
    '-vf', `scale=720:-1,tile=${columns}x${rows}:padding=8:margin=8`,
    '-frames:v', '1', outputPath,
  ]);
}

async function main(args) {
  const rootIndex = args.indexOf('--storage-root');
  const storageRoot = rootIndex >= 0 ? args[rootIndex + 1] : process.env.FITAPPLIANCE_STORAGE_ROOT;
  if (!storageRoot) throw new TypeError('storage root required');
  const acquisition = JSON.parse(await readFile(resolveArchitectureV2Path(repoRoot, 'phase10Acquisition'), 'utf8'));
  const documents = [];
  for (const entry of acquisition.entries) {
    if (entry.outcome !== 'acquired') {
      documents.push({
        legacyRuntimeId: entry.legacyRuntimeId, canonicalProductId: entry.canonicalProductId,
        category: entry.category, brand: entry.brand, model: entry.model,
        acquisitionOutcome: entry.outcome, reviewStatus: 'not_reviewable',
        reason: entry.unavailableReason ?? entry.failureReason ?? null,
      });
      continue;
    }
    const pdfPath = resolveWithin(storageRoot, entry.workspace.pdf);
    const text = await readFile(resolveWithin(storageRoot, entry.workspace.text), 'utf8');
    const candidates = findEvidenceReviewCandidates({ model: entry.model, text });
    const reviewPages = entry.pageCount <= 3
      ? Array.from({ length: entry.pageCount }, (_, index) => index + 1)
      : (candidates.reviewPages.length ? candidates.reviewPages : [1]);
    const renderDirectoryRelative = `review-workspaces/phase-10/rendered/${entry.legacyRuntimeId}`;
    const renderDirectory = resolveWithin(storageRoot, renderDirectoryRelative);
    await rm(renderDirectory, { recursive: true, force: true });
    for (const page of reviewPages) {
      await renderPage(pdfPath, resolve(renderDirectory, `page-${String(page).padStart(4, '0')}.png`), page);
    }
    const contactSheetRelative = `review-workspaces/phase-10/contact-sheets/${entry.legacyRuntimeId}.png`;
    await contactSheet(renderDirectory, resolveWithin(storageRoot, contactSheetRelative), reviewPages.length);
    documents.push({
      legacyRuntimeId: entry.legacyRuntimeId, canonicalProductId: entry.canonicalProductId,
      category: entry.category, brand: entry.brand, model: entry.model,
      acquisitionOutcome: 'acquired', documentSha256: entry.sha256, pageCount: entry.pageCount,
      identityPages: candidates.identityPages, dimensionPages: candidates.dimensionPages,
      spacePages: candidates.spacePages, reviewPages, snippets: candidates.snippets,
      reviewStatus: 'pending_visual_review',
      workspace: { renderDirectory: renderDirectoryRelative, contactSheet: contactSheetRelative },
    });
  }
  const output = {
    schemaVersion: 1, preparedAt: acquisition.acquiredAt, documents,
    summary: {
      documents: documents.length,
      reviewable: documents.filter((row) => row.reviewStatus === 'pending_visual_review').length,
      notReviewable: documents.filter((row) => row.reviewStatus === 'not_reviewable').length,
      renderedPages: documents.reduce((sum, row) => sum + (row.reviewPages?.length ?? 0), 0),
    },
  };
  await writeFile(resolveArchitectureV2Path(repoRoot, 'phase10ReviewCandidates'), `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(output.summary, null, 2)}\n`);
}

await main(process.argv.slice(2));
