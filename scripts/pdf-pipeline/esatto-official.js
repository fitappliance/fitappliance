const SITEMAP_URL = 'https://esatto.house/sitemap.xml';
const USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';
const { createHash } = require('node:crypto');

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function extractLocsFromSitemap(xml) {
  return [...String(xml || '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => match[1].trim());
}

function isCoreProductUrl(url) {
  return /esatto\.house\/(?:refrigeration|dishwashers|laundry|discontinued-products)\//i.test(url);
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function absoluteUrl(href, baseUrl) {
  return new URL(decodeHtml(href), baseUrl).toString();
}

function targetSku(target = {}) {
  return normalizeSku(target.sku || target.model || target.product?.model || target.product?.sku);
}

function urlMatchesTargetSku(url, target = {}) {
  const sku = targetSku(target);
  if (!sku || sku.length < 4) return false;
  return normalizeSku(url).includes(sku);
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
      throw new Error(`Esatto official finder failed HTTP ${response.status} for ${url}`);
    }
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

function classifyDownload(label, href) {
  const haystack = `${label || ''} ${href || ''}`;
  if (/user\s*manual|manual/i.test(haystack)) return { resourceType: 'user_manual', score: 100 };
  if (/product\s*card|spec/i.test(haystack)) return { resourceType: 'product_card', score: 70 };
  if (/quick\s*start|qsg/i.test(haystack)) return { resourceType: 'quick_start_guide', score: 20 };
  return { resourceType: 'pdf', score: 10 };
}

function extractEsattoDownloadLinks(html, pageUrl) {
  const links = [];
  const source = String(html || '');
  const anchorPattern = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  for (const match of source.matchAll(anchorPattern)) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    const href = attrs.match(/\bhref=["']([^"']+\.pdf[^"']*)["']/i)?.[1];
    if (!href) continue;
    const label = decodeHtml(body.replace(/<[^>]+>/g, ' ')).trim();
    const classified = classifyDownload(label, href);
    links.push({
      url: absoluteUrl(href, pageUrl),
      label,
      ...classified
    });
  }
  return links.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}

async function findEsattoOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  sitemapUrl = SITEMAP_URL,
  timeoutMs = 30_000,
  writeObject = null
} = {}) {
  if (!fetchImpl) throw new Error('Esatto official finder requires fetch');
  const sku = targetSku(target);
  if (!sku || sku.length < 4) throw new Error('Esatto official finder requires a SKU');

  const sitemapXml = await fetchText(sitemapUrl, fetchImpl, timeoutMs);
  const productUrls = extractLocsFromSitemap(sitemapXml)
    .filter(isCoreProductUrl)
    .filter((url) => urlMatchesTargetSku(url, target));

  if (productUrls.length === 0) {
    throw new Error(`Esatto product page not found for ${target.sku || target.model}`);
  }

  const errors = [];
  for (const productUrl of productUrls) {
    try {
      const html = await fetchText(productUrl, fetchImpl, timeoutMs);
      const links = extractEsattoDownloadLinks(html, productUrl);
      const best = links.find((link) => link.resourceType === 'user_manual')
        || links.find((link) => link.resourceType === 'product_card')
        || links[0];
      if (best) {
        let discoveryProvenance;
        if (typeof writeObject === 'function') {
          const bytes = Buffer.from(html, 'utf8');
          const discoveryContentSha256 = createHash('sha256').update(bytes).digest('hex');
          const discoveryObjectPath = `evidence/web/sha256/${discoveryContentSha256.slice(0, 2)}/${discoveryContentSha256.slice(2, 4)}/${discoveryContentSha256}.html`;
          await writeObject(discoveryObjectPath, bytes);
          discoveryProvenance = {
            schemaVersion: 1,
            method: 'official_product_page',
            market: 'AU',
            discoveryUrl: productUrl,
            requestedModel: sku,
            matchedModel: sku,
            artifactUrl: best.url,
            artifactLinkUrl: best.url,
            discoveryContentSha256,
            discoveryObjectPath,
            discoveryByteSize: bytes.length
          };
        }
        return {
          sourceUrl: best.url,
          source: `esatto-official-${best.resourceType}`,
          resourceType: best.resourceType,
          productUrl,
          label: best.label,
          ...(discoveryProvenance ? { discoveryProvenance } : {})
        };
      }
      errors.push(`${productUrl}: no downloadable PDFs`);
    } catch (error) {
      errors.push(`${productUrl}: ${error.message}`);
    }
  }

  throw new Error(`Esatto PDF not found: ${errors.join(' | ')}`);
}

exports.extractEsattoDownloadLinks = extractEsattoDownloadLinks;
exports.findEsattoOfficialPdf = findEsattoOfficialPdf;
exports.urlMatchesTargetSku = urlMatchesTargetSku;
