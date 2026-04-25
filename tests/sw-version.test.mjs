import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const SERVICE_WORKER_PATH = path.join(ROOT, 'public', 'service-worker.js');
const require = createRequire(import.meta.url);
const {
  generateServiceWorker
} = require('../scripts/generate-sw.js');

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

test('phase 43a sw: service worker generation is stable in the same git state', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-sw-version-'));
  const outputPath = path.join(tmpDir, 'service-worker.js');
  const logger = { log() {} };

  await generateServiceWorker({ outputPath, logger });
  const afterFirst = fs.readFileSync(outputPath, 'utf8');
  await generateServiceWorker({ outputPath, logger });
  const afterSecond = fs.readFileSync(outputPath, 'utf8');

  assert.match(afterFirst, /const CACHE_VERSION = '[^']+'/);
  assert.equal(afterSecond, afterFirst);
});
