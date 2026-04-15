'use strict';

const path = require('node:path');
const { mkdir, readdir, readFile, rm, writeFile } = require('node:fs/promises');
const { displayBrandName } = require('./utils/brand-utils.js');

const CATEGORY_META = {
  fridge: {
    slug: 'fridge',
    labelPlural: 'Fridges',
    labelSingular: 'fridge'
  },
  washing_machine: {
    slug: 'washing-machine',
    labelPlural: 'Washing Machines',
    labelSingular: 'washing machine'
  },
  dishwasher: {
    slug: 'dishwasher',
    labelPlural: 'Dishwashers',
    labelSingular: 'dishwasher'
  },
  dryer: {
    slug: 'dryer',
    labelPlural: 'Dryers',
    labelSingular: 'dryer'
  }
};

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return map[char];
  });
}

async function readJson(filePath) {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text);
}

function buildWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': 'https://fitappliance.com.au/#website',
    url: 'https://fitappliance.com.au',
    name: 'FitAppliance',
    description:
      "Australia's most precise appliance size finder. Per-brand ventilation clearances, delivery access check, and government rebates.",
    inLanguage: 'en-AU',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://fitappliance.com.au/?cat={cat}&w={w}&h={h}&d={d}',
        actionAccessibilityRequirement: {
          '@type': 'ActionAccessSpecification',
          requiresSubscription: false
        }
      },
      'query-input': 'required name=width'
    }
  };
}

function buildBrandPageHtml({ brand, category, count, side, rear, top, slug }) {
  const categoryMeta = CATEGORY_META[category] ?? {
    slug: category.replace(/_/g, '-'),
    labelPlural: category,
    labelSingular: category
  };
  const title = `${brand} ${categoryMeta.labelPlural} Clearance Requirements Australia | FitAppliance`;
  const description =
    `${brand} ${categoryMeta.labelSingular} ventilation clearance guide for Australian homes. ` +
    `Requires ${side}mm side, ${rear}mm rear, ${top}mm top clearance. Find the ${count} ${brand} ` +
    `${categoryMeta.labelSingular} models that fit your cavity.`;
  const canonical = `https://fitappliance.com.au/brands/${slug}`;
  const ctaUrl = `/?cat=${encodeURIComponent(category)}&brand=${encodeURIComponent(brand)}`;
  const siteJsonLd = JSON.stringify(buildWebSiteJsonLd(), null, 2);

  return `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escHtml(description)}">
  <link rel="canonical" href="${canonical}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --ink:#131210;
      --ink-2:#3D3A35;
      --ink-3:#7A766E;
      --paper:#FAF8F4;
      --white:#FFFFFF;
      --copper:#B55A2C;
      --border:#E0D9CE;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Outfit', sans-serif;
      color: var(--ink);
      background: var(--paper);
      line-height: 1.7;
    }
    main {
      max-width: 900px;
      margin: 0 auto;
      padding: 56px 24px 72px;
    }
    .back-link {
      display: inline-block;
      text-decoration: none;
      color: var(--ink-3);
      font-size: 13px;
      margin-bottom: 18px;
    }
    h1 {
      margin: 0 0 12px;
      font-family: 'Instrument Serif', serif;
      font-size: clamp(34px, 5vw, 50px);
      line-height: 1.1;
      letter-spacing: -0.4px;
    }
    p {
      margin: 0 0 16px;
      color: var(--ink-2);
      font-size: 16px;
    }
    .metric-grid {
      margin: 22px 0 28px;
      padding: 18px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--white);
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 10px;
    }
    .metric {
      font-size: 14px;
      color: var(--ink-2);
    }
    .metric b {
      color: var(--ink);
      font-size: 17px;
      font-weight: 700;
    }
    .cta {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      padding: 12px 20px;
      border-radius: 9px;
      background: var(--ink);
      color: #fff;
      font-weight: 700;
      font-size: 14px;
      transition: background .15s;
    }
    .cta:hover { background: var(--copper); }
    footer {
      margin-top: 36px;
      font-size: 13px;
      color: var(--ink-3);
    }
  </style>
</head>
<body>
  <main>
    <a class="back-link" href="https://fitappliance.com.au">← Back to FitAppliance</a>
    <h1>${escHtml(brand)} ${escHtml(categoryMeta.labelPlural)} Clearance Requirements</h1>
    <p>
      Australian installation guidance for <strong>${escHtml(brand)}</strong> ${escHtml(categoryMeta.labelPlural.toLowerCase())}
      should account for ventilation and access spacing before purchase.
    </p>
    <p>
      Current baseline clearance for this brand/category is <strong>${side}mm side</strong>,
      <strong>${rear}mm rear</strong>, and <strong>${top}mm top</strong>. These values help prevent
      airflow restriction, heat build-up, and service-access issues.
    </p>
    <div class="metric-grid">
      <div class="metric">Side clearance<br><b>${side}mm</b></div>
      <div class="metric">Rear clearance<br><b>${rear}mm</b></div>
      <div class="metric">Top clearance<br><b>${top}mm</b></div>
      <div class="metric">Models in database<br><b>${count}</b></div>
    </div>
    <a class="cta" href="${ctaUrl}">Find ${escHtml(brand)} ${escHtml(categoryMeta.labelPlural)} Models That Fit Your Space</a>
    <footer>
      <p>Source: FitAppliance clearance and model coverage dataset for Australia.</p>
    </footer>
  </main>
  <script type="application/ld+json">
${siteJsonLd}
  </script>
</body>
</html>
`;
}

