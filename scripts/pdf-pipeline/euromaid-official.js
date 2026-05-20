const DOWNLOADS_URL = 'https://www.euromaid.com/en-au/downloads';
const USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function targetSku(target = {}) {
  return normalizeSku(target.sku || target.model || target.product?.model || target.product?.sku);
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function absoluteUrl(href, baseUrl = DOWNLOADS_URL) {
  return new URL(decodeHtml(href), baseUrl).toString();
}

function classifyDownload(label, href) {
  const haystack = `${label || ''} ${href || ''}`;
  if (/spec(?:ification)?\s*sheet|spec\s*sheet/i.test(haystack)) {
    return { resourceType: 'specification_sheet', score: 100 };
  }
  if (/user\s*manual|instruction\s*manual|manual/i.test(haystack)) {
    return { resourceType: 'user_manual', score: 70 };
  }
  return { resourceType: 'pdf', score: 10 };
}

function extractEuromaidDownloadLinks(html, pageUrl = DOWNLOADS_URL, sku = '') {
  const target = normalizeSku(sku);
  const links = [];
  const source = String(html || '');
  const anchorPattern = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  for (const match of source.matchAll(anchorPattern)) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href || !/\.pdf(?:$|[?#])/i.test(href)) continue;
    const label = stripTags(
      attrs.match(/\bdata-filename=["']([^"']+)["']/i)?.[1]
      || attrs.match(/\btitle=["']([^"']+)["']/i)?.[1]
      || body
    );
    const url = absoluteUrl(href, pageUrl);
    const normalizedBlob = normalizeSku(`${label} ${url}`);
    if (target && !normalizedBlob.includes(target)) continue;
    const classified = classifyDownload(label, url);
    links.push({
      url,
      sourceUrl: url,
      label,
      source: `euromaid-official-${classified.resourceType}`,
      ...classified
    });
  }
  return [...new Map(links.map((link) => [link.url, link])).values()]
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}

async function fetchText(url, fetchImpl, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    if (!response.ok) {
      throw new Error(`Euromaid official finder failed HTTP ${response.status} for ${url}`);
    }
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function findEuromaidOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 30_000
} = {}) {
  if (!fetchImpl) throw new Error('Euromaid official finder requires fetch');
  const sku = targetSku(target);
  if (!sku || sku.length < 3) throw new Error('Euromaid official finder requires a SKU');

  const searchUrl = `${DOWNLOADS_URL}?keywords=${encodeURIComponent(sku)}`;
  const html = await fetchText(searchUrl, fetchImpl, timeoutMs);
  const resources = extractEuromaidDownloadLinks(html, searchUrl, sku);
  if (resources.length === 0) {
    throw new Error(`Euromaid PDF not found for ${target.sku || target.model}`);
  }

  const best = resources.find((resource) => resource.resourceType === 'specification_sheet') || resources[0];
  return {
    sourceUrl: best.sourceUrl,
    source: best.source,
    resourceType: best.resourceType,
    productUrl: searchUrl,
    label: best.label,
    resources
  };
}

exports.extractEuromaidDownloadLinks = extractEuromaidDownloadLinks;
exports.findEuromaidOfficialPdf = findEuromaidOfficialPdf;
exports.normalizeSku = normalizeSku;
