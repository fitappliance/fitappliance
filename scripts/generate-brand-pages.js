'use strict';

const path = require('node:path');
const { mkdir, readdir, readFile, rm, writeFile } = require('node:fs/promises');
const { SITE_ORIGIN } = require('./common/site-origin.js');
const { buildHtmlHead, escHtml } = require('./common/html-head.js');
const { copyKeyForBrandCategory, fillTemplate, loadCopyFile } = require('./common/copy-data.js');
const { stringifyJsonLd } = require('./common/schema-jsonld.js');
const { slugNormalize } = require('./common/slug-normalize.js');
const { buildReviewVideoSection } = require('./common/review-video-renderer.js');
const { displayBrandName } = require('./utils/brand-utils.js');
const { getBuildTimestampIso } = require('./utils/build-timestamp.js');
const { loadProvidersFromFile, renderAffiliateCta } = require('./render-affiliate-links.js');

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
const GUIDE_HUB_LINKS = [
  { url: '/guides/fridge-clearance-requirements', label: 'Fridge clearance guide hub' },
  { url: '/guides/dishwasher-cavity-sizing', label: 'Dishwasher cavity guide hub' },
  { url: '/guides/washing-machine-doorway-access', label: 'Washing machine doorway guide hub' },
  { url: '/guides/dryer-ventilation-guide', label: 'Dryer ventilation guide hub' },
  { url: '/guides/appliance-fit-sizing-handbook', label: 'Appliance fit sizing handbook' }
];

function slugify(value) {
  return slugNormalize(value);
}

async function readJson(filePath) {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text);
}

function buildWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_ORIGIN}/#website`,
    url: SITE_ORIGIN,
    name: 'FitAppliance',
    description:
      'Appliance fit guides for Australian homes, with clearance, access and energy data.',
    inLanguage: 'en-AU',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_ORIGIN}/?cat={cat}&w={w}&h={h}&d={d}`,
        actionAccessibilityRequirement: {
          '@type': 'ActionAccessSpecification',
          requiresSubscription: false
        }
      },
      'query-input': 'required name=width'
    }
  };
}

function buildClearanceContext({ side, rear, top, defaultSide, defaultRear, defaultTop }) {
  const notes = [];

  if (side > defaultSide) {
    notes.push(`The side gap is ${side - defaultSide}mm wider than the usual category baseline.`);
  } else if (side < defaultSide) {
    notes.push(`The side gap is ${defaultSide - side}mm tighter than the usual category baseline.`);
  }

  if (rear > defaultRear) {
    notes.push(`The rear allowance is ${rear - defaultRear}mm deeper than the default figure.`);
  } else if (rear < defaultRear) {
    notes.push(`The rear allowance is ${defaultRear - rear}mm tighter than the default figure.`);
  }

  if (top > defaultTop) {
    notes.push(`The top allowance is ${top - defaultTop}mm taller than the default figure.`);
  } else if (top < defaultTop) {
    notes.push(`The top allowance is ${defaultTop - top}mm tighter than the default figure.`);
  }

  if (notes.length === 0) {
    return 'These figures sit close to the category baseline.';
  }

  return notes.join(' ');
}

function buildClearanceNarrative(args) {
  return buildClearanceContext(args);
}

function resolveBrandIntro(copyDocument, { brand, brandRaw, category, count }) {
  const copyKey = copyKeyForBrandCategory(brandRaw, category);
  const template = copyDocument?.[copyKey] ?? copyDocument?.[`default_${category}`] ?? '';
  return fillTemplate(template, { brand, count });
}

function buildInstallTips({ copyDocument, brandRaw, category, side, rear, top }) {
  const copyKey = copyKeyForBrandCategory(brandRaw, category);
  const overrideTips = copyDocument?.overrides?.[copyKey];
  const baseTips = Array.isArray(overrideTips) ? overrideTips : (copyDocument?.defaults?.[category] ?? []);
  const tips = [...baseTips];

  if (side > 0) {
    tips.push(`Allow at least ${side * 2}mm of total side room if the cabinet sits between panels.`);
  }
  if (rear > 30) {
    tips.push(`Keep ${rear}mm behind the cabinet so the rear wall and service point do not crowd the install.`);
  }
  if (top > 30) {
    tips.push(`Check for ${top}mm of open space above the cabinet before the delivery team locks the position in.`);
  }

  return [...new Set(tips)].slice(0, 3);
}

function buildBreadcrumbJsonLd({ slug, brand, categoryLabel }) {
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
        name: `${brand} ${categoryLabel} Clearance`,
        item: `${SITE_ORIGIN}/brands/${slug}`
      }
    ]
  };
}

function buildFAQJsonLd({ brand, catLabel, side, rear, top }) {
  const unit = catLabel.toLowerCase();
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `How much clearance does a ${brand} ${unit} need in Australia?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${brand} ${unit}s require ${side}mm side clearance, ${rear}mm rear clearance, and ${top}mm top clearance per manufacturer installation guidelines. Insufficient clearance can void your warranty and cause premature motor failure.`
        }
      },
      {
        '@type': 'Question',
        name: `Does a ${brand} ${unit} need more clearance than other brands?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${brand} requires ${top}mm top clearance for ${unit}s. ${top > 50 ? `This is above average — ensure cabinetry above leaves at least ${top}mm gap.` : 'This aligns with typical Australian installation requirements.'} Always confirm with the specific model installation manual before fitting.`
        }
      },
      {
        '@type': 'Question',
        name: `What happens if I don't leave enough clearance for my ${brand} ${unit}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Inadequate ventilation clearance causes the ${unit}'s compressor or motor to overheat, reducing its lifespan and typically voiding the manufacturer warranty. ${brand} service technicians inspect clearances during any warranty claim.`
        }
      }
    ]
  };
}

function buildItemListJsonLd({ brand, categoryMeta, products }) {
  const rows = Array.isArray(products) ? products : [];
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${brand} ${categoryMeta.labelSingular} models in Australia`,
    numberOfItems: rows.length,
    itemListElement: rows.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Product',
        name: `${brand} ${product.model}`,
        brand: { '@type': 'Brand', name: brand },
        width: { '@type': 'QuantitativeValue', value: product.w, unitCode: 'MMT' },
        height: { '@type': 'QuantitativeValue', value: product.h, unitCode: 'MMT' },
        depth: { '@type': 'QuantitativeValue', value: product.d, unitCode: 'MMT' }
      }
    }))
  };
}

