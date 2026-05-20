const DEFAULT_TIMEOUT_MS = 20_000;
const SITEMAP_URL = 'https://inalto.house/sitemap.xml';
const SITE_BASE_URL = 'https://inalto.house/';

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function absoluteUrl(rawUrl, baseUrl = SITE_BASE_URL) {
  const cleaned = String(rawUrl || '')
    .trim()
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/&amp;/g, '&');
  if (!cleaned) return '';
  try {
    if (cleaned.startsWith('//')) return `https:${cleaned}`;
    return new URL(cleaned, baseUrl).toString();
  } catch {
    return '';
  }
}

function extractSitemapLocs(xml) {
  return [...String(xml || '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function extractHrefValues(html) {
  const values = [];
  const source = String(html || '');
  const pattern = /\b(?:href|data-href|data-url)=\\?["']([^"']+?\.pdf(?:\?[^"']*)?)\\?["']/gi;
  let match;
  while ((match = pattern.exec(source))) values.push(match[1]);
  return values;
}

function extractPdfUrlsFromProductPage(html, pageUrl) {
  const urls = [];
  const source = String(html || '');
  for (const rawHref of extractHrefValues(source)) {
    const url = absoluteUrl(rawHref, pageUrl);
    if (/\.pdf(?:$|[?#])/i.test(url) && /(?:inalto\.house|squarespace)/i.test(url)) {
      urls.push(url);
    }
  }

  const escapedPattern = /\\?["'](\/s\/[^"']+?\.pdf(?:\?[^"']*)?)\\?["']/gi;
  let escaped;
  while ((escaped = escapedPattern.exec(source))) {
    const url = absoluteUrl(escaped[1], pageUrl);
    if (/\.pdf(?:$|[?#])/i.test(url)) urls.push(url);
  }

  return [...new Set(urls)];
}

function extractProductPageUrlsForSku(xmlOrHtml, sku) {
  const target = normalizeSku(sku);
  if (!target) return [];
  return extractSitemapLocs(xmlOrHtml)
    .filter((url) => /\/en-au\/.+\/p\//i.test(url))
    .filter((url) => normalizeSku(url).includes(target));
}

function scorePdfUrl(url, target = {}) {
  const normalizedUrl = normalizeSku(url);
  const sku = normalizeSku(target.sku || target.model || target.product?.model);
  let score = 0;
  if (sku && normalizedUrl.includes(sku)) score += 100;
  if (/manual/i.test(url)) score += 30;
  if (/product.?card/i.test(url)) score += 10;
  if (/energy|label|wels/i.test(url)) score -= 100;
  return score;
}

async function fetchText(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (!fetchImpl) throw new Error('Inalto official finder requires fetch');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 FitApplianceBot/1.0',
        Accept: 'text/html,application/xhtml+xml,text/xml'
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`timeout after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function findInaltoOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const sku = String(target.sku || target.model || target.product?.model || '').trim();
  const errors = [];
  const candidatePdfs = [];
  try {
    const sitemap = await fetchText(SITEMAP_URL, { fetchImpl, timeoutMs });
    const pages = extractProductPageUrlsForSku(sitemap, sku);
    for (const pageUrl of pages.slice(0, 5)) {
      try {
        const html = await fetchText(pageUrl, { fetchImpl, timeoutMs });
        for (const pdfUrl of extractPdfUrlsFromProductPage(html, pageUrl)) {
          candidatePdfs.push({ sourceUrl: pdfUrl, productPageUrl: pageUrl });
        }
      } catch (error) {
        errors.push(`${pageUrl}: ${error.message}`);
      }
    }
  } catch (error) {
    errors.push(`${SITEMAP_URL}: ${error.message}`);
  }

  const ranked = candidatePdfs
    .map((candidate) => ({
      ...candidate,
      score: scorePdfUrl(candidate.sourceUrl, target)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.sourceUrl.localeCompare(b.sourceUrl));

  if (!ranked.length) {
    throw new Error(`Inalto official PDF resources not found for ${sku}: ${errors.slice(0, 2).join(' | ')}`.trim());
  }

  return {
    sourceUrl: ranked[0].sourceUrl,
    source: 'inalto-official',
    productPageUrl: ranked[0].productPageUrl
  };
}

exports.extractSitemapLocs = extractSitemapLocs;
exports.extractProductPageUrlsForSku = extractProductPageUrlsForSku;
exports.extractPdfUrlsFromProductPage = extractPdfUrlsFromProductPage;
exports.findInaltoOfficialPdf = findInaltoOfficialPdf;
