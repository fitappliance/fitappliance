'use strict';

const path = require('node:path');
const { readFile } = require('node:fs/promises');

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
    const matches = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    const externalLinks = matches.filter((href) => /^https?:\/\//i.test(href));
    const buyLinks = externalLinks.filter((href) => /jbhifi|thegoodguys|harveynorman|appliancesonline|binglee|westinghouse|lg\.com|hisense|fisherpaykel|smeg|miele/i.test(href));
    results.push({
      slug: row.slug,
      externalLinks: externalLinks.length,
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
