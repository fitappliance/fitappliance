#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readdir, readFile, rm, writeFile } = require('node:fs/promises');

const MIN_WIDTH = 500;
const MAX_WIDTH = 1100;
const STEP = 10;

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

async function readJson(filePath, fallback = null) {
  try {
    const text = await readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === 'ENOENT' && fallback !== null) {
      return fallback;
    }
    throw error;
  }
}

function buildWidthRange(min, max, step) {
  const values = [];
  for (let width = min; width <= max; width += step) {
    values.push(width);
  }
  return values;
}

function findClearance(clearanceRules, brand) {
  const fridgeRules = clearanceRules?.fridge ?? {};
  return fridgeRules[brand] ?? fridgeRules.__default__ ?? { side: 20 };
}

function buildItemListJsonLd(width, products) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Fridges that fit a ${width}mm cavity`,
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Product',
        name: `${product.brand} ${product.model}`,
        brand: { '@type': 'Brand', name: product.brand }
      }
    }))
  };
}

function buildBreadcrumbJsonLd(width) {
  const slug = `${width}mm-fridge`;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://fitappliance.com.au/'
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Cavity Guides',
        item: 'https://fitappliance.com.au/cavity'
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: `${width}mm Fridge Cavity`,
        item: `https://fitappliance.com.au/cavity/${slug}`
      }
    ]
  };
}

function buildPageHtml({
  width,
  resultCount,
  featured,
  adjacentWidths,
  topBrands,
  compareLinks
}) {
  const title = `Fridges that fit a ${width}mm cavity (Australia 2026) | FitAppliance`;
  const description = `${resultCount} fridges fit a ${width}mm kitchen cavity. Includes Samsung, LG, Fisher & Paykel. Free cavity checker.`;
  const canonical = `https://fitappliance.com.au/cavity/${width}mm-fridge`;
  const itemListJsonLd = JSON.stringify(buildItemListJsonLd(width, featured), null, 2);
  const breadcrumbJsonLd = JSON.stringify(buildBreadcrumbJsonLd(width), null, 2);

  return `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escHtml(description)}">
  <link rel="canonical" href="${canonical}">
  <style>
    :root { --ink:#131210; --ink-2:#3d3a35; --ink-3:#7a766e; --paper:#faf8f4; --white:#fff; --copper:#b55a2c; --border:#e0d9ce; }
    body { margin:0; font-family:Arial, sans-serif; color:var(--ink); background:var(--paper); line-height:1.6; }
    main { max-width:980px; margin:0 auto; padding:40px 20px 60px; }
    h1 { margin:0 0 10px; font-size:34px; }
    p { color:var(--ink-2); }
    .card-grid { display:grid; gap:10px; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); margin-top:18px; }
    .card { background:var(--white); border:1px solid var(--border); border-radius:10px; padding:12px; }
    .meta { color:var(--ink-3); font-size:13px; }
    a { color:var(--copper); text-decoration:none; }
    a:hover { text-decoration:underline; }
    .nav, .brands, .compare { margin-top:18px; display:flex; gap:10px; flex-wrap:wrap; }
    .chip { background:var(--white); border:1px solid var(--border); border-radius:999px; padding:6px 10px; font-size:13px; }
  </style>
</head>
<body>
  <main>
    <a href="https://fitappliance.com.au/">← Back to FitAppliance</a>
    <h1>Fridges that fit a ${width}mm cavity (Australia 2026)</h1>
    <p>${resultCount} fridge models currently fit this cavity width after per-brand side clearance.</p>
    <p>Use this page as a quick shortlist, then run your exact height/depth check on the main calculator.</p>

    <div class="nav">
      ${adjacentWidths.previous ? `<a class="chip" href="/cavity/${adjacentWidths.previous}mm-fridge">← ${adjacentWidths.previous}mm</a>` : ''}
      <a class="chip" href="https://fitappliance.com.au/?cat=fridge&w=${width}&h=1800&d=700">Run full fit check</a>
      ${adjacentWidths.next ? `<a class="chip" href="/cavity/${adjacentWidths.next}mm-fridge">${adjacentWidths.next}mm →</a>` : ''}
    </div>

    <h2>Top brands that fit ${width}mm</h2>
    <div class="brands">
      ${topBrands.map((row) => `<a class="chip" href="/?cat=fridge&brand=${encodeURIComponent(row.brand)}&w=${width}&h=1800&d=700">${escHtml(row.brand)} (${row.count})</a>`).join('')}
    </div>

    <h2>Featured models</h2>
    <div class="card-grid">
      ${featured.map((product) => `<article class="card">
        <strong>${escHtml(product.brand)} ${escHtml(product.model)}</strong>
        <div class="meta">W ${product.w} × H ${product.h} × D ${product.d} mm</div>
        <div class="meta">${product.stars}★ · ${product.kwh_year ?? '-'} kWh/yr</div>
      </article>`).join('')}
    </div>

    ${compareLinks.length > 0 ? `<h2>Popular brand comparisons</h2>
    <div class="compare">
      ${compareLinks.map((link) => `<a class="chip" href="${escHtml(link.url)}">${escHtml(link.label)}</a>`).join('')}
    </div>` : ''}
  </main>
  <script type="application/ld+json">
${itemListJsonLd}
  </script>
  <script type="application/ld+json">
${breadcrumbJsonLd}
  </script>
</body>
</html>
`;
}

