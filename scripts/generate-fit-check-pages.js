#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');

const { SITE_ORIGIN } = require('./common/site-origin.js');
const { buildEvidenceIndexFromFile } = require('./build-evidence-index.js');

const DEFAULT_CAVITY_WIDTHS = Object.freeze([540, 580, 600, 620, 640, 700, 800, 900]);
const PRACTICAL_CLEARANCE = Object.freeze({ side: 5, top: 20, rear: 10 });
const REVIEWED_AT = '2026-05-07T00:00:00+08:00';
const CATEGORY_FILE_BY_CAT = Object.freeze({
  fridge: 'fridges.json',
  dishwasher: 'dishwashers.json',
  dryer: 'dryers.json',
  washing_machine: 'washing-machines.json'
});
const CATEGORY_LABEL_BY_CAT = Object.freeze({
  fridge: 'fridge',
  dishwasher: 'dishwasher',
  dryer: 'dryer',
  washing_machine: 'washing machine'
});

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return map[char] ?? char;
  });
}

function escAttr(value) {
  return escHtml(value);
}

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function loadCatalog(repoRoot = path.resolve(__dirname, '..')) {
  return Object.entries(CATEGORY_FILE_BY_CAT).flatMap(([cat, fileName]) => {
    const data = JSON.parse(readFileSync(path.join(repoRoot, 'public', 'data', fileName), 'utf8'));
    return (data.products ?? []).map((product) => ({ ...product, cat: product.cat ?? cat }));
  });
}

function loadEvidenceIndex(repoRoot = path.resolve(__dirname, '..')) {
  const outputPath = path.join(repoRoot, 'public', 'data', 'evidence-index.json');
  if (existsSync(outputPath)) {
    return JSON.parse(readFileSync(outputPath, 'utf8'));
  }
  const manualEvidencePath = path.join(repoRoot, 'data', 'manual-evidence.json');
  if (!existsSync(manualEvidencePath)) {
    return {};
  }
  return buildEvidenceIndexFromFile({
    repoRoot,
    outputPath
  });
}

function productName(product) {
  const brand = String(product?.brand ?? '').trim();
  const model = String(product?.model ?? '').trim();
  const display = String(product?.displayName ?? '').trim();
  if (display && !display.toLowerCase().startsWith(brand.toLowerCase())) return `${brand} ${display}`.trim();
  if (display && display.length > model.length + brand.length + 2) return display;
  return `${brand} ${model}`.trim();
}

function getRequiredWidth(product) {
  return Math.round(Number(product?.w ?? 0) + PRACTICAL_CLEARANCE.side * 2);
}

function getWidthGap(product, cavityW) {
  return Math.round(Number(cavityW) - getRequiredWidth(product));
}

function getVerdict(product, cavityW) {
  const gap = getWidthGap(product, cavityW);
  if (gap >= 20) {
    return {
      key: 'perfect',
      label: 'Yes',
      headline: `Yes — fits with ${gap}mm spare width`,
      tone: 'green',
      gap
    };
  }
  if (gap >= 5) {
    return {
      key: 'tight',
      label: 'Tight',
      headline: `Tight — fits with ${gap}mm spare width`,
      tone: 'amber',
      gap
    };
  }
  if (gap >= 0) {
    return {
      key: 'binding',
      label: 'Binding',
      headline: `Very tight — only ${gap}mm spare width`,
      tone: 'orange',
      gap
    };
  }
  return {
    key: 'no-fit',
    label: 'No',
    headline: `No — needs ${Math.abs(gap)}mm more cavity width`,
    tone: 'red',
    gap
  };
}

function byPriority(left, right) {
  const priorityDiff = Number(right?.priorityScore ?? 0) - Number(left?.priorityScore ?? 0);
  if (priorityDiff !== 0) return priorityDiff;
  return productName(left).localeCompare(productName(right));
}

