#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readFile, rm, writeFile } = require('node:fs/promises');
const { SITE_ORIGIN } = require('./common/site-origin.js');
const { loadProvidersFromFile, renderAffiliateCta } = require('./render-affiliate-links.js');
const { getBuildTimestampIso } = require('./utils/build-timestamp.js');

const CATEGORY_ROWS = [
  { slug: 'dishwasher', label: 'Dishwasher', cat: 'dishwasher' },
  { slug: 'fridge', label: 'Fridge', cat: 'fridge' },
  { slug: 'washing-machine', label: 'Washing Machine', cat: 'washing_machine' },
  { slug: 'dryer', label: 'Dryer', cat: 'dryer' },
  { slug: 'oven', label: 'Oven', cat: null }
];

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;'
  }[char]));
}

async function readJson(filePath, fallback = []) {
  try {
    const text = await readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function dedupeLinks(rows) {
  const seen = new Set();
  const output = [];
  for (const row of rows) {
    if (!row || typeof row.url !== 'string') continue;
    if (!row.url.startsWith('/')) continue;
    if (seen.has(row.url)) continue;
    seen.add(row.url);
    output.push({
      url: row.url,
      label: String(row.label ?? row.url)
    });
  }
  return output;
}

function mapBrandLinks(rows, cat) {
  if (!cat) return [];
  return rows
    .filter((row) => row.cat === cat)
    .sort((left, right) => Number(right.models ?? 0) - Number(left.models ?? 0))
    .slice(0, 6)
    .map((row) => ({
      url: row.url ?? `/brands/${row.slug}`,
      label: `${row.brand} ${String(row.cat).replace(/_/g, ' ')} clearance`
    }));
}

function mapCompareLinks(rows, cat) {
  if (!cat) return [];
  return rows
    .filter((row) => row.cat === cat)
    .sort((left, right) => {
      const leftScore = Number(left.modelsA ?? 0) + Number(left.modelsB ?? 0);
      const rightScore = Number(right.modelsA ?? 0) + Number(right.modelsB ?? 0);
      return rightScore - leftScore;
    })
    .slice(0, 5)
    .map((row) => ({
      url: row.url ?? `/compare/${row.slug}`,
      label: `${row.brandA} vs ${row.brandB} ${String(row.cat).replace(/_/g, ' ')}`
    }));
}

function mapCavityLinks(rows) {
  return rows
    .sort((left, right) => Number(right.results ?? 0) - Number(left.results ?? 0))
    .slice(0, 6)
    .map((row) => ({
      url: row.url ?? `/cavity/${row.slug}`,
      label: `${row.width}mm fridge cavity guide`
    }));
}

function mapDoorwayLinks(rows) {
  return rows
    .sort((left, right) => Number(right.results ?? 0) - Number(left.results ?? 0))
    .slice(0, 6)
    .map((row) => ({
      url: row.url ?? `/doorway/${row.slug}`,
      label: `${row.doorway}mm doorway access guide`
    }));
}

function mapGuideLinks(rows) {
  return rows
    .slice(0, 6)
    .map((row) => ({
      url: row.url ?? `/guides/${row.slug}`,
      label: row.title ?? `Guide: ${row.slug}`
    }));
}

function buildLocationModelSamples(products, cat) {
  if (!cat) return [];
  return products
    .filter((product) => product && product.cat === cat)
    .sort((left, right) => {
      const leftStars = Number.isFinite(left.stars) ? left.stars : -1;
      const rightStars = Number.isFinite(right.stars) ? right.stars : -1;
      if (rightStars !== leftStars) return rightStars - leftStars;
      return String(left.model ?? '').localeCompare(String(right.model ?? ''));
    })
    .slice(0, 3)
    .map((product) => ({
      id: product.id,
      brand: product.brand,
      model: product.model,
      affiliate: product.affiliate ?? null
    }));
}

function buildPageLinks({
  city,
  category,
  cities,
  brandRows,
  compareRows,
  cavityRows,
  doorwayRows,
  guideRows
}) {
  const sameCityOtherCategories = CATEGORY_ROWS
    .filter((row) => row.slug !== category.slug)
    .map((row) => ({
      url: `/location/${city.slug}/${row.slug}`,
      label: `${row.label} in ${city.name}`
    }));

  const sameCategoryOtherCities = cities
    .filter((row) => row.slug !== city.slug)
    .map((row) => ({
      url: `/location/${row.slug}/${category.slug}`,
      label: `${category.label} in ${row.name}`
    }));

  const staticLinks = [
    { url: '/', label: 'FitAppliance home' },
    { url: '/affiliate-disclosure', label: 'Affiliate disclosure' },
    { url: '/privacy-policy', label: 'Privacy policy' },
    { url: '/methodology', label: 'Methodology' },
    { url: '/about/editorial-standards', label: 'Editorial standards' }
  ];

  const links = dedupeLinks([
    ...sameCategoryOtherCities,
    ...sameCityOtherCategories,
    ...mapBrandLinks(brandRows, category.cat),
    ...mapCompareLinks(compareRows, category.cat),
    ...mapCavityLinks(cavityRows),
    ...mapDoorwayLinks(doorwayRows),
    ...mapGuideLinks(guideRows),
    ...staticLinks
  ]);

  return links.slice(0, 24);
}

function buildBreadcrumbJsonLd(city, category) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${SITE_ORIGIN}/`
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Location Guides',
        item: `${SITE_ORIGIN}/location`
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: city.name,
        item: `${SITE_ORIGIN}/location/${city.slug}`
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: category.label,
        item: `${SITE_ORIGIN}/location/${city.slug}/${category.slug}`
      }
    ]
  };
}

function buildItemListJsonLd(city, category, links) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${category.label} cavity and doorway resources for ${city.name}`,
    numberOfItems: links.length,
    itemListElement: links.map((row, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@id': `${SITE_ORIGIN}${row.url}`,
        name: row.label
      }
    }))
  };
}

