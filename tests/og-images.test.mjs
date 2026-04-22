import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ogDir = path.join(repoRoot, 'public', 'og-images');

function listPngFiles() {
  return fs.readdirSync(ogDir).filter((name) => name.endsWith('.png')).sort();
}

test('phase 43a quick wins: every OG png stays under 120KB', () => {
  const oversized = listPngFiles().filter((name) => {
    const size = fs.statSync(path.join(ogDir, name)).size;
    return size > 120 * 1024;
  });

  assert.deepEqual(oversized, []);
});

test('phase 43a quick wins: total OG png payload stays under 3MB', () => {
  const totalBytes = listPngFiles().reduce((sum, name) => sum + fs.statSync(path.join(ogDir, name)).size, 0);
  assert.ok(totalBytes < 3 * 1024 * 1024, `expected <3MB png payload, got ${totalBytes} bytes`);
});
