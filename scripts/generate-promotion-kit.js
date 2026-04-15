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
    topQueries: buildTopQueries(products, 10)
  };
}

function buildPromoKit(stats, { today }) {
  const topQueriesMd = stats.topQueries.map((entry, index) => (
    `${index + 1}. "${entry.query}" — ${entry.count} ${entry.note}`
  )).join('\n');

  return `# FitAppliance Promotion Kit
_Auto-generated ${today} from live database_

---

## Site Stats (Current)
- **${stats.totalProducts} appliance models** across ${stats.totalBrands} brands (fridges, washing machines, dishwashers, dryers)
- **${stats.brandPages} brand clearance pages** with installation-specific ventilation data
- **${stats.doorSwingCoveragePct}% door swing coverage** — ${stats.doorSwingCovered} models with confirmed clearance data
- **${stats.comparePages} comparison pages** covering top brand pairs in each category
- Data sourced from the Australian Government Energy Rating database

---

## Platform: Reddit r/AusPropertyChat / r/HomeImprovement

**Post title:**
> Built a tool to check if a fridge actually fits in your kitchen before buying — Australian clearances included

**Body:**
> Moving apartments and measuring for a new fridge is a nightmare. I kept finding specs online but no tool that
> checked whether the ventilation clearances were met (which affects warranty and performance).
>
> Built fitappliance.com.au — it covers ${stats.totalProducts} models across ${stats.totalBrands} brands, checks your exact cavity dimensions,
> and shows which models fit with proper clearance. Also has brand-specific requirements (LG needs more rear
> clearance than Hisense, for example).
>
> Free, no signup, Australian data only.
>
> Happy to answer questions about how it works.

---

## Platform: OzBargain (as a free tool post)

**Title:**
> Free Tool: Check if LG Fridge Fits Your Kitchen Before Buying (AU Data, ${stats.totalProducts} Models)

**Tags:** Free, Tools, Home Improvement, Appliances

**Body:**
> Not a deal but a tool I built that OzBargain users might find useful when shopping for appliances.
>
> **FitAppliance** covers ${stats.totalProducts} fridge/washer/dishwasher/dryer models with:
> - Exact dimensions from the Australian Energy Rating database
> - Per-brand ventilation clearance requirements (important for warranty)
> - ${stats.doorSwingCoveragePct}% of models have door swing clearance data
> - Works on mobile — check in-store before you buy
>
> No affiliate links until I've secured proper partnerships.
> Feedback welcome — still adding more data.
>
> fitappliance.com.au

---

## Platform: Facebook Groups (Kitchen Reno AU, Home Buyers AU)

**Post:**
> Does your new fridge actually *fit* the spot in your kitchen? 🤔
>
> I always assumed "fits the dimensions" meant you were good — turns out the ventilation clearance (the gap
> you need to leave around the fridge) varies by brand and matters for both performance and warranty.
>
> Built a free checker: **fitappliance.com.au**
> Covers ${stats.totalProducts} models, ${stats.totalBrands} brands, ${stats.brandPages} brand-specific clearance guides.

---

## Key Differentiators (for any platform)
1. **Per-brand clearance data** — not just dimensions. LG, WESTINGHOUSE and HISENSE all have different requirements.
2. **${stats.totalProducts} models** — the most comprehensive Australian appliance sizing database.
3. **Door swing data** — ${stats.doorSwingCoveragePct}% coverage. Most tools don't include this.
4. **Energy efficiency + total cost of ownership** built in.
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
  const markdown = buildPromoKit(stats, { today });

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
