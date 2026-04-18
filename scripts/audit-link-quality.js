'use strict';

const path = require('node:path');
const { readFile } = require('node:fs/promises');

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function classifyLink(href, label = '') {
  const lowerHref = String(href || '').toLowerCase();
  const lowerLabel = String(label || '').toLowerCase();

  if (!/^https?:\/\//i.test(href)) {
    return 'non_external';
  }

  if (/fonts\.googleapis|fonts\.gstatic|fitappliance\.com\.au/.test(lowerHref)) {
    return 'non_buy_external';
  }

  if (lowerLabel.includes('buy from') || lowerLabel === 'buy now') {
    return 'product_like_buy';
  }

  if (lowerLabel.includes('search at')) {
    return 'retailer_search';
  }

  if (/\/search[/?]|[?&](q|query|text|search|keyword)=/.test(lowerHref)) {
    return 'retailer_search';
  }

  if (/harveynorman\.com\.au\/?$|thegoodguys\.com\.au\/?$|jbhifi\.com\.au\/?$|appliances-?online\.com\.au\/?$|binglee\.com\.au\/?$/i.test(lowerHref)) {
    return 'retailer_homepage';
  }

  return 'product_like_buy';
}

function extractAnchors(html) {
  const anchors = [];
  const regex = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    const inner = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    anchors.push({ href, text: inner });
  }
  return anchors;
}

async function auditLinkQuality(options = {}) {
  const repoRoot = options.repoRoot ?? path.resolve(__dirname, '..');
  const compareIndexPath = path.join(repoRoot, 'pages', 'compare', 'index.json');
  const rows = await readJson(compareIndexPath);

  const pageResults = [];
  for (const row of rows) {
    const filePath = path.join(repoRoot, 'pages', 'compare', `${row.slug}.html`);
    const html = await readFile(filePath, 'utf8');
    const anchors = extractAnchors(html);
    const externalAnchors = anchors.filter((anchor) => /^https?:\/\//i.test(anchor.href));
    const buyAnchors = externalAnchors.filter((anchor) => classifyLink(anchor.href, anchor.text) !== 'non_buy_external');
    const classified = buyAnchors.map((anchor) => ({
      ...anchor,
      kind: classifyLink(anchor.href, anchor.text)
    }));

    const counts = {
      product_like_buy: classified.filter((x) => x.kind === 'product_like_buy').length,
      retailer_search: classified.filter((x) => x.kind === 'retailer_search').length,
      retailer_homepage: classified.filter((x) => x.kind === 'retailer_homepage').length
    };

    let qualityTier = 'none';
    if (counts.product_like_buy > 0) {
      qualityTier = 'strong';
    } else if (counts.retailer_search > 0) {
      qualityTier = 'search_only';
    } else if (counts.retailer_homepage > 0) {
      qualityTier = 'homepage_only';
    }

    pageResults.push({
      slug: row.slug,
      cat: row.cat,
      brandA: row.brandA,
      brandB: row.brandB,
      qualityTier,
      buyLinkCount: classified.length,
      ...counts,
      links: classified
    });
  }

  const summary = {
    totalPages: pageResults.length,
    strongPages: pageResults.filter((x) => x.qualityTier === 'strong').length,
    searchOnlyPages: pageResults.filter((x) => x.qualityTier === 'search_only').length,
    homepageOnlyPages: pageResults.filter((x) => x.qualityTier === 'homepage_only').length,
    noBuyPages: pageResults.filter((x) => x.qualityTier === 'none').length,
    totalProductLikeBuyLinks: pageResults.reduce((sum, x) => sum + x.product_like_buy, 0),
    totalRetailerSearchLinks: pageResults.reduce((sum, x) => sum + x.retailer_search, 0),
    totalRetailerHomepageLinks: pageResults.reduce((sum, x) => sum + x.retailer_homepage, 0)
  };

  const priorityPages = pageResults
    .filter((x) => x.qualityTier !== 'strong')
    .sort((a, b) => {
      const rank = { none: 0, homepage_only: 1, search_only: 2, strong: 3 };
      if (rank[a.qualityTier] !== rank[b.qualityTier]) return rank[a.qualityTier] - rank[b.qualityTier];
      if (a.cat !== b.cat) return String(a.cat).localeCompare(String(b.cat));
      return String(a.slug).localeCompare(String(b.slug));
    });

  return { summary, priorityPages, pageResults };
}

if (require.main === module) {
  auditLinkQuality()
    .then(({ summary, priorityPages }) => {
      console.log(JSON.stringify({ summary, priorityPages: priorityPages.slice(0, 20) }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = { auditLinkQuality, classifyLink, extractAnchors };
