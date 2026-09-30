#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SOURCE_FILES = Object.freeze([
  'src/domain/architecture-v3/verified-source-binding.mjs',
  'src/domain/architecture-v3/evidence-claim-receipt.mjs',
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function packageRoot(entry, expectedName) {
  for (let dir = dirname(entry); ; dir = dirname(dir)) {
    try {
      const metadata = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      if (metadata.name === expectedName) return { dir, metadata };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (dir === dirname(dir)) throw new Error(`G4B_BUILD_IDENTITY_UNRESOLVED: ${expectedName}`);
  }
}

function packageTreeSha256(dir) {
  const rows = [];
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (entry.name === 'node_modules' && entry.isDirectory()) continue;
      const path = join(current, entry.name);
      const stat = lstatSync(path);
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) {
        const bytes = readFileSync(path);
        rows.push([relative(dir, path).split(sep).join('/'), sha256(bytes), bytes.length]);
      } else throw new Error(`G4B_BUILD_IDENTITY_UNSUPPORTED_PACKAGE_ENTRY: ${path}`);
    }
  }
  walk(dir);
  rows.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return sha256(Buffer.from(rows.map((row) => JSON.stringify(row)).join('\n') + '\n'));
}

function sourceSha256(root, path) {
  const absolute = resolve(root, path);
  if (!lstatSync(absolute).isFile()) throw new Error(`G4B_BUILD_IDENTITY_UNSUPPORTED_SOURCE: ${path}`);
  return sha256(readFileSync(absolute));
}

function resolvedPackage(fromEntry, name) {
  return packageRoot(createRequire(fromEntry).resolve(name), name);
}

function esmEntry(pkg) {
  const exportEntry = pkg.metadata.exports?.['.']?.import?.default
    ?? pkg.metadata.exports?.import;
  if (typeof exportEntry !== 'string') throw new Error(`G4B_BUILD_IDENTITY_UNRESOLVED: ${pkg.metadata.name} ESM export`);
  const entry = resolve(pkg.dir, exportEntry);
  if (!lstatSync(entry).isFile()) throw new Error(`G4B_BUILD_IDENTITY_UNRESOLVED: ${pkg.metadata.name} ESM entry`);
  return entry;
}

function packageIdentity(pkg, entry) {
  return {
    version: pkg.metadata.version,
    entry: relative(pkg.dir, entry).split(sep).join('/'),
    treeSha256: packageTreeSha256(pkg.dir),
  };
}

function dependencyClosure(cheerio) {
  const moduleStore = dirname(cheerio.dir);
  const pending = [cheerio];
  const seen = new Map();
  const keyFor = (pkg) => {
    const key = relative(moduleStore, pkg.dir).split(sep).join('/');
    if (!key || key === '..' || key.startsWith('../')) {
      throw new Error(`G4B_BUILD_IDENTITY_UNSUPPORTED_DEPENDENCY_LOCATION: ${pkg.metadata.name}`);
    }
    return key;
  };
  while (pending.length) {
    const pkg = pending.shift();
    const key = keyFor(pkg);
    if (seen.has(key)) continue;
    const required = pkg.metadata.dependencies ?? {};
    const optional = pkg.metadata.optionalDependencies ?? {};
    const dependencies = {};
    for (const name of [...new Set([...Object.keys(required), ...Object.keys(optional)])].sort()) {
      try {
        const target = resolvedPackage(join(pkg.dir, 'package.json'), name);
        dependencies[name] = keyFor(target);
        pending.push(target);
      } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND' && Object.hasOwn(optional, name)) {
          dependencies[name] = null;
        } else throw error;
      }
    }
    seen.set(key, {
      name: pkg.metadata.name,
      version: pkg.metadata.version,
      treeSha256: packageTreeSha256(pkg.dir),
      dependencies,
    });
  }
  return Object.fromEntries([...seen].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

export function collectG4bBuildIdentity({ root = DEFAULT_ROOT } = {}) {
  // Resolve from the binding producer, not this checker: a nearer node_modules
  // directory must not make the producer load unchecked parser bytes.
  const producerEntry = resolve(root, SOURCE_FILES[0]);
  const cheerio = resolvedPackage(producerEntry, 'cheerio');
  const cheerioEntry = esmEntry(cheerio);
  const parse5 = resolvedPackage(cheerioEntry, 'parse5');
  const parse5Entry = esmEntry(parse5);
  const adapter = resolvedPackage(cheerioEntry, 'parse5-htmlparser2-tree-adapter');
  const adapterEntry = esmEntry(adapter);
  const adapterParse5 = resolvedPackage(adapterEntry, 'parse5');
  const domhandler = resolvedPackage(adapterEntry, 'domhandler');
  const htmlparser2 = resolvedPackage(cheerioEntry, 'htmlparser2');
  const nestedRoot = resolve(cheerio.dir, 'node_modules', 'parse5');
  const resolution = parse5.dir === nestedRoot ? 'cheerio-nested' : 'other';
  const adapterNestedRoot = resolve(adapter.dir, 'node_modules', 'parse5');

  return {
    schemaVersion: 1,
    lockSha256: sourceSha256(root, 'package-lock.json'),
    cheerio: packageIdentity(cheerio, cheerioEntry),
    parse5: {
      ...packageIdentity(parse5, parse5Entry),
      resolution,
    },
    parse5Adapter: packageIdentity(adapter, adapterEntry),
    adapterParse5: {
      ...packageIdentity(adapterParse5, esmEntry(adapterParse5)),
      resolution: adapterParse5.dir === adapterNestedRoot ? 'adapter-nested' : 'other',
    },
    domhandler: packageIdentity(domhandler, esmEntry(domhandler)),
    htmlparser2: packageIdentity(htmlparser2, esmEntry(htmlparser2)),
    dependencyClosure: dependencyClosure(cheerio),
    sources: Object.fromEntries(SOURCE_FILES.map((path) => [path, sourceSha256(root, path)])),
  };
}

function mismatch(expected, observed, path = 'manifest') {
  if (typeof expected !== typeof observed || expected === null || observed === null) {
    return expected === observed ? null : path;
  }
  if (typeof expected !== 'object') return expected === observed ? null : path;
  if (Array.isArray(expected) || Array.isArray(observed)) return JSON.stringify(expected) === JSON.stringify(observed) ? null : path;
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(observed)])].sort();
  for (const key of keys) {
    if (!Object.hasOwn(expected, key) || !Object.hasOwn(observed, key)) return `${path}.${key}`;
    const difference = mismatch(expected[key], observed[key], `${path}.${key}`);
    if (difference) return difference;
  }
  return null;
}

export function verifyG4bBuildIdentity({ root = DEFAULT_ROOT, manifest } = {}) {
  const expected = manifest ?? JSON.parse(readFileSync(resolve(root, 'data/architecture-v3/policies/g4b-build-identity.json'), 'utf8'));
  const observed = collectG4bBuildIdentity({ root });
  const different = mismatch(expected, observed);
  if (different) throw new Error(`G4B_BUILD_IDENTITY_MISMATCH: ${different}`);
  return observed;
}

if (process.argv[1] && process.argv[1] !== '-' && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const verified = verifyG4bBuildIdentity();
    process.stdout.write(`[g4b-build-identity] verified Cheerio ${verified.cheerio.version}, parse5 ${verified.parse5.version} (${verified.parse5.resolution}), tree adapter ${verified.parse5Adapter.version}, adapter parse5 ${verified.adapterParse5.version} (${verified.adapterParse5.resolution})\n`);
  } catch (error) {
    process.stderr.write(`[g4b-build-identity] ${error.message}\n`);
    process.exitCode = 1;
  }
}
