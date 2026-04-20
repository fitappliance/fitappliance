import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { auditPortability } = require('../scripts/audit-portability.js');
const { slugNormalize } = require('../scripts/common/slug-normalize.js');
const { buildHtmlHead } = require('../scripts/common/html-head.js');
const { toAbsoluteSitemapLoc } = require('../scripts/common/sitemap-loc.js');
const { toJsonLdScriptTag } = require('../scripts/common/schema-jsonld.js');

async function createWorkspace(files) {
  const root = await mkdtemp(path.join(tmpdir(), 'fitappliance-portability-'));
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(root, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf8');
  }
  return root;
}

test('phase 37 portability: detects absolute-path violations and fails', async () => {
  const root = await createWorkspace({
    'scripts/bad.js': "const p = '/Users/demo/secret';\n",
    'tests/ok.test.mjs': 'export {};\n'
  });

  const result = await auditPortability({
    repoRoot: root,
    includeRoots: ['scripts', 'tests'],
    writeReport: false,
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.violations.length > 0, true);
  assert.equal(result.violations.some((row) => row.rule === 'absolute-path'), true);
});

test('phase 37 portability: whitelist suppresses approved rule with reason', async () => {
  const root = await createWorkspace({
    'scripts/localhost-fixture.js': 'const url = "http://localhost:4173/preview";\n'
  });

  const result = await auditPortability({
    repoRoot: root,
    includeRoots: ['scripts'],
    writeReport: false,
    whitelist: [
      {
        filePattern: /localhost-fixture\.js$/,
        rule: 'localhost-url',
        reason: 'Fixture only: local server endpoint for tests'
      }
    ],
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.violations.length, 0);
  assert.equal(result.ignored.length, 1);
});

test('phase 37 portability: clean workspace scan passes', async () => {
  const root = await createWorkspace({
    'scripts/good.js': 'const message = "portable";\n',
    'tests/good.test.mjs': 'export {};\n',
    'public/app.js': 'const x = new URL("https://fitappliance.com.au");\n'
  });

  const result = await auditPortability({
    repoRoot: root,
    includeRoots: ['scripts', 'tests', 'public'],
    writeReport: false,
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.violations.length, 0);
});

test('phase 37 portability: shared generator utils behave deterministically', () => {
  assert.equal(slugNormalize(' Fisher & Paykel '), 'fisher-paykel');
  assert.equal(
    toAbsoluteSitemapLoc('https://fitappliance.com.au/', '/brands/lg-fridge-clearance'),
    'https://fitappliance.com.au/brands/lg-fridge-clearance'
  );

  const head = buildHtmlHead({
    title: 'LG Fridge Guide',
    description: 'Guide body',
    canonical: 'https://fitappliance.com.au/brands/lg-fridge-clearance'
  });
  assert.equal(head.includes('<title>LG Fridge Guide</title>'), true);
  assert.equal(head.includes('<link rel="canonical" href="https://fitappliance.com.au/brands/lg-fridge-clearance">'), true);

  const jsonLd = toJsonLdScriptTag({ '@context': 'https://schema.org', '@type': 'Thing', name: 'FitAppliance' });
  assert.equal(
    jsonLd,
    '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Thing","name":"FitAppliance"}</script>'
  );
});
