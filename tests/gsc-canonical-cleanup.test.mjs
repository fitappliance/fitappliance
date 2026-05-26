import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..');

const crawlableQueryLinkPattern = /href=["'](?:https:\/\/www\.fitappliance\.com\.au)?\/\?cat=/;

const sourceFiles = [
  'index.html',
  'scripts/generate-brand-pages.js',
  'scripts/generate-cavity-pages.js',
  'scripts/generate-compare-vs-pages.js',
  'scripts/generate-comparisons.js',
  'scripts/generate-doorway-pages.js',
  'scripts/generate-fit-check-pages.js',
  'scripts/generate-location-pages.js',
  'scripts/generate-product-pages.js'
];

async function collectHtmlFiles(relativeDir) {
  const root = path.join(repoRoot, relativeDir);
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectHtmlFiles(relativePath));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(relativePath);
    }
  }

  return files;
}

test('GSC duplicate cleanup: static source does not expose crawlable search-state cat links', async () => {
  const offenders = [];
  for (const file of sourceFiles) {
    const text = await readFile(path.join(repoRoot, file), 'utf8');
    if (crawlableQueryLinkPattern.test(text)) offenders.push(file);
  }

  assert.deepEqual(offenders, []);
});

test('GSC duplicate cleanup: generated fit-check pages do not expose crawlable search-state cat links', async () => {
  const generatedFiles = await collectHtmlFiles('pages/fit-check');
  const offenders = [];

  for (const file of generatedFiles) {
    const text = await readFile(path.join(repoRoot, file), 'utf8');
    if (crawlableQueryLinkPattern.test(text)) offenders.push(file);
  }

  assert.deepEqual(offenders, []);
});
