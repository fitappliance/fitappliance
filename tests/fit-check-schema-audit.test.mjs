import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { auditFitCheckSchemas } = require('../scripts/audit-fit-check-schema.js');

const validArticle = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Will Bosch fit in a 600mm cavity?',
  description: 'A fit-check reference page.',
  url: 'https://www.fitappliance.com.au/fit-check/bosch-in-600mm-cavity',
  datePublished: '2026-05-01',
  dateModified: '2026-05-08'
};

const validFaq = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Will it fit?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Check the cavity width, height, and depth.'
      }
    }
  ]
};

function jsonLd(value) {
  return `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
}

async function createAuditWorkspace() {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'fitappliance-fit-check-schema-'));
  const pagesDir = path.join(repoRoot, 'pages', 'fit-check');
  await mkdir(pagesDir, { recursive: true });
  return { repoRoot, pagesDir };
}

test('phase 54 A3 schema audit accepts fit-check pages with Article and FAQPage', async () => {
  const { repoRoot, pagesDir } = await createAuditWorkspace();
  await writeFile(
    path.join(pagesDir, 'valid.html'),
    `<html><head>${jsonLd(validArticle)}${jsonLd(validFaq)}</head><body>Valid</body></html>`,
    'utf8'
  );

  const report = await auditFitCheckSchemas({
    repoRoot,
    pagesDir,
    outputPath: path.join(repoRoot, 'reports', 'fit-check', 'schema-audit.json'),
    logger: { log() {} }
  });

  assert.equal(report.pagesChecked, 1);
  assert.equal(report.errors, 0);
  assert.equal(report.pages[0].hasArticle, true);
  assert.equal(report.pages[0].hasFAQPage, true);
});

test('phase 54 A3 schema audit reports missing FAQPage and writes JSON report', async () => {
  const { repoRoot, pagesDir } = await createAuditWorkspace();
  const outputPath = path.join(repoRoot, 'reports', 'fit-check', 'schema-audit.json');
  await writeFile(
    path.join(pagesDir, 'missing-faq.html'),
    `<html><head>${jsonLd(validArticle)}</head><body>Missing FAQ</body></html>`,
    'utf8'
  );

  const report = await auditFitCheckSchemas({
    repoRoot,
    pagesDir,
    outputPath,
    logger: { log() {} }
  });
  const written = JSON.parse(await readFile(outputPath, 'utf8'));

  assert.equal(report.errors, 1);
  assert.match(report.issues[0].issue, /missing FAQPage/);
  assert.equal(written.errors, 1);
});
