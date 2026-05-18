'use strict';

const path = require('node:path');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { displayBrandName } = require('./utils/brand-utils.js');

async function readJson(filePath, fallback = null) {
  try {
    const text = await readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === 'ENOENT' && fallback !== null) return fallback;
    throw error;
  }
}

function buildTopQueries(products, limit = 10) {
  const counts = new Map();
  const categoryLabels = {
    fridge: 'fridge',
    washing_machine: 'washing machine',
    dishwasher: 'dishwasher',
    dryer: 'dryer'
  };

  for (const product of products ?? []) {
    if (!product?.brand || !product?.cat) continue;
    const key = `${product.brand}::${product.cat}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([key, count]) => {
      const [brand, cat] = key.split('::');
      const displayBrand = displayBrandName(brand);
      const labelCat = categoryLabels[cat] ?? cat;
      return {
        query: `${displayBrand.toLowerCase()} ${labelCat} clearance australia`,
        count,
        note: `${displayBrand} ${labelCat} models in database`
      };
    })
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.query.localeCompare(right.query);
    })
    .slice(0, limit);
}

function buildPromoStats(appliancesDoc, brandsIndexRows, compareIndexRows) {
  const products = Array.isArray(appliancesDoc?.products) ? appliancesDoc.products : [];
  const brands = new Set(products.map((product) => product?.brand).filter(Boolean));
  const doorSwingCovered = products.filter(
    (product) => product?.door_swing_mm !== null && product?.door_swing_mm !== undefined
  ).length;
  const coveragePct = products.length === 0
    ? 0
    : Number(((doorSwingCovered / products.length) * 100).toFixed(1));

  return {
    totalProducts: products.length,
    totalBrands: brands.size,
    brandPages: Array.isArray(brandsIndexRows) ? brandsIndexRows.length : 0,
    comparePages: Array.isArray(compareIndexRows) ? compareIndexRows.length : 0,
    doorSwingCovered,
    doorSwingCoveragePct: coveragePct,
    retailerVerifiedProducts: products.filter((product) => (product?.retailers ?? []).length > 0).length,
    retailerLinks: products.reduce((sum, product) => sum + (product?.retailers ?? []).length, 0),
    priceRows: products.reduce(
      (sum, product) => sum + (product?.retailers ?? []).filter((retailer) => Number(retailer?.p ?? retailer?.price) > 0).length,
      0
    ),
    topQueries: buildTopQueries(products, 10)
  };
}

function fmt(value) {
  return Number(value ?? 0).toLocaleString('en-AU');
}

function buildPromoKit(stats, { today }) {
  const topQueriesMd = stats.topQueries.map((entry, index) => (
    `${index + 1}. "${entry.query}" — ${entry.count} ${entry.note}`
  )).join('\n');

  return `# FitAppliance Promotion Kit
_Auto-generated ${today} from live database_

---

## Site Stats (Current)
- **${fmt(stats.totalProducts)} raw appliance spec rows** across fridges, washing machines, dishwashers, and dryers
- **${fmt(stats.retailerVerifiedProducts)} products with verified retailer product-page links** across the five tracked AU retailers
- **${fmt(stats.retailerLinks)} verified retailer product-page links**; live price rows are ${stats.priceRows === 0 ? 'not yet captured' : fmt(stats.priceRows)}
- **${fmt(stats.brandPages)} brand clearance pages** with installation-specific ventilation data
- **Door swing estimates for the raw specs catalog** where manufacturer values are unavailable
- **${fmt(stats.comparePages)} comparison pages** covering top brand pairs in each category
- Data sourced from the Australian Government Energy Rating database

---

## Platform: Reddit r/AusPropertyChat / r/HomeImprovement

**Post title:**
> Built a tool to check if a fridge actually fits in your kitchen before buying — Australian clearances included

**Body:**
> Moving apartments and measuring for a new fridge is a nightmare. I kept finding specs online but no tool that
> checked whether the ventilation clearances were met (which can affect airflow and performance).
>
> Built fitappliance.com.au — it checks ${fmt(stats.totalProducts)} raw appliance spec rows, checks your exact cavity dimensions,
> and shows which models fit with proper clearance. Also has brand-specific requirements (LG needs more rear
> clearance than Hisense, for example).
>
> Free, no signup, Australian data only.
>
> Happy to answer questions about how it works.

---

## Platform: OzBargain (as a free tool post)

**Title:**
> Free Tool: Check if LG Fridge Fits Your Kitchen Before Buying (AU sizing data)

**Tags:** Free, Tools, Home Improvement, Appliances

**Body:**
> Not a deal but a tool I built that OzBargain users might find useful when shopping for appliances.
>
> **FitAppliance** covers ${fmt(stats.totalProducts)} fridge/washer/dishwasher/dryer spec rows with:
> - Exact dimensions from the Australian Energy Rating database
> - Brand-specific ventilation clearance requirements
> - Door swing estimates where manufacturer values are unavailable
> - Works on mobile — check in-store before you buy
>
> Some retailer links may be affiliate links where verified product pages are available.
> Feedback welcome — still adding more data.
>
> fitappliance.com.au

---

## Platform: Facebook Groups (Kitchen Reno AU, Home Buyers AU)

**Post:**
> Does your new fridge actually *fit* the spot in your kitchen? 🤔
>
> I always assumed "fits the dimensions" meant you were good — turns out the ventilation clearance (the gap
> you need to leave around the fridge) varies by brand and matters for airflow and performance.
>
> Built a free checker: **fitappliance.com.au**
> Covers ${fmt(stats.totalProducts)} raw spec rows, ${fmt(stats.brandPages)} brand-specific clearance guides, and verified retailer product-page links where available.

---

## Key Differentiators (for any platform)
1. **Per-brand clearance data** — not just dimensions. LG, WESTINGHOUSE and HISENSE all have different requirements.
2. **${fmt(stats.totalProducts)} raw spec rows** — a broad Australian appliance sizing database, with retailer-link coverage tracked separately.
3. **Door swing estimates** — useful delivery and daily-use context where manufacturer values are unavailable.
4. **Energy efficiency + energy-cost estimates** built in.
5. **No account needed** — open URL, get answer.

---

## SEO Targets (top 10 by traffic potential)
${topQueriesMd}

---
_Next update: run \`node scripts/generate-promotion-kit.js\`_
`;
}

async function generatePromotionKit({
  repoRoot = path.resolve(__dirname, '..'),
  dataDir = path.join(repoRoot, 'public', 'data'),
  brandsIndexPath = path.join(repoRoot, 'pages', 'brands', 'index.json'),
  compareIndexPath = path.join(repoRoot, 'pages', 'compare', 'index.json'),
  outputPath = path.join(repoRoot, 'docs', 'promotion-kit.md'),
  today = new Date().toISOString().slice(0, 10),
  logger = console
} = {}) {
  const appliancesDoc = await readJson(path.join(dataDir, 'appliances.json'));
  const brandsIndexRows = await readJson(brandsIndexPath, []);
  const compareIndexRows = await readJson(compareIndexPath, []);
  const stats = buildPromoStats(appliancesDoc, brandsIndexRows, compareIndexRows);
  const markdown = buildPromoKit(stats, { today }).trimEnd();

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${markdown}\n`, 'utf8');
  logger.log(`Generated promotion kit at ${outputPath}`);

  return {
    outputPath,
    stats
  };
}

if (require.main === module) {
  generatePromotionKit().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildPromoKit,
  buildPromoStats,
  generatePromotionKit
};
