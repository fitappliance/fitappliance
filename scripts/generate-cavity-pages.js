#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readdir, readFile, rm, writeFile } = require('node:fs/promises');
const { fillTemplate, loadCopyFile, pickVariant } = require('./common/copy-data.js');
const { buildReviewVideoSection } = require('./common/review-video-renderer.js');
const { SITE_ORIGIN } = require('./common/site-origin.js');
const { generateMeasurementSvg } = require('./generate-measurement-svg');
const {
  buildMeasurementHowToJsonLd,
  buildMeasurementStepsHtml,
  loadMeasurementSteps
} = require('./generate-measurement-content');
const { displayBrandName } = require('./utils/brand-utils.js');
const { getBuildTimestampIso } = require('./utils/build-timestamp.js');

const MIN_WIDTH = 500;
const MAX_WIDTH = 1100;
const STEP = 10;
const DEFAULT_CAVITY_HEIGHT_MM = 1800;
const DEFAULT_CAVITY_DEPTH_MM = 700;
const GUIDE_HUB_LINKS = [
  { url: '/guides/fridge-clearance-requirements', label: 'Fridge Clearance Requirements Guide' },
  { url: '/guides/appliance-fit-sizing-handbook', label: 'Appliance Fit Sizing Handbook' },
  { url: '/guides/dishwasher-cavity-sizing', label: 'Dishwasher Cavity Sizing Guide' },
  { url: '/guides/washing-machine-doorway-access', label: 'Washing Machine Doorway Access Guide' },
  { url: '/guides/dryer-ventilation-guide', label: 'Dryer Ventilation Guide' }
];

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

function buildProductJsonLd(width, featured) {
  const lead = Array.isArray(featured) && featured.length > 0 ? featured[0] : null;
  const base = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: lead ? `${lead.brand} ${lead.model}` : `${width}mm fridge cavity shortlist`,
    description: `${width}mm fridge cavity shortlist for Australian installations with brand-specific ventilation clearances.`,
    category: 'Refrigerator'
  };
  if (lead) {
    base.brand = { '@type': 'Brand', name: lead.brand };
    base.width = { '@type': 'QuantitativeValue', value: lead.w, unitCode: 'MMT' };
    base.height = { '@type': 'QuantitativeValue', value: lead.h, unitCode: 'MMT' };
    base.depth = { '@type': 'QuantitativeValue', value: lead.d, unitCode: 'MMT' };
  }
  return base;
}

function buildSpeakableJsonLd(canonicalPath) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    url: `${SITE_ORIGIN}${canonicalPath}`,
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['#quick-answer']
    }
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
        item: `${SITE_ORIGIN}/`
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Cavity Guides',
        item: `${SITE_ORIGIN}/cavity`
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: `${width}mm Fridge Cavity`,
        item: `${SITE_ORIGIN}/cavity/${slug}`
      }
    ]
  };
}

