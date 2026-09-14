import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, 'scripts', 'build-public-deployment.js');
const verificationFiles = [
  'google32758d7798f4a670.html',
  'google5keGnUyvuq31_mxZ9pNVPIsh7BzKBbM7aHdxUTZZDJM.html',
];

function loadBuilder() {
  assert.equal(fs.existsSync(scriptPath), true, 'the public deployment builder must exist');
  const { buildPublicDeployment } = require(scriptPath);
  assert.equal(typeof buildPublicDeployment, 'function');
  return buildPublicDeployment;
}

function writeFixtureFile(root, relativePath, contents) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function createFixture(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-public-deployment-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  writeFixtureFile(root, 'index.html', Buffer.from('<!doctype html><title>FitAppliance</title>\n'));
  writeFixtureFile(root, verificationFiles[0], Buffer.from('google-site-verification: one\n'));
  writeFixtureFile(root, verificationFiles[1], Buffer.from('google-site-verification: two\n'));
  writeFixtureFile(root, 'public/data/appliances.json', Buffer.from('{"source":"public-runtime"}\n'));
  writeFixtureFile(root, 'public/scripts/app.js', Buffer.from('export const publicApp = true;\n'));
  writeFixtureFile(root, 'public/images/logo.png', Buffer.from([0, 255, 1, 254]));
  writeFixtureFile(root, 'pages/products/example.html', Buffer.from('<!doctype html><h1>Public product</h1>\n'));
  writeFixtureFile(root, 'pages/products/index.json', Buffer.from('{"items":["example"]}\n'));
  writeFixtureFile(root, 'pages/guides/example.html', Buffer.from('<!doctype html><h1>Public guide</h1>\n'));

  writeFixtureFile(root, 'data/appliances.json', Buffer.from('{"source":"private-root-shadow"}\n'));
  writeFixtureFile(root, 'data/pdf-evidence/manual.pdf', Buffer.from('%PDF-private-evidence'));
  writeFixtureFile(root, 'docs/private.md', Buffer.from('private documentation\n'));
  writeFixtureFile(root, 'scripts/private.js', Buffer.from('throw new Error("not public");\n'));
  writeFixtureFile(root, 'api/private.js', Buffer.from('module.exports = {};\n'));
  writeFixtureFile(root, 'tests/private.test.mjs', Buffer.from('throw new Error("not public");\n'));
  writeFixtureFile(root, 'reports/private.json', Buffer.from('{"report":"private"}\n'));
  writeFixtureFile(root, 'v2/private.txt', Buffer.from('private implementation\n'));
  writeFixtureFile(root, '.env', Buffer.from('SECRET=not-for-publication\n'));
  writeFixtureFile(root, '.git/config', Buffer.from('[core]\nrepositoryformatversion = 0\n'));

  return root;
}

function sourceBytes(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath));
}

function treeDigest(root) {
  const entries = [];

  function visit(directory, relative = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const nextRelative = path.posix.join(relative, entry.name);
      const nextPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(nextPath, nextRelative);
      } else if (entry.isFile()) {
        entries.push(`${nextRelative}\0${crypto.createHash('sha256').update(fs.readFileSync(nextPath)).digest('hex')}`);
      }
    }
  }

  visit(root);
  return crypto.createHash('sha256').update(entries.join('\n')).digest('hex');
}