function buildSocialMetaTags({ title, description, canonical, brandImageUrl = null }) {
  const imageMeta = brandImageUrl
    ? `  <meta property="og:image" content="${escHtml(brandImageUrl)}">`
    : '';

  return [
    '  <meta property="og:type" content="article">',
    '  <meta property="og:site_name" content="FitAppliance">',
    `  <meta property="og:title" content="${escHtml(title)}">`,
    `  <meta property="og:description" content="${escHtml(description)}">`,
    `  <meta property="og:url" content="${canonical}">`,
    '  <meta property="og:locale" content="en_AU">',
    imageMeta,
    '  <meta name="twitter:card" content="summary">',
    `  <meta name="twitter:title" content="${escHtml(title)}">`,
    `  <meta name="twitter:description" content="${escHtml(description)}">`,
    '  <meta name="twitter:site" content="@fitappliance">'
  ].filter(Boolean).join('\n');
}

function buildOrganizationJsonLd(brandName, metadataByBrand = {}) {
  const metadata = metadataByBrand?.[brandName] ?? {};
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: brandName
  };
  if (typeof metadata.url === 'string' && /^https?:\/\//i.test(metadata.url)) {
    org.url = metadata.url;
  }
  if (typeof metadata.logo === 'string' && /^https?:\/\//i.test(metadata.logo)) {
    org.logo = metadata.logo;
  }
  return org;
}

function buildAffiliateSnippet(sample, affiliateProviders) {
  return renderAffiliateCta(sample, {
    providers: affiliateProviders,
    env: process.env,
    className: 'affiliate-cta',
    buttonClassName: 'affiliate-buy-link',
    disclosureClassName: 'affiliate-disclosure'
  });
}

