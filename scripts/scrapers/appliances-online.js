'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');

const { createScraperClient, getRetailerDecisionFromAudit } = require('./common/http-client.js');
const { matchProductToCatalog } = require('./common/match-catalog.js');
const { writeScrapeReport } = require('./common/report.js');

const APPLIANCES_ONLINE_RETAILER = 'Appliances Online';
const BASE_URL = 'https://www.appliancesonline.com.au';
const CATEGORY_URLS = {
  fridges: `${BASE_URL}/category/fridges/`,
  dishwashers: `${BASE_URL}/category/dishwashers/`,
  dryers: `${BASE_URL}/category/dryers/`,
  'washing-machines': `${BASE_URL}/category/washing-machines/`,
};

function categoryUrlForAppliancesOnline(category) {
  const url = CATEGORY_URLS[category];
  if (!url) throw new Error(`Unsupported Appliances Online category: ${category}`);
  return url;
}

function text($, root, selectors) {
  for (const selector of selectors) {
    const value = root.find(selector).first().text().trim();
    if (value) return value.replace(/\s+/g, ' ');
  }
  return '';
}

function attr($, root, selectors, attribute) {
  for (const selector of selectors) {
    const value = root.find(selector).first().attr(attribute);
    if (value) return String(value).trim();
  }
  return '';
}

function absoluteUrl(value) {
  if (!value) return '';
  return new URL(value, BASE_URL).toString();
}

function parsePrice(value) {
  const raw = String(value ?? '').replace(/,/g, '');
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function deriveFromTitle(title, brand, model) {
  const cleanTitle = String(title ?? '').replace(/\s+/g, ' ').trim();
  if (brand && model) return { brand, model };

  const parts = cleanTitle.split(/\s+/);
  const derivedBrand = brand || parts.slice(0, 1).join(' ');
  const derivedModel = model || parts.find((part) => /[A-Z]*\d+[A-Z0-9-]*/i.test(part)) || '';
  return { brand: derivedBrand, model: derivedModel };
}

function parseAppliancesOnlineProducts(html, { category, sourceUrl, scrapedAt = new Date().toISOString() } = {}) {
  const $ = cheerio.load(html);
  const cards = $('[data-product-card], .product-card, article[itemtype*="Product"], [itemtype*="Product"]').toArray();
  const products = [];
  const seenUrls = new Set();

  for (const element of cards) {
    const root = $(element);
    const title = text($, root, ['[data-product-title]', '.product-title', '[itemprop="name"]', 'a[href]']);
    const link = attr($, root, ['a[href]'], 'href');
    const url = absoluteUrl(link);
    if (!url || seenUrls.has(url)) continue;

    const brandAttr = root.attr('data-brand') || '';
    const modelAttr = root.attr('data-model') || '';
    const brandText = text($, root, ['[itemprop="brand"]', '.brand', '[data-brand]']);
    const modelText = text($, root, ['[itemprop="model"]', '.model', '[data-model]']);
    const { brand, model } = deriveFromTitle(title, brandAttr || brandText, modelAttr || modelText);
    if (!brand || !model) continue;

    const priceValue =
      attr($, root, ['[data-price]'], 'data-price') ||
      attr($, root, ['[itemprop="price"]'], 'content') ||
      text($, root, ['.price', '[itemprop="price"]']);

    seenUrls.add(url);
    products.push({
      retailer: APPLIANCES_ONLINE_RETAILER,
      category,
      brand,
      model,
      url,
      price: parsePrice(priceValue),
      scraped_at: scrapedAt,
      source_url: sourceUrl,
    });
  }

  return products;
}

async function scrapeAppliancesOnline({
  category,
  maxProducts = 100,
  html,
  fetchImpl,
  client,
  scrapedAt = new Date().toISOString(),
} = {}) {
  const sourceUrl = categoryUrlForAppliancesOnline(category);
  const pageHtml = html ?? await (client ?? createScraperClient({
    fetchImpl,
    legalDecision: 'GREEN',
  })).fetchText(sourceUrl);

  return parseAppliancesOnlineProducts(pageHtml, { category, sourceUrl, scrapedAt }).slice(0, maxProducts);
}

function readCatalog(category) {
  const catalogPath = path.join(__dirname, '..', '..', 'public', 'data', `${category}.json`);
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8')).products ?? [];
}

function parseArgs(argv) {
  const args = {};
  for (const item of argv) {
    if (item === '--report-only') {
      args.reportOnly = true;
      continue;
    }
    const match = item.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const category = args.category || 'fridges';
  const maxProducts = Number(args.maxProducts || args['max-products'] || 100);
  const auditText = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'scraper-legal-audit.md'), 'utf8');
  const legalDecision = getRetailerDecisionFromAudit(auditText, APPLIANCES_ONLINE_RETAILER);
  const products = await scrapeAppliancesOnline({ category, maxProducts, client: createScraperClient({ legalDecision }) });

  if (args.reportOnly) {
    const catalog = readCatalog(category);
    const results = products.map((product) => ({
      ...product,
      match: matchProductToCatalog(product, catalog),
    }));
    const matchedCount = results.filter((product) => product.match?.matched).length;
    const { filePath } = writeScrapeReport('appliances-online', category, results, {
      scraped_count: products.length,
      matched_count: matchedCount,
      unmatched_count: products.length - matchedCount,
    });
    console.log(`Wrote report: ${filePath}`);
    return;
  }

  console.log(JSON.stringify(products, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  APPLIANCES_ONLINE_RETAILER,
  categoryUrlForAppliancesOnline,
  parseAppliancesOnlineProducts,
  scrapeAppliancesOnline,
};

