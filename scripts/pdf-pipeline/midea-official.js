const SITEMAP_URL = 'https://www.midea.com/au/sitemap.xml';
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

function extractLocsFromSitemap(xml) {
  return [...String(xml || '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => match[1].trim());
}

function isCoreProductUrl(url) {
  return /midea\.com\/au\/(?:refrigerator|kitchen-appliances\/dishwashers|laundry)\//i.test(String(url || ''));
}

function urlMatchesTargetSku(url, target = {}) {
  const sku = targetSku(target);
  if (!sku || sku.length < 4) return false;
  return normalizeSku(url).includes(sku);
}

function decodeAemString(value) {
  const raw = String(value || '');
  try {
    return JSON.parse(`"${raw.replace(/"/g, '\\"')}"`);
  } catch {
    return raw.replace(/\\\//g, '/');
  }
}

function extractManualDownloadPrefixes(html) {
  const prefixes = [];
  for (const match of String(html || '').matchAll(/"urlPrefix"\s*:\s*"([^"]+)"/g)) {
    const decoded = decodeAemString(match[1]);
    if (decoded.includes('/manualsdownload')) prefixes.push(decoded);
  }
  return [...new Set(prefixes)];
}

function absoluteUrl(href, baseUrl = 'https://www.midea.com/au/') {
  return new URL(String(href || ''), baseUrl).toString();
}

async function fetchText(url, fetchImpl, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7'
      }
    });
    if (!response.ok) {
      throw new Error(`Midea official finder failed HTTP ${response.status} for ${url}`);
    }
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, fetchImpl, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json,text/plain;q=0.8,*/*;q=0.7'
      }
    });
    if (!response.ok) {
      throw new Error(`Midea official finder failed HTTP ${response.status} for ${url}`);
    }
    if (typeof response.json === 'function') return response.json();
    return JSON.parse(await response.text());
  } finally {
    clearTimeout(timer);
  }
}

function classifyDownload(name, href) {
  const haystack = `${name || ''} ${href || ''}`;
  if (/spec(?:ification)?\s*sheet|spec\s*sheet/i.test(haystack)) {
    return { resourceType: 'specification_sheet', score: 100 };
  }
  if (/user\s*manual|manual/i.test(haystack)) {
    return { resourceType: 'user_manual', score: 90 };
  }
  if (/installation/i.test(haystack)) {
    return { resourceType: 'installation_manual', score: 80 };
  }
  return { resourceType: 'pdf', score: 10 };
}

function extractMideaDownloadLinks(payload, pageUrl) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows
    .filter((row) => /\.pdf(?:$|[?#])/i.test(String(row?.link || '')) || /pdf/i.test(String(row?.fileType || '')))
    .map((row) => {
      const classified = classifyDownload(row.name, row.link);
      return {
        url: absoluteUrl(row.link, 'https://www.midea.com/'),
        label: String(row.name || '').trim(),
        ...classified
      };
    })
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}

async function findMideaOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  sitemapUrl = SITEMAP_URL,
  timeoutMs = 30_000
} = {}) {
  if (!fetchImpl) throw new Error('Midea official finder requires fetch');
  const sku = targetSku(target);
  if (!sku || sku.length < 4) throw new Error('Midea official finder requires a SKU');

  const sitemapXml = await fetchText(sitemapUrl, fetchImpl, timeoutMs);
  const productUrls = extractLocsFromSitemap(sitemapXml)
    .filter(isCoreProductUrl)
    .filter((url) => urlMatchesTargetSku(url, target));

  if (productUrls.length === 0) {
    throw new Error(`Midea product page not found for ${target.sku || target.model}`);
  }

  const errors = [];
  for (const productUrl of productUrls) {
    try {
      const html = await fetchText(productUrl, fetchImpl, timeoutMs);
      const prefixes = extractManualDownloadPrefixes(html);
      if (prefixes.length === 0) {
        errors.push(`${productUrl}: no manualsdownload endpoint`);
        continue;
      }

      const resources = [];
      for (const prefix of prefixes) {
        const dataUrl = absoluteUrl(`${prefix}.data.json`, productUrl);
        const payload = await fetchJson(dataUrl, fetchImpl, timeoutMs);
        resources.push(...extractMideaDownloadLinks(payload, productUrl));
      }

      const deduped = [...new Map(resources.map((resource) => [resource.url, resource])).values()]
        .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
      const best = deduped.find((link) => link.resourceType === 'specification_sheet') || deduped[0];
      if (best) {
        return {
          sourceUrl: best.url,
          source: `midea-official-${best.resourceType}`,
          resourceType: best.resourceType,
          productUrl,
          label: best.label,
          resources: deduped.map((resource) => ({
            sourceUrl: resource.url,
            url: resource.url,
            source: `midea-official-${resource.resourceType}`,
            resourceType: resource.resourceType,
            label: resource.label,
            score: resource.score
          }))
        };
      }

      errors.push(`${productUrl}: no downloadable PDFs`);
    } catch (error) {
      errors.push(`${productUrl}: ${error.message}`);
    }
  }

  throw new Error(`Midea PDF not found: ${errors.join(' | ')}`);
}

exports.extractMideaDownloadLinks = extractMideaDownloadLinks;
exports.extractManualDownloadPrefixes = extractManualDownloadPrefixes;
exports.findMideaOfficialPdf = findMideaOfficialPdf;
exports.urlMatchesTargetSku = urlMatchesTargetSku;
