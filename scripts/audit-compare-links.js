'use strict';

const path = require('node:path');
const { readFile } = require('node:fs/promises');
const { classifyLink, extractAnchors } = require('./audit-link-quality.js');

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function auditCompareLinks(options = {}) {
  const repoRoot = options.repoRoot ?? path.resolve(__dirname, '..');
  const compareIndexPath = path.join(repoRoot, 'pages', 'compare', 'index.json');
  const rows = await readJson(compareIndexPath);

  const results = [];
  for (const row of rows) {
    const filePath = path.join(repoRoot, 'pages', 'compare', `${row.slug}.html`);
    const html = await readFile(filePath, 'utf8');
    const anchors = extractAnchors(html);
    const externalAnchors = anchors.filter((anchor) => /^https?:\/\//i.test(anchor.href));
    const buyLinks = externalAnchors.filter((anchor) => classifyLink(anchor.href, anchor.text) !== 'non_buy_external');
    results.push({
      slug: row.slug,
      externalLinks: externalAnchors.length,
      buyLinks: buyLinks.length,
      hasBuyLink: buyLinks.length > 0
    });
  }

  const summary = {
    totalPages: results.length,
    pagesWithBuyLinks: results.filter((row) => row.hasBuyLink).length,
    pagesWithoutBuyLinks: results.filter((row) => !row.hasBuyLink).length,
    totalBuyLinks: results.reduce((sum, row) => sum + row.buyLinks, 0)
  };

  return { summary, results };
}

if (require.main === module) {
  auditCompareLinks()
    .then(({ summary, results }) => {
      console.log(JSON.stringify({ summary, sampleFailures: results.filter((row) => !row.hasBuyLink).slice(0, 10) }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = { auditCompareLinks };
