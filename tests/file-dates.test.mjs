import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();

const {
  getFileLastModified,
  createFileDateReader,
  getRepoHeadModified,
  toDateOnly
} = require('../scripts/common/file-dates.js');

test('file dates: committed file uses git latest commit time instead of today', () => {
  const filePath = path.join(repoRoot, 'package.json');
  const expected = execFileSync('git', ['log', '-1', '--format=%aI', '--', 'package.json'], {
    cwd: repoRoot,
    encoding: 'utf8'
  }).trim();

  assert.equal(getFileLastModified(filePath, { repoRoot }), expected);
});

test('file dates: uncommitted file falls back to mtime when git has no history', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-file-dates-'));
  const filePath = path.join(tempDir, 'new.html');
  fs.writeFileSync(filePath, '<h1>new</h1>', 'utf8');
  const mtime = new Date('2026-04-20T04:05:06.000Z');
  fs.utimesSync(filePath, mtime, mtime);

  const reader = createFileDateReader({
    repoRoot,
    execFileSync: () => '',
    statSync: fs.statSync
  });

  assert.equal(reader.getFileLastModified(filePath), '2026-04-20T04:05:06.000Z');
});

test('file dates: git unavailable still falls back to mtime', () => {
  const filePath = path.join(repoRoot, 'README.md');
  const stat = { mtime: new Date('2026-03-01T00:00:00.000Z') };
  const reader = createFileDateReader({
    repoRoot,
    execFileSync: () => {
      throw new Error('git missing');
    },
    statSync: () => stat
  });

  assert.equal(reader.getFileLastModified(filePath), '2026-03-01T00:00:00.000Z');
});

test('file dates: mtime unavailable falls back to SOURCE_DATE_EPOCH', () => {
  const reader = createFileDateReader({
    repoRoot,
    env: { SOURCE_DATE_EPOCH: '1777075200' },
    execFileSync: () => {
      throw new Error('git missing');
    },
    statSync: () => {
      throw new Error('stat missing');
    },
    stderr: { write() {} }
  });

  assert.equal(reader.getFileLastModified('/missing/file.html'), '2026-04-25T00:00:00.000Z');
});

test('file dates: all fallbacks unavailable returns fixed epoch and warns', () => {
  let warning = '';
  const reader = createFileDateReader({
    repoRoot,
    env: {},
    execFileSync: () => {
      throw new Error('git missing');
    },
    statSync: () => {
      throw new Error('stat missing');
    },
    stderr: { write(message) { warning += message; } }
  });

  assert.equal(reader.getFileLastModified('/missing/file.html'), '1970-01-01T00:00:00.000Z');
  assert.match(warning, /file date fallback/i);
});

test('file dates: repeated calls cache git lookups for the same path', () => {
  let calls = 0;
  const reader = createFileDateReader({
    repoRoot,
    execFileSync: () => {
      calls += 1;
      return '2026-04-24T01:02:03+00:00\n';
    },
    statSync: fs.statSync
  });
  const filePath = path.join(repoRoot, 'package.json');

  assert.equal(reader.getFileLastModified(filePath), '2026-04-24T01:02:03+00:00');
  assert.equal(reader.getFileLastModified(filePath), '2026-04-24T01:02:03+00:00');
  assert.equal(calls, 1);
});

test('file dates: same git state returns the same value across wallclock days', () => {
  let day = '2026-04-26';
  const reader = createFileDateReader({
    repoRoot,
    execFileSync: () => '2026-04-24T01:02:03+00:00\n',
    statSync: () => ({ mtime: new Date(`${day}T00:00:00.000Z`) })
  });
  const filePath = path.join(repoRoot, 'package.json');

  const first = reader.getFileLastModified(filePath);
  day = '2026-04-27';
  const second = reader.getFileLastModified(filePath);

  assert.equal(first, second);
});

test('file dates: repo head helper and date-only formatter are deterministic', () => {
  const expected = execFileSync('git', ['log', '-1', '--format=%aI', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8'
  }).trim();

  assert.equal(getRepoHeadModified({ repoRoot }), expected);
  assert.equal(toDateOnly('2026-04-24T14:35:12+00:00'), '2026-04-24');
});
