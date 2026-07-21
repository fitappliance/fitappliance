import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(?:m?js)$/.test(entry.name) ? [entryPath] : [];
  }));
  return files.flat();
}

test('Node 20 runtime sources avoid unsupported groupBy APIs', async () => {
  const files = (await Promise.all([
    sourceFiles('scripts'),
    sourceFiles('src'),
  ])).flat();
  const violations = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (/\b(?:Object|Map)\.groupBy\b/.test(source)) violations.push(file);
  }

  assert.deepEqual(violations, []);
});
