'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_DATA_DIR = path.join(REPO_ROOT, 'public', 'data');
const COMPARE_DIR = path.join(REPO_ROOT, 'pages', 'compare');
const REPORT_PATH = path.join(REPO_ROOT, 'reports', 'retailer-link-click-audit.md');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function productList(document) {
  if (Array.isArray(document?.products)) return document.products;
  if (document?.products && typeof document.products === 'object') return Object.values(document.products);
  return [];
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value ?? '').trim());
}

function hostOf(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function isSearchOrCategoryUrl(value) {
  const raw = String(value ?? '');
  return /SearchDisplay|\/search\b|[?&](q|query|text|searchTerm)=|\/category\b|\/collections?\b/i.test(raw);
}

function collectRuntimeRetailerRows() {
  const rows = [];
  for (const file of fs.readdirSync(PUBLIC_DATA_DIR).filter((name) => name.endsWith('.json')).sort()) {
    const doc = readJson(path.join(PUBLIC_DATA_DIR, file));
    for (const product of productList(doc)) {
      for (const retailer of Array.isArray(product?.retailers) ? product.retailers : []) {
        rows.push({
          file,
          productId: product.id,
          brand: product.brand,
          model: product.model,
          retailer: retailer.n ?? retailer.name ?? '',
          canonicalUrl: String(retailer.url ?? '').trim(),
          affiliateUrl: String(retailer.affiliate_url ?? retailer.affiliateUrl ?? '').trim(),
          price: retailer.p ?? retailer.price ?? null
        });
      }
    }
  }
  return rows;
}

function collectCompareLinks() {
  if (!fs.existsSync(COMPARE_DIR)) return [];
  const rows = [];
  const files = fs.readdirSync(COMPARE_DIR).filter((name) => name.endsWith('.html')).sort();
  for (const file of files) {
    const html = fs.readFileSync(path.join(COMPARE_DIR, file), 'utf8');
    for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gis)) {
      const href = match[1];
      const text = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (/prf\.hn|thegoodguys\.com\.au/i.test(href + text)) {
        rows.push({ file, href, host: hostOf(href), text });
      }
    }
  }
  return rows;
}

async function fetchWithTimeout(url, { method = 'HEAD', redirect = 'manual', timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      redirect,
      signal: controller.signal,
      headers: {
        'User-Agent': 'FitApplianceLinkAudit/1.0 (+https://www.fitappliance.com.au/contact)'
      }
    });
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      location: response.headers.get('location') ?? ''
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      statusText: error?.name === 'AbortError' ? 'timeout' : String(error?.message ?? error),
      location: ''
    };
  } finally {
    clearTimeout(timer);
  }
}

async function checkUrl(url, { affiliate = false } = {}) {
  if (!isHttpUrl(url)) return { url, status: 0, statusText: 'invalid_url', location: '' };
  const first = await fetchWithTimeout(url, { method: 'HEAD', redirect: affiliate ? 'manual' : 'follow' });
  if (first.status === 405 || first.status === 403 || first.status === 0) {
    const second = await fetchWithTimeout(url, { method: 'GET', redirect: affiliate ? 'manual' : 'follow' });
    return { url, ...second };
  }
  return { url, ...first };
}

async function mapLimit(items, limit, mapper) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => String(left[0]).localeCompare(String(right[0])));
}

function formatCountTable(rows, headers) {
  const [leftHeader, rightHeader] = headers;
  return [
    `| ${leftHeader} | ${rightHeader} |`,
    '|---|---:|',
    ...rows.map(([label, count]) => `| ${label || '(blank)'} | ${count} |`)
  ].join('\n');
}

