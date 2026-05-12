'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { mkdir, readFile, rm, writeFile } = require('node:fs/promises');
const { SITE_ORIGIN } = require('./common/site-origin.js');
const { buildHtmlHead, escHtml } = require('./common/html-head.js');
const { stringifyJsonLd } = require('./common/schema-jsonld.js');
const { slugNormalize } = require('./common/slug-normalize.js');
const { displayBrandName } = require('./utils/brand-utils.js');

const CATEGORY_META = {
  fridge: { slug: 'fridge', label: 'fridge', plural: 'fridges' },
  dishwasher: { slug: 'dishwasher', label: 'dishwasher', plural: 'dishwashers' },
  dryer: { slug: 'dryer', label: 'dryer', plural: 'dryers' },
  washing_machine: { slug: 'washing-machine', label: 'washing machine', plural: 'washing machines' }
};

const NEW_PAGE_KIND = 'rtings-compare';

function compareText(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''), 'en-AU', { sensitivity: 'base' })
    || String(left ?? '').localeCompare(String(right ?? ''), 'en-AU');
}

function readJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function readJsonFile(filePath, fallback) {
  try {
    return readJson(await readFile(filePath, 'utf8'), fallback);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function getProductsFromCatalog(catalog) {
  if (Array.isArray(catalog)) return catalog;
  if (Array.isArray(catalog?.products)) return catalog.products;
  if (Array.isArray(catalog?.items)) return catalog.items;
  return [];
}

function hasDimensions(product) {
  return [product?.w, product?.h, product?.d].every((value) => Number.isFinite(Number(value)) && Number(value) > 0);
}

function hasRetailer(product) {
  return Array.isArray(product?.retailers) && product.retailers.some((retailer) => /^https?:\/\//i.test(String(retailer?.url ?? '')));
}

function scoreProduct(product) {
  const retailerBoost = hasRetailer(product) ? 10000 : 0;
  const activeBoost = product?.unavailable === false ? 5000 : 0;
  const priority = Number(product?.priorityScore);
  const stars = Number(product?.stars);
  return retailerBoost
    + activeBoost
    + (Number.isFinite(priority) ? priority : 0)
    + (Number.isFinite(stars) ? stars * 10 : 0);
}

function slugifyCompareVs(brandA, brandB, cat) {
  return `${slugNormalize(displayBrandName(brandA))}-vs-${slugNormalize(displayBrandName(brandB))}-${CATEGORY_META[cat]?.slug ?? slugNormalize(cat)}`;
}

function groupProducts(products) {
  const grouped = new Map();
  for (const product of products) {
    if (!product || !CATEGORY_META[product.cat] || !hasDimensions(product) || !product.brand) continue;
    const catMap = grouped.get(product.cat) ?? new Map();
    const brandKey = displayBrandName(product.brand);
    const list = catMap.get(brandKey) ?? [];
    list.push(product);
    catMap.set(brandKey, list);
    grouped.set(product.cat, catMap);
  }

  for (const catMap of grouped.values()) {
    for (const [brand, list] of catMap.entries()) {
      catMap.set(brand, [...list].sort((left, right) => {
        const scoreDelta = scoreProduct(right) - scoreProduct(left);
        if (scoreDelta !== 0) return scoreDelta;
        return compareText(left.model, right.model);
      }));
    }
  }
  return grouped;
}

function rankBrands(catMap) {
  return [...catMap.entries()]
    .map(([brand, products]) => ({
      brand,
      products,
      count: products.length,
      retailerCount: products.filter(hasRetailer).length,
      bestScore: Math.max(...products.map(scoreProduct))
    }))
    .sort((left, right) => {
      if (right.retailerCount !== left.retailerCount) return right.retailerCount - left.retailerCount;
      if (right.count !== left.count) return right.count - left.count;
      if (right.bestScore !== left.bestScore) return right.bestScore - left.bestScore;
      return compareText(left.brand, right.brand);
    });
}

function selectCompareVsPairs(products, { targetPages = 100 } = {}) {
  const grouped = groupProducts(products);
  const seeded = [];
  const extras = [];
  const seen = new Set();

  for (const cat of Object.keys(CATEGORY_META)) {
    const brands = rankBrands(grouped.get(cat) ?? new Map());
    const topFive = brands.slice(0, 5);
    const allBrands = brands.slice(0, 12);

    for (let left = 0; left < topFive.length; left += 1) {
      for (let right = left + 1; right < topFive.length; right += 1) {
        const brandA = topFive[left];
        const brandB = topFive[right];
        const slug = slugifyCompareVs(brandA.brand, brandB.brand, cat);
        if (seen.has(slug)) continue;
        seen.add(slug);
        seeded.push({ cat, brandA, brandB, slug });
      }
    }

    for (let left = 0; left < allBrands.length; left += 1) {
      for (let right = left + 1; right < allBrands.length; right += 1) {
        const brandA = allBrands[left];
        const brandB = allBrands[right];
        const slug = slugifyCompareVs(brandA.brand, brandB.brand, cat);
        if (seen.has(slug)) continue;
        seen.add(slug);
        extras.push({ cat, brandA, brandB, slug });
      }
    }
  }

  return [...seeded, ...extras]
    .filter((row) => hasRetailer(row.brandA.products[0]) || hasRetailer(row.brandB.products[0]))
    .slice(0, targetPages)
    .sort((left, right) => {
      if (left.cat !== right.cat) return compareText(left.cat, right.cat);
      if (left.brandA.brand !== right.brandA.brand) return compareText(left.brandA.brand, right.brandA.brand);
      return compareText(left.brandB.brand, right.brandB.brand);
    });
}

function normalizeForCompare(product) {
  return {
    id: product.id,
    slug: product.id,
    displayName: product.displayName ?? `${displayBrandName(product.brand)} ${product.model}`,
    readableSpec: product.readableSpec,
    brand: displayBrandName(product.brand),
    model: product.model,
    cat: product.cat,
    w: product.w,
    h: product.h,
    d: product.d,
    kwh_year: product.kwh_year,
    stars: product.stars,
    features: product.features,
    retailers: product.retailers,
    evidence: product.evidence,
    data_source: product.data_source,
    unavailable: product.unavailable,
    fitScoreNumeric: product.fitScoreNumeric ?? null,
    delivery: {
      doorwayClearanceMm: Number.isFinite(Number(product.w)) && Number.isFinite(Number(product.d))
        ? Math.ceil(Math.min(Number(product.w), Number(product.d)) + 50)
        : null,
      turnClearanceMm: Number.isFinite(Number(product.w)) && Number.isFinite(Number(product.d))
        ? Math.ceil(Math.max(Number(product.w), Number(product.d)))
        : null
    }
  };
}

function pickBestRetailer(product) {
  const retailers = Array.isArray(product?.retailers) ? product.retailers : [];
  return retailers.find((retailer) => /^https?:\/\//i.test(String(retailer?.url ?? ''))) ?? null;
}

function buildRetailerCtas(products) {
  const links = products
    .map((product) => {
      const retailer = pickBestRetailer(product);
      if (!retailer) return '';
      const brand = displayBrandName(product.brand);
      const model = String(product.model ?? '').trim();
      const retailerName = String(retailer.n ?? retailer.name ?? 'retailer').trim();
      return `<a href="${escHtml(retailer.url)}" target="_blank" rel="sponsored nofollow noopener">Check ${escHtml(brand)} ${escHtml(model)} at ${escHtml(retailerName)} →</a>`;
    })
    .filter(Boolean);
  if (links.length === 0) return '';
  return `<section class="comparison-detail">
      <h2>Retailer pages to verify current availability</h2>
      <p>Use these direct retailer pages as the next step after checking dimensions. Prices and stock can change.</p>
      <p>${links.join(' ')}</p>
    </section>`;
}

function buildCompareVsPageHtml({ row, renderCompareTable, lastUpdated = '1970-01-01' }) {
  const catMeta = CATEGORY_META[row.cat];
  const brandA = row.brandA.brand;
  const brandB = row.brandB.brand;
  const sampleA = normalizeForCompare(row.brandA.products[0]);
  const sampleB = normalizeForCompare(row.brandB.products[0]);
  const title = `${brandA} vs ${brandB} ${catMeta.label} fit comparison`;
  const description = `Compare ${brandA} and ${brandB} ${catMeta.plural} by dimensions, clearance, energy, access, and evidence status for Australian appliance cavities.`;
  const canonical = `${SITE_ORIGIN}/compare/${row.slug}`;
  const tableHtml = renderCompareTable([sampleA, sampleB], { staticPage: true });

  const articleJsonLd = stringifyJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    datePublished: lastUpdated,
    dateModified: lastUpdated,
    author: { '@type': 'Organization', name: 'FitAppliance' },
    publisher: { '@type': 'Organization', name: 'FitAppliance', url: SITE_ORIGIN },
    mainEntityOfPage: canonical
  }, { pretty: true });
  const itemListJsonLd = stringifyJsonLd({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    itemListElement: [sampleA, sampleB].map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: `${product.brand} ${product.model}`
    }))
  }, { pretty: true });

  return `<!doctype html>
<html lang="en-AU">
<head>
${buildHtmlHead({
  title,
  description,
  canonical,
  modifiedTime: lastUpdated
})}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/styles-deferred.css">
  <script type="application/ld+json">${articleJsonLd}</script>
  <script type="application/ld+json">${itemListJsonLd}</script>
</head>
<body>
  <main class="compare-static-page">
    <a class="back-link" href="/">← Back to FitAppliance</a>
    <header class="compare-static-hero">
      <p class="eyebrow">Side-by-side fit comparison</p>
      <h1>${escHtml(title)}</h1>
      <p>${escHtml(description)}</p>
    </header>
    ${tableHtml}
    ${buildRetailerCtas([row.brandA.products[0], row.brandB.products[0]])}
    <section class="comparison-detail">
      <h2>How to use this comparison</h2>
      <p>Start with the dimensions and clearance rows, then check access, energy, and evidence status. A lower clearance requirement is easier to fit; a higher Fit Score is better only when a cavity has been entered.</p>
      <p><a href="/?cat=${escHtml(row.cat)}&intent=compare&brand=${encodeURIComponent(brandA)}&vs=${encodeURIComponent(brandB)}">Run a live cavity comparison for ${escHtml(brandA)} vs ${escHtml(brandB)} →</a></p>
    </section>
    <footer class="comparison-detail">
      <p><a href="/methodology">Methodology</a> · <a href="/about/editorial-standards">Editorial standards</a> · <a href="/affiliate-disclosure">Affiliate disclosure</a></p>
    </footer>
  </main>
</body>
</html>
`;
}

