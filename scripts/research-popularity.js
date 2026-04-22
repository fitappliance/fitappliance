'use strict';

const path = require('node:path');
const { mkdir, readFile, writeFile } = require('node:fs/promises');

const { inferBrandTier } = require('./common/popularity-score.js');
const { CAT_FILE_MAP } = require('./split-appliances.js');

const DEFAULT_FETCH_LIMIT = 500;
const RESEARCH_SCHEMA_VERSION = 2;
const OUT_OF_STOCK_RE = /\b(out of stock|sold out|discontinued|no longer available)\b/i;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function buildFallbackResearchDocument() {
  return {
    schema_version: RESEARCH_SCHEMA_VERSION,
    last_researched: null,
    cursor: 0,
    researched: 0,
    totalCatalog: 0,
    skipped: [],
    last_batch: {
      researched: 0,
      skipped: 0
    },
    products: {}
  };
}

function buildResearchBackfillMarkdown({ products = [] } = {}) {
  const lines = [
    '# Phase 42A Research Backfill',
    '',
    'Manual retailer research is required because sandbox WebFetch could not reach the live AU retailer pages.',
    '',
    'For each product below, confirm these fields by opening real retailer product pages manually:',
    '',
    '- `retailersAvailable`',
    '- `retailersChecked`',
    '- `reviewCountSum`',
    '- `priceMinAud`',
    '- `priceMaxAud`',
    '- `researchedAt`',
    '',
    '## Products to backfill',
    ''
  ];

  for (const product of products) {
    lines.push(`- \`${product.id}\` — ${product.brand} ${product.model}`);
  }

  lines.push('');
  lines.push('Add the confirmed values into `data/popularity-research.json` and rerun `npm run enrich-appliances`.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function buildResearchQueue(products, { limit = DEFAULT_FETCH_LIMIT, cursor = 0 } = {}) {
  const rows = (Array.isArray(products) ? products : [])
    .filter((product) => {
      const tier = inferBrandTier(product?.brand);
      return tier === 'tier1' || tier === 'tier2';
    });

  return rows.slice(cursor, cursor + limit);
}

function getEffectiveResearchDocument(document) {
  if (document?.schema_version === RESEARCH_SCHEMA_VERSION) {
    return {
      ...buildFallbackResearchDocument(),
      ...document,
      skipped: Array.isArray(document?.skipped) ? document.skipped : [],
      products: typeof document?.products === 'object' && document?.products !== null ? document.products : {},
      last_batch: {
        researched: Number.isInteger(document?.last_batch?.researched) ? document.last_batch.researched : 0,
        skipped: Number.isInteger(document?.last_batch?.skipped) ? document.last_batch.skipped : 0
      }
    };
  }

  return buildFallbackResearchDocument();
}

function resolveBatchSize(env = process.env) {
  const value = Number.parseInt(String(env?.RESEARCH_BATCH_SIZE ?? ''), 10);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_FETCH_LIMIT;
}

async function loadCatalogProducts({
  dataDir
}) {
  const catalog = [];
  const seen = new Set();

  for (const fileName of Object.values(CAT_FILE_MAP)) {
    const filePath = path.join(dataDir, fileName);
    let document;
    try {
      document = JSON.parse(await readFile(filePath, 'utf8'));
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }

    for (const product of Array.isArray(document?.products) ? document.products : []) {
      const dedupeKey = String(product?.slug ?? product?.id ?? '').trim();
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      catalog.push(product);
    }
  }

  return catalog;
}

function parseReviewCount(text) {
  const schemaMatch = text.match(/"reviewCount"\s*:\s*"?(\d+)"?/i);
  if (schemaMatch) return Number(schemaMatch[1]);
  const looseMatch = text.match(/\b(\d{1,5})\s+reviews?\b/i);
  return looseMatch ? Number(looseMatch[1]) : 0;
}

function parsePriceCandidates(text) {
  const prices = [];
  const schemaMatches = text.matchAll(/"price"\s*:\s*"?(\d+(?:\.\d{2})?)"?/gi);
  for (const match of schemaMatches) {
    prices.push(Math.round(Number(match[1])));
  }
  const dollarMatches = text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g);
  for (const match of dollarMatches) {
    prices.push(Math.round(Number(String(match[1]).replace(/,/g, ''))));
  }
  return prices.filter((value) => Number.isFinite(value) && value > 0);
}

async function inspectRetailerPage(retailer, fetchImpl) {
  const response = await fetchImpl(retailer.url);
  const text = await response.text();
  const available = response.status === 200 && !OUT_OF_STOCK_RE.test(text);
  const reviewCount = parseReviewCount(text);
  const prices = parsePriceCandidates(text);

  return {
    available,
    status: response.status,
    reviewCount,
    priceMinAud: prices.length > 0 ? Math.min(...prices) : null,
    priceMaxAud: prices.length > 0 ? Math.max(...prices) : null
  };
}

