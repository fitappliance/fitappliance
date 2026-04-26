'use strict';

const path = require('node:path');
const { execFileSync: defaultExecFileSync } = require('node:child_process');
const { statSync: defaultStatSync } = require('node:fs');

const FIXED_EPOCH_ISO = '1970-01-01T00:00:00.000Z';

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDateOnly(value) {
  const match = String(value ?? '').trim().match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : FIXED_EPOCH_ISO.slice(0, 10);
}

function toRfc822Date(value) {
  const iso = toIso(value) ?? FIXED_EPOCH_ISO;
  return new Date(iso).toUTCString();
}

function epochToIso(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

function getRelativeGitPath(repoRoot, filePath) {
  const absoluteRepoRoot = path.resolve(repoRoot);
  const absoluteFilePath = path.resolve(filePath);
  const relative = path.relative(absoluteRepoRoot, absoluteFilePath).replace(/\\/g, '/');
  return relative && !relative.startsWith('..') ? relative : absoluteFilePath;
}

function createFileDateReader({
  repoRoot = path.resolve(__dirname, '..', '..'),
  execFileSync = defaultExecFileSync,
  statSync = defaultStatSync,
  env = process.env,
  stderr = process.stderr
} = {}) {
  const fileCache = new Map();
  let repoHeadCache = null;

  function warn(message) {
    try {
      stderr?.write?.(`${message}\n`);
    } catch {
      // Warnings must never break generation.
    }
  }

  function readGitDate(filePath) {
    const relativePath = getRelativeGitPath(repoRoot, filePath);
    try {
      const output = execFileSync('git', ['log', '-1', '--format=%aI', '--', relativePath], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      return String(output ?? '').trim().split('\n').filter(Boolean)[0] ?? null;
    } catch {
      return null;
    }
  }

  function readRepoHeadDate() {
    if (repoHeadCache) return repoHeadCache;
    try {
      const output = execFileSync('git', ['log', '-1', '--format=%aI', 'HEAD'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      repoHeadCache = String(output ?? '').trim().split('\n').filter(Boolean)[0] ?? null;
    } catch {
      repoHeadCache = null;
    }
    return repoHeadCache;
  }

  function readMtime(filePath) {
    try {
      return toIso(statSync(filePath).mtime);
    } catch {
      return null;
    }
  }

  function readFallbackIso(filePath) {
    const isoFromEnv = epochToIso(env?.SOURCE_DATE_EPOCH);
    if (isoFromEnv) return isoFromEnv;
    warn(`file date fallback: unable to resolve git or mtime for ${filePath}; using ${FIXED_EPOCH_ISO}`);
    return FIXED_EPOCH_ISO;
  }

  function getFileLastModified(filePath) {
    const key = path.resolve(String(filePath ?? ''));
    if (fileCache.has(key)) return fileCache.get(key);

    const resolved = readGitDate(key) ?? readMtime(key) ?? readFallbackIso(key);
    fileCache.set(key, resolved);
    return resolved;
  }

  function getRepoHeadModified() {
    return readRepoHeadDate() ?? epochToIso(env?.SOURCE_DATE_EPOCH) ?? FIXED_EPOCH_ISO;
  }

  return {
    getFileLastModified,
    getRepoHeadModified,
    toDateOnly,
    toRfc822Date
  };
}

const defaultReader = createFileDateReader();

function getFileLastModified(filePath, opts = {}) {
  const reader = Object.keys(opts).length > 0 ? createFileDateReader(opts) : defaultReader;
  return reader.getFileLastModified(filePath);
}

function getRepoHeadModified(opts = {}) {
  const reader = Object.keys(opts).length > 0 ? createFileDateReader(opts) : defaultReader;
  return reader.getRepoHeadModified();
}

module.exports = {
  FIXED_EPOCH_ISO,
  createFileDateReader,
  getFileLastModified,
  getRepoHeadModified,
  toDateOnly,
  toRfc822Date
};
