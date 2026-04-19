import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { auditDocs } = require('../scripts/audit-docs.js');

async function createWorkspace(structure) {
  const root = await mkdtemp(path.join(tmpdir(), 'fitappliance-doc-audit-'));
  for (const [relativePath, content] of Object.entries(structure)) {
    const fullPath = path.join(root, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf8');
  }
  return root;
}

const basePackageJson = {
  name: 'fixture',
  version: '1.0.0',
  scripts: {
    test: 'node --test',
    'existing-task': 'node scripts/existing.js'
  }
};

test('phase 38 doc-audit: reports missing npm script reference', async () => {
  const root = await createWorkspace({
    'package.json': `${JSON.stringify(basePackageJson, null, 2)}\n`,
    'README.md': 'Run `npm run missing-task` before deploy.\n'
  });

  const result = await auditDocs({
    repoRoot: root,
    includeFiles: ['README.md'],
    writeReport: false,
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.issues.some((row) => row.rule === 'missing-npm-script'), true);
});

test('phase 38 doc-audit: reports missing local markdown link target', async () => {
  const root = await createWorkspace({
    'package.json': `${JSON.stringify(basePackageJson, null, 2)}\n`,
    'README.md': '[Missing Guide](docs/missing.md)\n'
  });

  const result = await auditDocs({
    repoRoot: root,
    includeFiles: ['README.md'],
    writeReport: false,
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.issues.some((row) => row.rule === 'missing-local-link-target'), true);
});

test('phase 38 doc-audit: passes with valid scripts, node paths and local links', async () => {
  const root = await createWorkspace({
    'package.json': `${JSON.stringify(basePackageJson, null, 2)}\n`,
    'README.md': [
      'Use `npm run existing-task`.',
      'Then run `node scripts/existing.js`.',
      '[Guide](docs/guide.md)'
    ].join('\n'),
    'scripts/existing.js': "console.log('ok');\n",
    'docs/guide.md': '# guide\n'
  });

  const result = await auditDocs({
    repoRoot: root,
    includeFiles: ['README.md'],
    writeReport: false,
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.issues.length, 0);
});

test('phase 38 doc-audit: ignores external URLs, anchor links, and explicit ignore markers', async () => {
  const root = await createWorkspace({
    'package.json': `${JSON.stringify(basePackageJson, null, 2)}\n`,
    'README.md': [
      '[External](https://example.com/docs)',
      '[Anchor](#local-section)',
      '<!-- doc-audit: ignore -->',
      '`npm run missing-task`',
      '<!-- doc-audit: ignore --> [Ignored Missing](docs/not-real.md)'
    ].join('\n')
  });

  const result = await auditDocs({
    repoRoot: root,
    includeFiles: ['README.md'],
    writeReport: false,
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.issues.length, 0);
});