async function loadCompareRenderer(repoRoot) {
  const modulePath = pathToFileURL(path.join(repoRoot, 'public', 'scripts', 'ui', 'compare-table.js')).href;
  const module = await import(`${modulePath}?cacheBust=${Date.now()}`);
  return module.renderCompareTable;
}

async function generateCompareVsPages({
  repoRoot = path.resolve(__dirname, '..'),
  dataPath = path.join(repoRoot, 'public', 'data', 'appliances.json'),
  outputDir = path.join(repoRoot, 'pages', 'compare'),
  targetPages = 100,
  logger = console
} = {}) {
  const catalog = await readJsonFile(dataPath, { products: [] });
  const products = getProductsFromCatalog(catalog);
  const lastUpdated = String(catalog?.last_updated ?? '1970-01-01').slice(0, 10);
  const renderCompareTable = await loadCompareRenderer(repoRoot);
  const indexPath = path.join(outputDir, 'index.json');
  const previousIndex = await readJsonFile(indexPath, []);
  const preservedRows = (Array.isArray(previousIndex) ? previousIndex : []).filter((row) => row.kind !== NEW_PAGE_KIND);

  await mkdir(outputDir, { recursive: true });
  await Promise.all((Array.isArray(previousIndex) ? previousIndex : [])
    .filter((row) => row.kind === NEW_PAGE_KIND && row.slug)
    .map((row) => rm(path.join(outputDir, `${row.slug}.html`), { force: true })));

  const rows = selectCompareVsPairs(products, { targetPages });
  for (const row of rows) {
    const html = buildCompareVsPageHtml({ row, renderCompareTable, lastUpdated });
    await writeFile(path.join(outputDir, `${row.slug}.html`), html, 'utf8');
  }

  const newRows = rows.map((row) => ({
    kind: NEW_PAGE_KIND,
    brandA: row.brandA.brand,
    brandB: row.brandB.brand,
    cat: row.cat,
    slug: row.slug,
    url: `/compare/${row.slug}`,
    modelsA: row.brandA.count,
    modelsB: row.brandB.count
  }));
  const mergedRows = [...preservedRows, ...newRows].sort((left, right) => {
    if (String(left.kind ?? '') !== String(right.kind ?? '')) return compareText(left.kind, right.kind);
    if (String(left.cat ?? '') !== String(right.cat ?? '')) return compareText(left.cat, right.cat);
    if (String(left.brandA ?? '') !== String(right.brandA ?? '')) return compareText(left.brandA, right.brandA);
    return compareText(left.brandB, right.brandB);
  });
  await writeFile(indexPath, `${JSON.stringify(mergedRows, null, 2)}\n`, 'utf8');
  logger.log(`Generated ${newRows.length} RTINGS-style compare-vs pages to pages/compare/`);
  return { generated: newRows.length, outputDir, indexPath, rows: newRows };
}

if (require.main === module) {
  generateCompareVsPages().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildCompareVsPageHtml,
  generateCompareVsPages,
  selectCompareVsPairs,
  slugifyCompareVs
};