async function cleanOutputDir(outputDir) {
  await mkdir(outputDir, { recursive: true });
  const entries = await readdir(outputDir, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile()) return;
    if (!entry.name.endsWith('.html') && entry.name !== 'index.json') return;
    await rm(path.join(outputDir, entry.name), { force: true });
  }));
}

async function generateBrandPages(options = {}) {
  const repoRoot = options.repoRoot ?? path.resolve(__dirname, '..');
  const dataDir = options.dataDir ?? path.join(repoRoot, 'public', 'data');
  const outputDir = options.outputDir ?? path.join(repoRoot, 'pages', 'brands');
  const logger = options.logger ?? console;

  const appliances = await readJson(path.join(dataDir, 'appliances.json'));
  const clearance = await readJson(path.join(dataDir, 'clearance.json'));
  const products = Array.isArray(appliances.products) ? appliances.products : [];
  const rules = clearance.rules ?? {};

  await cleanOutputDir(outputDir);

  const pageBySlug = new Map();

  for (const [category, brandRules] of Object.entries(rules)) {
    if (!brandRules || typeof brandRules !== 'object') continue;

    for (const [brand, rule] of Object.entries(brandRules)) {
      if (brand === '__default__') continue;
      if (!rule || typeof rule !== 'object') continue;

      const modelCount = products.filter((product) =>
        product.cat === category && product.brand === brand
      ).length;
      if (modelCount < 1) continue;

      const brandSlug = slugify(brand);
      const categorySlug = CATEGORY_META[category]?.slug ?? slugify(category.replace(/_/g, '-'));
      const slug = `${brandSlug}-${categorySlug}-clearance`;
      const fileName = `${slug}.html`;
      const filePath = path.join(outputDir, fileName);

      const side = Number.isFinite(rule.side) ? rule.side : 0;
      const rear = Number.isFinite(rule.rear) ? rule.rear : 0;
      const top = Number.isFinite(rule.top) ? rule.top : 0;

      const pageRecord = {
        brand,
        cat: category,
        slug,
        url: `/brands/${slug}`,
        models: modelCount,
        side,
        rear,
        top,
        filePath
      };

      const existing = pageBySlug.get(slug);
      if (!existing || pageRecord.models > existing.models) {
        pageBySlug.set(slug, pageRecord);
      }
    }
  }

  const indexRows = Array.from(pageBySlug.values());
  for (const row of indexRows) {
    const displayBrand = displayBrandName(row.brand);
    const html = buildBrandPageHtml({
      brand: displayBrand,
      category: row.cat,
      count: row.models,
      side: row.side,
      rear: row.rear,
      top: row.top,
      slug: row.slug
    });
    await writeFile(row.filePath, html, 'utf8');
  }

  indexRows.sort((a, b) => {
    if (a.cat !== b.cat) return a.cat.localeCompare(b.cat);
    if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
    return b.models - a.models;
  });

  const serializableRows = indexRows.map(({ brand, cat, slug, url, models }) => ({
    brand,
    cat,
    slug,
    url,
    models
  }));

  const indexPath = path.join(outputDir, 'index.json');
  await writeFile(indexPath, `${JSON.stringify(serializableRows, null, 2)}\n`, 'utf8');
  logger.log(`Generated ${serializableRows.length} brand clearance pages to pages/brands/`);

  return {
    generated: serializableRows.length,
    outputDir,
    indexPath
  };
}

if (require.main === module) {
  generateBrandPages().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  generateBrandPages,
  slugify
};