async function cleanOutputDir(outputDir) {
  await mkdir(outputDir, { recursive: true });
  const entries = await readdir(outputDir, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    if (entry.isFile() && (entry.name.endsWith('.html') || entry.name === 'index.json')) {
      await rm(path.join(outputDir, entry.name), { force: true });
    }
  }));
}

async function generateCavityPages(options = {}) {
  const repoRoot = options.repoRoot ?? path.resolve(__dirname, '..');
  const dataDir = options.dataDir ?? path.join(repoRoot, 'public', 'data');
  const outputDir = options.outputDir ?? path.join(repoRoot, 'pages', 'cavity');
  const logger = options.logger ?? console;

  const appliances = await readJson(path.join(dataDir, 'appliances.json'));
  const clearance = await readJson(path.join(dataDir, 'clearance.json'));
  const compareIndex = await readJson(path.join(repoRoot, 'pages', 'compare', 'index.json'), []);
  const products = (appliances.products ?? []).filter((product) => product.cat === 'fridge');
  const widths = buildWidthRange(MIN_WIDTH, MAX_WIDTH, STEP);

  await cleanOutputDir(outputDir);
  const rows = [];

  for (let index = 0; index < widths.length; index += 1) {
    const width = widths[index];
    const matched = products.filter((product) => {
      const clearanceRule = findClearance(clearance.rules, product.brand);
      const side = Number.isFinite(clearanceRule.side) ? clearanceRule.side : 20;
      return (product.w + side * 2) <= width;
    });

    const featured = [...matched]
      .sort((left, right) => {
        const rightStars = Number.isFinite(right.stars) ? right.stars : -1;
        const leftStars = Number.isFinite(left.stars) ? left.stars : -1;
        if (rightStars !== leftStars) return rightStars - leftStars;
        return String(left.model).localeCompare(String(right.model));
      })
      .slice(0, 18);

    const brandCounts = new Map();
    for (const product of matched) {
      brandCounts.set(product.brand, (brandCounts.get(product.brand) ?? 0) + 1);
    }
    const topBrands = [...brandCounts.entries()]
      .map(([brand, count]) => ({ brand, count }))
      .sort((left, right) => right.count - left.count || left.brand.localeCompare(right.brand))
      .slice(0, 8);

    const compareLinks = (compareIndex ?? [])
      .filter((entry) => entry.cat === 'fridge')
      .slice(0, 8)
      .map((entry) => ({
        url: entry.url,
        label: `${entry.brandA} vs ${entry.brandB}`
      }));

    const html = buildPageHtml({
      width,
      resultCount: matched.length,
      featured,
      adjacentWidths: {
        previous: widths[index - 1] ?? null,
        next: widths[index + 1] ?? null
      },
      topBrands,
      compareLinks
    });

    const slug = `${width}mm-fridge`;
    const filePath = path.join(outputDir, `${slug}.html`);
    await writeFile(filePath, html, 'utf8');

    rows.push({
      width,
      slug,
      url: `/cavity/${slug}`,
      results: matched.length
    });
  }

  const indexPath = path.join(outputDir, 'index.json');
  await writeFile(indexPath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  logger.log(`Generated ${rows.length} cavity pages to pages/cavity/`);

  return {
    generated: rows.length,
    outputDir,
    indexPath
  };
}

if (require.main === module) {
  generateCavityPages().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  generateCavityPages
};
