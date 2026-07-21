#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';

import { inspectMineruContentListV2 } from '../../src/domain/mineru-document.mjs';
import { runMineruPdfWithImageFallback } from '../../src/domain/mineru-runner.mjs';

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function resolveWithin(root, relativePath) {
  if (isAbsolute(relativePath)) throw new TypeError('derived evidence path must be relative');
  const normalizedRoot = resolve(root);
  const candidate = resolve(normalizedRoot, relativePath);
  if (!candidate.startsWith(`${normalizedRoot}${sep}`)) throw new TypeError('derived evidence path escapes storage root');
  return candidate;
}

async function writeImmutable(path, bytes, expectedHash) {
  try {
    const existing = await readFile(path);
    const existingHash = createHash('sha256').update(existing).digest('hex');
    if (existingHash !== expectedHash) throw new Error('content-addressed derived artifact collision');
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

async function main(args) {
  const input = option(args, '--input');
  const storageRoot = option(args, '--storage-root') ?? process.env.FITAPPLIANCE_STORAGE_ROOT;
  if (!input || !storageRoot) throw new TypeError('--input and --storage-root are required');
  const pdfBytes = await readFile(resolve(input));
  const result = await runMineruPdfWithImageFallback(pdfBytes, { storageRoot });
  const outputPath = resolveWithin(storageRoot, result.derivedArtifact.objectPath);
  await writeImmutable(outputPath, result.jsonBytes, result.derivedArtifact.contentSha256);
  const inspection = inspectMineruContentListV2(result.jsonBytes);
  process.stdout.write(`${JSON.stringify({
    sourcePdfSha256: result.derivedArtifact.sourcePdfSha256,
    derivedArtifact: result.derivedArtifact,
    pageTypes: inspection.pages.map((page) => ({
      page: page.page,
      types: [...new Set(page.fragments.map((fragment) => fragment.type))].sort(),
    })),
  }, null, 2)}\n`);
}

await main(process.argv.slice(2));
