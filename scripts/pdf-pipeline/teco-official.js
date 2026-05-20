const PRODUCT_SEARCH_URL = 'https://appliances.teco.com.au/wp-json/wp/v2/product';
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

function absoluteUrl(href, baseUrl) {
  return new URL(decodeHtml(href), baseUrl).toString();
}

function classifyResource(label, href) {
  const haystack = `${label || ''} ${href || ''}`;
  if (/warranty|catalogue|catalog|brochure/i.test(haystack)) {
    return { resourceType: 'ignored', score: -100 };
  }
  if (/user[-_\s]*manual|manual/i.test(haystack)) {
    return { resourceType: 'user_manual', score: 100 };
  }
  if (/spec(?:ification)?|data[-_\s]*sheet|factsheet|fact[-_\s]*sheet/i.test(haystack)) {
    return { resourceType: 'specification_sheet', score: 80 };
  }
  return { resourceType: 'pdf', score: 10 };
}

function extractTecoDownloadLinks(html, pageUrl, sku = '') {
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
      attrs.match(/\btitle=["']([^"']+)["']/i)?.[1]
      || attrs.match(/\bdownload=["']([^"']+)["']/i)?.[1]
      || body
    );
    const url = absoluteUrl(href, pageUrl);
    const normalizedBlob = normalizeSku(`${label} ${url}`);
    if (target && !normalizedBlob.includes(target)) continue;

    const classified = classifyResource(label, url);
    if (classified.resourceType === 'ignored') continue;
    links.push({
      url,
      sourceUrl: url,
      label,
      source: `teco-official-${classified.resourceType}`,
      ...classified
    });
  }

  return [...new Map(links.map((link) => [link.url, link])).values()]
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}

async function fetchText(url, fetchImpl, timeoutMs = 30_000, retries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
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
        throw new Error(`TECO official finder failed HTTP ${response.status} for ${url}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function fetchJson(url, fetchImpl, timeoutMs = 30_000) {
  const text = await fetchText(url, fetchImpl, timeoutMs);
  return JSON.parse(text);
}

function buildProductSearchUrl(sku) {
  const url = new URL(PRODUCT_SEARCH_URL);
  url.searchParams.set('search', sku);
  url.searchParams.set('_fields', 'id,link,title');
  url.searchParams.set('per_page', '10');
  return url.toString();
}

function productResultMatchesSku(result, sku) {
  const target = normalizeSku(sku);
  const haystack = normalizeSku(`${result?.title?.rendered || ''} ${result?.link || ''}`);
  return target && haystack.includes(target);
}

async function findTecoOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 30_000
} = {}) {
  if (!fetchImpl) throw new Error('TECO official finder requires fetch');
  const sku = targetSku(target);
  if (!sku || sku.length < 3) throw new Error('TECO official finder requires a SKU');

  const searchUrl = buildProductSearchUrl(sku);
  const rows = await fetchJson(searchUrl, fetchImpl, timeoutMs);
  const allRows = Array.isArray(rows) ? rows : [];
  const exactRows = allRows.filter((row) => productResultMatchesSku(row, sku));
  const candidates = exactRows.length > 0 ? exactRows : allRows;
  if (candidates.length === 0) {
    throw new Error(`TECO product page not found for ${target.sku || target.model}`);
  }

  const errors = [];
  for (const row of candidates) {
    const productUrl = row.link;
    try {
      const html = await fetchText(productUrl, fetchImpl, timeoutMs);
      const normalizedHtml = normalizeSku(html);
      if (!normalizedHtml.includes(sku)) {
        throw new Error(`TECO product page does not contain exact SKU ${sku}`);
      }
      const resources = extractTecoDownloadLinks(html, productUrl, sku);
      const best = resources.find((resource) => resource.resourceType === 'user_manual')
        || resources.find((resource) => resource.resourceType === 'specification_sheet')
        || resources[0];
      if (best) {
        return {
          sourceUrl: best.sourceUrl,
          source: best.source,
          resourceType: best.resourceType,
          productUrl,
          label: best.label,
          resources
        };
      }
      errors.push(`${productUrl}: no exact SKU PDF resources`);
    } catch (error) {
      errors.push(`${productUrl}: ${error.message}`);
    }
  }

  throw new Error(`TECO official PDF resources not found for ${sku}: ${errors.join(' | ')}`);
}

exports.buildProductSearchUrl = buildProductSearchUrl;
exports.extractTecoDownloadLinks = extractTecoDownloadLinks;
exports.findTecoOfficialPdf = findTecoOfficialPdf;
exports.normalizeSku = normalizeSku;
