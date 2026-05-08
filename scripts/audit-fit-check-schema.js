#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readdir, readFile, writeFile } = require('node:fs/promises');

const DEFAULT_AUDIT_DATE = '2026-05-08';

function collectJsonLdBlocks(html) {
  return [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1].trim());
}

function getSchemaTypes(value) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((row) => getSchemaTypes(row));
  const ownType = value['@type'];
  const graphTypes = Array.isArray(value['@graph']) ? value['@graph'].flatMap((row) => getSchemaTypes(row)) : [];
  return [
    ...(Array.isArray(ownType) ? ownType : ownType ? [ownType] : []),
    ...graphTypes
  ].map((type) => String(type));
}

function findArticle(blocks) {
  return blocks.find((block) => getSchemaTypes(block).includes('Article'));
}

function findFaq(blocks) {
  return blocks.find((block) => getSchemaTypes(block).includes('FAQPage'));
}

function validateArticle(article) {
  const errors = [];
  if (!article) return ['missing Article JSON-LD'];
  for (const field of ['headline', 'description', 'url', 'dateModified']) {
    if (!String(article[field] ?? '').trim()) errors.push(`Article missing ${field}`);
  }
  if (article.url && !String(article.url).startsWith('https://www.fitappliance.com.au/fit-check/')) {
    errors.push('Article url must point to a fit-check page');
  }
  return errors;
}

function validateFaq(faq) {
  const errors = [];
  if (!faq) return ['missing FAQPage JSON-LD'];
  if (!Array.isArray(faq.mainEntity) || faq.mainEntity.length === 0) {
    errors.push('FAQPage missing mainEntity questions');
  }
  return errors;
}

async function listFitCheckHtml(pagesDir) {
  const entries = await readdir(pagesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => path.join(pagesDir, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right)));
}

async function auditFitCheckSchemas({
  repoRoot = path.resolve(__dirname, '..'),
  pagesDir = path.join(repoRoot, 'pages', 'fit-check'),
  outputPath = path.join(repoRoot, 'reports', 'fit-check', `schema-audit-${DEFAULT_AUDIT_DATE}.json`),
  auditDate = DEFAULT_AUDIT_DATE,
  logger = console
} = {}) {
  const files = await listFitCheckHtml(pagesDir);
  const pages = [];
  const issues = [];
  let jsonLdBlocks = 0;

  for (const filePath of files) {
    const html = await readFile(filePath, 'utf8');
    const relativeFile = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    const parsedBlocks = [];

    for (const block of collectJsonLdBlocks(html)) {
      try {
        parsedBlocks.push(JSON.parse(block));
        jsonLdBlocks += 1;
      } catch (error) {
        issues.push({ file: relativeFile, issue: `invalid JSON-LD: ${error.message}` });
      }
    }

    const article = findArticle(parsedBlocks);
    const faq = findFaq(parsedBlocks);
    const pageErrors = [
      ...validateArticle(article),
      ...validateFaq(faq)
    ];

    for (const issue of pageErrors) {
      issues.push({ file: relativeFile, issue });
    }

    pages.push({
      file: relativeFile,
      hasArticle: Boolean(article),
      hasFAQPage: Boolean(faq),
      jsonLdBlocks: parsedBlocks.length,
      errors: pageErrors.length
    });
  }

  const report = {
    schema_version: 1,
    audit_date: auditDate,
    method: 'fit-check-json-ld-audit',
    pagesChecked: files.length,
    jsonLdBlocks,
    errors: issues.length,
    issues,
    pages
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  logger.log(`Fit-check schema audit completed: pages=${files.length} blocks=${jsonLdBlocks} errors=${issues.length}`);
  return report;
}

if (require.main === module) {
  auditFitCheckSchemas().then((report) => {
    if (report.errors > 0) process.exitCode = 1;
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  auditFitCheckSchemas,
  collectJsonLdBlocks,
  getSchemaTypes
};
