'use strict';

const path = require('node:path');
const { mkdir, readdir, readFile, rm, writeFile } = require('node:fs/promises');
const { SITE_ORIGIN } = require('./common/site-origin.js');
const { buildHtmlHead, escHtml } = require('./common/html-head.js');
const { stringifyJsonLd } = require('./common/schema-jsonld.js');
const { slugNormalize } = require('./common/slug-normalize.js');
const { displayBrandName } = require('./utils/brand-utils.js');
const { loadProvidersFromFile, resolveAffiliateLinkForProduct } = require('./render-affiliate-links.js');

const CATEGORY_META = {
  fridge: {
    slug: 'fridge',
    labelPlural: 'Fridges',
    labelSingular: 'Fridge'
  },
  washing_machine: {
    slug: 'washing-machine',
    labelPlural: 'Washing Machines',
    labelSingular: 'Washing Machine'
  },
  dishwasher: {
    slug: 'dishwasher',
    labelPlural: 'Dishwashers',
    labelSingular: 'Dishwasher'
  },
  dryer: {
    slug: 'dryer',
    labelPlural: 'Dryers',
    labelSingular: 'Dryer'
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

function slugifyPair(brandA, brandB, catSlug) {
  return `${slugify(brandA)}-vs-${slugify(brandB)}-${slugify(catSlug)}-clearance`;
}

function hasRetailLink(product) {
  if (!product || typeof product !== 'object') return false;
  if (typeof product.direct_url === 'string' && /^https?:\/\//i.test(product.direct_url)) return true;
  return Array.isArray(product.retailers)
    && product.retailers.some((retailer) => retailer && typeof retailer.url === 'string' && /^https?:\/\//i.test(retailer.url));
}

function extractModelSku(modelString) {
  if (typeof modelString !== 'string' || !modelString.trim()) return '';
  return modelString.trim().split(/\s+/)[0];
}

function normalizeModelForSearch(modelString, brand) {
  const model = String(modelString ?? '').trim();
  if (!model) return '';
  if (!brand) return model;
  const escapedBrand = String(brand).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return model.replace(new RegExp(`^${escapedBrand}\\s+`, 'i'), '').trim() || model;
}

function buildRetailSearchQuery(sample) {
  const brand = String(sample?.brand ?? '').trim();
  const model = normalizeModelForSearch(sample?.model, brand);
  const sku = extractModelSku(model);
  if (brand && model) {
    return `${brand} "${model}"`;
  }
  if (sku) {
    return `${brand} "${sku}"`.trim();
  }
  return `${brand} ${String(sample?.model ?? '').trim()}`.trim();
}

function parseUrlOrNull(rawUrl) {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function isSearchLikeUrl(parsedUrl) {
  if (!parsedUrl || typeof parsedUrl !== 'object') return false;
  if (/\/search(?:\/|$)/i.test(parsedUrl.pathname)) return true;
  return ['q', 'query', 'text', 'search', 'keyword'].some((key) => parsedUrl.searchParams.has(key));
}

function normalizeRetailLink(rawUrl, sample) {
  if (typeof rawUrl !== 'string' || !/^https?:\/\//i.test(rawUrl)) return null;
  const parsed = parseUrlOrNull(rawUrl);
  if (!parsed) return { url: rawUrl, searchLike: false, hostLabel: '' };

  const host = parsed.hostname.replace(/^www\./, '');
  const hostLabel = host.replace(/\.com\.au$|\.com$|\.au$/i, '').replace(/-/g, ' ');
  if (!isSearchLikeUrl(parsed)) {
    return { url: rawUrl, searchLike: false, hostLabel };
  }

  const query = buildRetailSearchQuery(sample);
  if (!query) {
    return { url: rawUrl, searchLike: true, hostLabel };
  }

  if (host === 'harveynorman.com.au') {
    return {
      url: `https://www.harveynorman.com.au/catalogsearch/result/?q=${encodeURIComponent(query)}`,
      searchLike: true,
      hostLabel: 'Harvey Norman'
    };
  }
  if (host === 'thegoodguys.com.au') {
    return {
      url: `https://www.thegoodguys.com.au/search?text=${encodeURIComponent(query)}`,
      searchLike: true,
      hostLabel: 'The Good Guys'
    };
  }
  if (host === 'jbhifi.com.au') {
    return {
      url: `https://www.jbhifi.com.au/search?query=${encodeURIComponent(query)}`,
      searchLike: true,
      hostLabel: 'JB Hi-Fi'
    };
  }
  if (host === 'binglee.com.au') {
    return {
      url: `https://www.binglee.com.au/search?query=${encodeURIComponent(query)}`,
      searchLike: true,
      hostLabel: 'Bing Lee'
    };
  }
  if (host === 'appliances-online.com.au' || host === 'appliancesonline.com.au') {
    return {
      url: `https://www.appliancesonline.com.au/search/?q=${encodeURIComponent(query)}`,
      searchLike: true,
      hostLabel: 'Appliances Online'
    };
  }

  const paramKey = ['query', 'q', 'text', 'search', 'keyword'].find((key) => parsed.searchParams.has(key));
  if (paramKey) {
    parsed.searchParams.set(paramKey, query);
  } else {
    parsed.searchParams.set('q', query);
  }
  return { url: parsed.toString(), searchLike: true, hostLabel };
}

function pickRetailLink(sample) {
  if (!sample || typeof sample !== 'object') return null;
  if (typeof sample.directUrl === 'string' && /^https?:\/\//i.test(sample.directUrl)) {
    const normalized = normalizeRetailLink(sample.directUrl, sample);
    if (!normalized) return null;
    return {
      url: normalized.url,
      label: normalized.searchLike ? `Search at ${normalized.hostLabel || 'retailer'}` : (sample.directLabel || 'Buy now')
    };
  }
  const retailerUrl = sample.bestRetailer?.url;
  if (typeof retailerUrl === 'string' && /^https?:\/\//i.test(retailerUrl)) {
    const normalized = normalizeRetailLink(retailerUrl, sample);
    if (!normalized) return null;
    return {
      url: normalized.url,
      label: normalized.searchLike
        ? `Search at ${sample.bestRetailer?.n || normalized.hostLabel || 'retailer'}`
        : `Buy from ${sample.bestRetailer?.n || 'retailer'}`
    };
  }
  return null;
}

function hasSampleRetailLink(samples) {
  return Array.isArray(samples) && samples.some((sample) => Boolean(pickRetailLink(sample)));
}

function buildFallbackBuySearchUrl(brand, categoryMeta, sampleModel = '') {
  const normalizedModel = normalizeModelForSearch(sampleModel, brand);
  const sku = extractModelSku(normalizedModel);
  const query = (brand && normalizedModel)
    ? `${brand} "${normalizedModel}"`
    : (brand && sku)
      ? `${brand} "${sku}"`
      : `${brand} ${categoryMeta.labelSingular}`;
  return `https://www.appliances-online.com.au/search/?q=${encodeURIComponent(query)}`;
}

async function readJson(filePath) {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text);
}

function rankBrands(products, cat) {
  const counts = Object.create(null);
  for (const product of products ?? []) {
    if (!product || product.cat !== cat) continue;
    counts[product.brand] = (counts[product.brand] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([brand, count]) => ({ brand, count }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return String(left.brand).localeCompare(String(right.brand));
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function normalizeClearanceRule(rule) {
  if (!rule || typeof rule !== 'object') return null;
  const side = Number.isFinite(rule.side) ? rule.side : null;
  const rear = Number.isFinite(rule.rear) ? rule.rear : null;
  const top = Number.isFinite(rule.top) ? rule.top : null;
  if (side === null || rear === null || top === null) return null;
  return { side, rear, top };
}

function selectComparisonPairs(
  products,
  clearanceRules,
  {
    catsToProcess = ['fridge', 'washing_machine', 'dishwasher', 'dryer'],
    topN = 10,
    minModels = 3,
    maxBrandsPerCategory = 8
  } = {}
) {
  const allRows = [];
  const rules = clearanceRules ?? {};

  for (const cat of catsToProcess) {
    const ranked = rankBrands(products, cat).slice(0, maxBrandsPerCategory);
    if (ranked.length < 2) continue;
    const byBrand = new Map(ranked.map((row) => [row.brand, row]));
    const catRules = rules[cat] ?? {};
    const pairs = [];

    for (let i = 0; i < ranked.length - 1; i += 1) {
      for (let j = i + 1; j < ranked.length; j += 1) {
        const brandA = ranked[i].brand;
        const brandB = ranked[j].brand;
        const rowA = byBrand.get(brandA);
        const rowB = byBrand.get(brandB);
        if (!rowA || !rowB) continue;
        if (rowA.count < minModels || rowB.count < minModels) continue;

        const clearanceA = normalizeClearanceRule(catRules[brandA]);
        const clearanceB = normalizeClearanceRule(catRules[brandB]);
        if (!clearanceA || !clearanceB) continue;

        pairs.push({
          brandA,
          brandB,
          cat,
          modelsA: rowA.count,
          modelsB: rowB.count,
          rankScore: rowA.rank + rowB.rank,
          volumeScore: rowA.count + rowB.count,
          clearanceA,
          clearanceB
        });
      }
    }

    pairs.sort((left, right) => {
      if (left.rankScore !== right.rankScore) return left.rankScore - right.rankScore;
      if (right.volumeScore !== left.volumeScore) return right.volumeScore - left.volumeScore;
      if (left.brandA !== right.brandA) return left.brandA.localeCompare(right.brandA);
      return left.brandB.localeCompare(right.brandB);
    });

    allRows.push(...pairs.slice(0, topN));
  }

  return allRows.map((row) => ({
    brandA: row.brandA,
    brandB: row.brandB,
    cat: row.cat,
    modelsA: row.modelsA,
    modelsB: row.modelsB,
    clearanceA: row.clearanceA,
    clearanceB: row.clearanceB
  }));
}

function buildComparisonNarrative(clearanceA, clearanceB, brandA, brandB, categoryMeta) {
  const sideA = clearanceA.side;
  const sideB = clearanceB.side;
  const rearA = clearanceA.rear;
  const rearB = clearanceB.rear;
  const topA = clearanceA.top;
  const topB = clearanceB.top;

  const compareAxis = (axisLabel, unitA, unitB) => {
    if (unitA === unitB) {
      return `${brandA} and ${brandB} both require ${unitA}mm ${axisLabel} clearance.`;
    }
    if (unitA > unitB) {
      return `${brandA} requires ${unitA}mm ${axisLabel} clearance versus ${brandB}'s ${unitB}mm. ${brandA} needs ${unitA - unitB}mm more ${axisLabel} space.`;
    }
    return `${brandB} requires ${unitB}mm ${axisLabel} clearance versus ${brandA}'s ${unitA}mm. ${brandB} needs ${unitB - unitA}mm more ${axisLabel} space.`;
  };

  const sideLine = compareAxis('side', sideA, sideB);
  const rearLine = compareAxis('rear', rearA, rearB);
  const topLine = compareAxis('top', topA, topB);

  const scoreA = sideA * 2 + rearA + topA;
  const scoreB = sideB * 2 + rearB + topB;
  const recommendation = scoreA === scoreB
    ? `${brandA} and ${brandB} have the same combined clearance footprint for ${categoryMeta.labelPlural.toLowerCase()}.`
    : scoreA < scoreB
      ? `${brandA} has the tighter overall clearance footprint (${scoreA}mm total vs ${scoreB}mm).`
      : `${brandB} has the tighter overall clearance footprint (${scoreB}mm total vs ${scoreA}mm).`;

  const summary = `${brandA} vs ${brandB}: ${sideLine} ${rearLine} ${topLine}`;
  return {
    summary,
    bullets: [sideLine, rearLine, `${topLine} ${recommendation}`]
  };
}

function buildSocialMetaTags({ title, description, canonical, ogImageUrl = null }) {
  const imageMeta = ogImageUrl
    ? `  <meta property="og:image" content="${escHtml(ogImageUrl)}">`
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

function buildComparisonPageHtml({
  brandA,
  brandB,
  cat,
  modelsA,
  modelsB,
  clearanceA,
  clearanceB,
  slug,
  categoryMeta,
  modelSamplesA = [],
  modelSamplesB = [],
  affiliateProviders = [],
  alsoViewedComparisons = [],
  lastUpdated = new Date().toISOString().slice(0, 10)
}) {
  const displayBrandA = displayBrandName(brandA);
  const displayBrandB = displayBrandName(brandB);
  const title = `${displayBrandA} vs ${displayBrandB} ${categoryMeta.labelSingular} Clearance Requirements — Australia 2026`;
  const description = `${displayBrandA} vs ${displayBrandB} ${categoryMeta.labelSingular.toLowerCase()} clearance comparison for Australian homes. Side/rear/top spacing and fit implications with real model coverage.`;
  const canonical = `${SITE_ORIGIN}/compare/${slug}`;
  const heroPngPath = `/og-images/compare-${slug}.png`;
  const heroWebpPath = `/og-images/compare-${slug}.webp`;
  const ogImageUrl = `${SITE_ORIGIN}${heroPngPath}`;
  const narrative = buildComparisonNarrative(
    clearanceA,
    clearanceB,
    displayBrandA,
    displayBrandB,
    categoryMeta
  );
  const compareLabel = `${displayBrandA} vs ${displayBrandB}`;
  const compareParam = `${displayBrandA}-vs-${displayBrandB}`;
  const brandAUrl = `/?cat=${encodeURIComponent(cat)}&brand=${encodeURIComponent(brandA)}&compare=${encodeURIComponent(compareParam)}&vs=${encodeURIComponent(brandB)}`;
  const brandBUrl = `/?cat=${encodeURIComponent(cat)}&brand=${encodeURIComponent(brandB)}&compare=${encodeURIComponent(compareParam)}&vs=${encodeURIComponent(brandA)}`;
  const ctaUrl = `/?cat=${encodeURIComponent(cat)}&compare=${encodeURIComponent(compareParam)}&vs=${encodeURIComponent(brandB)}`;
  const hasLinksA = hasSampleRetailLink(modelSamplesA);
  const hasLinksB = hasSampleRetailLink(modelSamplesB);
  const fallbackLinks = [];
  if (!hasLinksA) {
    const sampleModelA = modelSamplesA[0]?.model ?? '';
    fallbackLinks.push({
      label: `Find ${displayBrandA} ${categoryMeta.labelPlural}`,
      url: buildFallbackBuySearchUrl(displayBrandA, categoryMeta, sampleModelA)
    });
  }
  if (!hasLinksB) {
    const sampleModelB = modelSamplesB[0]?.model ?? '';
    fallbackLinks.push({
      label: `Find ${displayBrandB} ${categoryMeta.labelPlural}`,
      url: buildFallbackBuySearchUrl(displayBrandB, categoryMeta, sampleModelB)
    });
  }
  const sampleItemsA = modelSamplesA.map((sample) => {
    const affiliate = resolveAffiliateLinkForProduct(sample, {
      providers: affiliateProviders,
      env: process.env
    });
    const retailLink = pickRetailLink(sample);
    const buyHtml = affiliate
      ? `<br><a href="${escHtml(affiliate.url)}" target="_blank" rel="sponsored nofollow noopener">Buy at ${escHtml(affiliate.providerName)} →</a><small style="display:block;color:#7a766e;margin-top:4px">${escHtml(affiliate.disclosureText)} <a href="/affiliate-disclosure" style="color:#b55a2c">Disclosure</a></small>`
      : retailLink
        ? `<br><a href="${escHtml(retailLink.url)}" target="_blank" rel="noopener sponsored nofollow">${escHtml(retailLink.label)} →</a>`
        : '';
    return `<li><picture class="sample-thumb"><source srcset="${heroWebpPath}" type="image/webp"><img src="${heroPngPath}" alt="${escHtml(displayBrandA)} ${escHtml(sample.model)} comparison preview" width="600" height="315" loading="lazy" decoding="async"></picture>${escHtml(sample.model)} · ${sample.w}×${sample.h}×${sample.d}mm${buyHtml}</li>`;
  }).join('');
  const sampleItemsB = modelSamplesB.map((sample) => {
    const affiliate = resolveAffiliateLinkForProduct(sample, {
      providers: affiliateProviders,
      env: process.env
    });
    const retailLink = pickRetailLink(sample);
    const buyHtml = affiliate
      ? `<br><a href="${escHtml(affiliate.url)}" target="_blank" rel="sponsored nofollow noopener">Buy at ${escHtml(affiliate.providerName)} →</a><small style="display:block;color:#7a766e;margin-top:4px">${escHtml(affiliate.disclosureText)} <a href="/affiliate-disclosure" style="color:#b55a2c">Disclosure</a></small>`
      : retailLink
        ? `<br><a href="${escHtml(retailLink.url)}" target="_blank" rel="noopener sponsored nofollow">${escHtml(retailLink.label)} →</a>`
        : '';
    return `<li><picture class="sample-thumb"><source srcset="${heroWebpPath}" type="image/webp"><img src="${heroPngPath}" alt="${escHtml(displayBrandB)} ${escHtml(sample.model)} comparison preview" width="600" height="315" loading="lazy" decoding="async"></picture>${escHtml(sample.model)} · ${sample.w}×${sample.h}×${sample.d}mm${buyHtml}</li>`;
  }).join('');

  const articleJsonLd = stringifyJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${displayBrandA} vs ${displayBrandB} ${categoryMeta.labelSingular} Clearance Requirements — Australia`,
    datePublished: lastUpdated,
    dateModified: lastUpdated,
    publisher: {
      '@type': 'Organization',
      name: 'FitAppliance',
      url: SITE_ORIGIN
    }
  }, { pretty: true });

  const breadcrumbJsonLd = stringifyJsonLd({
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
        name: `${displayBrandA} vs ${displayBrandB} ${categoryMeta.labelSingular}`,
        item: canonical
      }
    ]
  }, { pretty: true });

  const itemListJsonLd = stringifyJsonLd({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${displayBrandA} and ${displayBrandB} featured ${categoryMeta.labelPlural.toLowerCase()}`,
    itemListElement: [
      ...modelSamplesA.slice(0, 3).map((sample, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: `${displayBrandA} ${sample.model}`
      })),
      ...modelSamplesB.slice(0, 3).map((sample, index) => ({
        '@type': 'ListItem',
        position: modelSamplesA.slice(0, 3).length + index + 1,
        name: `${displayBrandB} ${sample.model}`
      }))
    ]
  }, { pretty: true });
  const headMeta = buildHtmlHead({
    title,
    description,
    modifiedTime: lastUpdated,
    canonical,
    extraMeta: `  ${buildSocialMetaTags({ title, description, canonical, ogImageUrl })}`
  });

  return `<!doctype html>
<html lang="en-AU">
<head>
${headMeta}
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-WNPNS4ZGWK"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-WNPNS4ZGWK');
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root { --ink:#131210; --ink-2:#3D3A35; --ink-3:#7A766E; --paper:#FAF8F4; --white:#FFF; --copper:#B55A2C; --border:#E0D9CE; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Outfit', sans-serif; color: var(--ink); background: var(--paper); line-height: 1.65; }
    main { max-width: 980px; margin: 0 auto; padding: 54px 24px 70px; }
    .back-link { display: inline-block; margin-bottom: 16px; text-decoration: none; color: var(--ink-3); font-size: 13px; }
    h1 { margin: 0 0 12px; font-family: 'Instrument Serif', serif; font-size: clamp(34px, 5vw, 50px); line-height: 1.08; }
    .hero-media { display:block; margin: 0 0 18px; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--white); }
    .hero-media img { width: 100%; height: auto; display: block; }
    .comparison-verdict { border: 1px solid var(--border); background: var(--white); border-radius: 12px; padding: 14px 16px; margin: 0 0 18px; }
    .comparison-verdict p { margin: 0; color: var(--ink-2); font-size: 15px; }
    .comparison-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin: 0 0 22px; }
    .brand-col { border: 1px solid var(--border); border-radius: 12px; background: var(--white); padding: 14px; }
    .brand-col h2 { margin: 0 0 6px; font-size: 22px; font-family: 'Instrument Serif', serif; }
    .metric { font-size: 13px; color: var(--ink-2); margin: 0 0 6px; }
    .metric b { color: var(--ink); font-size: 18px; }
    .comparison-detail { border: 1px solid var(--border); border-radius: 12px; background: var(--white); padding: 16px; margin-bottom: 18px; }
    .comparison-detail h2 { margin: 0 0 8px; font-size: 19px; }
    .comparison-detail ul { margin: 0; padding-left: 18px; color: var(--ink-2); font-size: 14px; }
    .comparison-models { border: 1px solid var(--border); border-radius: 12px; background: var(--white); padding: 16px; margin-bottom: 18px; }
    .comparison-models h2 { margin: 0 0 10px; font-size: 19px; }
    .model-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .model-grid h3 { margin: 0 0 8px; font-size: 15px; color: var(--ink); }
    .model-grid ul { margin: 0; padding-left: 18px; color: var(--ink-2); font-size: 13px; }
    .model-grid li { margin-bottom: 8px; }
    .sample-thumb { display: block; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin: 0 0 6px; }
    .sample-thumb img { width: 100%; height: auto; display: block; }
    .model-grid li a { color: var(--copper); font-weight: 700; text-decoration: none; }
    .model-grid li a:hover { text-decoration: underline; }
    .brand-links { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; }
    .brand-links a, .cta {
      display: inline-flex; align-items: center; justify-content: center; text-decoration: none;
      padding: 10px 16px; border-radius: 8px; background: var(--ink); color: #fff; font-weight: 700; font-size: 13px;
    }
    .brand-links a:hover, .cta:hover { background: var(--copper); }
    @media (max-width: 760px) { .comparison-grid, .model-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <a class="back-link" href="${SITE_ORIGIN}">← Back to FitAppliance</a>
    <h1>${escHtml(displayBrandA)} vs ${escHtml(displayBrandB)} ${escHtml(categoryMeta.labelSingular)} Clearance Requirements — Australia 2026</h1>
    <picture class="hero-media">
      <source srcset="${heroWebpPath}" type="image/webp">
      <img src="${heroPngPath}" alt="${escHtml(compareLabel)} clearance comparison preview" width="1200" height="630" loading="eager" decoding="async" fetchpriority="high">
    </picture>
    <div class="comparison-verdict">
      <p data-source="comparison-analysis">${escHtml(narrative.summary)}</p>
    </div>

    <div class="comparison-grid">
      <section class="brand-col">
        <h2>${escHtml(displayBrandA)}</h2>
        <p class="metric">Side clearance<br><b>${clearanceA.side}mm</b></p>
        <p class="metric">Rear clearance<br><b>${clearanceA.rear}mm</b></p>
        <p class="metric">Top clearance<br><b>${clearanceA.top}mm</b></p>
        <p class="metric">Models in database<br><b>${modelsA}</b></p>
      </section>
      <section class="brand-col">
        <h2>${escHtml(displayBrandB)}</h2>
        <p class="metric">Side clearance<br><b>${clearanceB.side}mm</b></p>
        <p class="metric">Rear clearance<br><b>${clearanceB.rear}mm</b></p>
        <p class="metric">Top clearance<br><b>${clearanceB.top}mm</b></p>
        <p class="metric">Models in database<br><b>${modelsB}</b></p>
      </section>
    </div>

    <section class="comparison-detail">
      <h2>Installation Differences</h2>
      <ul>
        ${narrative.bullets.map((line) => `<li>${escHtml(line)}</li>`).join('')}
      </ul>
    </section>

    <section class="comparison-models">
      <h2>Featured ${escHtml(categoryMeta.labelPlural)} Models</h2>
      <div class="model-grid">
        <div>
          <h3>${escHtml(displayBrandA)}</h3>
          <ul>${sampleItemsA || '<li>Model data pending.</li>'}</ul>
        </div>
        <div>
          <h3>${escHtml(displayBrandB)}</h3>
          <ul>${sampleItemsB || '<li>Model data pending.</li>'}</ul>
        </div>
      </div>
      <div class="brand-links">
        <a href="${brandAUrl}">Browse ${escHtml(displayBrandA)} ${escHtml(categoryMeta.labelPlural)}</a>
        <a href="${brandBUrl}">Browse ${escHtml(displayBrandB)} ${escHtml(categoryMeta.labelPlural)}</a>
      </div>
      ${fallbackLinks.length > 0 ? `<div class="brand-links">${fallbackLinks
        .map((link) => `<a href="${escHtml(link.url)}" target="_blank" rel="noopener sponsored nofollow">${escHtml(link.label)} →</a>`)
        .join('')}</div>` : ''}
    </section>

    <a class="cta" href="${ctaUrl}">Compare ${escHtml(compareLabel)} inside your exact cavity →</a>
    <section style="margin:32px 0;padding:16px 24px;background:#f5f2ec;border-radius:8px;border:1px solid #e0d9ce">
      <p style="font-size:13px;color:#7a766e;margin:0 0 10px">Full clearance specifications:</p>
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <a href="/brands/${escHtml(slugify(brandA))}-${escHtml(categoryMeta.slug)}-clearance" style="font-size:13px;color:#b55a2c;text-decoration:none">${escHtml(displayBrandA)} ${escHtml(categoryMeta.labelSingular)} clearance specs →</a>
        <a href="/brands/${escHtml(slugify(brandB))}-${escHtml(categoryMeta.slug)}-clearance" style="font-size:13px;color:#b55a2c;text-decoration:none">${escHtml(displayBrandB)} ${escHtml(categoryMeta.labelSingular)} clearance specs →</a>
      </div>
    </section>
    ${alsoViewedComparisons.length > 0 ? `<section style="margin:20px 0;padding:16px 24px;background:#f5f2ec;border-radius:8px;border:1px solid #e0d9ce">
      <p style="font-size:13px;color:#7a766e;margin:0 0 10px">Also viewed comparisons:</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${alsoViewedComparisons.map((row) => `<a href="/compare/${escHtml(row.slug)}" style="display:inline-block;padding:6px 14px;border:1px solid #e0d9ce;border-radius:20px;font-size:13px;color:#b55a2c;text-decoration:none;background:#fff">${escHtml(row.label)}</a>`).join('\n        ')}
      </div>
    </section>` : ''}
    <section style="margin:20px 0;padding:16px 24px;background:#f5f2ec;border-radius:8px;border:1px solid #e0d9ce">
      <p style="font-size:13px;color:#7a766e;margin:0 0 10px">Related fitting guides:</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${GUIDE_HUB_LINKS.map((row) => `<a href="${escHtml(row.url)}" style="display:inline-block;padding:6px 14px;border:1px solid #e0d9ce;border-radius:20px;font-size:13px;color:#b55a2c;text-decoration:none;background:#fff">${escHtml(row.label)}</a>`).join('\n        ')}
      </div>
    </section>
    <footer style="margin-top:16px;padding-top:14px;border-top:1px solid #e0d9ce;font-size:13px;color:#7a766e">
      <a href="/methodology" style="color:#b55a2c;text-decoration:none">Methodology</a> ·
      <a href="/about/editorial-standards" style="color:#b55a2c;text-decoration:none">Editorial standards</a>
    </footer>
  </main>
  <script>
    if (typeof gtag === 'function') {
      gtag('event', 'compare_view', {
        cat: ${JSON.stringify(categoryMeta.slug)},
        brand_a: ${JSON.stringify(displayBrandA)},
        brand_b: ${JSON.stringify(displayBrandB)}
      });
    }
  </script>
  <script type="application/ld+json">
${articleJsonLd}
  </script>
  <script type="application/ld+json">
${breadcrumbJsonLd}
  </script>
  <script type="application/ld+json">
${itemListJsonLd}
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

function sampleBrandModels(products, cat, brand) {
  return products
    .filter((product) => product.cat === cat && product.brand === brand)
    .sort((left, right) => {
      const leftHasLink = hasRetailLink(left) ? 1 : 0;
      const rightHasLink = hasRetailLink(right) ? 1 : 0;
      if (rightHasLink !== leftHasLink) return rightHasLink - leftHasLink;
      const leftStars = Number.isFinite(left.stars) ? left.stars : -1;
      const rightStars = Number.isFinite(right.stars) ? right.stars : -1;
      if (rightStars !== leftStars) return rightStars - leftStars;
      const leftHeight = Number.isFinite(left.h) ? left.h : 0;
      const rightHeight = Number.isFinite(right.h) ? right.h : 0;
      if (rightHeight !== leftHeight) return rightHeight - leftHeight;
      return String(left.model ?? '').localeCompare(String(right.model ?? ''));
    })
    .slice(0, 3)
    .map((product) => ({
      brand: product.brand,
      cat: product.cat,
      model: product.model,
      w: product.w,
      h: product.h,
      d: product.d,
      affiliate: product.affiliate ?? null,
      directUrl: product.direct_url,
      directLabel: null,
      bestRetailer: Array.isArray(product.retailers)
        ? product.retailers.find((retailer) => retailer && typeof retailer.url === 'string' && /^https?:\/\//i.test(retailer.url)) ?? null
        : null
    }));
}

async function generateComparisonPages(options = {}) {
  const repoRoot = options.repoRoot ?? path.resolve(__dirname, '..');
  const dataDir = options.dataDir ?? path.join(repoRoot, 'public', 'data');
  const outputDir = options.outputDir ?? path.join(repoRoot, 'pages', 'compare');
  const logger = options.logger ?? console;

  const appliances = await readJson(path.join(dataDir, 'appliances.json'));
  const clearance = await readJson(path.join(dataDir, 'clearance.json'));
  const affiliateProviders = await loadProvidersFromFile(
    options.affiliateProvidersPath ?? path.join(repoRoot, 'data', 'affiliates', 'providers.json')
  ).catch(() => []);
  const products = Array.isArray(appliances.products) ? appliances.products : [];
  const pairs = selectComparisonPairs(products, clearance.rules ?? {}, options);

  await cleanOutputDir(outputDir);

  const pageBySlug = new Map();
  for (const pair of pairs) {
    const meta = CATEGORY_META[pair.cat] ?? {
      slug: slugify(pair.cat),
      labelPlural: pair.cat,
      labelSingular: pair.cat
    };
    const slug = slugifyPair(pair.brandA, pair.brandB, meta.slug);
    const filePath = path.join(outputDir, `${slug}.html`);
    const record = {
      brandA: pair.brandA,
      brandB: pair.brandB,
      cat: pair.cat,
      modelsA: pair.modelsA,
      modelsB: pair.modelsB,
      clearanceA: pair.clearanceA,
      clearanceB: pair.clearanceB,
      slug,
      url: `/compare/${slug}`,
      categoryMeta: meta,
      modelSamplesA: sampleBrandModels(products, pair.cat, pair.brandA),
      modelSamplesB: sampleBrandModels(products, pair.cat, pair.brandB),
      lastUpdated: appliances.last_updated,
      filePath
    };
    const existing = pageBySlug.get(slug);
    if (!existing || (record.modelsA + record.modelsB) > (existing.modelsA + existing.modelsB)) {
      pageBySlug.set(slug, record);
    }
  }

  const rows = Array.from(pageBySlug.values());
  for (const row of rows) {
    const alsoViewedComparisons = rows
      .filter((candidate) => candidate.slug !== row.slug && candidate.cat === row.cat)
      .sort((left, right) => {
        const leftShared = Number(left.brandA === row.brandA || left.brandA === row.brandB || left.brandB === row.brandA || left.brandB === row.brandB);
        const rightShared = Number(right.brandA === row.brandA || right.brandA === row.brandB || right.brandB === row.brandA || right.brandB === row.brandB);
        if (rightShared !== leftShared) return rightShared - leftShared;
        return (right.modelsA + right.modelsB) - (left.modelsA + left.modelsB);
      })
      .slice(0, 8)
      .map((candidate) => ({
        slug: candidate.slug,
        label: `${displayBrandName(candidate.brandA)} vs ${displayBrandName(candidate.brandB)}`
      }));
    const html = buildComparisonPageHtml({
      brandA: row.brandA,
      brandB: row.brandB,
      cat: row.cat,
      modelsA: row.modelsA,
      modelsB: row.modelsB,
      clearanceA: row.clearanceA,
      clearanceB: row.clearanceB,
      slug: row.slug,
      categoryMeta: row.categoryMeta,
      modelSamplesA: row.modelSamplesA,
      modelSamplesB: row.modelSamplesB,
      affiliateProviders,
      alsoViewedComparisons,
      lastUpdated: row.lastUpdated
    });
    await writeFile(row.filePath, html, 'utf8');
  }

  rows.sort((left, right) => {
    if (left.cat !== right.cat) return left.cat.localeCompare(right.cat);
    if (left.brandA !== right.brandA) return left.brandA.localeCompare(right.brandA);
    return left.brandB.localeCompare(right.brandB);
  });

  const serializableRows = rows.map((row) => ({
    brandA: row.brandA,
    brandB: row.brandB,
    cat: row.cat,
    slug: row.slug,
    url: row.url,
    modelsA: row.modelsA,
    modelsB: row.modelsB
  }));

  const indexPath = path.join(outputDir, 'index.json');
  await writeFile(indexPath, `${JSON.stringify(serializableRows, null, 2)}\n`, 'utf8');
  logger.log(`Generated ${serializableRows.length} comparison pages to pages/compare/`);

  return {
    generated: serializableRows.length,
    outputDir,
    indexPath
  };
}

if (require.main === module) {
  generateComparisonPages().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildComparisonNarrative,
  buildComparisonPageHtml,
  generateComparisonPages,
  rankBrands,
  selectComparisonPairs,
  slugifyPair
};
