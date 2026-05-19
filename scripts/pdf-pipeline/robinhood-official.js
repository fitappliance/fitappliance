const DEFAULT_USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';
const TECHNICAL_PAGE_URL = 'https://robinhood.co.nz/pages/technical';
const PRODUCT_SITEMAP_URL = 'https://robinhood.co.nz/sitemap_products_1.xml?from=5864509440157&to=9886546460912';

let cachedTechnicalHtml = null;
let cachedProductUrls = null;
const cachedProductHtmlByUrl = new Map();

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function getTargetSku(target = {}) {
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractPdfUrls(html) {
  const urls = [...String(html || '').matchAll(/https?:[^"'<>\\\s]+\.pdf(?:\?[^"'<>\\\s]*)?/gi)]
    .map((match) => decodeHtml(match[0]));
  return [...new Set(urls)];
}

function productUrlsFromSitemap(xml) {
  return [...String(xml || '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => decodeHtml(match[1].trim()))
    .filter((url) => /\/products\//i.test(url));
}

function resourceTypeFromUrl(url) {
  const value = decodeURIComponent(String(url || '')).toLowerCase();
  if (/technical[_-]?sheet|tech[_-]?sheet|specification|specifications/.test(value)) return 'specification_sheet';
  if (/service[_-]?manual/.test(value)) return 'service_manual';
  if (/(?:^|[_-])plt(?:[_-]|\.)|parts/.test(value)) return 'parts_list';
  return 'user_manual';
}

function scoreResource(url, sku) {
  const type = resourceTypeFromUrl(url);
  const name = normalizeSku(decodeURIComponent(String(url).split('/').pop() || ''));
  const normalizedSku = normalizeSku(sku);
  const exactSkuBonus = name.includes(normalizedSku) ? 100 : 0;
  const typeScore = {
    user_manual: 90,
    specification_sheet: 80,
    service_manual: 20,
    parts_list: 5
  }[type] || 0;
  return exactSkuBonus + typeScore;
}

function matchingResourcesFromHtml(html, sku, sourcePrefix = 'robinhood-official') {
  const normalizedSku = normalizeSku(sku);
  return extractPdfUrls(html)
    .filter((url) => normalizeSku(decodeURIComponent(url)).includes(normalizedSku))
    .map((url) => ({
      sourceUrl: url,
      url,
      source: `${sourcePrefix}-${resourceTypeFromUrl(url)}`,
      resourceType: resourceTypeFromUrl(url),
      score: scoreResource(url, sku)
    }))
    .sort((a, b) => b.score - a.score || a.sourceUrl.localeCompare(b.sourceUrl));
}

async function fetchText(url, {
  fetchImpl = globalThis.fetch,
  userAgent = DEFAULT_USER_AGENT,
  timeoutMs = 30_000
} = {}) {
  if (!fetchImpl) throw new Error('Robinhood official finder requires fetch');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml,text/xml,application/xml'
    };
    let response = await fetchImpl(url, { headers, signal: controller.signal });
    if (!response.ok && response.status === 403 && userAgent === DEFAULT_USER_AGENT) {
      response = await fetchImpl(url, {
        headers: {
          ...headers,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36'
        },
        signal: controller.signal
      });
    }
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function getTechnicalHtml(options) {
  if (cachedTechnicalHtml) return cachedTechnicalHtml;
  cachedTechnicalHtml = await fetchText(TECHNICAL_PAGE_URL, options);
  return cachedTechnicalHtml;
}

async function getProductUrls(options) {
  if (cachedProductUrls) return cachedProductUrls;
  const xml = await fetchText(PRODUCT_SITEMAP_URL, options);
  cachedProductUrls = productUrlsFromSitemap(xml);
  return cachedProductUrls;
}

async function getProductHtml(url, options) {
  if (cachedProductHtmlByUrl.has(url)) return cachedProductHtmlByUrl.get(url);
  const html = await fetchText(url, options).catch(() => null);
  if (html === null) return '';
  cachedProductHtmlByUrl.set(url, html);
  return html;
}

async function findProductPageResources(sku, options) {
  const productUrls = await getProductUrls(options);
  const normalizedSku = normalizeSku(sku);
  const resources = [];

  for (const url of productUrls) {
    const html = await getProductHtml(url, options);
    if (!normalizeSku(html).includes(normalizedSku)) continue;
    resources.push(...matchingResourcesFromHtml(html, sku));
    if (resources.length > 0) break;
  }

  return resources.sort((a, b) => b.score - a.score || a.sourceUrl.localeCompare(b.sourceUrl));
}

async function findRobinhoodOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  userAgent = DEFAULT_USER_AGENT,
  timeoutMs = 30_000
} = {}) {
  const sku = getTargetSku(target);
  if (!sku) throw new Error('Robinhood official finder requires a SKU');
  const options = { fetchImpl, userAgent, timeoutMs };

  const technicalHtml = await getTechnicalHtml(options);
  let resources = matchingResourcesFromHtml(technicalHtml, sku);

  if (resources.length === 0) {
    resources = await findProductPageResources(sku, options);
  }

  const usable = resources.filter((resource) => resource.resourceType !== 'parts_list');
  if (usable.length === 0) {
    throw new Error(`Robinhood official PDF resources not found for ${sku}`);
  }

  return {
    sourceUrl: usable[0].sourceUrl,
    source: usable[0].source,
    resourceType: usable[0].resourceType,
    resources: usable
  };
}

function clearRobinhoodCaches() {
  cachedTechnicalHtml = null;
  cachedProductUrls = null;
  cachedProductHtmlByUrl.clear();
}

exports.clearRobinhoodCaches = clearRobinhoodCaches;
exports.extractPdfUrls = extractPdfUrls;
exports.findRobinhoodOfficialPdf = findRobinhoodOfficialPdf;
exports.matchingResourcesFromHtml = matchingResourcesFromHtml;
exports.normalizeSku = normalizeSku;
exports.productUrlsFromSitemap = productUrlsFromSitemap;
exports.resourceTypeFromUrl = resourceTypeFromUrl;
