#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readdir, readFile, writeFile } = require('node:fs/promises');
const { JSDOM } = require('jsdom');
const { FIXED_EPOCH_ISO } = require('./common/file-dates.js');

function countWords(text) {
  return (String(text ?? '').match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []).length;
}

function normalizeText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function auditReviewContentHtml({ html, pagePath, expectedClearance = null } = {}) {
  const dom = new JSDOM(String(html ?? ''));
  const document = dom.window.document;
  const reviewSection = document.querySelector('#review-videos');
  if (!reviewSection) {
    return {
      pagePath,
      checked: false,
      passed: true,
      wordCount: 0,
      issues: []
    };
  }

  const main = document.querySelector('main')?.cloneNode(true) ?? document.body.cloneNode(true);
  main.querySelectorAll('#review-videos, script, style, footer, nav').forEach((node) => node.remove());
  const proseText = normalizeText(main.textContent);
  const wordCount = countWords(proseText);
  const issues = [];

  if (wordCount < 300) {
    issues.push(`Original content must contain at least 300 words; found ${wordCount}.`);
  }

  if (expectedClearance) {
    const { side, rear, top } = expectedClearance;
    if (!new RegExp(`\\b${side}mm\\s+side\\b`, 'i').test(proseText)) issues.push(`Missing ${side}mm side clearance mention.`);
    if (!new RegExp(`\\b${rear}mm\\s+rear\\b`, 'i').test(proseText)) issues.push(`Missing ${rear}mm rear clearance mention.`);
    if (!new RegExp(`\\b${top}mm\\s+top\\b`, 'i').test(proseText)) issues.push(`Missing ${top}mm top clearance mention.`);
  } else {
    if (!/\b\d+mm\s+side\b/i.test(proseText)) issues.push('Missing side clearance reference.');
    if (!/\b\d+mm\s+rear\b/i.test(proseText)) issues.push('Missing rear clearance reference.');
    if (!/\b\d+mm\s+top\b/i.test(proseText)) issues.push('Missing top clearance reference.');
  }

  if (!/\bfit\b|\bcavity\b|\bspace\b/i.test(proseText)) {
    issues.push('Missing fit or cavity judgement language.');
  }

  return {
    pagePath,
    checked: true,
    passed: issues.length === 0,
    wordCount,
    issues
  };
}

async function walkHtmlFiles(dirPath) {
  const out = [];
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walkHtmlFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) out.push(fullPath);
  }
  return out;
}

async function auditReviewContent({
  repoRoot = path.resolve(__dirname, '..'),
  reportPath = path.join(repoRoot, 'reports', 'review-content-audit.json'),
  generatedAt = FIXED_EPOCH_ISO,
  logger = console
} = {}) {
  const htmlFiles = [
    path.join(repoRoot, 'index.html'),
    ...(await walkHtmlFiles(path.join(repoRoot, 'pages')))
  ];

  const pages = [];
  for (const filePath of htmlFiles) {
    const html = await readFile(filePath, 'utf8');
    const result = auditReviewContentHtml({
      html,
      pagePath: path.relative(repoRoot, filePath).replace(/\\/g, '/')
    });
    if (result.checked) pages.push(result);
  }

  const failures = pages.filter((row) => !row.passed);
  const report = {
    generatedAt,
    checkedPages: pages.length,
    failedPages: failures.length,
    pages
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  logger.log(`[audit-review-content] checked=${pages.length} failed=${failures.length}`);
  return {
    reportPath,
    pages,
    failures,
    exitCode: failures.length > 0 ? 1 : 0
  };
}

if (require.main === module) {
  auditReviewContent()
    .then((result) => {
      if (result.exitCode !== 0) process.exitCode = result.exitCode;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  auditReviewContent,
  auditReviewContentHtml,
  countWords
};
