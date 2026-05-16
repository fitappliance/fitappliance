#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readFile, rm, writeFile } = require('node:fs/promises');

const { SITE_ORIGIN } = require('./common/site-origin.js');
const { escHtml, buildHtmlHead } = require('./common/html-head.js');
const { serializeJsonLd } = require('./common/schema-jsonld.js');
const { slugNormalize } = require('./common/slug-normalize.js');

const CATEGORY_LABELS = Object.freeze({
  fridge: 'Fridge',
  washing_machine: 'Washing Machine',
  dishwasher: 'Dishwasher',
  dryer: 'Dryer',
  washtower_combo: 'WashTower'
});

const CATEGORY_HUBS = Object.freeze({
  fridge: '/?cat=fridge',
  washing_machine: '/?cat=washing_machine',
  dishwasher: '/?cat=dishwasher',
  dryer: '/?cat=dryer',
  washtower_combo: '/?cat=washing_machine&category=washtower_combo'
});

function escAttr(value) {
  return escHtml(value);
}

function isFinitePositive(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function roundMm(value) {
  return Math.round(Number(value));
}

function productName(product) {
  const brand = String(product?.brand ?? '').trim();
  const model = String(product?.model ?? '').trim();
  const displayName = String(product?.displayName ?? '').trim();
  const cleanName = (value) => String(value ?? '').replace(/[™®]/g, '').replace(/\s+/g, ' ').trim();
  if (displayName && displayName.toLowerCase().startsWith(brand.toLowerCase())) {
    return cleanName(displayName);
  }
  if (displayName && displayName.length > model.length + brand.length + 2) {
    return cleanName(`${brand} ${displayName}`);
  }
  return cleanName(`${brand} ${model}`);
}

function categoryLabel(product) {
  return CATEGORY_LABELS[product?.cat] ?? String(product?.cat ?? 'Appliance').replace(/_/g, ' ');
}

function slugifyProduct(product) {
  const base = [
    product?.brand,
    product?.model,
    product?.id
  ].filter(Boolean).join(' ');
  return slugNormalize(base).slice(0, 140);
}

function productUrl(product) {
  return `${SITE_ORIGIN}/products/${slugifyProduct(product)}`;
}

function getDimension(product, key, fallbackKey) {
  const fromEvidence = product?.dimensions?.[key];
  if (isFinitePositive(fromEvidence)) return roundMm(fromEvidence);
  if (isFinitePositive(product?.[fallbackKey])) return roundMm(product[fallbackKey]);
  return null;
}

function getClearance(product, key) {
  const value = product?.clearance_requirements?.[key];
  return Number.isFinite(Number(value)) ? Math.max(0, roundMm(value)) : 0;
}

function selectVerifiedProducts(products) {
  return [...(Array.isArray(products) ? products : [])]
    .filter((product) => (
      product?.evidence?.has_pdf_evidence === true &&
      isFinitePositive(getDimension(product, 'width_mm', 'w')) &&
      isFinitePositive(getDimension(product, 'height_mm', 'h')) &&
      isFinitePositive(getDimension(product, 'depth_mm', 'd'))
    ))
    .sort((left, right) => {
      const leftCat = String(left?.cat ?? '');
      const rightCat = String(right?.cat ?? '');
      if (leftCat !== rightCat) return leftCat.localeCompare(rightCat);
      return productName(left).localeCompare(productName(right));
    });
}

function buildAdditionalProperties(product) {
  const properties = [
    { '@type': 'PropertyValue', name: 'Width clearance', value: `${getClearance(product, 'left_mm')}mm left, ${getClearance(product, 'right_mm')}mm right` },
    { '@type': 'PropertyValue', name: 'Top clearance', value: getClearance(product, 'top_mm'), unitCode: 'MMT' },
    { '@type': 'PropertyValue', name: 'Rear clearance', value: getClearance(product, 'rear_mm'), unitCode: 'MMT' },
    { '@type': 'PropertyValue', name: 'Verified source', value: 'Official PDF evidence captured by FitAppliance' }
  ];

  if (product?.data_source) {
    properties.push({ '@type': 'PropertyValue', name: 'Data source', value: String(product.data_source) });
  }
  if (product?.evidence?.verified_at) {
    properties.push({ '@type': 'PropertyValue', name: 'Verified at', value: String(product.evidence.verified_at) });
  }
  if (isFinitePositive(product?.dimensions?.door_open_90_depth_mm)) {
    properties.push({
      '@type': 'PropertyValue',
      name: 'Door open 90 degree depth',
      value: roundMm(product.dimensions.door_open_90_depth_mm),
      unitCode: 'MMT'
    });
  }
  return properties;
}

function buildProductJsonLd(product) {
  const width = getDimension(product, 'width_mm', 'w');
  const height = getDimension(product, 'height_mm', 'h');
  const depth = getDimension(product, 'depth_mm', 'd');
  const name = productName(product);
  const canonical = productUrl(product);
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${canonical}#product`,
    name,
    description: `${name} exact dimensions and verified cavity-fit data for Australian homes.`,
    sku: String(product?.model ?? product?.id ?? ''),
    mpn: String(product?.model ?? product?.id ?? ''),
    category: categoryLabel(product),
    brand: {
      '@type': 'Brand',
      name: String(product?.brand ?? '').trim()
    },
    width: { '@type': 'QuantitativeValue', value: width, unitCode: 'MMT' },
    height: { '@type': 'QuantitativeValue', value: height, unitCode: 'MMT' },
    depth: { '@type': 'QuantitativeValue', value: depth, unitCode: 'MMT' },
    additionalProperty: buildAdditionalProperties(product),
    mainEntityOfPage: canonical
  };

  const firstRetailer = Array.isArray(product?.retailers)
    ? product.retailers.find((retailer) => /^https?:\/\//i.test(String(retailer?.url ?? '')))
    : null;
  if (firstRetailer && Number.isFinite(Number(product?.price)) && Number(product.price) > 0) {
    schema.offers = {
      '@type': 'Offer',
      price: Number(product.price),
      priceCurrency: 'AUD',
      availability: product?.unavailable === true
        ? 'https://schema.org/OutOfStock'
        : 'https://schema.org/InStock',
      url: firstRetailer.url,
      seller: {
        '@type': 'Organization',
        name: String(firstRetailer.n ?? 'Retailer')
      }
    };
  }

  return schema;
}

function buildBreadcrumbJsonLd(product) {
  const canonical = productUrl(product);
  const category = categoryLabel(product);
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'FitAppliance',
        item: SITE_ORIGIN
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: `${category} dimensions`,
        item: `${SITE_ORIGIN}${CATEGORY_HUBS[product?.cat] ?? '/'}`
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: productName(product),
        item: canonical
      }
    ]
  };
}

