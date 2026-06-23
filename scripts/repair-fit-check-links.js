#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdirSync, readdirSync, readFileSync, writeFileSync } = require('node:fs');

const REPORT_DATE = '2026-06-23';

function listFitCheckSlugs(fitCheckDir) {
  return new Set(readdirSync(fitCheckDir)
    .filter((file) => file.endsWith('.html'))
    .map((file) => file.slice(0, -'.html'.length)));
}

function removeMissingFitCheckLinks(html, availableSlugs) {
  let removed = 0;
  const nextHtml = String(html).replace(
    /<a\b([^>]*?)\bhref=["']\/fit-check\/([^"']+)["']([^>]*)>[\s\S]*?<\/a>/gi,
    (match, before, slug, after) => {
      if (availableSlugs.has(slug)) return match;
      removed += 1;
      const spacer = before || after ? '' : '';
      return spacer;
    }
  );
  return { html: nextHtml, removed };
}

function repairFitCheckLinks({
  repoRoot = path.resolve(__dirname, '..'),
  reportPath = path.join(repoRoot, 'reports', 'fit-check-link-repair.json'),
  write = true
} = {}) {
  const fitCheckDir = path.join(repoRoot, 'pages', 'fit-check');
  const availableSlugs = listFitCheckSlugs(fitCheckDir);
  const files = [...availableSlugs].map((slug) => `${slug}.html`).sort();
  const changedFiles = [];
  let removedLinks = 0;

  for (const file of files) {
    const filePath = path.join(fitCheckDir, file);
    const html = readFileSync(filePath, 'utf8');
    const repaired = removeMissingFitCheckLinks(html, availableSlugs);
    if (repaired.removed > 0) {
      removedLinks += repaired.removed;
      changedFiles.push({
        file: path.relative(repoRoot, filePath).replace(/\\/g, '/'),
        removed_links: repaired.removed
      });
      if (write) writeFileSync(filePath, repaired.html, 'utf8');
    }
  }

  const report = {
    generated_at: REPORT_DATE,
    scanned_pages: files.length,
    removed_links: removedLinks,
    changed_files: changedFiles
  };

  if (write) {
    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  return report;
}

if (require.main === module) {
  const report = repairFitCheckLinks();
  console.log(`[repair-fit-check-links] pages=${report.scanned_pages} removed=${report.removed_links}`);
}

module.exports = {
  removeMissingFitCheckLinks,
  repairFitCheckLinks
};
