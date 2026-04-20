import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { auditCopy } = require('../scripts/audit-copy.js');

async function createWorkspace(structure) {
  const root = await mkdtemp(path.join(tmpdir(), 'fitappliance-copy-lint-'));
  for (const [relativePath, content] of Object.entries(structure)) {
    const fullPath = path.join(root, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf8');
  }
  return root;
}

async function runAuditWithHtml(html) {
  const root = await createWorkspace({
    'pages/sample.html': html
  });

  return auditCopy({
    repoRoot: root,
    includeFiles: ['pages/sample.html'],
    writeReport: false,
    logger: { log() {}, warn() {}, error() {} }
  });
}

test('copy-lint: forbids per-brand phrase', async () => {
  const result = await runAuditWithHtml('<html><body><p>We subtract per-brand clearances.</p></body></html>');

  assert.equal(result.exitCode, 1);
  assert.equal(result.violations.some((row) => row.rule === 'forbidden-phrase'), true);
});

test('copy-lint: forbids inline style on h2', async () => {
  const result = await runAuditWithHtml('<html><body><h2 style="font-size:18px">Heading</h2></body></html>');

  assert.equal(result.exitCode, 1);
  assert.equal(result.violations.some((row) => row.rule === 'heading-inline-style'), true);
});

test('copy-lint: forbids plural category noun before Clearance in h1', async () => {
  const result = await runAuditWithHtml('<html><body><h1>Samsung Fridges Clearance</h1></body></html>');

  assert.equal(result.exitCode, 1);
  assert.equal(result.violations.some((row) => row.rule === 'clearance-heading-singular'), true);
});

test('copy-lint: forbids emoji inside headings', async () => {
  const result = await runAuditWithHtml('<html><body><h1>📦 Samsung Fridge Clearance</h1></body></html>');

  assert.equal(result.exitCode, 1);
  assert.equal(result.violations.some((row) => row.rule === 'emoji-heading'), true);
});

test('copy-lint: passes clean fixture', async () => {
  const result = await runAuditWithHtml([
    '<html><body>',
    '<h1>Samsung Fridge Clearance Requirements</h1>',
    '<p>Check each brand&apos;s clearance figures before you shortlist a model.</p>',
    '<h2 class="section-title-sm">Installation notes</h2>',
    '</body></html>'
  ].join(''));

  assert.equal(result.exitCode, 0);
  assert.equal(result.violations.length, 0);
});
