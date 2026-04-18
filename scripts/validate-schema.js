#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readdir, readFile, writeFile } = require('node:fs/promises');

function collectSchemaBlocks(html) {
  const blocks = [];
  const matches = html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of matches) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

function hasDisallowedRatingFields(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((row) => hasDisallowedRatingFields(row));
  if (Object.prototype.hasOwnProperty.call(value, 'aggregateRating')) return true;
  if (Object.prototype.hasOwnProperty.call(value, 'reviewCount')) return true;
  return Object.values(value).some((row) => hasDisallowedRatingFields(row));
}

async function walkHtmlFiles(rootDir) {
  const stack = [rootDir];
  const files = [];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      if (entry.isFile() && entry.name.endsWith('.html')) files.push(fullPath);
    }
  }
  return files;
}

async function validateSchema({
  repoRoot = path.resolve(__dirname, '..'),
  outputPath = path.join(repoRoot, 'reports', 'schema-validation.json'),
  logger = console
} = {}) {
  const htmlFiles = [
    path.join(repoRoot, 'index.html'),
    ...(await walkHtmlFiles(path.join(repoRoot, 'pages')))
  ];

  const issues = [];
  let jsonLdBlocks = 0;

  for (const filePath of htmlFiles) {
    const html = await readFile(filePath, 'utf8');
    const blocks = collectSchemaBlocks(html);
    jsonLdBlocks += blocks.length;
    for (const block of blocks) {
      try {
        const parsed = JSON.parse(block);
        if (hasDisallowedRatingFields(parsed)) {
          issues.push({
            file: path.relative(repoRoot, filePath).replace(/\\/g, '/'),
            issue: 'contains disallowed aggregateRating/reviewCount'
          });
        }
      } catch (error) {
        issues.push({
          file: path.relative(repoRoot, filePath).replace(/\\/g, '/'),
          issue: `invalid JSON-LD: ${error.message}`
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    method: 'local-json-ld-parser',
    pagesChecked: htmlFiles.length,
    jsonLdBlocks,
    errors: issues.length,
    issues
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  logger.log(`Schema validation completed: pages=${report.pagesChecked} blocks=${jsonLdBlocks} errors=${issues.length}`);
  return report;
}

if (require.main === module) {
  validateSchema().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  validateSchema
};