function buildPlaceJsonLd(city) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: `${city.name}, ${city.stateCode}`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: city.name,
      addressRegion: city.stateCode,
      addressCountry: 'AU'
    }
  };
}

function buildPageHtml({
  city,
  category,
  links,
  categoryCount,
  modelSamples = [],
  affiliateProviders = [],
  modifiedTime
}) {
  const h1 = `Appliance Cavity & Doorway Guide — ${category.label} in ${city.name}`;
  const title = `${h1} | FitAppliance`;
  const description = `${category.label} installation resources for ${city.name}, ${city.stateCode}. Browse cavity and doorway fit guides with links to brand clearance pages.`;
  const canonical = `${SITE_ORIGIN}/location/${city.slug}/${category.slug}`;

  const breadcrumbJsonLd = JSON.stringify(buildBreadcrumbJsonLd(city, category), null, 2);
  const itemListJsonLd = JSON.stringify(buildItemListJsonLd(city, category, links), null, 2);
  const placeJsonLd = JSON.stringify(buildPlaceJsonLd(city), null, 2);

  const affiliateRows = modelSamples
    .map((sample) => {
      const cta = renderAffiliateCta(sample, {
        providers: affiliateProviders,
        env: process.env,
        className: 'affiliate-cta',
        buttonClassName: 'affiliate-buy-link',
        disclosureClassName: 'affiliate-disclosure'
      });
      if (!cta) return '';
      return `<li><strong>${escHtml(sample.brand)} ${escHtml(sample.model)}</strong>${cta}</li>`;
    })
    .filter(Boolean)
    .join('\n      ');

  return `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escHtml(description)}">
  <meta name="article:modified_time" content="${escHtml(modifiedTime)}">
  <link rel="canonical" href="${canonical}">
  <style>
    :root { --ink:#131210; --ink-2:#3d3a35; --ink-3:#7a766e; --paper:#faf8f4; --white:#fff; --copper:#b55a2c; --border:#e0d9ce; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; line-height: 1.6; color: var(--ink); background: var(--paper); }
    main { max-width: 960px; margin: 0 auto; padding: 40px 20px 64px; }
    h1 { margin: 0 0 12px; font-size: 32px; }
    p { margin: 0 0 14px; color: var(--ink-2); }
    .city-meta { color: var(--ink-3); font-size: 13px; margin-bottom: 20px; }
    .chip-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px; }
    .chip-row a {
      color: var(--copper); text-decoration: none; background: var(--white); border: 1px solid var(--border);
      border-radius: 999px; padding: 6px 10px; font-size: 13px;
    }
    .chip-row a:hover { text-decoration: underline; }
    ul { margin: 0; padding-left: 18px; }
    li { margin-bottom: 8px; }
    .resource-list a { color: var(--copper); text-decoration: none; }
    .resource-list a:hover { text-decoration: underline; }
    .affiliate-panel { margin-top: 18px; padding: 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--white); }
    .affiliate-panel h2 { margin: 0 0 10px; font-size: 18px; }
    .affiliate-panel ul { margin: 0; padding-left: 18px; }
    .affiliate-panel li { margin-bottom: 10px; }
    .affiliate-cta { margin-top: 6px; }
    .affiliate-buy-link { display: inline-flex; padding: 7px 11px; border-radius: 8px; background: var(--ink); color: #fff; text-decoration: none; font-size: 12px; font-weight: 700; }
    .affiliate-buy-link:hover { background: var(--copper); }
    .affiliate-disclosure { margin: 4px 0 0; font-size: 11px; color: var(--ink-3); }
    .affiliate-disclosure a { color: var(--copper); }
    footer { margin-top: 24px; border-top: 1px solid var(--border); padding-top: 14px; color: var(--ink-3); font-size: 13px; }
    .section-title-lg { font-size:22px; margin:18px 0 10px; }
    .back-link { color:var(--ink-3); text-decoration:none; font-size:13px; }
  </style>
</head>
<body>
  <main>
    <a class="back-link" href="/">← Back to FitAppliance</a>
    <h1>${escHtml(h1)}</h1>
    <p class="city-meta">${escHtml(city.name)}, ${escHtml(city.state)} (${escHtml(city.stateCode)})</p>
    <p>This location guide links to cavity fit, doorway access, and clearance resources relevant to ${escHtml(category.label.toLowerCase())} shopping in ${escHtml(city.name)}.</p>
    <p>${categoryCount > 0 ? `${categoryCount} models are currently listed in this category in our Australian database.` : 'This category guide links to practical fit-check resources across the site.'}</p>

    <div class="chip-row">
      <a href="${SITE_ORIGIN}/?cat=${encodeURIComponent(category.cat ?? 'fridge')}&w=600&h=1800&d=700">Run fit checker for ${escHtml(category.label)}</a>
      <a href="/location/${city.slug}/fridge">Fridge in ${escHtml(city.name)}</a>
      <a href="/location/${city.slug}/dishwasher">Dishwasher in ${escHtml(city.name)}</a>
      <a href="/location/${city.slug}/washing-machine">Washing Machine in ${escHtml(city.name)}</a>
      <a href="/location/${city.slug}/dryer">Dryer in ${escHtml(city.name)}</a>
    </div>

    <h2 class="section-title-lg">Resource Links</h2>
    <ul class="resource-list">
      ${links.map((row) => `<li><a href="${escHtml(row.url)}">${escHtml(row.label)}</a></li>`).join('\n      ')}
    </ul>

    ${affiliateRows ? `<section class="affiliate-panel">
      <h2>Buy Popular ${escHtml(category.label)} Models</h2>
      <ul>
        ${affiliateRows}
      </ul>
    </section>` : ''}

    <footer>
      <a href="/methodology">Methodology</a> ·
      <a href="/about/editorial-standards">Editorial standards</a>
    </footer>
  </main>
  <script type="application/ld+json">
${breadcrumbJsonLd}
  </script>
  <script type="application/ld+json">
${itemListJsonLd}
  </script>
  <script type="application/ld+json">
${placeJsonLd}
  </script>
</body>
</html>
`;
}

