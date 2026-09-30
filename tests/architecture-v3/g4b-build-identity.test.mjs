import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, copyFileSync, symlinkSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  collectG4bBuildIdentity,
  verifyG4bBuildIdentity,
} from '../../scripts/architecture-v3/verify-g4b-build-identity.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, 'data/architecture-v3/policies/g4b-build-identity.json'), 'utf8'));

test('G4b build identity records the actual resolved parser and reviewed source bytes', () => {
  const observed = collectG4bBuildIdentity({ root });
  assert.equal(observed.cheerio.entry, 'dist/esm/index.js');
  assert.equal(observed.parse5.version, '7.3.0');
  assert.equal(observed.parse5.resolution, 'cheerio-nested');
  assert.deepEqual(verifyG4bBuildIdentity({ root, manifest }), observed);
});

test('G4b build identity fails closed for changed lock, source, adapter, or parser bytes', () => {
  for (const field of [
    'lockSha256',
    'sources.src/domain/architecture-v3/verified-source-binding.mjs',
    'sources.src/domain/architecture-v3/evidence-claim-receipt.mjs',
    'cheerio.treeSha256',
    'parse5.treeSha256',
    'parse5Adapter.treeSha256',
    'adapterParse5.treeSha256',
    'domhandler.treeSha256',
    'htmlparser2.treeSha256',
    'parse5.version',
    'parse5.resolution',
  ]) {
    const changed = structuredClone(manifest);
    const parts = field.startsWith('sources.') ? ['sources', field.slice('sources.'.length)] : field.split('.');
    const owner = parts.slice(0, -1).reduce((value, part) => value[part], changed);
    owner[parts.at(-1)] = 'unsupported';
    assert.throws(() => verifyG4bBuildIdentity({ root, manifest: changed }), /G4B_BUILD_IDENTITY_MISMATCH/, field);
  }
});

test('G4b identity checks actual lock and source bytes in a disposable checkout', () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'fit-g4b-identity-'));
  try {
    symlinkSync(resolve(root, 'node_modules'), resolve(temporary, 'node_modules'));
    for (const path of ['package-lock.json', ...Object.keys(manifest.sources)]) {
      mkdirSync(resolve(temporary, path, '..'), { recursive: true });
      copyFileSync(resolve(root, path), resolve(temporary, path));
    }
    assert.deepEqual(verifyG4bBuildIdentity({ root: temporary, manifest }), collectG4bBuildIdentity({ root }));
    writeFileSync(resolve(temporary, 'package-lock.json'), '{}\n');
    assert.throws(() => verifyG4bBuildIdentity({ root: temporary, manifest }), /G4B_BUILD_IDENTITY_MISMATCH: manifest.lockSha256/);
    copyFileSync(resolve(root, 'package-lock.json'), resolve(temporary, 'package-lock.json'));
    const source = Object.keys(manifest.sources)[0];
    writeFileSync(resolve(temporary, source), readFileSync(resolve(temporary, source), 'utf8') + '\n');
    assert.throws(() => verifyG4bBuildIdentity({ root: temporary, manifest }), /G4B_BUILD_IDENTITY_MISMATCH: manifest.sources/);

    copyFileSync(resolve(root, source), resolve(temporary, source));
    const nearerPackage = resolve(temporary, 'src/domain/architecture-v3/node_modules/cheerio');
    mkdirSync(resolve(temporary, 'src/domain/architecture-v3/node_modules'), { recursive: true });
    cpSync(resolve(root, 'node_modules/cheerio'), nearerPackage, { recursive: true, filter: (path) => !path.includes('/node_modules/cheerio/node_modules') });
    assert.throws(() => verifyG4bBuildIdentity({ root: temporary, manifest }), /G4B_BUILD_IDENTITY_MISMATCH|G4B_BUILD_IDENTITY_UNRESOLVED/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('declared public build and direct deployment builder both enforce G4b identity', () => {
  const scripts = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).scripts;
  const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'));
  assert.match(scripts.build, /^npm run verify:g4b-build-identity && /);
  assert.match(scripts['build:public-deployment'], /^npm run verify:g4b-build-identity && /);
  assert.match(scripts['verify:g4b-build-identity'], /^node scripts\/architecture-v3\/verify-g4b-build-identity\.mjs$/);
  assert.equal(vercel.buildCommand, 'npm run build');
});
