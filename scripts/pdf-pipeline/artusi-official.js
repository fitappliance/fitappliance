const SITEMAP_URL = 'https://artusi.com.au/wp-sitemap-posts-product-1.xml';
const USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';

let cachedProductUrls = null;
const cachedHtmlByUrl = new Map();

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function targetSku(target = {}) {
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function skuSearchKeys(value) {
  const raw = String(value || '').trim().toUpperCase();
  const normalized = normalizeSku(raw);
  const keys = new Set();
  if (normalized.length >= 4) keys.add(normalized);

  const firstToken = raw.split(/[ /_-]+/)[0];
  const firstNormalized = normalizeSku(firstToken);
  if (firstNormalized.length >= 4) keys.add(firstNormalized);

  const familyMatch = normalized.match(/^([A-Z]+)(\d{3,4})/);
  if (familyMatch) keys.add(`${familyMatch[1]}${familyMatch[2]}`);

  return [...keys].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function extractLocsFromSitemap(xml) {
  return [...String(xml || '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => match[1].trim());
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8211;/g, '-')
    .replace(/&#038;/g, '&');
}

function stripTags(value) {
  return decodeHtml(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function absoluteUrl(href, baseUrl = 'https://artusi.com.au/') {
  return new URL(String(href || ''), baseUrl).toString();
}

function classifyDownload(context, href) {
  const haystack = `${context || ''} ${href || ''}`;
  if (/user[-_\s]*manual|manual/i.test(String(href || ''))) {
    return { resourceType: 'user_manual', score: 80 };
  }
  if (/operation[-_\s]*&?[-_\s]*installation|installation[-_\s]*manual/i.test(String(href || ''))) {
    return { resourceType: 'installation_manual', score: 90 };
  }
  if (/spec(?:ification)?\s*sheet|\bPF[_-]/i.test(haystack)) {
    return { resourceType: 'specification_sheet', score: 100 };
  }
  if (/operation\s*&?\s*installation|installation\s*manual/i.test(haystack)) {
    return { resourceType: 'installation_manual', score: 90 };
  }
  if (/user\s*manual|manual/i.test(haystack)) {
    return { resourceType: 'user_manual', score: 80 };
  }
  return { resourceType: 'pdf', score: 10 };
}

function extractArtusiDownloadLinks(html, pageUrl = 'https://artusi.com.au/') {
  const source = String(html || '');
  const resources = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of source.matchAll(anchorPattern)) {
    const href = decodeHtml(match[1]);
    const anchorStart = match.index || 0;
    const contextStart = Math.max(0, anchorStart - 280);
    const context = stripTags(source.slice(contextStart, anchorStart) + ' ' + match[2]);
    const classified = classifyDownload(context, href);
    const sourceUrl = absoluteUrl(href, pageUrl);
    resources.push({
      sourceUrl,
      url: sourceUrl,
      label: context,
      source: `artusi-official-${classified.resourceType}`,
      ...classified
    });
  }

  return [...new Map(resources.map((resource) => [resource.sourceUrl, resource])).values()]
    .sort((a, b) => b.score - a.score || a.sourceUrl.localeCompare(b.sourceUrl));
}

function productUrlMatchesTarget(url, target = {}) {
  const normalizedUrl = normalizeSku(url);
  return skuSearchKeys(targetSku(target)).some((key) => (
    key.length >= 4 && normalizedUrl.includes(key)
  ));
}

function productHtmlMatchesTarget(html, target = {}) {
  const normalizedText = normalizeSku(stripTags(html));
  return skuSearchKeys(targetSku(target)).some((key) => (
    key.length >= 4 && normalizedText.includes(key)
  ));
}

async function fetchText(url, {
  fetchImpl = globalThis.fetch,
  userAgent = USER_AGENT,
  timeoutMs = 30_000
} = {}) {
  if (!fetchImpl) throw new Error('Artusi official finder requires fetch');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.7'
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function getProductUrls(options) {
  if (cachedProductUrls) return cachedProductUrls;
  const xml = await fetchText(options.sitemapUrl || SITEMAP_URL, options);
  cachedProductUrls = extractLocsFromSitemap(xml)
    .filter((url) => /artusi\.com\.au\/product\//i.test(url));
  return cachedProductUrls;
}

async function getProductHtml(url, options) {
  if (cachedHtmlByUrl.has(url)) return cachedHtmlByUrl.get(url);
  const html = await fetchText(url, options);
  cachedHtmlByUrl.set(url, html);
  return html;
}

async function findArtusiOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  sitemapUrl = SITEMAP_URL,
  userAgent = USER_AGENT,
  timeoutMs = 30_000,
  maxProductPages = 260
} = {}) {
  const sku = targetSku(target);
  if (!normalizeSku(sku)) throw new Error('Artusi official finder requires a SKU');

  const options = { fetchImpl, sitemapUrl, userAgent, timeoutMs };
  const productUrls = await getProductUrls(options);
  const directCandidates = productUrls.filter((url) => productUrlMatchesTarget(url, target));
  const scanCandidates = directCandidates.length > 0
    ? directCandidates
    : productUrls.slice(0, maxProductPages);

  const errors = [];
  for (const productUrl of scanCandidates) {
    try {
      const html = await getProductHtml(productUrl, options);
      if (!productUrlMatchesTarget(productUrl, target) && !productHtmlMatchesTarget(html, target)) continue;
      const resources = extractArtusiDownloadLinks(html, productUrl);
      if (resources.length === 0) {
        errors.push(`${productUrl}: no PDF downloads`);
        continue;
      }
      const best = resources.find((resource) => resource.resourceType === 'specification_sheet') || resources[0];
      return {
        sourceUrl: best.sourceUrl,
        source: best.source,
        resourceType: best.resourceType,
        productUrl,
        label: best.label,
        resources
      };
    } catch (error) {
      errors.push(`${productUrl}: ${error.message}`);
    }
  }

  throw new Error(`Artusi official PDF resources not found for ${sku}${errors.length ? `: ${errors.join(' | ')}` : ''}`);
}

function clearArtusiCaches() {
  cachedProductUrls = null;
  cachedHtmlByUrl.clear();
}

exports.SITEMAP_URL = SITEMAP_URL;
exports.clearArtusiCaches = clearArtusiCaches;
exports.extractArtusiDownloadLinks = extractArtusiDownloadLinks;
exports.findArtusiOfficialPdf = findArtusiOfficialPdf;
exports.normalizeSku = normalizeSku;
exports.productUrlMatchesTarget = productUrlMatchesTarget;