async function cleanOutputDir(outputDir) {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
}

async function generateLocationPages(options = {}) {
  const repoRoot = options.repoRoot ?? path.resolve(__dirname, '..');
  const logger = options.logger ?? console;
  const dataDir = options.dataDir ?? path.join(repoRoot, 'data', 'locations');
  const outputDir = options.outputDir ?? path.join(repoRoot, 'pages', 'location');

  const cityDoc = await readJson(path.join(dataDir, 'au-cities.json'));
  const cities = Array.isArray(cityDoc.cities) ? cityDoc.cities : [];
  const brandRows = await readJson(path.join(repoRoot, 'pages', 'brands', 'index.json'));
  const compareRows = await readJson(path.join(repoRoot, 'pages', 'compare', 'index.json'));
  const cavityRows = await readJson(path.join(repoRoot, 'pages', 'cavity', 'index.json'));
  const doorwayRows = await readJson(path.join(repoRoot, 'pages', 'doorway', 'index.json'));
  const guideRows = await readJson(path.join(repoRoot, 'pages', 'guides', 'index.json'));
  const affiliateProviders = await loadProvidersFromFile(
    options.affiliateProvidersPath ?? path.join(repoRoot, 'data', 'affiliates', 'providers.json')
  ).catch(() => []);
  const appliancesDoc = await readJson(path.join(repoRoot, 'public', 'data', 'appliances.json'), { products: [] });
  const products = Array.isArray(appliancesDoc.products) ? appliancesDoc.products : [];

  const categoryCounts = products.reduce((accumulator, product) => {
    const cat = String(product?.cat ?? '');
    accumulator[cat] = (accumulator[cat] ?? 0) + 1;
    return accumulator;
  }, {});

  await cleanOutputDir(outputDir);
  const rows = [];

  for (const city of cities) {
    const cityDir = path.join(outputDir, city.slug);
    await mkdir(cityDir, { recursive: true });

    for (const category of CATEGORY_ROWS) {
      const links = buildPageLinks({
        city,
        category,
        cities,
        brandRows,
        compareRows,
        cavityRows,
        doorwayRows,
        guideRows
      });

      const html = buildPageHtml({
        city,
        category,
        links,
        categoryCount: Number(categoryCounts[category.cat] ?? 0),
        modelSamples: buildLocationModelSamples(products, category.cat),
        affiliateProviders,
        modifiedTime: getBuildTimestampIso()
      });

      const filePath = path.join(cityDir, `${category.slug}.html`);
      await writeFile(filePath, html, 'utf8');

      rows.push({
        slug: `${city.slug}-${category.slug}`,
        city: city.name,
        citySlug: city.slug,
        state: city.state,
        stateCode: city.stateCode,
        category: category.slug,
        cat: category.cat,
        categoryLabel: category.label,
        models: Number(categoryCounts[category.cat] ?? 0),
        url: `/location/${city.slug}/${category.slug}`,
        links: links.length
      });
    }
  }

  await writeFile(path.join(outputDir, 'index.json'), `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  logger.log(`Generated ${rows.length} location pages in ${outputDir}`);
  return {
    outputDir,
    pageCount: rows.length,
    rows
  };
}

if (require.main === module) {
  generateLocationPages().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  CATEGORY_ROWS,
  buildPageLinks,
  generateLocationPages
};