function buildFaqJsonLd(product) {
  const name = productName(product);
  const width = getDimension(product, 'width_mm', 'w');
  const height = getDimension(product, 'height_mm', 'h');
  const depth = getDimension(product, 'depth_mm', 'd');
  const requiredWidth = width + getClearance(product, 'left_mm') + getClearance(product, 'right_mm');
  const requiredHeight = height + getClearance(product, 'top_mm');
  const requiredDepth = depth + getClearance(product, 'rear_mm');
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `What are the exact dimensions of the ${name}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${name} measures ${width}mm wide, ${height}mm high, and ${depth}mm deep.`
        }
      },
      {
        '@type': 'Question',
        name: `What cavity size does the ${name} need?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Allow at least ${requiredWidth}mm width, ${requiredHeight}mm height, and ${requiredDepth}mm depth once verified clearance requirements are included.`
        }
      },
      {
        '@type': 'Question',
        name: `Is the ${name} verified by FitAppliance?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Yes. FitAppliance has linked this model to PDF evidence and records the source date where available.`
        }
      }
    ]
  };
}

function safeJsonLd(value) {
  return serializeJsonLd(value).replace(/[<>&]/g, (char) => {
    const map = {
      '<': '\\u003c',
      '>': '\\u003e',
      '&': '\\u0026'
    };
    return map[char] ?? char;
  });
}