function selectFitCheckCombinations(catalog, options = {}) {
  const topN = Number.isFinite(Number(options.topN)) ? Number(options.topN) : 200;
  const cavityWidths = Array.isArray(options.cavityWidths) && options.cavityWidths.length > 0
    ? options.cavityWidths.map(Number).filter((value) => Number.isFinite(value) && value > 0)
    : [...DEFAULT_CAVITY_WIDTHS];
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : Infinity;
  const products = [...(Array.isArray(catalog) ? catalog : [])]
    .filter((product) => Number.isFinite(Number(product?.w)) && product.w > 0)
    .sort(byPriority)
    .slice(0, topN);

  const combinations = [];
  for (const product of products) {
    for (const cavityW of cavityWidths) {
      combinations.push({ product, cavityW });
      if (combinations.length >= limit) return combinations;
    }
  }
  return combinations;
}

function selectReviewSampleCombinations(catalog) {
  const all = selectFitCheckCombinations(catalog, { topN: 200, cavityWidths: DEFAULT_CAVITY_WIDTHS });
  const wanted = [
    ['perfect', 5],
    ['tight', 3],
    ['no-fit', 2]
  ];
  const picked = [];
  const seen = new Set();
  for (const [verdictKey, count] of wanted) {
    const seenProducts = new Set();
    const matches = all.filter(({ product, cavityW }) => getVerdict(product, cavityW).key === verdictKey);
    for (const requireNewProduct of [true, false]) {
      for (const combo of matches) {
        const key = `${combo.product.id}:${combo.cavityW}`;
        if (seen.has(key)) continue;
        if (requireNewProduct && seenProducts.has(combo.product.id)) continue;
        picked.push(combo);
        seen.add(key);
        seenProducts.add(combo.product.id);
        if (picked.filter((row) => getVerdict(row.product, row.cavityW).key === verdictKey).length >= count) break;
      }
      if (picked.filter((row) => getVerdict(row.product, row.cavityW).key === verdictKey).length >= count) break;
    }
  }
  return picked.slice(0, 10);
}

function findAlternatives(product, cavityW, allProducts) {
  return [...(allProducts ?? [])]
    .filter((candidate) => (
      candidate?.cat === product?.cat &&
      candidate?.id !== product?.id &&
      candidate?.unavailable === false
    ))
    .map((candidate) => ({ candidate, verdict: getVerdict(candidate, cavityW) }))
    .filter(({ verdict }) => verdict.gap >= 5)
    .sort((left, right) => {
      const fitDiff = Math.abs(left.verdict.gap - 20) - Math.abs(right.verdict.gap - 20);
      if (fitDiff !== 0) return fitDiff;
      return byPriority(left.candidate, right.candidate);
    })
    .slice(0, 3)
    .map(({ candidate, verdict }) => ({ product: candidate, verdict }));
}

function buildRetailerLinks(product) {
  const retailers = Array.isArray(product?.retailers) ? product.retailers : [];
  return retailers
    .filter((retailer) => retailer?.url && retailer?.n)
    .slice(0, 5)
    .map((retailer) => `<a class="retailer-chip" href="${escAttr(retailer.url)}" rel="sponsored nofollow noopener" target="_blank">${escHtml(retailer.n)}</a>`)
    .join('\n');
}

