const APPLIANCES_ONLINE_SITEMAP = 'https://www.appliancesonline.com.au/public/sitemaps/sitemap-products.xml';
const DEFAULT_USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';

const PDF_HOSTS = [
  'https://www.appliancesonline.com.au/public/manuals/',
  'https://www.winningcommercial.com.au/public/manuals/'
];

const PDF_SUFFIXES = [
  ['specification_sheet', '-Liebherr-Specifications-Sheet.pdf', 100],
  ['installation_guide', '-Liebherr-Installation-Guide.pdf', 90],
  ['installation_manual', '-Liebherr-Installation-Manual.pdf', 85],
  ['user_manual', '-Liebherr-User-Manual.pdf', 70]
];

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function baseLiebherrSku(value) {
  return normalizeSku(value)
    .replace(/(?:LHH|RHH|LH|RH)$/i, '');
}

function extractLocsFromSitemap(xml) {
  return [...String(xml || '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => match[1].trim());
}

function productSlugFromUrl(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
}

function extractSkuTokensFromSlug(slug) {
  const tokens = [...String(slug || '').toUpperCase().matchAll(/\b[A-Z]{2,}\d[A-Z0-9]*\b/g)]
    .map((match) => normalizeSku(match[0]))
    .filter((token) => token.length >= 5);
  const parts = String(slug || '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);

  for (let index = 0; index < parts.length - 1; index += 1) {
    const first = parts[index];
    const second = parts[index + 1];
    if (/^[A-Z]{2,}$/.test(first) && /^\d[A-Z0-9]*$/.test(second)) {
      tokens.push(normalizeSku(`${first}${second}`));
    }
  }

  return [...new Set(tokens)];
}

function getTargetSku(target = {}) {
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function findMatchingProductUrls(sitemapXml, target = {}) {
  const targetSku = normalizeSku(getTargetSku(target));
  if (!targetSku) return [];
  const targetBase = baseLiebherrSku(targetSku);
  return extractLocsFromSitemap(sitemapXml)
    .filter((url) => /liebherr/i.test(url))
    .filter((url) => {
      const normalizedUrl = normalizeSku(url);
      return normalizedUrl.includes(targetSku) || normalizedUrl.includes(targetBase);
    });
}

function buildLookupTokens(target = {}, productUrls = []) {
  const targetSku = normalizeSku(getTargetSku(target));
  const targetBase = baseLiebherrSku(targetSku);
  const tokens = new Set([targetSku, targetBase].filter(Boolean));

  for (const url of productUrls) {
    for (const token of extractSkuTokensFromSlug(productSlugFromUrl(url))) {
      const tokenBase = baseLiebherrSku(token);
      if (
        token === targetSku
        || tokenBase === targetBase
        || token.includes(targetBase)
        || targetBase.includes(tokenBase)
      ) {
        tokens.add(token);
      }
    }
  }

  return [...tokens].filter(Boolean);
}

function buildLiebherrPdfCandidates(target = {}, productUrls = []) {
  const candidates = [];
  for (const token of buildLookupTokens(target, productUrls)) {
    for (const host of PDF_HOSTS) {
      for (const [resourceType, suffix, score] of PDF_SUFFIXES) {
        candidates.push({
          sourceUrl: `${host}${token}${suffix}`,
          source: `liebherr-retailer-${resourceType}`,
          resourceType,
          score
        });
      }
    }
  }
  return candidates;
}

async function fetchText(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 30_000,
  userAgent = DEFAULT_USER_AGENT
} = {}) {
  if (!fetchImpl) throw new Error('Liebherr official finder requires fetch');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/xml,text/html,application/xhtml+xml'
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Liebherr sitemap fetch failed HTTP ${response.status} for ${url}`);
    }
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function probePdfMagic(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
  userAgent = DEFAULT_USER_AGENT
} = {}) {
  if (!fetchImpl) throw new Error('Liebherr PDF probe requires fetch');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Range: 'bytes=0-7',
        'User-Agent': userAgent
      },
      signal: controller.signal
    });
    if (!response.ok && response.status !== 206) return false;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.toString('latin1').startsWith('%PDF-');
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function findLiebherrOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  sitemapUrl = APPLIANCES_ONLINE_SITEMAP,
  timeoutMs = 30_000,
  userAgent = DEFAULT_USER_AGENT
} = {}) {
  const sku = getTargetSku(target);
  if (!sku) throw new Error('Liebherr official finder requires a SKU');
  if (!fetchImpl) throw new Error('Liebherr official finder requires fetch');

  const sitemapXml = await fetchText(sitemapUrl, { fetchImpl, timeoutMs, userAgent });
  const productUrls = findMatchingProductUrls(sitemapXml, target);
  const candidates = buildLiebherrPdfCandidates(target, productUrls);
  const resources = [];

  for (const candidate of candidates) {
    if (await probePdfMagic(candidate.sourceUrl, { fetchImpl, timeoutMs: Math.min(timeoutMs, 10_000), userAgent })) {
      resources.push(candidate);
    }
  }

  const deduped = new Map();
  for (const resource of resources) {
    const existing = deduped.get(resource.sourceUrl);
    if (!existing || resource.score > existing.score) deduped.set(resource.sourceUrl, resource);
  }
  const sorted = [...deduped.values()].sort((a, b) => b.score - a.score || a.sourceUrl.localeCompare(b.sourceUrl));

  if (sorted.length === 0) {
    throw new Error(`Liebherr PDF resources not found for ${sku}`);
  }

  return {
    sourceUrl: sorted[0].sourceUrl,
    source: sorted[0].source,
    resourceType: sorted[0].resourceType,
    productUrls,
    resources: sorted
  };
}

exports.APPLIANCES_ONLINE_SITEMAP = APPLIANCES_ONLINE_SITEMAP;
exports.buildLiebherrPdfCandidates = buildLiebherrPdfCandidates;
exports.buildLookupTokens = buildLookupTokens;
exports.extractSkuTokensFromSlug = extractSkuTokensFromSlug;
exports.findLiebherrOfficialPdf = findLiebherrOfficialPdf;
exports.findMatchingProductUrls = findMatchingProductUrls;
exports.normalizeSku = normalizeSku;
exports.probePdfMagic = probePdfMagic;