test('buildPublicDeployment copies only public producers and preserves source bytes', (t) => {
  const root = createFixture(t);
  const buildPublicDeployment = loadBuilder();
  const expectedFiles = [
    'index.html',
    ...verificationFiles,
    'public/data/appliances.json',
    'public/images/logo.png',
    'public/scripts/app.js',
    'pages/guides/example.html',
    'pages/products/example.html',
    'pages/products/index.json',
  ].sort();

  const result = buildPublicDeployment({ repoRoot: root });
  const outputRoot = path.join(root, '.site-public');

  assert.equal(result.outputPath, outputRoot);
  assert.equal(result.fileCount, expectedFiles.length);
  assert.equal(result.files.length, expectedFiles.length);
  assert.deepEqual(result.files.map(({ relativePath }) => relativePath), expectedFiles);
  assert.equal(result.artifactSha256, treeDigest(outputRoot));
  assert.match(result.artifactSha256, /^[a-f0-9]{64}$/);
  assert.ok(result.totalBytes > 0);
  assert.deepEqual(fs.readdirSync(outputRoot).sort(), ['index.html', ...verificationFiles, 'pages', 'public'].sort());

  for (const relativePath of expectedFiles) {
    assert.deepEqual(sourceBytes(outputRoot, relativePath), sourceBytes(root, relativePath), `${relativePath} bytes must be unchanged`);
  }
  for (const relativePath of [
    'data',
    'data/pdf-evidence/manual.pdf',
    'docs',
    'scripts',
    'api',
    'tests',
    'reports',
    'v2',
    '.env',
    '.git',
  ]) {
    assert.equal(fs.existsSync(path.join(outputRoot, relativePath)), false, `${relativePath} must not enter the public artifact`);
  }
  assert.notDeepEqual(
    sourceBytes(outputRoot, 'public/data/appliances.json'),
    sourceBytes(root, 'data/appliances.json'),
    'the public data rewrite must not be shadowed by root data',
  );
});

test('buildPublicDeployment replaces stale generated files and produces a deterministic unchanged artifact', (t) => {
  const root = createFixture(t);
  const buildPublicDeployment = loadBuilder();
  const outputRoot = path.join(root, '.site-public');

  writeFixtureFile(root, 'public/obsolete.txt', 'remove on the next build');
  buildPublicDeployment({ repoRoot: root });
  fs.writeFileSync(path.join(outputRoot, 'stale.txt'), 'stale output');
  fs.rmSync(path.join(root, 'public', 'obsolete.txt'));

  const rebuilt = buildPublicDeployment({ repoRoot: root });
  const repeated = buildPublicDeployment({ repoRoot: root });

  assert.equal(fs.existsSync(path.join(outputRoot, 'stale.txt')), false);
  assert.equal(fs.existsSync(path.join(outputRoot, 'public', 'obsolete.txt')), false);
  assert.equal(rebuilt.artifactSha256, repeated.artifactSha256);
  assert.equal(rebuilt.fileCount, repeated.fileCount);
  assert.deepEqual(rebuilt.files, repeated.files);
});

test('buildPublicDeployment fails closed for hidden or symlinked allowed inputs and retains the prior artifact', (t) => {
  const root = createFixture(t);
  const buildPublicDeployment = loadBuilder();
  const outputRoot = path.join(root, '.site-public');
  const initial = buildPublicDeployment({ repoRoot: root });
  const sourceBefore = sourceBytes(root, 'public/data/appliances.json');
  const outputBefore = treeDigest(outputRoot);

  writeFixtureFile(root, 'public/.private.json', '{"must":"not publish"}\n');
  assert.throws(
    () => buildPublicDeployment({ repoRoot: root }),
    /hidden entry/i,
  );
  assert.equal(treeDigest(outputRoot), outputBefore);
  assert.deepEqual(sourceBytes(root, 'public/data/appliances.json'), sourceBefore);

  fs.rmSync(path.join(root, 'public', '.private.json'));
  fs.symlinkSync(path.join(root, 'docs', 'private.md'), path.join(root, 'public', 'leak.md'));
  assert.throws(
    () => buildPublicDeployment({ repoRoot: root }),
    /symbolic link/i,
  );
  assert.equal(treeDigest(outputRoot), outputBefore);
  assert.equal(initial.artifactSha256, outputBefore);
});