function renderRetailerLinks(product) {
  const links = (Array.isArray(product?.retailers) ? product.retailers : [])
    .filter((retailer) => /^https?:\/\//i.test(String(retailer?.url ?? '')) && retailer?.n)
    .slice(0, 5)
    .map((retailer) => `<a href="${escAttr(retailer.url)}" rel="sponsored nofollow noopener" target="_blank">${escHtml(retailer.n)}</a>`)
    .join('');
  return links || '<span>No verified retailer link recorded.</span>';
}

function buildProductPageHtml(product) {
  const name = productName(product);
  const category = categoryLabel(product);
  const canonical = productUrl(product);
  const width = getDimension(product, 'width_mm', 'w');
  const height = getDimension(product, 'height_mm', 'h');
  const depth = getDimension(product, 'depth_mm', 'd');
  const requiredWidth = width + getClearance(product, 'left_mm') + getClearance(product, 'right_mm');
  const requiredHeight = height + getClearance(product, 'top_mm');
  const requiredDepth = depth + getClearance(product, 'rear_mm');
  const titleSubject = new RegExp(`\\b${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(name)
    ? name
    : `${name} ${category}`;
  const title = `${titleSubject} Exact Dimensions & Verified Cavity Fit | FitAppliance`;
  const description = `${name} verified dimensions: W ${width}mm, H ${height}mm, D ${depth}mm. Check safe cavity size and clearance requirements before buying in Australia.`;
  const sourceUrl = /^https?:\/\//i.test(String(product?.evidence?.source_url ?? ''))
    ? product.evidence.source_url
    : null;
  const modifiedTime = product?.evidence?.verified_at
    ? `${String(product.evidence.verified_at).slice(0, 10)}T00:00:00+08:00`
    : '2026-05-09T00:00:00+08:00';
  const head = buildHtmlHead({ title, description, canonical, modifiedTime });

  return `<!doctype html>
<html lang="en-AU">
<head>
${head}
  <link rel="stylesheet" href="/styles.css">
  <script type="application/ld+json">${safeJsonLd(buildProductJsonLd(product))}</script>
  <script type="application/ld+json">${safeJsonLd(buildBreadcrumbJsonLd(product))}</script>
  <script type="application/ld+json">${safeJsonLd(buildFaqJsonLd(product))}</script>
  <style>
    .sku-page{max-width:980px;margin:0 auto;padding:48px 24px 72px}
    .sku-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,.7fr);gap:24px}
    .sku-panel{background:#fff;border:1px solid #e0d9ce;border-radius:12px;padding:20px}
    .sku-kicker{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b6b6b}
    .sku-title{font-size:clamp(32px,4vw,52px);line-height:1.02;margin:8px 0 16px}
    .sku-table{width:100%;border-collapse:collapse}
    .sku-table th,.sku-table td{border-bottom:1px solid #eee7dc;padding:10px;text-align:left}
    .sku-badge{display:inline-block;border:1px solid #047857;background:#ecfdf5;color:#047857;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;font-weight:700;padding:2px 6px}
    .sku-source{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;background:#f9fafb;border:1px solid #e5e7eb;padding:12px;margin-top:16px}
    .retailer-strip{display:flex;flex-wrap:wrap;gap:8px}.retailer-strip a{border:1px solid #d8cfc1;padding:8px 10px;color:#1f1f1f;text-decoration:none}
    @media(max-width:760px){.sku-grid{grid-template-columns:1fr}.sku-page{padding:28px 16px 56px}}
  </style>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="/">Fit<span>Appliance</span></a>
    <nav aria-label="Primary">
      <a href="/?cat=fridge">Fridges</a>
      <a href="/?cat=washing_machine">Laundry</a>
      <a href="/?cat=dishwasher">Dishwashers</a>
      <a class="btn" href="/#fit-checker">Find your fit</a>
    </nav>
  </header>
  <main class="sku-page">
    <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a> → <a href="${escAttr(CATEGORY_HUBS[product?.cat] ?? '/')}">${escHtml(category)} dimensions</a> → ${escHtml(name)}</nav>
    <p class="sku-kicker" data-source="catalog-final">${escHtml(product?.brand ?? '')} · ${escHtml(category)} · Model ${escHtml(product?.model ?? product?.id ?? '')}</p>
    <h1 class="sku-title">${escHtml(name)} exact dimensions and verified cavity fit</h1>
    <p data-source="pdf-evidence">${escHtml(description)}</p>
    <p data-source="pdf-evidence"><span class="sku-badge">Verified PDF evidence</span></p>
    <div class="sku-grid">
      <section class="sku-panel">
        <h2>Physical dimensions</h2>
        <table class="sku-table">
          <tbody>
            <tr><th>Width</th><td>${width}mm</td></tr>
            <tr><th>Height</th><td>${height}mm</td></tr>
            <tr><th>Depth</th><td>${depth}mm</td></tr>
            ${isFinitePositive(product?.dimensions?.door_open_90_depth_mm) ? `<tr><th>Door open 90° depth</th><td>${roundMm(product.dimensions.door_open_90_depth_mm)}mm</td></tr>` : ''}
          </tbody>
        </table>
      </section>
      <section class="sku-panel">
        <h2>Minimum cavity to verify</h2>
        <table class="sku-table">
          <tbody>
            <tr><th>Required width</th><td>${requiredWidth}mm</td></tr>
            <tr><th>Required height</th><td>${requiredHeight}mm</td></tr>
            <tr><th>Required depth</th><td>${requiredDepth}mm</td></tr>
          </tbody>
        </table>
      </section>
    </div>
    <section class="sku-panel" style="margin-top:24px">
      <h2>Clearance requirements</h2>
      <table class="sku-table">
        <tbody>
          <tr><th>Left</th><td>${getClearance(product, 'left_mm')}mm</td></tr>
          <tr><th>Right</th><td>${getClearance(product, 'right_mm')}mm</td></tr>
          <tr><th>Top</th><td>${getClearance(product, 'top_mm')}mm</td></tr>
          <tr><th>Rear</th><td>${getClearance(product, 'rear_mm')}mm</td></tr>
        </tbody>
      </table>
      <div class="sku-source">
        Source of truth:
        ${sourceUrl ? `<a href="${escAttr(sourceUrl)}" target="_blank" rel="noopener">PDF evidence</a>` : 'PDF evidence captured'}
        ${product?.evidence?.verified_at ? ` · Verified ${escHtml(product.evidence.verified_at)}` : ''}
      </div>
    </section>
    <section class="sku-panel" style="margin-top:24px">
      <h2>Retailer availability</h2>
      <div class="retailer-strip">${renderRetailerLinks(product)}</div>
    </section>
  </main>
  <footer class="site-footer">
    <a href="/about">About</a>
    <a href="/methodology">Methodology</a>
    <a href="/about/editorial-standards">Editorial standards</a>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
    <a href="/contact">Contact</a>
  </footer>
</body>
</html>
`;
}

function buildProductIndexHtml(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = categoryLabel(row.cat ?? 'appliance');
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  const sections = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, items]) => {
      const links = [...items]
        .sort((left, right) => {
          const leftBrand = String(left.brand ?? '');
          const rightBrand = String(right.brand ?? '');
          if (leftBrand !== rightBrand) return leftBrand.localeCompare(rightBrand);
          return String(left.model ?? left.slug ?? '').localeCompare(String(right.model ?? right.slug ?? ''));
        })
        .map((row) => `<li><a href="${escAttr(row.url)}">${escHtml(`${row.brand} ${row.model}`.trim())}</a></li>`)
        .join('\n');

      return `<section class="sku-panel">
        <h2>${escHtml(label)} verified pages</h2>
        <ul class="product-index-list">
${links}
        </ul>
      </section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Verified appliance dimension pages | FitAppliance</title>
  <meta name="description" content="Browse FitAppliance product pages with PDF-backed appliance dimensions, clearance requirements and source citations.">
  <meta name="article:modified_time" content="2026-05-16T00:00:00+08:00">
  <link rel="canonical" href="${SITE_ORIGIN}/products">
  <style>
    body { margin:0; font-family:'Outfit',-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif; color:#111; background:#faf8f3; }
    header, main, footer { max-width:1120px; margin:0 auto; padding:24px; }
    a { color:#111; text-decoration-thickness:2px; text-underline-offset:3px; }
    .eyebrow { text-transform:uppercase; letter-spacing:.12em; font-size:12px; color:#6b6b6b; font-weight:800; }
    h1 { font-family:Georgia,serif; font-size:clamp(34px,5vw,56px); margin:8px 0 12px; }
    .sku-panel { background:#fff; border:1px solid #ddd4c8; border-radius:16px; padding:20px; margin:18px 0; }
    .product-index-list { columns:3 240px; column-gap:28px; margin:0; padding-left:18px; }
    .product-index-list li { break-inside:avoid; margin:0 0 8px; font-size:14px; }
    footer { color:#666; font-size:13px; }
  </style>
</head>
<body>
  <header>
    <a href="/">FitAppliance</a>
    <p class="eyebrow">Verified product pages</p>
    <h1>PDF-backed appliance dimensions</h1>
    <p>These pages expose crawlable Product, Breadcrumb and FAQ structured data for appliances with captured evidence.</p>
  </header>
  <main>
${sections}
  </main>
  <footer>
    <a href="/about">About</a> · <a href="/methodology">Methodology</a> · <a href="/about/editorial-standards">Editorial standards</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/contact">Contact</a>
  </footer>
</body>
</html>
`;
}

async function loadCatalog(repoRoot) {
  const text = await readFile(path.join(repoRoot, 'data', 'catalog-final.json'), 'utf8');
  const payload = JSON.parse(text);
  return Array.isArray(payload?.products) ? payload.products : [];
}

async function generateProductPages({
  repoRoot = path.resolve(__dirname, '..'),
  outputDir = path.join(repoRoot, 'pages', 'products'),
  logger = console
} = {}) {
  const catalog = await loadCatalog(repoRoot);
  const products = selectVerifiedProducts(catalog);
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const rows = [];
  for (const product of products) {
    const slug = slugifyProduct(product);
    const html = buildProductPageHtml(product);
    await writeFile(path.join(outputDir, `${slug}.html`), html, 'utf8');
    rows.push({
      id: product.id,
      slug,
      url: `/products/${slug}`,
      cat: product.cat,
      brand: product.brand,
      model: product.model,
      verified_at: product?.evidence?.verified_at ?? null
    });
  }

  await writeFile(path.join(outputDir, 'index.json'), `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  await writeFile(path.join(repoRoot, 'pages', 'products.html'), buildProductIndexHtml(rows), 'utf8');
  logger.log(`Generated ${rows.length} verified product pages to ${path.relative(repoRoot, outputDir)}`);
  return { count: rows.length, rows };
}

if (require.main === module) {
  generateProductPages().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildProductJsonLd,
  buildProductIndexHtml,
  buildProductPageHtml,
  categoryLabel,
  generateProductPages,
  productName,
  selectVerifiedProducts,
  slugifyProduct
};
