import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const SERVICE_WORKER_PATH = path.join(ROOT, 'public', 'service-worker.js');

test('phase 43a sw: generated service worker has git-derived cache version, not placeholder', () => {
  const source = fs.readFileSync(SERVICE_WORKER_PATH, 'utf8');
  const version = source.match(/const CACHE_VERSION = '([^']+)'/)?.[1] ?? '';

  assert.ok(version, 'CACHE_VERSION should be present');
  assert.notEqual(version, '__SW_VERSION__');
  assert.match(version, /^[0-9a-f]{7}$/);
  execFileSync('git', ['cat-file', '-e', `${version}^{commit}`], { cwd: ROOT });
});

test('phase 43a sw: generate-all keeps service worker bytes stable in the same git state', () => {
  const before = fs.readFileSync(SERVICE_WORKER_PATH, 'utf8');
  execFileSync('npm', ['run', 'generate-all'], { cwd: ROOT, stdio: 'pipe' });
  const afterFirst = fs.readFileSync(SERVICE_WORKER_PATH, 'utf8');
  execFileSync('npm', ['run', 'generate-all'], { cwd: ROOT, stdio: 'pipe' });
  const afterSecond = fs.readFileSync(SERVICE_WORKER_PATH, 'utf8');

  assert.equal(afterFirst, before);
  assert.equal(afterSecond, afterFirst);
});
