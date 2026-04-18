#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readdir, readFile, rm, writeFile } = require('node:fs/promises');

const MIN_DOORWAY = 600;
const MAX_DOORWAY = 900;
const STEP = 10;
const GUIDE_HUB_LINKS = [
  { url: '/guides/washing-machine-doorway-access', label: 'Washing Machine Doorway Access Guide' },
  { url: '/guides/appliance-fit-sizing-handbook', label: 'Appliance Fit Sizing Handbook' },
  { url: '/guides/fridge-clearance-requirements', label: 'Fridge Clearance Requirements Guide' },
  { url: '/guides/dishwasher-cavity-sizing', label: 'Dishwasher Cavity Sizing Guide' },
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

function buildWidths(min, max, step) {
  const values = [];
  for (let doorway = min; doorway <= max; doorway += step) {
    values.push(doorway);
  }
  return values;
}

function buildFaqJsonLd(doorway) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `How do I measure a ${doorway}mm doorway correctly?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Measure between door jambs at the narrowest point, and include skirting or trim protrusions.'
        }
      },
      {
        '@type': 'Question',
        name: 'Can fridge delivery teams remove doors?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Many delivery teams can remove fridge doors temporarily, but always confirm this service before purchase.'
        }
      }
    ]
  };
}

function buildBreadcrumbJsonLd(doorway) {
  const slug = `${doorway}mm-fridge-doorway`;
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
        name: 'Doorway Guides',
        item: 'https://fitappliance.com.au/doorway'
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: `${doorway}mm Fridge Doorway`,
        item: `https://fitappliance.com.au/doorway/${slug}`
      }
    ]
  };
}

function buildPageHtml({ doorway, matched, adjacentDoorways, relatedDoorways }) {
  const title = `Fridges that fit through a ${doorway}mm doorway | FitAppliance Australia`;
  const description = `${matched.length} fridge models can pass through a ${doorway}mm doorway with basic handling margin.`;
  const canonical = `https://fitappliance.com.au/doorway/${doorway}mm-fridge-doorway`;
  const faqJsonLd = JSON.stringify(buildFaqJsonLd(doorway), null, 2);
  const breadcrumbJsonLd = JSON.stringify(buildBreadcrumbJsonLd(doorway), null, 2);

  return `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escHtml(description)}">
  <link rel="canonical" href="${canonical}">
  <style>
    :root { --ink:#131210; --ink-2:#3d3a35; --paper:#faf8f4; --white:#fff; --copper:#b55a2c; --border:#e0d9ce; }
    body { margin:0; font-family:Arial, sans-serif; color:var(--ink); background:var(--paper); line-height:1.6; }
    main { max-width:980px; margin:0 auto; padding:40px 20px 60px; }
    h1 { margin:0 0 10px; font-size:34px; }
    p { color:var(--ink-2); }
    .chip-row { margin-top:16px; display:flex; gap:10px; flex-wrap:wrap; }
    .chip { background:var(--white); border:1px solid var(--border); border-radius:999px; padding:6px 10px; font-size:13px; text-decoration:none; color:var(--copper); }
    .card-grid { display:grid; gap:10px; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); margin-top:18px; }
    .card { background:var(--white); border:1px solid var(--border); border-radius:10px; padding:12px; }
    .meta { color:#666; font-size:13px; }
    h2 { margin-top:24px; }
  </style>
</head>
<body>
  <main>
    <a href="https://fitappliance.com.au/">← Back to FitAppliance</a>
    <h1>Fridges that fit through a ${doorway}mm doorway</h1>
    <p>${matched.length} fridge models can pass a ${doorway}mm doorway using a 10mm handling margin.</p>
    <p>Always confirm diagonal clearance, hallway corners, and stair turns before delivery day.</p>

    <div class="chip-row">
      ${adjacentDoorways.previous ? `<a class="chip" href="/doorway/${adjacentDoorways.previous}mm-fridge-doorway">← ${adjacentDoorways.previous}mm</a>` : ''}
      <a class="chip" href="https://fitappliance.com.au/?cat=fridge&w=900&h=1800&d=700&door=${doorway}">Run full doorway + cavity check</a>
      ${adjacentDoorways.next ? `<a class="chip" href="/doorway/${adjacentDoorways.next}mm-fridge-doorway">${adjacentDoorways.next}mm →</a>` : ''}
    </div>

    <h2>Featured models</h2>
    <div class="card-grid">
      ${matched.slice(0, 18).map((product) => `<article class="card">
        <strong>${escHtml(product.brand)} ${escHtml(product.model)}</strong>
        <div class="meta">W ${product.w} × H ${product.h} × D ${product.d} mm</div>
      </article>`).join('')}
    </div>

    <h2>Doorway measurement checklist</h2>
    <ul>
      <li>Measure clear opening width with the door fully open.</li>
      <li>Measure every pinch-point between entry and kitchen.</li>
      <li>Allow extra margin for handles, straps, and safe carrying angle.</li>
    </ul>

    <h2>Also viewed doorway guides</h2>
    <div class="chip-row">
      ${relatedDoorways.map((value) => `<a class="chip" href="/doorway/${value}mm-fridge-doorway">${value}mm doorway fit check</a>`).join('')}
    </div>

    <h2>Related fitting guides</h2>
    <div class="chip-row">
      ${GUIDE_HUB_LINKS.map((link) => `<a class="chip" href="${link.url}">${escHtml(link.label)}</a>`).join('')}
    </div>
  </main>
  <script type="application/ld+json">
${faqJsonLd}
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

async function generateDoorwayPages(options = {}) {
  const repoRoot = options.repoRoot ?? path.resolve(__dirname, '..');
  const dataDir = options.dataDir ?? path.join(repoRoot, 'public', 'data');
  const outputDir = options.outputDir ?? path.join(repoRoot, 'pages', 'doorway');
  const logger = options.logger ?? console;

  const appliances = await readJson(path.join(dataDir, 'appliances.json'));
  const products = (appliances.products ?? []).filter((product) => product.cat === 'fridge');
  const doorways = buildWidths(MIN_DOORWAY, MAX_DOORWAY, STEP);

  await cleanOutputDir(outputDir);
  const rows = [];

  for (let index = 0; index < doorways.length; index += 1) {
    const doorway = doorways[index];
    const matched = products
      .filter((product) => (product.w + 10) <= doorway)
      .sort((left, right) => {
        const rightStars = Number.isFinite(right.stars) ? right.stars : -1;
        const leftStars = Number.isFinite(left.stars) ? left.stars : -1;
        if (rightStars !== leftStars) return rightStars - leftStars;
        return String(left.model).localeCompare(String(right.model));
      });

    const slug = `${doorway}mm-fridge-doorway`;
    const html = buildPageHtml({
      doorway,
      matched,
      adjacentDoorways: {
        previous: doorways[index - 1] ?? null,
        next: doorways[index + 1] ?? null
      },
      relatedDoorways: doorways
        .filter((candidate) => candidate !== doorway)
        .sort((left, right) => Math.abs(left - doorway) - Math.abs(right - doorway))
        .slice(0, 8)
    });
    await writeFile(path.join(outputDir, `${slug}.html`), html, 'utf8');

    rows.push({
      doorway,
      slug,
      url: `/doorway/${slug}`,
      results: matched.length
    });
  }

  const indexPath = path.join(outputDir, 'index.json');
  await writeFile(indexPath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  logger.log(`Generated ${rows.length} doorway pages to pages/doorway/`);

  return {
    generated: rows.length,
    outputDir,
    indexPath
  };
}

if (require.main === module) {
  generateDoorwayPages().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  generateDoorwayPages
};