function productInitials(product) {
  const parts = String(product?.brand ?? '')
    .trim()
    .split(/[\s\-&]+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function buildStaticThumb(product) {
  return `<svg class="product-thumb-svg" role="img" aria-label="${escAttr(productName(product))}" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
    <rect width="80" height="80" rx="10" fill="#6b7f73"></rect>
    <text x="40" y="50" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="28" font-weight="700" fill="#fff">${escHtml(productInitials(product))}</text>
  </svg>`;
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 45;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clearanceTone(spareMm) {
  if (!Number.isFinite(spareMm)) return 'unknown';
  if (spareMm >= 20) return 'green';
  if (spareMm >= 5) return 'amber';
  return 'red';
}

function buildStaticClearanceBar({ axis, label, productMm, cavityMm, clearanceMm }) {
  const productValue = Number(productMm);
  const cavityValue = Number(cavityMm);
  const clearanceValue = Math.max(0, Math.round(Number(clearanceMm) || 0));
  const hasCavity = Number.isFinite(cavityValue) && cavityValue > 0;
  const usedMm = Number.isFinite(productValue) ? productValue + clearanceValue : null;
  const spareMm = hasCavity && Number.isFinite(usedMm) ? Math.round(cavityValue - usedMm) : null;
  const tone = clearanceTone(spareMm);
  const fillPercent = hasCavity && Number.isFinite(usedMm) ? clampPercent((usedMm / cavityValue) * 100) : 45;
  const labelText = hasCavity
    ? `${label}: ${Math.round(productValue)}mm + ${clearanceValue}mm clearance / ${Math.round(cavityValue)}mm cavity (${spareMm < 0 ? `${Math.abs(spareMm)}mm over` : `${spareMm}mm spare`})`
    : `${label}: ${Math.round(productValue)}mm product / cavity not entered`;

  return `<div class="clearance-bar clearance-bar--${escAttr(tone)}${spareMm !== null && spareMm < 0 ? ' clearance-bar--striped' : ''}${axis === 'width' ? ' clearance-bar--binding' : ''}" data-clearance-axis="${escAttr(axis)}" aria-label="${escAttr(labelText)}">
      <div class="clearance-bar-label">${escHtml(labelText)}</div>
      <div class="clearance-bar-track" aria-hidden="true"><span class="clearance-bar-fill" style="width:${fillPercent}%"></span></div>
    </div>`;
}

function renderStaticMiniWireframe(product, cavityW) {
  const productW = Number(product?.w);
  const productH = Number(product?.h);
  const cavityWidth = Number(cavityW);
  if (!Number.isFinite(productW) || !Number.isFinite(productH) || !Number.isFinite(cavityWidth)) {
    return '';
  }
  const outer = { x: 6, y: 6, w: 48, h: 48 };
  const ratioW = Math.max(0.12, Math.min(1, productW / cavityWidth));
  const innerW = Math.max(8, Math.round(outer.w * ratioW));
  const innerH = 40;
  const innerX = Math.round(outer.x + (outer.w - innerW) / 2);
  const innerY = Math.round(outer.y + (outer.h - innerH) / 2);

  return `<svg class="mini-front-wireframe" role="img" aria-label="${escAttr(productName(product))} mini front fit preview" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
    <rect x="${outer.x}" y="${outer.y}" width="${outer.w}" height="${outer.h}" rx="3" fill="none" stroke="#2c2c2c" stroke-width="1.2"></rect>
    <rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" rx="2" fill="#eeece6" fill-opacity="0.7" stroke="#2c2c2c" stroke-width="1"></rect>
  </svg>`;
}

function buildStaticFitHealth(verdict) {
  const state = verdict.key === 'no-fit' ? 'blocked' : verdict.gap < 20 ? 'tight' : 'perfect';
  const legacyClass = state === 'blocked' ? 'fit-badge--relax' : state === 'tight' ? 'fit-badge--tight' : 'fit-badge--exact';
  const label = state === 'blocked' ? "Won't fit" : state === 'tight' ? 'Tight fit' : 'Perfect fit';
  const detail = state === 'blocked' ? `+${Math.abs(verdict.gap)}mm cavity needed` : `${verdict.gap}mm spare`;
  return `<div class="fit-health fit-health--${escAttr(state)} fit-badge ${legacyClass}" data-fit-health="${escAttr(state)}">
      <span class="fit-health-light" aria-hidden="true"></span>
      <span class="fit-health-label">${escHtml(label)}</span>
      <span class="fit-health-detail">${escHtml(detail)}</span>
    </div>`;
}

function buildAlternativeAvailability(product) {
  const retailerLinks = buildRetailerLinks(product);
  if (retailerLinks) {
    return `<details class="card-availability">
      <summary class="card-cta-availability">Check Availability</summary>
      <div class="retailer-accordion-content"><div class="retailer-accordion-links">${retailerLinks}</div></div>
    </details>`;
  }
  return `<details class="card-availability">
      <summary class="card-cta-availability">Check Availability</summary>
      <div class="retailer-accordion-content"><p class="retailer-commission-note">No verified retailer link yet.</p></div>
    </details>`;
}

function renderAlternativeCard(product, verdict, cavityW) {
  const name = productName(product);
  const category = CATEGORY_LABEL_BY_CAT[product?.cat] ?? 'appliance';
  return `<article class="alternative-card p-row p-row--rtings">
    <div class="card-zone-a" aria-label="${escAttr(name)} fit preview">
      <div class="card-zone-thumb-split">
        <div class="card-zone-thumb-half">${buildStaticThumb(product)}</div>
        <div class="card-zone-wire-half">${renderStaticMiniWireframe(product, cavityW)}</div>
      </div>
      <div class="card-zone-fit">${buildStaticFitHealth(verdict)}</div>
    </div>
    <div class="card-zone-b">
      <div class="card-zone-heading">
        <div class="card-zone-kicker">${escHtml(product?.brand ?? '')}</div>
        <div class="card-zone-title">${escHtml(name)}</div>
        <div class="card-zone-model">Model ${escHtml(product?.model ?? product?.id ?? '')}</div>
      </div>
      <div class="clearance-bars" aria-label="Product and clearance use compared with cavity size">
        ${buildStaticClearanceBar({ axis: 'width', label: 'W', productMm: product?.w, cavityMm: cavityW, clearanceMm: PRACTICAL_CLEARANCE.side * 2 })}
        ${buildStaticClearanceBar({ axis: 'height', label: 'H', productMm: product?.h, cavityMm: null, clearanceMm: PRACTICAL_CLEARANCE.top })}
        ${buildStaticClearanceBar({ axis: 'depth', label: 'D', productMm: product?.d, cavityMm: null, clearanceMm: PRACTICAL_CLEARANCE.rear })}
      </div>
      <div class="card-zone-tech-specs">${escHtml(category)} · ${escHtml(product?.stars ?? '—')}★ GEMS</div>
    </div>
    <div class="card-zone-c">
      <div class="card-zone-actions">
        <a class="btn-compare" href="/?cat=${escAttr(product?.cat)}&w=${escAttr(cavityW)}">Compare</a>
      </div>
      ${buildAlternativeAvailability(product)}
    </div>
  </article>`;
}

function buildArticleSchema({ product, cavityW, slug, title, description }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    author: { '@type': 'Organization', name: 'FitAppliance' },
    publisher: { '@type': 'Organization', name: 'FitAppliance' },
    url: `${SITE_ORIGIN}/fit-check/${slug}`,
    mainEntityOfPage: `${SITE_ORIGIN}/fit-check/${slug}`,
    about: `${product.brand} ${product.model}`,
    inLanguage: 'en-AU',
    dateModified: REVIEWED_AT
  };
}

function buildFaqSchema(faqItems) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a
      }
    }))
  };
}

