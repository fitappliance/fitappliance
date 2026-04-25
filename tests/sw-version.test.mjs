import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const SERVICE_WORKER_PATH = path.join(ROOT, 'public', 'service-worker.js');

function isShallowRepository() {
  try {
    return execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim() === 'true';
  } catch {
    return false;
  }
}

function canResolveCommit(ref) {
  try {
    execFileSync('git', ['cat-file', '-e', ref], { cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

test('phase 43a sw: generated service worker has git-derived cache version, not placeholder', () => {
  const source = fs.readFileSync(SERVICE_WORKER_PATH, 'utf8');
  const version = source.match(/const CACHE_VERSION = '([^']+)'/)?.[1] ?? '';

  assert.ok(version, 'CACHE_VERSION should be present');
  assert.notEqual(version, '__SW_VERSION__');
  assert.match(version, /^[0-9a-f]{7}$/);

  if (!canResolveCommit(`${version}^{commit}`)) {
    assert.equal(
      isShallowRepository(),
      true,
      `CACHE_VERSION ${version} should resolve to a commit in non-shallow repositories`
    );
  }
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
