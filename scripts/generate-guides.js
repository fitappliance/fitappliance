#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readdir, readFile, rm, writeFile } = require('node:fs/promises');
const { SITE_ORIGIN } = require('./common/site-origin.js');
const { getBuildTimestampIso } = require('./utils/build-timestamp.js');

const GUIDE_HUBS = [
  {
    slug: 'dishwasher-cavity-sizing',
    title: 'Dishwasher Cavity Sizing Guide',
    description:
      'Installation-first dishwasher cavity sizing references for Australian kitchens, with links to brand clearance pages, compare pages, and nearby fridge cavity benchmarks.'
  },
  {
    slug: 'washing-machine-doorway-access',
    title: 'Washing Machine Doorway Access Guide',
    description:
      'Delivery and installation access planning for washing machines across Australian homes, including doorway benchmarks and model-level clearance references.'
  },
  {
    slug: 'fridge-clearance-requirements',
    title: 'Fridge Clearance Requirements Guide',
    description:
      'A central fridge clearance index covering major Australian brands, side/rear/top spacing differences, and comparison pages for high-intent fit checks.'
  },
  {
    slug: 'dryer-ventilation-guide',
    title: 'Dryer Ventilation & Safety Guide',
    description:
      'Dryer placement references, ventilation requirements, and cross-links into high-efficiency dryer models and comparison pages for apartment-safe installs.'
  },
  {
    slug: 'appliance-fit-sizing-handbook',
    title: 'Appliance Fit Sizing Handbook',
    description:
      'Master hub for appliance cavity, doorway, brand, and compare pages. Use this handbook to traverse every FitAppliance sizing resource in one place.'
  }
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

async function readJson(filePath, fallback = []) {
  try {
    const text = await readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function uniqueLinks(rows) {
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    if (!row || typeof row.url !== 'string') continue;
    if (seen.has(row.url)) continue;
    seen.add(row.url);
    deduped.push(row);
  }
  return deduped;
}

function normalizeBrandLinks(rows = []) {
  return rows.map((row) => ({
    url: row.url ?? `/brands/${row.slug}`,
    label: `${row.brand} ${String(row.cat ?? '').replace(/_/g, ' ')} clearance`
  }));
}

function normalizeCompareLinks(rows = []) {
  return rows.map((row) => ({
    url: row.url ?? `/compare/${row.slug}`,
    label: `${row.brandA} vs ${row.brandB} ${String(row.cat ?? '').replace(/_/g, ' ')}`
  }));
}

function normalizeCavityLinks(rows = []) {
  return rows.map((row) => ({
    url: row.url ?? `/cavity/${row.slug}`,
    label: `${row.width}mm fridge cavity`
  }));
}

function normalizeDoorwayLinks(rows = []) {
  return rows.map((row) => ({
    url: row.url ?? `/doorway/${row.slug}`,
    label: `${row.doorway}mm fridge doorway`
  }));
}

function buildLinkPool({ brands, compares, cavity, doorway }) {
  const staticLinks = [
    { url: '/', label: 'FitAppliance home' },
    { url: '/affiliate-disclosure', label: 'Affiliate disclosure' },
    { url: '/privacy-policy', label: 'Privacy policy' }
  ];
  return uniqueLinks([
    ...staticLinks,
    ...normalizeBrandLinks(brands),
    ...normalizeCompareLinks(compares),
    ...normalizeCavityLinks(cavity),
    ...normalizeDoorwayLinks(doorway)
  ]);
}

function selectGuideLinks({ guide, allLinks, brands, compares, cavity, doorway }) {
  const byCategory = (cat) => ({
    brands: normalizeBrandLinks(brands.filter((row) => row.cat === cat)),
    compares: normalizeCompareLinks(compares.filter((row) => row.cat === cat))
  });
  const fridge = byCategory('fridge');
  const dishwasher = byCategory('dishwasher');
  const washingMachine = byCategory('washing_machine');
  const dryer = byCategory('dryer');
  const cavityLinks = normalizeCavityLinks(cavity);
  const doorwayLinks = normalizeDoorwayLinks(doorway);

  if (guide.slug === 'dishwasher-cavity-sizing') {
    return uniqueLinks([
      ...dishwasher.brands.slice(0, 25),
      ...dishwasher.compares.slice(0, 12),
      ...cavityLinks.slice(0, 10),
      ...doorwayLinks.slice(0, 8),
      ...fridge.compares.slice(0, 8)
    ]);
  }

  if (guide.slug === 'washing-machine-doorway-access') {
    return uniqueLinks([
      ...washingMachine.brands.slice(0, 25),
      ...washingMachine.compares.slice(0, 12),
      ...doorwayLinks.slice(0, 20),
      ...cavityLinks.slice(0, 8),
      ...dryer.compares.slice(0, 8)
    ]);
  }

  if (guide.slug === 'fridge-clearance-requirements') {
    return uniqueLinks([
      ...fridge.brands.slice(0, 50),
      ...fridge.compares.slice(0, 22),
      ...cavityLinks.slice(0, 20),
      ...doorwayLinks.slice(0, 20)
    ]);
  }

  if (guide.slug === 'dryer-ventilation-guide') {
    return uniqueLinks([
      ...dryer.brands.slice(0, 25),
      ...dryer.compares.slice(0, 16),
      ...washingMachine.compares.slice(0, 10),
      ...cavityLinks.slice(0, 8),
      ...doorwayLinks.slice(0, 8)
    ]);
  }

  return allLinks;
}

function buildHubHtml({ guide, links, crossLinks }) {
  const title = `${guide.title} | FitAppliance`;
  const description = guide.description;
  const canonical = `${SITE_ORIGIN}/guides/${guide.slug}`;
  const ogImage = `${SITE_ORIGIN}/og-images/guide-${guide.slug}.png`;

  return `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escHtml(description)}">
  <meta name="article:modified_time" content="${getBuildTimestampIso()}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="FitAppliance">
  <meta property="og:title" content="${escHtml(title)}">
  <meta property="og:description" content="${escHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${ogImage}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escHtml(title)}">
  <meta name="twitter:description" content="${escHtml(description)}">
  <style>
    :root { --ink:#131210; --ink-2:#3d3a35; --ink-3:#6b6b6b; --paper:#faf8f4; --white:#fff; --copper:#b55a2c; --border:#e0d9ce; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: var(--paper); color: var(--ink); line-height: 1.6; }
    main { max-width: 1100px; margin: 0 auto; padding: 42px 24px 68px; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 24px; align-items: start; }
    .content-col { min-width: 0; }
    h1 { margin: 0 0 10px; font-size: 34px; }
    p { color: var(--ink-2); margin: 0 0 14px; }
    .cross { margin: 18px 0 24px; display: flex; flex-wrap: wrap; gap: 8px; }
    .cross a {
      text-decoration: none; color: var(--copper); background: var(--white);
      border: 1px solid var(--border); border-radius: 999px; padding: 6px 12px; font-size: 13px;
    }
    .grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px;
      margin-top: 14px;
    }
    .grid a {
      text-decoration: none; color: var(--ink-2); background: var(--white); border: 1px solid var(--border);
      padding: 10px 12px; border-radius: 8px; font-size: 14px;
    }
    .grid a:hover { border-color: var(--copper); color: var(--copper); }
    .meta { margin-top: 14px; font-size: 12px; color: var(--ink-3); }
    .section-title-lg { margin: 18px 0 8px; font-size: 18px; }
    .section-title-lg--flush { margin-top: 0; }
    .subscribe-card {
      background: var(--white);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      position: sticky;
      top: 20px;
    }
    .subscribe-card h2 { margin: 0 0 8px; font-size: 17px; }
    .subscribe-card p { margin: 0 0 10px; font-size: 13px; color: var(--ink-3); }
    .subscribe-form { display: flex; flex-direction: column; gap: 10px; }
    .subscribe-form input[type="email"] {
      width: 100%;
      border: 1.5px solid var(--border);
      border-radius: 10px;
      background: var(--paper);
      color: var(--ink);
      font-size: 14px;
      padding: 10px 12px;
    }
    .subscribe-form button[type="submit"] {
      width: 100%;
      border: none;
      border-radius: 10px;
      background: var(--ink);
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      padding: 10px 12px;
      cursor: pointer;
    }
    .subscribe-form button[type="submit"]:disabled { opacity: .6; cursor: not-allowed; }
    .subscribe-note { margin: 0; font-size: 11px; color: var(--ink-3); line-height: 1.45; }
    .subscribe-note a { color: var(--copper); }
    .subscribe-hp {
      position: absolute !important;
      left: -9999px !important;
      width: 1px !important;
      height: 1px !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
    .subscribe-status { min-height: 18px; margin: 0; font-size: 12px; color: var(--ink-3); line-height: 1.4; }
    .subscribe-status[data-tone="success"] { color: #0f766e; }
    .subscribe-status[data-tone="error"] { color: #b91c1c; }
    .subscribe-status[data-tone="warn"] { color: #a16207; }
    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr; }
      .subscribe-card { position: static; }
    }
  </style>
</head>
<body>
  <main>
    <a href="/" style="color:var(--ink-3);text-decoration:none;font-size:13px">← Back to FitAppliance</a>
    <h1>${escHtml(guide.title)}</h1>
    <p>${escHtml(guide.description)}</p>
    <div class="layout">
      <div class="content-col">
        <section>
          <h2 class="section-title-lg">Related Guide Hubs</h2>
          <div class="cross">
            ${crossLinks.map((row) => `<a href="${escHtml(row.url)}">${escHtml(row.label)}</a>`).join('\n        ')}
          </div>
        </section>

        <section>
          <h2 class="section-title-lg section-title-lg--flush">Linked Resources</h2>
          <div class="grid">
            ${links.map((row) => `<a href="${escHtml(row.url)}">${escHtml(row.label)}</a>`).join('\n        ')}
          </div>
          <p class="meta">${links.length} static links. Updated automatically from the latest FitAppliance page indices.</p>
        </section>

        <footer style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);font-size:13px;color:var(--ink-3)">
          <a href="/methodology">Methodology</a> ·
          <a href="/about/editorial-standards">Editorial standards</a>
        </footer>
      </div>

      <aside class="subscribe-card" aria-label="Email subscription">
        <h2>Get New Data Drops</h2>
        <p>Weekly updates when new cavity pages, brand specs, and model coverage are published.</p>
        <form class="subscribe-form" data-subscribe action="/api/subscribe" method="post" novalidate>
          <input type="email" name="email" placeholder="you@example.com" autocomplete="email" required>
          <label class="subscribe-hp" aria-hidden="true">Company
            <input type="text" name="hp_company" tabindex="-1" autocomplete="off">
          </label>
          <button type="submit">Subscribe</button>
          <p class="subscribe-note">No spam. One-click unsubscribe. <a href="/privacy-policy">Privacy Policy</a></p>
          <p class="subscribe-status" data-subscribe-status aria-live="polite"></p>
        </form>
      </aside>
    </div>
  </main>
  <script defer src="/scripts/subscribe.js"></script>
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

async function generateGuidePages(options = {}) {
  const repoRoot = options.repoRoot ?? path.resolve(__dirname, '..');
  const outputDir = options.outputDir ?? path.join(repoRoot, 'pages', 'guides');
  const logger = options.logger ?? console;

  const brands = await readJson(path.join(repoRoot, 'pages', 'brands', 'index.json'), []);
  const compares = await readJson(path.join(repoRoot, 'pages', 'compare', 'index.json'), []);
  const cavity = await readJson(path.join(repoRoot, 'pages', 'cavity', 'index.json'), []);
  const doorway = await readJson(path.join(repoRoot, 'pages', 'doorway', 'index.json'), []);
  const allLinks = buildLinkPool({ brands, compares, cavity, doorway });

  await cleanOutputDir(outputDir);
  const rows = [];
  const guideCrossLinks = GUIDE_HUBS.map((guide) => ({
    url: `/guides/${guide.slug}`,
    label: guide.title
  }));

  for (const guide of GUIDE_HUBS) {
    const links = selectGuideLinks({ guide, allLinks, brands, compares, cavity, doorway });
    const filePath = path.join(outputDir, `${guide.slug}.html`);
    const html = buildHubHtml({
      guide,
      links,
      crossLinks: guideCrossLinks.filter((row) => row.url !== `/guides/${guide.slug}`)
    });
    await writeFile(filePath, html, 'utf8');
    rows.push({
      slug: guide.slug,
      title: guide.title,
      description: guide.description,
      url: `/guides/${guide.slug}`,
      linkCount: links.length
    });
  }

  const indexPath = path.join(outputDir, 'index.json');
  await writeFile(indexPath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  logger.log(`Generated ${rows.length} guide hub pages to pages/guides/`);
  return {
    generated: rows.length,
    outputDir,
    indexPath
  };
}

if (require.main === module) {
  generateGuidePages().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  GUIDE_HUBS,
  generateGuidePages
};
