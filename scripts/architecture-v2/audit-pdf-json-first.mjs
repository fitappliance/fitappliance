#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.isFile() && ['.js', '.mjs', '.cjs'].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

const files = [
  ...await sourceFiles(resolve(repoRoot, 'src')),
  ...await sourceFiles(resolve(repoRoot, 'scripts')),
];
const forbidden = [];
for (const path of files) {
  if (path === fileURLToPath(import.meta.url)) continue;
  const source = await readFile(path, 'utf8');
  if (/\bpdftotext\b|\bextractClaimsFromPdfText\b|(?:require\s*\(|from\s+)["']pdf-parse["']/i.test(source)) {
    forbidden.push(path.slice(repoRoot.length + 1));
  }
}
if (forbidden.length) throw new Error(`direct PDF text extraction is forbidden: ${forbidden.join(', ')}`);

const requiredSignals = [
  ['scripts/architecture-v2/run-evidence-resolution.mjs', /runMineruPdfWithImageFallback/],
  ['scripts/architecture-v2/acquire-phase10-evidence.mjs', /runMineruPdfWithImageFallback/],
  ['scripts/architecture-v2/verify-evidence-resolution-objects.mjs', /derivedArtifactBytes/],
  ['scripts/pdf-pipeline/2-extract-text.js', /inspectMineruContentListV2/],
];
for (const [relativePath, pattern] of requiredSignals) {
  const source = await readFile(resolve(repoRoot, relativePath), 'utf8');
  if (!pattern.test(source)) throw new Error(`MinerU JSON-first workflow missing from ${relativePath}`);
}

const policy = JSON.parse(await readFile(resolve(
  repoRoot, 'data/architecture-v2/policies/evidence-resolution-policy.json',
), 'utf8'));
if (policy.pdfEvidence?.requiredFormat !== 'content_list_v2'
  || policy.pdfEvidence?.parserName !== 'MinerU'
  || !/^\d+\.\d+\.\d+$/.test(policy.pdfEvidence?.parserVersion ?? '')
  || !/^[a-f0-9]{40}$/.test(policy.pdfEvidence?.modelRevision ?? '')) {
  throw new Error('current MinerU PDF evidence policy required');
}

process.stdout.write(`${JSON.stringify({
  checkedFiles: files.length,
  directPdfTextExtractors: 0,
  parser: `${policy.pdfEvidence.parserName}-${policy.pdfEvidence.parserVersion}`,
  modelRevision: policy.pdfEvidence.modelRevision,
  format: policy.pdfEvidence.requiredFormat,
}, null, 2)}\n`);