test('buildPublicDeployment rejects incomplete inputs and symlinked publication paths', (t) => {
  const root = createFixture(t);
  const buildPublicDeployment = loadBuilder();
  const outputRoot = path.join(root, '.site-public');

  fs.rmSync(path.join(root, 'pages'), { recursive: true, force: true });
  assert.throws(
    () => buildPublicDeployment({ repoRoot: root }),
    /required public directory.*pages/i,
  );
  assert.equal(fs.existsSync(outputRoot), false);

  const secondRoot = createFixture(t);
  const secondOutput = path.join(secondRoot, '.site-public');
  const externalOutput = path.join(secondRoot, 'external-output');
  fs.mkdirSync(externalOutput);
  fs.symlinkSync(externalOutput, secondOutput, 'dir');
  assert.throws(
    () => buildPublicDeployment({ repoRoot: secondRoot }),
    /output.*symbolic link/i,
  );
  assert.equal(fs.existsSync(path.join(externalOutput, 'index.html')), false);
});

test('buildPublicDeployment rejects a repository path reached through a symlinked ancestor', (t) => {
  const root = createFixture(t);
  const buildPublicDeployment = loadBuilder();
  const parent = path.dirname(root);
  const symlinkedParent = path.join(parent, `fitappliance-public-deployment-parent-${process.pid}-${Date.now()}`);
  t.after(() => fs.rmSync(symlinkedParent, { recursive: true, force: true }));
  fs.symlinkSync(parent, symlinkedParent, 'dir');

  assert.throws(
    () => buildPublicDeployment({ repoRoot: path.join(symlinkedParent, path.basename(root)) }),
    /ancestor.*symbolic link/i,
  );
  assert.equal(fs.existsSync(path.join(root, '.site-public')), false);
});

test('buildPublicDeployment ignores crashed generated stage and backup siblings', (t) => {
  const root = createFixture(t);
  const buildPublicDeployment = loadBuilder();
  writeFixtureFile(root, '.site-public-stage-crashed/private.json', '{"stage":"not public"}\n');
  writeFixtureFile(root, '.site-public-backup-crashed/private.json', '{"backup":"not public"}\n');

  buildPublicDeployment({ repoRoot: root });

  assert.equal(fs.existsSync(path.join(root, '.site-public-stage-crashed', 'private.json')), true);
  assert.equal(fs.existsSync(path.join(root, '.site-public-backup-crashed', 'private.json')), true);
  assert.equal(fs.existsSync(path.join(root, '.site-public', '.site-public-stage-crashed')), false);
  assert.equal(fs.existsSync(path.join(root, '.site-public', '.site-public-backup-crashed')), false);
});

test('canonical build preserves the original pipeline before appending public deployment packaging', () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const originalBuildSteps = [
    'node scripts/vendor-fit-engine.js',
    'node scripts/vendor-web-vitals.js',
    'npm run publish:catalog',
    'node scripts/pick-review-pilot.js',
    'node scripts/generate-ui-copy.js',
    'node scripts/generate-comparisons.js',
    'node scripts/generate-compare-vs-pages.js',
    'node scripts/generate-brand-pages.js',
    'node scripts/inject-video-schema.js',
    'node scripts/generate-cavity-pages.js',
    'node scripts/generate-doorway-pages.js',
    'node scripts/generate-guides.js',
    'node scripts/generate-location-pages.js',
    'node scripts/generate-product-pages.js',
    'node scripts/generate-sitemap.js',
    'node scripts/generate-sw.js',
    'npm run audit:active-retail-release',
  ];

  assert.equal(scripts['build:public-deployment'], 'node scripts/build-public-deployment.js');
  assert.deepEqual(scripts.build.split(' && '), [
    ...originalBuildSteps,
    'npm run build:public-deployment',
  ]);

  for (const ignoreFile of ['.gitignore', '.vercelignore']) {
    const ignoredPaths = new Set(fs.readFileSync(path.join(repoRoot, ignoreFile), 'utf8').split(/\r?\n/));
    for (const generatedPath of ['.site-public/', '.site-public-stage-*', '.site-public-backup-*']) {
      assert.equal(ignoredPaths.has(generatedPath), true, `${ignoreFile} must ignore ${generatedPath}`);
    }
  }
});
