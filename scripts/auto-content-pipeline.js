#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readdir, readFile, writeFile } = require('node:fs/promises');
const { fileURLToPath } = require('node:url');

const BLACKLIST_TERMS = ['buy', 'cheap', 'deal', 'coupon', 'discount', 'free shipping'];
const LOCATION_TERMS = ['sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'canberra', 'hobart', 'darwin'];

function toDateStamp(today = new Date()) {
  const iso = typeof today === 'string' ? today : today.toISOString();
  return iso.slice(0, 10).replace(/-/g, '');
}

function toIsoDate(today = new Date()) {
  const iso = typeof today === 'string' ? today : today.toISOString();
  return iso.slice(0, 10);
}

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeWords(value) {
  return normalizeText(value)
    .split(' ')
    .filter(Boolean);
}

function slugifyQuery(query) {
  return String(query ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function classifyQuery(query) {
  const norm = normalizeText(query);
  if (/^how\b|\bhow to\b/.test(norm)) return 'how-to';
  if (LOCATION_TERMS.some((city) => norm.includes(city))) return 'location';
  if (/\bdoor\b|\bdoorway\b|\bentry\b/.test(norm)) return 'doorway';
  if (/\bcavity\b|\bmm\b/.test(norm)) return 'cavity';
  return 'brand';
}

function parseSitemapUrls(xmlText = '') {
  const urls = [];
  const matches = xmlText.matchAll(/<loc>([\s\S]*?)<\/loc>/g);
  for (const match of matches) {
    urls.push(String(match[1]).trim());
  }
  return urls;
}

function levenshteinDistance(left, right) {
  const a = String(left);
  const b = String(right);
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => Array.from({ length: b.length + 1 }, () => 0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function similarityRatio(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - (distance / maxLen);
}

function extractUrlSlug(urlString) {
  try {
    const url = new URL(urlString);
    const pieces = url.pathname.split('/').filter(Boolean);
    return pieces.length > 0 ? pieces[pieces.length - 1] : '';
  } catch {
    return '';
  }
}

function hasBlacklistedTerm(query) {
  const norm = normalizeText(query);
  return BLACKLIST_TERMS.some((term) => norm.includes(term));
}

function findCoverageSimilarity(query, sitemapUrls = []) {
  const targetSlug = slugifyQuery(query);
  let best = 0;
  for (const url of sitemapUrls) {
    const existingSlug = slugifyQuery(extractUrlSlug(url));
    if (!existingSlug) continue;
    best = Math.max(best, similarityRatio(targetSlug, existingSlug));
    if (best > 0.999) break;
  }
  return best;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function selectCandidates({ rows = [], sitemapUrls = [] } = {}) {
  const accepted = [];
  const rejected = [];
  const dedupe = new Set();

  for (const raw of rows) {
    const query = String(raw?.query ?? '').trim();
    if (!query) {
      rejected.push({ query, reason: 'empty_query' });
      continue;
    }

    const normalizedKey = normalizeText(query);
    if (dedupe.has(normalizedKey)) {
      rejected.push({ query, reason: 'duplicate_query' });
      continue;
    }
    dedupe.add(normalizedKey);

    if (hasBlacklistedTerm(query)) {
      rejected.push({ query, reason: 'blacklist' });
      continue;
    }

    const queryWordCount = tokenizeWords(query).length;
    if (queryWordCount < 3) {
      rejected.push({ query, reason: 'query_too_short' });
      continue;
    }

    const impressions = toNumber(raw?.impressions, 0);
    const ctr = toNumber(raw?.ctr, 0);
    const position = toNumber(raw?.position, 0);

    if (impressions < 50) {
      rejected.push({ query, reason: 'low_impressions' });
      continue;
    }
    if (position < 11 || position > 30) {
      rejected.push({ query, reason: 'position_out_of_range' });
      continue;
    }
    if (ctr >= 0.05) {
      rejected.push({ query, reason: 'ctr_not_low_enough' });
      continue;
    }

    const similarity = findCoverageSimilarity(query, sitemapUrls);
    if (similarity > 0.9) {
      rejected.push({ query, reason: 'already_covered', similarity: Number(similarity.toFixed(3)) });
      continue;
    }

    accepted.push({
      query,
      slug: slugifyQuery(query),
      type: classifyQuery(query),
      impressions,
      ctr,
      position,
      sourcePage: String(raw?.page ?? ''),
      similarity: Number(similarity.toFixed(3))
    });
  }

  accepted.sort((left, right) => right.impressions - left.impressions || left.position - right.position);
  return { accepted, rejected };
}

function stripHtmlText(html = '') {
  return String(html)
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z0-9#]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWordsInHtml(html = '') {
  const text = stripHtmlText(html);
  if (!text) return 0;
  return text.split(' ').filter(Boolean).length;
}

function countSchemaErrorsInHtml(html = '') {
  let errors = 0;
  const matches = String(html).matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of matches) {
    try {
      JSON.parse(String(match[1]).trim());
    } catch {
      errors += 1;
    }
  }
  return errors;
}

function runQualityGate({ html = '', internalLinkPattern = /\/(cavity|doorway|brands)\//, schemaErrors = null } = {}) {
  const failures = [];
  const wordCount = countWordsInHtml(html);
  if (wordCount < 300) failures.push('min_word_count');

  const hasDataBlock = /<(table|dl)(\s|>)/i.test(html);
  if (!hasDataBlock) failures.push('missing_data_block');

  const hasInternalLink = internalLinkPattern.test(String(html));
  if (!hasInternalLink) failures.push('missing_internal_link');

  const hasPlaceholder = /(lorem ipsum|todo|fixme|<placeholder>)/i.test(String(html));
  if (hasPlaceholder) failures.push('placeholder_content');

  const computedSchemaErrors = schemaErrors == null ? countSchemaErrorsInHtml(html) : Number(schemaErrors);
  if (computedSchemaErrors > 0) failures.push('schema_errors');

  return {
    ok: failures.length === 0,
    wordCount,
    schemaErrors: computedSchemaErrors,
    failures
  };
}

function ensureMinimumDataPoints(references = []) {
  if (!Array.isArray(references) || references.length < 3) {
    return { ok: false, reason: 'insufficient_real_data_points' };
  }
  return { ok: true };
}

async function readJson(filePath, fallback = null) {
  try {
    const text = await readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === 'ENOENT' && fallback !== null) return fallback;
    throw error;
  }
}

async function loadDatasets(repoRoot) {
  const files = {
    fridges: path.join(repoRoot, 'public', 'data', 'fridges.json'),
    dishwashers: path.join(repoRoot, 'public', 'data', 'dishwashers.json'),
    washers: path.join(repoRoot, 'public', 'data', 'washing-machines.json'),
    dryers: path.join(repoRoot, 'public', 'data', 'dryers.json')
  };

  const loaded = {};
  for (const [key, filePath] of Object.entries(files)) {
    const rawText = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(rawText);
    loaded[key] = {
      filePath,
      lines: rawText.split(/\r?\n/),
      products: Array.isArray(parsed?.products) ? parsed.products : []
    };
  }

  return loaded;
}

function extractNumericHint(query) {
  const match = String(query).match(/(\d{3,4})\s*mm/i);
  return match ? Number(match[1]) : null;
}

function chooseDatasetByQuery(query) {
  const norm = normalizeText(query);
  if (norm.includes('dishwasher')) return 'dishwashers';
  if (norm.includes('washing machine') || norm.includes('washer')) return 'washers';
  if (norm.includes('dryer')) return 'dryers';
  return 'fridges';
}

function pickProductsForCandidate(candidate, datasets) {
  const datasetKey = chooseDatasetByQuery(candidate.query);
  const dataset = datasets[datasetKey] ?? datasets.fridges;
  const widthHint = extractNumericHint(candidate.query);
  const rows = [...(dataset.products ?? [])]
    .filter((row) => Number.isFinite(row?.w) && Number.isFinite(row?.h) && Number.isFinite(row?.d))
    .sort((left, right) => {
      const leftStars = Number.isFinite(left?.stars) ? left.stars : -1;
      const rightStars = Number.isFinite(right?.stars) ? right.stars : -1;
      if (rightStars !== leftStars) return rightStars - leftStars;
      return String(left?.model ?? '').localeCompare(String(right?.model ?? ''));
    });

  if (Number.isFinite(widthHint)) {
    const narrowed = rows
      .filter((row) => Math.abs(Number(row.w) - widthHint) <= 120)
      .slice(0, 6);
    if (narrowed.length >= 3) {
      return { datasetKey, dataset, products: narrowed };
    }
  }

  return { datasetKey, dataset, products: rows.slice(0, 6) };
}

function findLineForNeedle(lines, needle) {
  if (!needle) return 0;
  const normNeedle = String(needle).toLowerCase();
  for (let index = 0; index < lines.length; index += 1) {
    if (String(lines[index]).toLowerCase().includes(normNeedle)) return index + 1;
  }
  return 0;
}

function buildDataReferences(dataset, products = []) {
  return products.slice(0, 3).map((product) => {
    const line = findLineForNeedle(dataset.lines, product.model) || findLineForNeedle(dataset.lines, product.id);
    return {
      file: path.relative(path.resolve(__dirname, '..'), dataset.filePath).replace(/\\/g, '/'),
      line,
      field: 'model',
      value: `${product.brand} ${product.model}`
    };
  });
}

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function buildInternalLinks(type) {
  if (type === 'doorway') {
    return [
      { url: '/doorway/700mm-fridge-doorway', label: '700mm doorway fit checks' },
      { url: '/doorway/800mm-fridge-doorway', label: '800mm doorway fit checks' },
      { url: '/brands/samsung-fridge-clearance', label: 'Samsung fridge clearance baseline' }
    ];
  }

  if (type === 'location') {
    return [
      { url: '/location/sydney/fridge', label: 'Sydney fridge fit guides' },
      { url: '/location/perth/dishwasher', label: 'Perth dishwasher guides' },
      { url: '/cavity/600mm-fridge', label: '600mm cavity benchmark' }
    ];
  }

  if (type === 'brand') {
    return [
      { url: '/brands/lg-fridge-clearance', label: 'LG clearance guide' },
      { url: '/brands/samsung-fridge-clearance', label: 'Samsung clearance guide' },
      { url: '/compare/lg-vs-samsung-fridge-clearance', label: 'Brand comparison' }
    ];
  }

  return [
    { url: '/cavity/600mm-fridge', label: '600mm cavity reference' },
    { url: '/cavity/700mm-fridge', label: '700mm cavity reference' },
    { url: '/doorway/800mm-fridge-doorway', label: '800mm doorway fallback' }
  ];
}

function buildPageHtml({ candidate, products, internalLinks, references }) {
  const title = `${candidate.query} | FitAppliance data guide`;
  const canonical = `https://fitappliance.com.au/guides/${candidate.slug}`;
  const nowIso = new Date().toISOString();
  const longCopy = [
    `This guide is generated from current FitAppliance data files and targets the exact query \"${candidate.query}\" with measurable appliance dimensions instead of generic claims.`,
    'We selected products using the same width-height-depth fields exposed in the public data catalogue, then grouped them into a quick shortlist so readers can compare realistic fit constraints before purchase.',
    'For cavity planning, use the narrowest measured width and always leave airflow room per manufacturer guidance. For doorway planning, map the entire path from entry to install point and include corners, handrails, and handle protrusions.',
    'The table below lists dimensions and energy ratings taken directly from repository JSON fields. Every row is traceable to a concrete source line and can be audited in pull requests before publishing.',
    'Use internal links to run deeper checks: cavity pages benchmark fixed widths, doorway pages stress-test delivery access, and brand pages capture ventilation deltas that often decide pass or fail outcomes in tight kitchens.',
    'If your install tolerance is under 20mm on any side, treat this page as a shortlist only and complete a manual verification with cabinet and doorway measurements on site.',
    'For apartments, include lift-door constraints and service-corridor turns. For houses, include entry frame trims and any temporary obstacles that change diagonal carry room during delivery.',
    'All values remain deterministic and repeatable because the page text is template-driven and data-backed. No synthetic model data is introduced during this generation path.'
  ];

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: candidate.query,
    url: canonical,
    about: candidate.type,
    dateModified: nowIso
  };

  return `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(title)}</title>
  <meta name="description" content="Data-backed guide for ${escHtml(candidate.query)} with concrete model dimensions and fit references.">
  <meta name="article:modified_time" content="${escHtml(nowIso)}">
  <link rel="canonical" href="${canonical}">
</head>
<body>
  <main>
    <a href="/">Back to FitAppliance</a>
    <h1>${escHtml(candidate.query)}</h1>
    ${longCopy.map((p) => `<p>${escHtml(p)}</p>`).join('\n    ')}

    <h2>Model snapshot from real dataset rows</h2>
    <table>
      <thead>
        <tr><th>Brand</th><th>Model</th><th>W (mm)</th><th>H (mm)</th><th>D (mm)</th><th>Stars</th><th>kWh/year</th></tr>
      </thead>
      <tbody>
        ${products.slice(0, 6).map((row) => `<tr><td>${escHtml(row.brand)}</td><td>${escHtml(row.model)}</td><td>${row.w}</td><td>${row.h}</td><td>${row.d}</td><td>${row.stars ?? '-'}</td><td>${row.kwh_year ?? '-'}</td></tr>`).join('')}
      </tbody>
    </table>

    <h2>Traceable data references</h2>
    <dl>
      ${references.map((ref) => `<dt>${escHtml(ref.file)}:${ref.line || 0}</dt><dd>${escHtml(ref.field)} = ${escHtml(ref.value)}</dd>`).join('')}
    </dl>

    <h2>Related fit guides</h2>
    <ul>
      ${internalLinks.map((link) => `<li><a href="${link.url}">${escHtml(link.label)}</a></li>`).join('')}
    </ul>

    <footer>
      <a href="/methodology">Methodology</a> ·
      <a href="/about/editorial-standards">Editorial standards</a>
    </footer>
  </main>
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
</body>
</html>
`;
}

async function buildCandidateDraft({ candidate, repoRoot }) {
  const datasets = await loadDatasets(repoRoot);
  const picked = pickProductsForCandidate(candidate, datasets);
  const references = buildDataReferences(picked.dataset, picked.products);
  const dataPointCheck = ensureMinimumDataPoints(references);

  if (!dataPointCheck.ok) {
    return {
      candidate,
      skipped: true,
      skipReason: dataPointCheck.reason,
      references: []
    };
  }

  const internalLinks = buildInternalLinks(candidate.type);
  const html = buildPageHtml({
    candidate,
    products: picked.products,
    internalLinks,
    references
  });

  const gate = runQualityGate({ html });
  if (!gate.ok) {
    return {
      candidate,
      skipped: true,
      skipReason: `quality_gate:${gate.failures.join(',')}`,
      references,
      gate
    };
  }

  return {
    candidate,
    skipped: false,
    references,
    gate,
    html,
    products: picked.products
  };
}

async function findLatestGscReportPath(reportsDir) {
  const entries = await readdir(reportsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /^gsc-(\d{4}-\d{2}-\d{2}|\d{8})\.json$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (files.length === 0) return null;
  return path.join(reportsDir, files[files.length - 1]);
}

async function runAutoContentPipeline({
  repoRoot = path.resolve(__dirname, '..'),
  reportsDir = path.join(repoRoot, 'reports'),
  logger = console,
  today = new Date()
} = {}) {
  const isoDate = toIsoDate(today);
  const dateStamp = toDateStamp(today);
  const reportPath = path.join(reportsDir, `auto-content-${dateStamp}.json`);
  const latestReportPath = path.join(reportsDir, 'auto-content-latest.json');
  const sitemapPath = path.join(repoRoot, 'public', 'sitemap.xml');

  await mkdir(reportsDir, { recursive: true });

  const latestGscPath = await findLatestGscReportPath(reportsDir);
  if (!latestGscPath) {
    const emptyReport = {
      generatedAt: new Date().toISOString(),
      date: isoDate,
      status: 'no_gsc_report',
      message: 'No GSC report found yet. Waiting for GSC data backfill before generating candidates.',
      candidates: [],
      rejected: []
    };
    await writeFile(reportPath, `${JSON.stringify(emptyReport, null, 2)}\n`, 'utf8');
    await writeFile(latestReportPath, `${JSON.stringify(emptyReport, null, 2)}\n`, 'utf8');
    logger.log('[auto-content] no GSC report found; exiting without candidates');
    return emptyReport;
  }

  const gscDoc = await readJson(latestGscPath, { rows: [] });
  const sitemapXml = await readFile(sitemapPath, 'utf8');
  const sitemapUrls = parseSitemapUrls(sitemapXml);
  const rows = Array.isArray(gscDoc?.rows) ? gscDoc.rows : [];
  const selection = selectCandidates({ rows, sitemapUrls });

  const candidates = [];
  const rejected = [...selection.rejected];

  for (const candidate of selection.accepted) {
    const draft = await buildCandidateDraft({ candidate, repoRoot });
    if (draft.skipped) {
      rejected.push({ query: candidate.query, reason: draft.skipReason });
      continue;
    }

    candidates.push({
      query: candidate.query,
      slug: candidate.slug,
      type: candidate.type,
      impressions: candidate.impressions,
      ctr: candidate.ctr,
      position: candidate.position,
      sourcePage: candidate.sourcePage,
      references: draft.references,
      gate: draft.gate
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    date: isoDate,
    status: 'ok',
    gscSource: path.relative(repoRoot, latestGscPath).replace(/\\/g, '/'),
    totals: {
      rows: rows.length,
      selected: selection.accepted.length,
      publishable: candidates.length,
      rejected: rejected.length
    },
    candidates,
    rejected
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  logger.log(`[auto-content] selected=${selection.accepted.length} publishable=${candidates.length} rejected=${rejected.length}`);
  return report;
}

async function runCli() {
  try {
    const report = await runAutoContentPipeline();
    console.log(`[auto-content] status=${report.status} candidates=${report.candidates.length}`);
  } catch (error) {
    console.error(`[auto-content] ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  BLACKLIST_TERMS,
  classifyQuery,
  slugifyQuery,
  parseSitemapUrls,
  findCoverageSimilarity,
  selectCandidates,
  runQualityGate,
  ensureMinimumDataPoints,
  countSchemaErrorsInHtml,
  buildCandidateDraft,
  findLatestGscReportPath,
  runAutoContentPipeline
};