function buildBrandPageHtml({
  brand,
  brandRaw = brand,
  category,
  count,
  side,
  rear,
  top,
  slug,
  defaultSide,
  defaultRear,
  defaultTop,
  modelSamples = [],
  itemListProducts = [],
  affiliateProviders = [],
  pendingSwingCount = 0,
  relatedCompares = [],
  sameBrandAlternatives = [],
  introText = '',
  reviewSectionHtml = '',
  installTipsCopy = null,
  organizationJsonLd = null,
  modifiedTime = getBuildTimestampIso()
}) {
  const categoryMeta = CATEGORY_META[category] ?? {
    slug: category.replace(/_/g, '-'),
    labelPlural: category,
    labelSingular: category
  };
  const categoryHeading = categoryMeta.labelSingular.replace(/\b([a-z])/g, (match) => match.toUpperCase());
  const title = `${brand} ${categoryHeading} Clearance Requirements Australia | FitAppliance`;
  const description =
    `${brand} ${categoryMeta.labelSingular} clearance guide for Australian homes. ` +
    `${side}mm side, ${rear}mm rear and ${top}mm top clearance. Browse ${count} models and compare the cavity numbers before you buy.`;
  const canonical = `${SITE_ORIGIN}/brands/${slug}`;
  const heroPngPath = `/og-images/${slugify(brandRaw)}-${categoryMeta.slug}.png`;
  const heroWebpPath = `/og-images/${slugify(brandRaw)}-${categoryMeta.slug}.webp`;
  const ogImageUrl = `${SITE_ORIGIN}${heroPngPath}`;
  const ctaUrl = `/?cat=${encodeURIComponent(category)}&brand=${encodeURIComponent(brandRaw)}`;
  const siteJsonLd = stringifyJsonLd(buildWebSiteJsonLd(), { pretty: true });
  const breadcrumbJsonLd = stringifyJsonLd(
    buildBreadcrumbJsonLd({
      slug,
      brand,
      categoryLabel: categoryMeta.labelSingular
    }),
    { pretty: true }
  );
  const faqJsonLd = stringifyJsonLd(
    buildFAQJsonLd({ brand, catLabel: categoryMeta.labelSingular, side, rear, top }),
    { pretty: true }
  );
  const itemListJsonLd = stringifyJsonLd(
    buildItemListJsonLd({
      brand,
      categoryMeta,
      products: itemListProducts
    }),
    { pretty: true }
  );
  const headMeta = buildHtmlHead({
    title,
    description,
    modifiedTime,
    canonical,
    extraMeta: `  ${buildSocialMetaTags({ title, description, canonical, brandImageUrl: ogImageUrl })}`
  });
  const clearanceContext = buildClearanceContext({
    side,
    rear,
    top,
    defaultSide,
    defaultRear,
    defaultTop
  });
  const installTips = buildInstallTips({
    copyDocument: installTipsCopy,
    brandRaw,
    category,
    side,
    rear,
    top
  });
  const confirmedSwingCount = Math.max(0, count - pendingSwingCount);
  const modelPreview = modelSamples.map((sample) => {
    const affiliateHtml = buildAffiliateSnippet(sample, affiliateProviders);
    return `<div class="model-item">
      <picture class="model-thumb">
        <source srcset="${heroWebpPath}" type="image/webp">
        <img src="${heroPngPath}" alt="${escHtml(brand)} ${escHtml(sample.model)} preview" width="600" height="315" loading="lazy" decoding="async">
      </picture>
      <div class="model-name">${escHtml(sample.model)}</div>
      <div class="model-dims">W ${sample.w}mm × H ${sample.h}mm × D ${sample.d}mm</div>
      <a class="model-link" href="/?cat=${encodeURIComponent(category)}&brand=${encodeURIComponent(brandRaw)}&h=${sample.h}">Check if this fits your space →</a>
      ${affiliateHtml}
    </div>`;
  }).join('');

  return `<!doctype html>
<html lang="en-AU">
<head>
${headMeta}
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
    .hero-media {
      display: block;
      margin: 0 0 18px;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--border);
      background: var(--white);
    }
    .hero-media img {
      width: 100%;
      height: auto;
      display: block;
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
    .install-section {
      margin: 30px 0 18px;
      padding: 16px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--white);
    }
    .install-section h2 {
      margin: 0 0 10px;
      font-size: 18px;
      color: var(--ink);
      font-family: 'Instrument Serif', serif;
    }
    .install-tips {
      margin: 0;
      padding-left: 18px;
      color: var(--ink-2);
      font-size: 14px;
      line-height: 1.65;
    }
    .install-tips li + li {
      margin-top: 8px;
    }
    .model-preview {
      margin-top: 26px;
    }
    .model-preview h2 {
      margin: 0 0 12px;
      font-size: 20px;
      color: var(--ink);
      font-family: 'Instrument Serif', serif;
    }
    .model-list {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .model-item {
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--white);
      padding: 12px;
    }
    .model-name {
      font-size: 14px;
      font-weight: 700;
      color: var(--ink);
      margin-bottom: 6px;
    }
    .model-thumb {
      display: block;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--border);
      margin-bottom: 8px;
    }
    .model-thumb img {
      display: block;
      width: 100%;
      height: auto;
    }
    .model-dims {
      font-size: 13px;
      color: var(--ink-2);
      margin-bottom: 8px;
    }
    .model-link {
      font-size: 12.5px;
      color: var(--copper);
      text-decoration: none;
      font-weight: 600;
    }
    .model-link:hover { text-decoration: underline; }
    .affiliate-cta { margin-top: 8px; }
    .affiliate-buy-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      padding: 8px 12px;
      border-radius: 8px;
      background: var(--ink);
      color: #fff;
      font-weight: 700;
      font-size: 12px;
    }
    .affiliate-buy-link:hover { background: var(--copper); }
    .affiliate-disclosure {
      margin: 5px 0 0;
      font-size: 11px;
      color: var(--ink-3);
      line-height: 1.4;
    }
    .affiliate-disclosure a { color: var(--copper); }
    footer {
      margin-top: 36px;
      font-size: 13px;
      color: var(--ink-3);
    }
    .section-title-lg {
      margin: 0 0 12px;
      font-size: 20px;
      color: var(--ink);
      font-family: 'Instrument Serif', serif;
    }
    .section-title-sm {
      margin: 0 0 12px;
      font-size: 15px;
      font-weight: 600;
      color: var(--ink);
      font-family: 'Outfit', sans-serif;
    }
    .chip-panel {
      margin: 20px 0;
      padding: 20px 24px;
      background: #f5f2ec;
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    .chip-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip-list a {
      display: inline-block;
      padding: 6px 14px;
      border: 1px solid var(--border);
      border-radius: 20px;
      font-size: 13px;
      color: var(--copper);
      text-decoration: none;
      background: #fff;
    }
  </style>
</head>
<body>
  <main>
    <a class="back-link" href="${SITE_ORIGIN}">← Back to FitAppliance</a>
    <h1>${escHtml(brand)} ${escHtml(categoryHeading)} Clearance Requirements</h1>
    <picture class="hero-media">
      <source srcset="${heroWebpPath}" type="image/webp">
      <img src="${heroPngPath}" alt="${escHtml(brand)} ${escHtml(categoryHeading)} clearance guide preview" width="1200" height="630" loading="eager" decoding="async" fetchpriority="high">
    </picture>
    <p data-source="clearance-dataset">${escHtml(introText)} ${escHtml(`Current guide figures are ${side}mm at each side, ${rear}mm at the rear and ${top}mm above. ${clearanceContext}`)}</p>
    <div class="metric-grid">
      <div class="metric">Side clearance<br><b>${side}mm</b></div>
      <div class="metric">Rear clearance<br><b>${rear}mm</b></div>
      <div class="metric">Top clearance<br><b>${top}mm</b></div>
      <div class="metric">Models in database<br><b>${count}</b></div>
      ${pendingSwingCount > 0
        ? `<div class="metric">Door swing confirmed<br>
  <b>${confirmedSwingCount} of ${count}</b>
  <small style="color:var(--ink-3);font-size:11px;display:block">Research in progress</small>
</div>`
        : `<div class="metric">Door swing data<br><b>✓ All ${count} confirmed</b></div>`}
    </div>
    <section class="install-section">
      <h2 class="section-title-lg">Installation Tips</h2>
      <ul class="install-tips">
        ${installTips.map((tip) => `<li>${escHtml(tip)}</li>`).join('')}
      </ul>
    </section>${modelSamples.length > 0 ? `\n    <section class="model-preview">
      <h2 class="section-title-lg">Featured ${escHtml(brand)} ${escHtml(categoryHeading)} Models</h2>
      <div class="model-list">
        ${modelPreview}
      </div>
    </section>` : ''}${reviewSectionHtml ? `\n    ${reviewSectionHtml}` : ''}
    <a class="cta" href="${ctaUrl}">Find ${escHtml(brand)} ${escHtml(categoryMeta.labelPlural)} That Fit Your Space</a>
    ${relatedCompares.length > 0 ? `<section class="chip-panel">
      <h2 class="section-title-sm">Compare ${escHtml(brand)} with other brands</h2>
      <ul class="chip-list">
        ${relatedCompares.map((row) => {
          const other = row.brandA === brand || row.brandA === brandRaw ? row.brandB : row.brandA;
          return `<li><a href="/compare/${escHtml(row.slug)}">${escHtml(brand)} vs ${escHtml(other)} →</a></li>`;
        }).join('\n        ')}
      </ul>
    </section>` : ''}
    <section class="chip-panel">
      <h2 class="section-title-sm">Same brand alternatives</h2>
      <ul class="chip-list">
        ${sameBrandAlternatives.map((row) => (
          `<li><a href="${escHtml(row.url)}">${escHtml(row.label)}</a></li>`
        )).join('\n        ')}
      </ul>
    </section>
    <section class="chip-panel">
      <h2 class="section-title-sm">Also viewed</h2>
      <ul class="chip-list">
        ${GUIDE_HUB_LINKS.map((row) => (
          `<li><a href="${escHtml(row.url)}">${escHtml(row.label)}</a></li>`
        )).join('\n        ')}
      </ul>
    </section>
    <footer>
      <p>Source: FitAppliance clearance and model coverage dataset for Australia.</p>
      <p><a href="/methodology">Methodology</a> · <a href="/about/editorial-standards">Editorial standards</a></p>
    </footer>
  </main>
  <script type="application/ld+json">
${siteJsonLd}
  </script>
  <script type="application/ld+json">
${breadcrumbJsonLd}
  </script>
  <script type="application/ld+json">
${faqJsonLd}
  </script>
  <script type="application/ld+json">
${itemListJsonLd}
  </script>
  ${organizationJsonLd ? `<script type="application/ld+json">
${organizationJsonLd}
  </script>` : ''}
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
  const brandMetadata = await readJson(path.join(dataDir, 'brands', 'metadata.json')).catch(() => ({}));
  const brandIntroCopy = await loadCopyFile('brand-intro', repoRoot);
  const installTipsCopy = await loadCopyFile('install-tips', repoRoot);
  const reviewPilotDoc = await readJson(path.join(repoRoot, 'data', 'videos', 'review-pilot-slugs.json')).catch(() => ({ pilots: [] }));
  const reviewVideosDoc = await readJson(path.join(repoRoot, 'data', 'videos', 'review-videos.json')).catch(() => ({ models: {} }));
  const creatorWhitelist = await readJson(path.join(repoRoot, 'data', 'videos', 'creator-whitelist.json')).catch(() => ({ creators: [] }));
  const reviewDisclaimerCopy = await loadCopyFile('review-disclaimer', repoRoot).catch(() => ({}));
  const affiliateProviders = await loadProvidersFromFile(
    options.affiliateProvidersPath ?? path.join(repoRoot, 'data', 'affiliates', 'providers.json')
  ).catch(() => []);
  const products = Array.isArray(appliances.products) ? appliances.products : [];
  const rules = clearance.rules ?? {};
  const reviewPilots = Array.isArray(reviewPilotDoc.pilots) ? reviewPilotDoc.pilots : [];
  const pilotSlugs = reviewPilots.map((row) => row.modelSlug).filter(Boolean);
  const pilotByBrandPageSlug = new Map(
    reviewPilots
      .filter((row) => typeof row.brandPageSlug === 'string' && row.brandPageSlug)
      .map((row) => [row.brandPageSlug, row])
  );

  const compareIndexPath = path.join(repoRoot, 'pages', 'compare', 'index.json');
  let compareIndex = [];
  try {
    compareIndex = await readJson(compareIndexPath);
  } catch {
    // compare index may not exist yet — proceed without cross-links
  }

  await cleanOutputDir(outputDir);

  const pageBySlug = new Map();

  for (const [category, brandRules] of Object.entries(rules)) {
    if (!brandRules || typeof brandRules !== 'object') continue;
    const categoryProducts = products.filter((product) => product.cat === category);
    const defaultRule = brandRules.__default__ ?? {};
    const defaultSide = Number.isFinite(defaultRule.side) ? defaultRule.side : 0;
    const defaultRear = Number.isFinite(defaultRule.rear) ? defaultRule.rear : 0;
    const defaultTop = Number.isFinite(defaultRule.top) ? defaultRule.top : 0;

    for (const [brand, rule] of Object.entries(brandRules)) {
      if (brand === '__default__') continue;
      if (!rule || typeof rule !== 'object') continue;

      const matchedProducts = categoryProducts.filter((product) => product.brand === brand);
      const modelCount = matchedProducts.length;
      if (modelCount < 1) continue;

      const brandSlug = slugify(brand);
      const categorySlug = CATEGORY_META[category]?.slug ?? slugify(category.replace(/_/g, '-'));
      const slug = `${brandSlug}-${categorySlug}-clearance`;
      const fileName = `${slug}.html`;
      const filePath = path.join(outputDir, fileName);

      const side = Number.isFinite(rule.side) ? rule.side : 0;
      const rear = Number.isFinite(rule.rear) ? rule.rear : 0;
      const top = Number.isFinite(rule.top) ? rule.top : 0;
      const modelSamples = [...matchedProducts]
        .sort((left, right) => {
          const leftHeight = Number.isFinite(left.h) ? left.h : 0;
          const rightHeight = Number.isFinite(right.h) ? right.h : 0;
          if (leftHeight !== rightHeight) return rightHeight - leftHeight;
          return String(left.model ?? '').localeCompare(String(right.model ?? ''));
        })
        .slice(0, 3)
        .map((product) => ({
          model: product.model,
          w: product.w,
          h: product.h,
          d: product.d,
          affiliate: product.affiliate ?? null
        }));
      const itemListProducts = [...matchedProducts]
        .sort((left, right) => String(left.model ?? '').localeCompare(String(right.model ?? '')))
        .slice(0, 20)
        .map((product) => ({
          model: product.model,
          w: product.w,
          h: product.h,
          d: product.d
        }));
      const pendingSwingCount = matchedProducts.filter(
        (product) => product.door_swing_mm === null || product.door_swing_mm === undefined
      ).length;

      const pageRecord = {
        brand,
        cat: category,
        slug,
        url: `/brands/${slug}`,
        models: modelCount,
        side,
        rear,
        top,
        defaultSide,
        defaultRear,
        defaultTop,
        pendingSwingCount,
        modelSamples,
        itemListProducts,
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
    const relatedCompares = compareIndex
      .filter((cRow) => cRow.cat === row.cat && (cRow.brandA === row.brand || cRow.brandB === row.brand))
      .slice(0, 4);
    const sameBrandAlternatives = indexRows
      .filter((candidate) => candidate.brand === row.brand && candidate.slug !== row.slug)
      .slice(0, 8)
      .map((candidate) => ({
        url: candidate.url,
        label: `${displayBrandName(candidate.brand)} ${CATEGORY_META[candidate.cat]?.labelPlural ?? String(candidate.cat).replace(/_/g, ' ')}`
      }));
    if (sameBrandAlternatives.length < 6) {
      const categoryFallbacks = Object.entries(CATEGORY_META)
        .filter(([cat]) => cat !== row.cat)
        .map(([cat, meta]) => ({
          url: `/?cat=${encodeURIComponent(cat)}&brand=${encodeURIComponent(row.brand)}`,
          label: `${displayBrand} ${meta.labelPlural} fit check`
        }));
      for (const fallback of categoryFallbacks) {
        if (sameBrandAlternatives.length >= 8) break;
        if (sameBrandAlternatives.some((rowAlt) => rowAlt.url === fallback.url)) continue;
        sameBrandAlternatives.push(fallback);
      }
    }
    const pilotTarget = pilotByBrandPageSlug.get(row.slug);
    const reviewSectionHtml = pilotTarget
      ? buildReviewVideoSection({
        modelSlug: pilotTarget.modelSlug,
        reviews: reviewVideosDoc?.models?.[pilotTarget.modelSlug]?.reviews ?? [],
        whitelistDocument: creatorWhitelist,
        disclaimerCopy: reviewDisclaimerCopy,
        pilotSlugs
      })
      : '';
    const html = buildBrandPageHtml({
      brand: displayBrand,
      brandRaw: row.brand,
      category: row.cat,
      count: row.models,
      side: row.side,
      rear: row.rear,
      top: row.top,
      slug: row.slug,
      defaultSide: row.defaultSide,
      defaultRear: row.defaultRear,
      defaultTop: row.defaultTop,
      pendingSwingCount: row.pendingSwingCount,
      modelSamples: row.modelSamples,
      itemListProducts: row.itemListProducts,
      affiliateProviders,
      relatedCompares,
      sameBrandAlternatives,
      reviewSectionHtml,
      introText: resolveBrandIntro(brandIntroCopy, {
        brand: displayBrand,
        brandRaw: row.brand,
        category: row.cat,
        count: row.models
      }),
      installTipsCopy,
      organizationJsonLd: JSON.stringify(buildOrganizationJsonLd(displayBrand, brandMetadata), null, 2),
      modifiedTime: getBuildTimestampIso()
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
  buildBrandPageHtml,
  buildItemListJsonLd,
  buildClearanceContext,
  buildClearanceNarrative,
  buildInstallTips,
  generateBrandPages,
  slugify
};