function buildFaqItems(product, cavityW, verdict) {
  const name = productName(product);
  const category = CATEGORY_LABEL_BY_CAT[product?.cat] ?? 'appliance';
  const requiredWidth = getRequiredWidth(product);
  return [
    {
      q: `What size cavity does the ${name} need?`,
      a: `The ${name} is ${product.w}mm wide. With FitAppliance's practical side clearance buffer, it needs about ${requiredWidth}mm of cavity width.`
    },
    {
      q: `Will the ${name} fit a ${cavityW}mm cavity?`,
      a: verdict.gap >= 0
        ? `Yes. A ${cavityW}mm cavity leaves about ${verdict.gap}mm spare width after the practical clearance buffer.`
        : `No. A ${cavityW}mm cavity is about ${Math.abs(verdict.gap)}mm short of the practical width needed.`
    },
    {
      q: `Can I install this ${category} in a ${Math.max(0, cavityW - 50)}mm cavity?`,
      a: `A ${Math.max(0, cavityW - 50)}mm cavity would be checked against the same ${requiredWidth}mm practical width requirement. If it is below that figure, choose a narrower model.`
    },
    {
      q: `Does the ${name} need top clearance?`,
      a: `This page uses the practical FitAppliance buffer of ${PRACTICAL_CLEARANCE.top}mm top clearance. Always check the manufacturer installation manual before purchase.`
    },
    {
      q: `Where can I buy the ${name} in Australia?`,
      a: Array.isArray(product.retailers) && product.retailers.length > 0
        ? `Retailer links are shown on this page where FitAppliance has product-page URLs available.`
        : `FitAppliance does not yet have a verified retailer link for this model, so use the dimensions here as a fit check before searching retailers.`
    }
  ];
}

