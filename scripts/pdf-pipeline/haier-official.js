const HAIER_SITEMAP_INDEX = 'https://www.haier.com.au/sitemap_index.xml';

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\bSERIES\b/g, '')
    .replace(/[^A-Z0-9]+/g, '');
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractXmlLocs(xml) {
  return [...String(xml || '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => decodeHtml(match[1]).trim())
    .filter(Boolean);
}

function isCoreProductUrl(url) {
  return /haier\.com\.au\/(?:refrigeration|dishwashing|laundry)\//i.test(String(url || ''));
}

function haierProductUrlMatchesTarget(url, target = {}) {
  const sku = normalizeSku(target.sku || target.model || target.product?.model);
  if (!sku || sku.length < 4) return false;
  const normalizedUrl = normalizeSku(url);
  return normalizedUrl.includes(sku);
}

function scoreHaierPdf(url) {
  const text = String(url || '');
  if (/SpecificationGuide/i.test(text)) return 100;
  if (/QRG/i.test(text)) return 50;
  if (/UserInstall|Installation/i.test(text)) return 40;
  if (/UserGuide|Manual/i.test(text)) return 20;
  if (/Energy|Water/i.test(text)) return -20;
  return 0;
}

function resourceTypeForHaierPdf(url) {
  const text = String(url || '');
  if (/SpecificationGuide/i.test(text)) return 'specification_guide';
  if (/QRG/i.test(text)) return 'quick_reference_guide';
  if (/UserInstall|Installation/i.test(text)) return 'installation_manual';
  if (/UserGuide|Manual/i.test(text)) return 'user_manual';
  if (/Energy|Water/i.test(text)) return 'energy_label';
  return 'pdf';
}

function extractHaierDownloadLinks(html, baseUrl = 'https://www.haier.com.au/') {
  const links = [...String(html || '').matchAll(/href=["']([^"']+?\.pdf(?:\?[^"']*)?)["']/gi)]
    .map((match) => {
      const rawUrl = decodeHtml(match[1]);
      const url = new URL(rawUrl, baseUrl).href;
      return {
        url,
        sourceUrl: url,
        resourceType: resourceTypeForHaierPdf(url),
        source: `haier-official-${resourceTypeForHaierPdf(url)}`,
        score: scoreHaierPdf(url)
      };
    })
    .filter((link) => !/(?:Energy|Water)/i.test(link.url))
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

  const seen = new Set();
  return links.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

function buildHaierProductCandidates(sitemapXml) {
  return extractXmlLocs(sitemapXml).filter(isCoreProductUrl);
}

async function fetchText(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)'
    }
  });
  if (!response.ok) {
    throw new Error(`Haier request failed with HTTP ${response.status}: ${url}`);
  }
  return response.text();
}

async function loadHaierSitemapProductUrls(fetchImpl, sitemapIndexUrl = HAIER_SITEMAP_INDEX) {
  const indexXml = await fetchText(sitemapIndexUrl, fetchImpl);
  const sitemapUrls = extractXmlLocs(indexXml);
  const productUrls = [];
  for (const sitemapUrl of sitemapUrls) {
    const sitemapXml = await fetchText(sitemapUrl, fetchImpl);
    productUrls.push(...buildHaierProductCandidates(sitemapXml));
  }
  return [...new Set(productUrls)].sort();
}

async function findHaierOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  sitemapIndexUrl = HAIER_SITEMAP_INDEX
} = {}) {
  if (!fetchImpl) throw new Error('Haier official finder requires fetch');
  const productUrls = await loadHaierSitemapProductUrls(fetchImpl, sitemapIndexUrl);
  const productUrl = productUrls.find((url) => haierProductUrlMatchesTarget(url, target));
  if (!productUrl) {
    throw new Error(`Haier product page not found for ${target.sku || target.model}`);
  }

  const html = await fetchText(productUrl, fetchImpl);
  const links = extractHaierDownloadLinks(html, productUrl)
    .filter((link) => link.score > 0);
  const primary = links[0];
  if (!primary) {
    throw new Error(`Haier official PDF resources not found for ${target.sku || target.model}`);
  }

  return {
    ...primary,
    productUrl,
    resources: links
  };
}

exports.HAIER_SITEMAP_INDEX = HAIER_SITEMAP_INDEX;
exports.buildHaierProductCandidates = buildHaierProductCandidates;
exports.extractHaierDownloadLinks = extractHaierDownloadLinks;
exports.extractXmlLocs = extractXmlLocs;
exports.findHaierOfficialPdf = findHaierOfficialPdf;
exports.haierProductUrlMatchesTarget = haierProductUrlMatchesTarget;
exports.loadHaierSitemapProductUrls = loadHaierSitemapProductUrls;
exports.normalizeSku = normalizeSku;
exports.resourceTypeForHaierPdf = resourceTypeForHaierPdf;
