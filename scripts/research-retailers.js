'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');

const REPO_ROOT = path.resolve(__dirname, '..');

const RETAILERS = [
  { name: 'JB Hi-Fi', domain: 'jbhifi.com.au' },
  { name: 'Harvey Norman', domain: 'harveynorman.com.au' },
  { name: 'The Good Guys', domain: 'thegoodguys.com.au' },
  { name: 'Appliances Online', domain: 'appliancesonline.com.au' },
  { name: 'Bing Lee', domain: 'binglee.com.au' },
];

const CATEGORY_FILES = {
  fridge: 'fridges.json',
  fridges: 'fridges.json',
  dishwasher: 'dishwashers.json',
  dishwashers: 'dishwashers.json',
  dryer: 'dryers.json',
  dryers: 'dryers.json',
  washing_machine: 'washing-machines.json',
  'washing-machines': 'washing-machines.json',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const args = {};
  for (const item of argv) {
    const match = item.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function buildSearchQuery(product, retailer) {
  const brand = String(product?.brand ?? '').trim();
  const model = String(product?.model ?? '').trim();
  const domain = String(retailer?.domain ?? '').trim();
  return `"${[brand, model].filter(Boolean).join(' ')}" site:${domain}`;
}

function duckDuckGoSearchUrl(query) {
  return `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
}

function isBlockedSearchResponse(status, html) {
  const source = String(html ?? '').toLowerCase();
  return status === 403 || source.includes('captcha') || source.includes('blocked') || source.includes('unusual traffic');
}

function unwrapDuckDuckGoUrl(rawHref) {
  if (!rawHref) return '';
  const href = String(rawHref).trim();
  try {
    const parsed = new URL(href, 'https://duckduckgo.com');
    const wrapped = parsed.searchParams.get('uddg');
    return wrapped ? decodeURIComponent(wrapped) : parsed.toString();
  } catch {
    return '';
  }
}

function isProductPageUrl(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    if (/\/(search|collections|collection|category|categories|c\/|cart|checkout)(\/|$)/.test(pathname)) return false;
    if (parsed.searchParams.has('q') || parsed.searchParams.has('query') || parsed.searchParams.has('searchTerm')) return false;
    return /\/(products?|p)\//.test(pathname) || /\.html$/.test(pathname);
  } catch {
    return false;
  }
}

function parseDuckDuckGoResults(html, retailer) {
  const $ = cheerio.load(html);
  const domain = String(retailer?.domain ?? '').replace(/^www\./, '');
  const links = $('a.result__a, a.result-link, a[href]').toArray();

  for (const element of links) {
    const url = unwrapDuckDuckGoUrl($(element).attr('href'));
    if (!url) continue;
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    const host = parsed.hostname.replace(/^www\./, '');
    if (host !== domain) continue;
    if (!isProductPageUrl(url)) continue;
    return {
      url,
      source: 'duckduckgo-search',
    };
  }

  return null;
}

function calculateConfidence(foundCount, totalCount = RETAILERS.length) {
  if (foundCount === totalCount) return 'high';
  if (foundCount >= 2) return 'medium';
  return 'low';
}

function readCatalogProducts({ category } = {}) {
  const dataDir = path.join(REPO_ROOT, 'public', 'data');
  const fileNames = category
    ? [CATEGORY_FILES[category]].filter(Boolean)
    : ['fridges.json', 'dishwashers.json', 'dryers.json', 'washing-machines.json'];

  if (category && fileNames.length === 0) {
    throw new Error(`Unsupported category: ${category}`);
  }

  return fileNames.flatMap((fileName) => {
    const document = JSON.parse(fs.readFileSync(path.join(dataDir, fileName), 'utf8'));
    return (document.products ?? []).map((product) => ({ ...product }));
  });
}

function selectTopProducts(products, top) {
  return [...products]
    .sort((a, b) => (Number(b.priorityScore) || 0) - (Number(a.priorityScore) || 0) || String(a.id).localeCompare(String(b.id)))
    .slice(0, top);
}

async function searchRetailerForProduct(product, retailer, { fetchImpl = globalThis.fetch, sleepFn = sleep, delayMs = 2000 } = {}) {
  const query = buildSearchQuery(product, retailer);
  const url = duckDuckGoSearchUrl(query);
  await sleepFn(delayMs);

  const response = await fetchImpl(url, {
    headers: {
      'user-agent': 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)',
    },
  });
  const html = await response.text();
  if (isBlockedSearchResponse(response.status, html)) {
    return {
      retailer,
      status: 'blocked',
      source: 'duckduckgo-blocked',
    };
  }

  const result = parseDuckDuckGoResults(html, retailer);
  if (!result) {
    return {
      retailer,
      status: 'not_found',
      source: 'duckduckgo-search',
    };
  }

  return {
    retailer,
    status: 'found',
    source: result.source,
    url: result.url,
  };
}

async function researchRetailers({
  top = 50,
  category,
  output,
  fetchImpl = globalThis.fetch,
  sleepFn = sleep,
  now = new Date(),
} = {}) {
  const cappedTop = Math.min(Math.max(Number(top) || 50, 1), 200);
  const researchedAt = now.toISOString();
  const products = selectTopProducts(readCatalogProducts({ category }), cappedTop);
  const reportProducts = {};

  for (const product of products) {
    const foundRetailers = [];
    const statuses = [];

    for (const retailer of RETAILERS) {
      const searchResult = await searchRetailerForProduct(product, retailer, { fetchImpl, sleepFn });
      statuses.push(`${retailer.name}:${searchResult.status}`);
      if (searchResult.status === 'found') {
        foundRetailers.push({
          n: retailer.name,
          url: searchResult.url,
          p: null,
          verified_at: researchedAt,
          source: searchResult.source,
        });
      }
    }

    reportProducts[product.id] = {
      researched_at: researchedAt,
      approved: false,
      confidence: calculateConfidence(foundRetailers.length, RETAILERS.length),
      retailers: foundRetailers,
      notes: foundRetailers.length > 0 ? `found ${foundRetailers.length}/${RETAILERS.length} retailers` : `not found anywhere (${statuses.join(', ')})`,
    };
  }

  const report = {
    schema_version: 1,
    researched_at: researchedAt,
    research_count: products.length,
    products: reportProducts,
  };

  const outputPath = output ?? path.join(REPO_ROOT, 'reports', `manual-retailers-candidates-${researchedAt.slice(0, 10)}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return { outputPath, report };
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const { outputPath, report } = await researchRetailers({
    top: args.top ?? 50,
    category: args.category || undefined,
    output: args.output || undefined,
  });
  console.log(`[research-retailers] wrote ${outputPath} products=${report.research_count}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  RETAILERS,
  buildSearchQuery,
  calculateConfidence,
  duckDuckGoSearchUrl,
  isProductPageUrl,
  parseDuckDuckGoResults,
  researchRetailers,
  selectTopProducts,
};