async function writeJson(filePath, document) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeFallbackArtifacts({ dataDir, docsDir, products }) {
  const fallbackDocument = buildFallbackResearchDocument();
  const backfillMarkdown = buildResearchBackfillMarkdown({ products });

  await writeJson(dataDir, fallbackDocument);
  await mkdir(docsDir, { recursive: true });
  await writeFile(path.join(docsDir, 'PHASE42A-RESEARCH-BACKFILL.md'), backfillMarkdown, 'utf8');

  return fallbackDocument;
}

async function researchPopularity({
  repoRoot = path.resolve(__dirname, '..'),
  dataDir = path.join(repoRoot, 'public', 'data'),
  outputPath = path.join(repoRoot, 'data', 'popularity-research.json'),
  docsDir = path.join(repoRoot, 'docs'),
  fetchImpl = globalThis.fetch?.bind(globalThis),
  limit = null,
  cursor = null,
  env = process.env,
  logger = console
} = {}) {
  const products = await loadCatalogProducts({ dataDir });
  const previousDocument = getEffectiveResearchDocument(
    await readJson(outputPath, buildFallbackResearchDocument())
  );
  const batchSize = limit ?? resolveBatchSize(env);
  const startCursor = Number.isInteger(cursor)
    ? cursor
    : (Number.isInteger(previousDocument?.cursor) ? previousDocument.cursor : 0);
  const queue = buildResearchQueue(products, { limit: batchSize, cursor: startCursor });

  if (typeof fetchImpl !== 'function') {
    const fallbackDocument = await writeFallbackArtifacts({ dataDir: outputPath, docsDir, products: queue });
    logger.warn?.('[research-popularity] No fetch implementation available. Wrote fallback research document.');
    return {
      mode: 'fallback',
      researched: 0,
      total: queue.length,
      skippedReason: 'missing-fetch',
      document: fallbackDocument
    };
  }

  try {
    const researchedProducts = {
      ...(previousDocument?.products ?? {})
    };
    const skipped = [...(Array.isArray(previousDocument?.skipped) ? previousDocument.skipped : [])];

    for (const product of queue) {
      const productRetailers = Array.isArray(product?.retailers) ? product.retailers : [];
      let retailersAvailable = 0;
      let retailersChecked = 0;
      let reviewCountSum = 0;
      let priceMinAud = null;
      let priceMaxAud = null;
      let resolvedRetailers = [];
      let hadSuccessfulFetch = false;

      for (const retailer of productRetailers) {
        try {
          const result = await inspectRetailerPage(retailer, fetchImpl);
          hadSuccessfulFetch = true;
          retailersChecked += 1;
          if (result.available) {
            retailersAvailable += 1;
            resolvedRetailers.push({
              n: retailer.n,
              url: retailer.url,
              p: result.priceMinAud
            });
          }
          reviewCountSum += result.reviewCount;
          if (Number.isFinite(result.priceMinAud)) {
            priceMinAud = priceMinAud === null ? result.priceMinAud : Math.min(priceMinAud, result.priceMinAud);
          }
          if (Number.isFinite(result.priceMaxAud)) {
            priceMaxAud = priceMaxAud === null ? result.priceMaxAud : Math.max(priceMaxAud, result.priceMaxAud);
          }
        } catch (error) {
          skipped.push({
            id: product.id,
            slug: product.slug ?? null,
            retailer: retailer?.n ?? null,
            reason: error.message
          });
        }
      }

      if (hadSuccessfulFetch) {
        researchedProducts[product.id] = {
          retailersAvailable,
          retailersChecked,
          reviewCountSum,
          priceMinAud,
          priceMaxAud,
          researchedAt: today(),
          retailers: resolvedRetailers
        };
      }
    }

    const document = {
      schema_version: RESEARCH_SCHEMA_VERSION,
      last_researched: today(),
      cursor: Math.min(startCursor + queue.length, products.length),
      researched: Math.min(startCursor + queue.length, products.length),
      totalCatalog: products.length,
      skipped,
      last_batch: {
        researched: queue.length,
        skipped: skipped.length - (previousDocument?.skipped?.length ?? 0)
      },
      products: researchedProducts
    };

    await writeJson(outputPath, document);
    logger.log(
      `[research-popularity] researched=${queue.length} skipped=${skipped.length} total=${products.length} cursor=${document.cursor}`
    );

    return {
      mode: 'researched',
      researched: queue.length,
      total: products.length,
      skippedReason: null,
      document
    };
  } catch (error) {
    const fallbackDocument = await writeFallbackArtifacts({ dataDir: outputPath, docsDir, products: queue });
    logger.warn?.(`[research-popularity] Fallback triggered: ${error.message}`);
    return {
      mode: 'fallback',
      researched: 0,
      total: queue.length,
      skippedReason: error.message,
      document: fallbackDocument
    };
  }
}

if (require.main === module) {
  researchPopularity().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_FETCH_LIMIT,
  buildFallbackResearchDocument,
  buildResearchBackfillMarkdown,
  buildResearchQueue,
  loadCatalogProducts,
  inspectRetailerPage,
  parsePriceCandidates,
  parseReviewCount,
  resolveBatchSize,
  researchPopularity
};