function renderAlternatives(alternatives, cavityW) {
  if (alternatives.length === 0) {
    return '<p>No better-fit alternative is available in the current catalog for this cavity width.</p>';
  }
  return [
    '<div class="alternative-grid">',
    ...alternatives.map(({ product, verdict }) => renderAlternativeCard(product, verdict, cavityW)),
    '</div>'
  ].join('\n');
}

function formatEvidenceDate(value) {
  const raw = String(value ?? '').trim();
  const direct = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
  if (!direct) return '';
  const [year, month, day] = direct.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

function isSafeEvidenceUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function renderStaticProvenanceBlock(product, evidenceIndex = {}) {
  const entry = evidenceIndex[String(product?.id ?? '')];
  if (!entry) {
    return `<div class="data-provenance data-provenance--fallback">
        <span class="data-provenance__label">Evidence</span>
        <span class="data-provenance__copy">Retailer or catalog spec. Official PDF verification pending.</span>
      </div>`;
  }
  const date = formatEvidenceDate(entry.extractedAt);
  const source = String(entry.source ?? 'official_pdf').replace(/[_-]+/g, ' ');
  if (entry.verified === true && isSafeEvidenceUrl(entry.pdfUrl)) {
    return `<div class="data-provenance data-provenance--verified">
        <span class="data-provenance__label">Verified against official PDF</span>
        <a class="data-provenance__link" href="${escAttr(entry.pdfUrl)}" target="_blank" rel="noopener">View ${escHtml(source)}</a>
        ${date ? `<span class="data-provenance__date">Extracted ${escHtml(date)}</span>` : ''}
      </div>`;
  }
  return `<div class="data-provenance data-provenance--pending">
        <span class="data-provenance__label">Evidence pending review</span>
        <span class="data-provenance__copy">PDF source captured, but not yet approved for runtime data.</span>
        ${date ? `<span class="data-provenance__date">Captured ${escHtml(date)}</span>` : ''}
      </div>`;
}

function buildFitCheckPage(product, cavityW, allProducts = [], options = {}) {
  const name = productName(product);
  const brandSlug = slugify(product?.brand);
  const modelSlug = slugify(product?.model || product?.id);
  const slug = `${brandSlug}-${modelSlug}-in-${Number(cavityW)}mm-cavity`;
  const verdict = getVerdict(product, cavityW);
  const requiredWidth = getRequiredWidth(product);
  const category = CATEGORY_LABEL_BY_CAT[product?.cat] ?? 'appliance';
  const title = `Will the ${name} fit a ${cavityW}mm cavity? — FitAppliance`;
  const description = `${name} requires about ${requiredWidth}mm cavity width with ${PRACTICAL_CLEARANCE.side}mm side clearance. See if it fits your ${cavityW}mm cavity.`;
  const faqItems = buildFaqItems(product, cavityW, verdict);
  const alternatives = findAlternatives(product, cavityW, allProducts);
  const retailerLinks = buildRetailerLinks(product);
  const articleSchema = buildArticleSchema({ product, cavityW, slug, title, description });
  const faqSchema = buildFaqSchema(faqItems);
  const canonical = `${SITE_ORIGIN}/fit-check/${slug}`;
  const relatedWidths = DEFAULT_CAVITY_WIDTHS
    .filter((width) => width !== Number(cavityW))
    .slice(0, 6)
    .map((width) => `<a href="/fit-check/${brandSlug}-${modelSlug}-in-${width}mm-cavity">${width}mm cavity</a>`)
    .join('\n');
  const relatedProducts = alternatives
    .slice(0, 6)
    .map(({ product: alternative }) => {
      const altSlug = `${slugify(alternative.brand)}-${slugify(alternative.model || alternative.id)}-in-${Number(cavityW)}mm-cavity`;
      return `<a href="/fit-check/${altSlug}">${escHtml(productName(alternative))}</a>`;
    })
    .join('\n');

  const evidenceIndex = options.evidenceIndex ?? {};
  const html = `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escAttr(description)}">
  <link rel="canonical" href="${escAttr(canonical)}">
  <link rel="alternate" hreflang="en-AU" href="${escAttr(canonical)}">
  <link rel="alternate" hreflang="x-default" href="${escAttr(canonical)}">
  <meta property="og:title" content="${escAttr(title)}">
  <meta property="og:description" content="${escAttr(description)}">
  <meta property="og:url" content="${escAttr(canonical)}">
  <meta property="og:image" content="/og-images/fridge-default.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="article:modified_time" content="${escAttr(REVIEWED_AT)}">
  <link rel="stylesheet" href="/styles.css">
  <link rel="preload" href="/styles-deferred.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="/styles-deferred.css"></noscript>
  <script type="application/ld+json">${JSON.stringify(articleSchema)}</script>
  <script type="application/ld+json">${JSON.stringify(faqSchema)}</script>
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
  <main class="fit-check-page">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a> <span>→</span> <span>Fit Check</span> <span>→</span> <span>${escHtml(name)}</span>
    </nav>
    <h1>Will the ${escHtml(name)} fit a ${escHtml(cavityW)}mm cavity?</h1>
    <section class="verdict-box verdict-box--${escAttr(verdict.tone)}">
      <p class="verdict-label">${escHtml(verdict.label)}</p>
      <h2>${escHtml(verdict.headline)}</h2>
      <p>Your ${escHtml(cavityW)}mm cavity is compared with the ${escHtml(product.w)}mm product width plus ${PRACTICAL_CLEARANCE.side}mm side clearance on each side.</p>
    </section>
    <section>
      <h2>Product dimensions</h2>
      <table class="dimensions-table">
        <tbody>
          <tr><th>Width</th><td>${escHtml(product.w)}mm</td></tr>
          <tr><th>Height</th><td>${escHtml(product.h)}mm</td></tr>
          <tr><th>Depth</th><td>${escHtml(product.d)}mm</td></tr>
        </tbody>
      </table>
      ${renderStaticProvenanceBlock(product, evidenceIndex)}
    </section>
    <section>
      <h2>Clearance breakdown</h2>
      <table class="clearance-table">
        <thead><tr><th>Area</th><th>Required</th><th>Available in this check</th></tr></thead>
        <tbody>
          <tr><td>Left side</td><td>${PRACTICAL_CLEARANCE.side}mm</td><td>${Math.floor((cavityW - product.w) / 2)}mm before appliance alignment</td></tr>
          <tr><td>Right side</td><td>${PRACTICAL_CLEARANCE.side}mm</td><td>${Math.floor((cavityW - product.w) / 2)}mm before appliance alignment</td></tr>
          <tr><td>Top</td><td>${PRACTICAL_CLEARANCE.top}mm</td><td>Check your cavity height separately</td></tr>
          <tr><td>Rear</td><td>${PRACTICAL_CLEARANCE.rear}mm</td><td>Check your cavity depth separately</td></tr>
        </tbody>
      </table>
    </section>
    <section>
      <h2>Cavity-fit math</h2>
      <p>Your cavity width is ${escHtml(cavityW)}mm. ${escHtml(name)} is ${escHtml(product.w)}mm wide. FitAppliance adds ${PRACTICAL_CLEARANCE.side}mm side clearance × 2, so the practical width needed is ${escHtml(requiredWidth)}mm. Result: ${verdict.gap >= 0 ? `${escHtml(verdict.gap)}mm spare` : `${escHtml(Math.abs(verdict.gap))}mm short`}.</p>
    </section>
    <section>
      <h2>3 alternatives that fit better in your ${escHtml(cavityW)}mm cavity</h2>
      ${renderAlternatives(alternatives, cavityW)}
    </section>
    <section>
      <h2>Buy links</h2>
      ${retailerLinks ? `<div class="retailer-strip">${retailerLinks}</div>` : '<p>No verified retailer product-page link is available for this model yet.</p>'}
    </section>
    <section>
      <h2>FAQ</h2>
      <dl class="faq-list">
        ${faqItems.map((item) => `<dt>${escHtml(item.q)}</dt><dd>${escHtml(item.a)}</dd>`).join('\n')}
      </dl>
    </section>
    <section>
      <h2>Related fit checks</h2>
      <div class="related-links">${relatedWidths}${relatedProducts}</div>
    </section>
  </main>
  <footer class="site-footer">
    <a href="/methodology">Methodology</a>
    <a href="/about/editorial-standards">Editorial standards</a>
    <a href="/affiliate-disclosure">Affiliate disclosure</a>
  </footer>
</body>
</html>
`;
  return {
    slug,
    html,
    meta: {
      title,
      description,
      jsonLd: [articleSchema, faqSchema],
      verdict: verdict.key,
      gap: verdict.gap
    }
  };
}

function htmlText(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function textSimilarity(leftHtml, rightHtml) {
  const toNgrams = (html) => {
    const tokens = htmlText(html).split(/\s+/).filter(Boolean);
    const grams = new Set();
    for (let index = 0; index <= tokens.length - 5; index += 1) {
      grams.add(tokens.slice(index, index + 5).join(' '));
    }
    return grams.size > 0 ? grams : new Set(tokens);
  };
  const left = toNgrams(leftHtml);
  const right = toNgrams(rightHtml);
  if (left.size === 0 && right.size === 0) return 1;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size);
}

function writePages(combinations, options = {}) {
  const repoRoot = options.repoRoot ?? path.resolve(__dirname, '..');
  const allProducts = options.allProducts ?? loadCatalog(repoRoot);
  const evidenceIndex = options.evidenceIndex ?? loadEvidenceIndex(repoRoot);
  const outputDir = path.join(repoRoot, 'pages', 'fit-check');
  const reportDir = path.join(repoRoot, 'reports', 'fit-check');
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(reportDir, { recursive: true });

  const builtPages = combinations.map((combo) => buildFitCheckPage(combo.product, combo.cavityW, allProducts, { evidenceIndex }));
  const pages = [];
  for (const page of builtPages) {
    const peerLinks = builtPages
      .filter((peer) => peer.slug !== page.slug)
      .slice(0, 9)
      .map((peer) => `<a href="/fit-check/${peer.slug}">${escHtml(peer.meta.title.replace(' — FitAppliance', ''))}</a>`)
      .join('\n');
    const html = page.html.replace(
      '</main>',
      `<section class="fit-check-peer-links">
      <h2>More sample fit checks</h2>
      <div class="related-links">${peerLinks}</div>
    </section>
  </main>`
    );
    writeFileSync(path.join(outputDir, `${page.slug}.html`), html, 'utf8');
    pages.push({
      slug: page.slug,
      url: `/fit-check/${page.slug}`,
      title: page.meta.title,
      verdict: page.meta.verdict,
      gap: page.meta.gap
    });
  }

  const report = {
    schema_version: 1,
    generated_at: '2026-05-07',
    pages
  };
  writeFileSync(
    path.join(reportDir, 'sample-validation.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  return { count: pages.length, pages };
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const catalog = loadCatalog(repoRoot);
  const combinations = selectReviewSampleCombinations(catalog);
  const result = writePages(combinations, { repoRoot, allProducts: catalog });
  console.log(`Generated ${result.count} fit-check sample pages`);
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_CAVITY_WIDTHS,
  buildFitCheckPage,
  getVerdict,
  selectFitCheckCombinations,
  selectReviewSampleCombinations,
  textSimilarity,
  writePages
};