function renderReport({
  runtimeRows,
  compareLinks,
  badCanonical,
  missingPartnerize,
  networkResults = null
}) {
  const tggRows = runtimeRows.filter((row) => row.retailer === 'The Good Guys');
  const compareHostCounts = countBy(compareLinks, (row) => row.host);
  const retailerCounts = countBy(runtimeRows, (row) => row.retailer);
  const lines = [
    '# Retailer Link and Click Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Runtime Data Summary',
    '',
    `- Runtime retailer rows: ${runtimeRows.length}`,
    `- Products with runtime retailer rows: ${new Set(runtimeRows.map((row) => row.productId)).size}`,
    `- The Good Guys rows: ${tggRows.length}`,
    `- The Good Guys rows with Partnerize affiliate_url: ${tggRows.filter((row) => isHttpUrl(row.affiliateUrl) && hostOf(row.affiliateUrl) === 'prf.hn').length}`,
    `- Bad canonical URL rows: ${badCanonical.length}`,
    `- TGG missing Partnerize rows: ${missingPartnerize.length}`,
    '',
    formatCountTable(retailerCounts, ['Retailer', 'Rows']),
    '',
    '## Compare Page Link Summary',
    '',
    `- Compare HTML TGG/Partnerize hrefs: ${compareLinks.length}`,
    '',
    formatCountTable(compareHostCounts, ['Host', 'Href count']),
    '',
    '## Static Checks',
    '',
    badCanonical.length === 0
      ? '- PASS: Runtime canonical URLs are http(s), non-search, non-category, and not Partnerize jump URLs.'
      : `- FAIL: Bad canonical URL rows detected: ${badCanonical.length}`,
    missingPartnerize.length === 0
      ? '- PASS: All runtime The Good Guys rows have Partnerize prf.hn affiliate URLs.'
      : `- FAIL: Missing Partnerize affiliate URLs for TGG rows: ${missingPartnerize.length}`,
    compareLinks.some((row) => row.host === 'thegoodguys.com.au')
      ? '- FAIL: Static compare pages still contain direct TGG hrefs instead of Partnerize click URLs.'
      : '- PASS: Static compare pages use Partnerize click hrefs for The Good Guys links.',
    ''
  ];

  if (networkResults) {
    const statusCounts = countBy(networkResults, (row) => `${row.kind}:${row.status}`);
    const failures = networkResults.filter((row) => row.status === 0 || row.status >= 400).slice(0, 30);
    lines.push(
      '## Network Checks',
      '',
      `- Unique URLs checked: ${networkResults.length}`,
      '',
      formatCountTable(statusCounts, ['Kind/status', 'Count']),
      '',
      failures.length === 0
        ? '- PASS: No network failures in sampled/checked URLs.'
        : `- Review: ${failures.length} failed or blocked URLs shown below. Retailer bot blocks can return 403 and require browser/manual confirmation.`,
      '',
      ...failures.map((row) => `- ${row.kind} ${row.status} ${row.statusText}: ${row.url}`)
    );
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const network = process.argv.includes('--network');
  const runtimeRows = collectRuntimeRetailerRows();
  const compareLinks = collectCompareLinks();
  const badCanonical = runtimeRows.filter((row) => (
    !isHttpUrl(row.canonicalUrl)
    || hostOf(row.canonicalUrl) === 'prf.hn'
    || isSearchOrCategoryUrl(row.canonicalUrl)
  ));
  const missingPartnerize = runtimeRows.filter((row) => (
    row.retailer === 'The Good Guys'
    && !(isHttpUrl(row.affiliateUrl) && hostOf(row.affiliateUrl) === 'prf.hn')
  ));

  let networkResults = null;
  if (network) {
    const canonicalUrls = [...new Set(runtimeRows.map((row) => row.canonicalUrl).filter(isHttpUrl))];
    const affiliateUrls = [...new Set(runtimeRows.map((row) => row.affiliateUrl).filter(isHttpUrl))];
    const checks = [
      ...canonicalUrls.map((url) => ({ kind: 'canonical', url })),
      ...affiliateUrls.map((url) => ({ kind: 'affiliate', url }))
    ];
    networkResults = await mapLimit(checks, 8, async (row) => ({
      ...row,
      ...(await checkUrl(row.url, { affiliate: row.kind === 'affiliate' }))
    }));
  }

  const report = renderReport({
    runtimeRows,
    compareLinks,
    badCanonical,
    missingPartnerize,
    networkResults
  });
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(report);

  if (badCanonical.length > 0 || missingPartnerize.length > 0 || compareLinks.some((row) => row.host === 'thegoodguys.com.au')) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