function buildPageHtml({
  width,
  cavityHeightMm,
  cavityDepthMm,
  resultCount,
  introText,
  featured,
  adjacentWidths,
  relatedWidths,
  topBrands,
  compareLinks,
  reviewSectionHtml = '',
  modifiedTime,
  measurementSvgHtml,
  measurementStepsHtml,
  howToJsonLd
}) {
  const title = `Fridges that fit a ${width}mm cavity (Australia 2026) | FitAppliance`;
  const description = `${resultCount} fridges fit a ${width}mm kitchen cavity. Includes Samsung, LG, Fisher & Paykel. Free cavity checker.`;
  const canonical = `${SITE_ORIGIN}/cavity/${width}mm-fridge`;
  const itemListJsonLd = JSON.stringify(buildItemListJsonLd(width, featured), null, 2);
  const breadcrumbJsonLd = JSON.stringify(buildBreadcrumbJsonLd(width), null, 2);
  const productJsonLd = JSON.stringify(buildProductJsonLd(width, featured), null, 2);
  const speakableJsonLd = JSON.stringify(buildSpeakableJsonLd(`/cavity/${width}mm-fridge`), null, 2);
  const howToSchemaJsonLd = JSON.stringify(howToJsonLd, null, 2);

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
    :root { --ink:#131210; --ink-2:#3d3a35; --ink-3:#6b6b6b; --paper:#faf8f4; --white:#fff; --copper:#b55a2c; --border:#e0d9ce; }
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
    .tool-callout {
      margin-top: 14px;
      padding: 11px 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--paper);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--ink-2);
    }
    .tool-callout a { font-weight: 700; }
    .btn-pdf-export {
      border: 1px solid var(--border);
      background: var(--white);
      color: var(--ink-2);
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 13px;
      cursor: pointer;
    }
    .btn-pdf-export:hover { border-color: var(--copper); color: var(--copper); }
    #measure { margin-top: 24px; background: var(--white); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
    #measure h2 { margin: 0 0 10px; font-size: 22px; }
    .measurement-svg { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 10px; }
    .measurement-view { width: 100%; height: auto; background: #fbfaf7; border: 1px solid var(--border); border-radius: 10px; padding: 8px; box-sizing: border-box; }
    .measurement-steps { margin-top: 10px; display: grid; gap: 8px; }
    .measure-step { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; background: #fff; }
    .measure-step summary { cursor: pointer; font-weight: 600; color: var(--ink-2); }
    .measure-step p { margin: 8px 0 0; font-size: 14px; color: var(--ink-2); }
    .measurement-note { margin: 2px 0 0; font-size: 13px; color: var(--ink-3); }
    .page-footer { margin-top:28px; padding-top:16px; border-top:1px solid var(--border); font-size:13px; color:var(--ink-3); }
  </style>
</head>
<body>
  <main>
    <a href="${SITE_ORIGIN}/">← Back to FitAppliance</a>
    <h1>Fridges that fit a ${width}mm cavity (Australia 2026)</h1>
    <p id="quick-answer">${escHtml(introText)}</p>
    <p>Use this page as a quick shortlist, then run your exact height/depth check on the main calculator.</p>
    <div class="tool-callout">
      <span>Need a fast shortlist?</span>
      <a href="/tools/fit-checker">Try the fit checker</a>
      <button class="btn-pdf-export" data-cavity-slug="${width}mm-fridge" data-cavity-width="${width}" data-cavity-height="${cavityHeightMm}" data-cavity-depth="${cavityDepthMm}">Download PDF</button>
    </div>

    <div class="nav">
      ${adjacentWidths.previous ? `<a class="chip" href="/cavity/${adjacentWidths.previous}mm-fridge">← ${adjacentWidths.previous}mm</a>` : ''}
      <a class="chip" href="${SITE_ORIGIN}/?cat=fridge&w=${width}&h=1800&d=700">Run full fit check</a>
      ${adjacentWidths.next ? `<a class="chip" href="/cavity/${adjacentWidths.next}mm-fridge">${adjacentWidths.next}mm →</a>` : ''}
    </div>

    <h2>Top brands that fit ${width}mm</h2>
    <div class="brands">
      ${topBrands.map((row) => `<a class="chip" href="/?cat=fridge&brand=${encodeURIComponent(row.brand)}&w=${width}&h=1800&d=700">${escHtml(displayBrandName(row.brand))} (${row.count})</a>`).join('')}
    </div>

    <h2>Featured models</h2>
    <div class="card-grid">
      ${featured.map((product) => `<article class="card">
        <strong>${escHtml(displayBrandName(product.brand))} ${escHtml(product.model)}</strong>
        <div class="meta">W ${product.w} × H ${product.h} × D ${product.d} mm</div>
        <div class="meta">${product.stars}★ · ${product.kwh_year ?? '-'} kWh/yr</div>
      </article>`).join('')}
    </div>${reviewSectionHtml ? `\n    ${reviewSectionHtml}\n` : '\n'}
    <section id="measure">
      <h2>How to measure this fridge cavity</h2>
      <p>Use these three views before you shortlist appliances: width, height, and depth all need to pass with ventilation clearance.</p>
      ${measurementSvgHtml}
      ${measurementStepsHtml}
    </section>

    ${compareLinks.length > 0 ? `<h2>Popular brand comparisons</h2>
    <div class="compare">
      ${compareLinks.map((link) => `<a class="chip" href="${escHtml(link.url)}">${escHtml(link.label)}</a>`).join('')}
    </div>` : ''}

    <h2>Related cavity sizes</h2>
    <div class="nav">
      ${relatedWidths.map((relatedWidth) => (
        `<a class="chip" href="/cavity/${relatedWidth}mm-fridge">${relatedWidth}mm cavity fit check</a>`
      )).join('')}
    </div>

    <h2>Also viewed guides</h2>
    <div class="compare">
      ${GUIDE_HUB_LINKS.map((link) => `<a class="chip" href="${link.url}">${escHtml(link.label)}</a>`).join('')}
    </div>
    <footer class="page-footer">
      <a href="/methodology">Methodology</a> ·
      <a href="/about/editorial-standards">Editorial standards</a>
    </footer>
  </main>
  <script type="application/ld+json">
${itemListJsonLd}
  </script>
  <script type="application/ld+json">
${breadcrumbJsonLd}
  </script>
  <script type="application/ld+json">
${productJsonLd}
  </script>
  <script type="application/ld+json">
${speakableJsonLd}
  </script>
  <script type="application/ld+json">
${howToSchemaJsonLd}
  </script>
  <script defer src="/scripts/pdf-export.js"></script>
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
  const measurementSteps = await loadMeasurementSteps();
  const cavityIntroCopy = await loadCopyFile('cavity-intro', repoRoot);
  const reviewPilotDoc = await readJson(path.join(repoRoot, 'data', 'videos', 'review-pilot-slugs.json'), { pilots: [] });
  const reviewVideosDoc = await readJson(path.join(repoRoot, 'data', 'videos', 'review-videos.json'), { models: {} });
  const creatorWhitelist = await readJson(path.join(repoRoot, 'data', 'videos', 'creator-whitelist.json'), { creators: [] });
  const reviewDisclaimerCopy = await loadCopyFile('review-disclaimer', repoRoot).catch(() => ({}));
  const products = (appliances.products ?? []).filter((product) => product.cat === 'fridge');
  const widths = buildWidthRange(MIN_WIDTH, MAX_WIDTH, STEP);
  const reviewPilots = Array.isArray(reviewPilotDoc.pilots) ? reviewPilotDoc.pilots : [];
  const pilotSlugs = reviewPilots.map((row) => row.modelSlug).filter(Boolean);
  const pilotByCavityPageSlug = new Map(
    reviewPilots
      .filter((row) => typeof row.cavityPageSlug === 'string' && row.cavityPageSlug)
      .map((row) => [row.cavityPageSlug, row])
  );

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
    const slug = `${width}mm-fridge`;
    const pilotTarget = pilotByCavityPageSlug.get(slug);
    const reviewSectionHtml = pilotTarget
      ? buildReviewVideoSection({
        modelSlug: pilotTarget.modelSlug,
        reviews: reviewVideosDoc?.models?.[pilotTarget.modelSlug]?.reviews ?? [],
        whitelistDocument: creatorWhitelist,
        disclaimerCopy: reviewDisclaimerCopy,
        pilotSlugs
      })
      : '';

    const html = buildPageHtml({
      width,
      cavityHeightMm: DEFAULT_CAVITY_HEIGHT_MM,
      cavityDepthMm: DEFAULT_CAVITY_DEPTH_MM,
      resultCount: matched.length,
      introText: fillTemplate(
        pickVariant(cavityIntroCopy.fridge, width / 10),
        { width, count: matched.length }
      ),
      featured,
      adjacentWidths: {
        previous: widths[index - 1] ?? null,
        next: widths[index + 1] ?? null
      },
      relatedWidths: widths
        .filter((candidate) => candidate !== width)
        .sort((left, right) => Math.abs(left - width) - Math.abs(right - width))
        .slice(0, 8),
      topBrands,
      compareLinks,
      reviewSectionHtml,
      modifiedTime: getBuildTimestampIso(),
      measurementSvgHtml: generateMeasurementSvg({
        widthMm: width,
        heightMm: DEFAULT_CAVITY_HEIGHT_MM,
        depthMm: DEFAULT_CAVITY_DEPTH_MM
      }),
      measurementStepsHtml: buildMeasurementStepsHtml({
        steps: measurementSteps,
        widthMm: width,
        heightMm: DEFAULT_CAVITY_HEIGHT_MM,
        depthMm: DEFAULT_CAVITY_DEPTH_MM
      }),
      howToJsonLd: buildMeasurementHowToJsonLd({
        steps: measurementSteps,
        widthMm: width,
        heightMm: DEFAULT_CAVITY_HEIGHT_MM,
        depthMm: DEFAULT_CAVITY_DEPTH_MM,
        pageUrl: `${SITE_ORIGIN}/cavity/${width}mm-fridge`
      })
    });

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
  buildPageHtml,
  generateCavityPages
};
