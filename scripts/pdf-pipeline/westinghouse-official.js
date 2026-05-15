const SITEMAP_URL = 'https://www.westinghouse.com.au/sitemap.xml';
const USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';
const RESOURCE_BASE = 'https://resource.electrolux.com.au/Public/File/?Id=';
const { westinghouseModelMatchesSku } = require('./parsers/westinghouse');

const KNOWN_DIMENSION_GUIDES = [
  { id: '53210', models: ['WBB3100AK', 'WBB3100WK', 'WBB3400AK', 'WBB3400WK'] },
  { id: '53211', models: ['WTB3100AK', 'WTB3100WK', 'WTB3400AK', 'WTB3400WK'] },
  { id: '51192', models: ['WBB3700AH', 'WBB3700WH', 'WBB3400AH', 'WBB3400WH'] },
  { id: '51194', models: ['WTB3700AH', 'WTB3700WH', 'WTB3400AH', 'WTB3400WH', 'WTB2800AH', 'WTB2800WH', 'WTB2500WH', 'WTB2300WH'] },
  { id: '51195', models: ['WBE5300BC', 'WBE5300SC', 'WBE5300WC', 'WBE4500BC', 'WBE4500SC', 'WBE4500WC', 'WBE5304BC', 'WBE5304SC', 'WBE4504BC', 'WBE4504SC'] },
  { id: '51198', models: ['WRB5004SC', 'WRB5004WC', 'WFB4204SC', 'WFB4204WC', 'WRB3504SA', 'WRB3504WA', 'WFB2804SA', 'WFB2804WA', 'WRM2400WE', 'WFM1700WE'] },
  { id: '51196', models: ['WHE6170BB', 'WHE6170SB', 'WHE6270SB', 'WQE6870BA', 'WQE6870SA', 'WQE6000BB', 'WQE6000SB', 'WQE6060BB', 'WQE6060SB', 'WHE6000SB', 'WHE6060SB'] },
  { id: '57496', models: ['WQE5650BA'] }
];

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractLocsFromSitemap(xml) {
  return [...String(xml || '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => match[1].trim());
}

function isCoreProductUrl(url) {
  return /westinghouse\.com\.au\/(?:support|fridges-and-freezers\/fridges|dishwashing\/dishwashers|laundry\/(?:washing-machines|dryers))\//i.test(url);
}

function buildWestinghouseProductCandidates(sitemapXml) {
  return extractLocsFromSitemap(sitemapXml)
    .filter(isCoreProductUrl);
}

function collectLookupText(target = {}) {
  return [
    target.sku,
    target.model,
    target.product?.model,
    target.product?.sku,
    target.product?.title,
    target.product?.displayName,
    target.product?.slug
  ].filter(Boolean).join(' ');
}

function extractWestinghouseSkus(text) {
  return [...String(text || '').toUpperCase().matchAll(/\bW[A-Z]{1,4}\d[A-Z0-9]*\b/g)]
    .map((match) => normalizeSku(match[0]))
    .filter((sku) => sku.length >= 5);
}

function buildLookupCandidates(target = {}) {
  return [...new Set(extractWestinghouseSkus(collectLookupText(target)))];
}

function buildRawLookupValues(target = {}) {
  return [...new Set([
    target.sku,
    target.model,
    target.product?.model,
    target.product?.sku,
    ...buildLookupCandidates(target)
  ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function knownDimensionGuideForTarget(target = {}) {
  const candidates = buildRawLookupValues(target);
  for (const guide of KNOWN_DIMENSION_GUIDES) {
    const guideModels = guide.models.map(normalizeSku);
    if (candidates.some((candidate) => (
      guideModels.includes(normalizeSku(candidate))
      || guide.models.some((model) => westinghouseModelMatchesSku(model, candidate))
    ))) {
      return {
        sourceUrl: `${RESOURCE_BASE}${guide.id}`,
        source: 'westinghouse-official-known-dimension_sheet',
        resourceType: 'dimension_sheet',
        productUrl: null,
        label: `Known Westinghouse dimension guide ${guide.id}`
      };
    }
  }
  return null;
}

function productSlugFromUrl(url) {
  const pathname = new URL(url).pathname;
  const parts = pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function stripVariantSuffix(slug) {
  return normalizeSku(slug.replace(/-(?:l|r|x)$/i, ''));
}

function westinghouseProductUrlMatchesTarget(url, target = {}) {
  const productSku = stripVariantSuffix(productSlugFromUrl(url));
  if (!productSku || productSku.length < 5) return false;
  return buildLookupCandidates(target).some((candidate) => (
    candidate === productSku
    || productSku.startsWith(candidate)
    || candidate.startsWith(productSku)
  ));
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

function classifyDownloadType(label, href) {
  const haystack = `${label || ''} ${href || ''}`;
  if (/dimension/i.test(haystack)) return { type: 'dimension_sheet', score: 100 };
  if (/install/i.test(haystack)) return { type: 'installation_manual', score: 80 };
  if (/fact/i.test(haystack)) return { type: 'fact_sheet', score: 60 };
  if (/manual|user/i.test(haystack)) return { type: 'user_manual', score: 50 };
  return { type: 'pdf', score: 10 };
}

function extractWestinghouseDownloadLinks(html, pageUrl) {
  const links = [];
  const source = String(html || '');
  const anchorPattern = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  for (const match of source.matchAll(anchorPattern)) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const label = decodeHtml(
      attrs.match(/\bdata-ga4-download-type=["']([^"']+)["']/i)?.[1]
      || body.replace(/<[^>]+>/g, ' ')
    );
    if (!/documenthandler|RequestPdf|\.pdf(?:$|[?#])/i.test(href)) continue;
    const classified = classifyDownloadType(label, href);
    links.push({
      url: absoluteUrl(href, pageUrl),
      label: label.trim(),
      ...classified
    });
  }

  return links.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
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
      throw new Error(`Westinghouse official finder failed HTTP ${response.status} for ${url}`);
    }
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function findWestinghouseOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  knownOnly = false,
  sitemapUrl = SITEMAP_URL,
  timeoutMs = 30_000
} = {}) {
  if (!fetchImpl) throw new Error('Westinghouse official finder requires fetch');
  if (buildLookupCandidates(target).length === 0) {
    throw new Error('Westinghouse official finder requires a SKU');
  }

  const knownGuide = knownDimensionGuideForTarget(target);
  if (knownOnly && knownGuide) return knownGuide;
  if (knownOnly) {
    throw new Error(`Westinghouse known dimension guide not found for ${target.sku || target.model}`);
  }

  const sitemapXml = await fetchText(sitemapUrl, fetchImpl, timeoutMs);
  const productUrls = buildWestinghouseProductCandidates(sitemapXml)
    .filter((url) => westinghouseProductUrlMatchesTarget(url, target));
  if (productUrls.length === 0) {
    if (knownGuide) return knownGuide;
    throw new Error(`Westinghouse product page not found for ${target.sku || target.model}`);
  }

  const errors = [];
  for (const productUrl of productUrls) {
    try {
      const html = await fetchText(productUrl, fetchImpl, timeoutMs);
      const links = extractWestinghouseDownloadLinks(html, productUrl);
      const best = links.find((link) => link.type === 'dimension_sheet')
        || links.find((link) => link.type === 'installation_manual')
        || links[0];
      if (best) {
        return {
          sourceUrl: best.url,
          source: `westinghouse-official-${best.type}`,
          resourceType: best.type,
          productUrl,
          label: best.label
        };
      }
      errors.push(`${productUrl}: no downloadable PDF links`);
    } catch (error) {
      errors.push(`${productUrl}: ${error.message}`);
    }
  }

  if (knownGuide) return knownGuide;

  throw new Error(`Westinghouse PDF not found: ${errors.join(' | ')}`);
}

exports.buildLookupCandidates = buildLookupCandidates;
exports.buildWestinghouseProductCandidates = buildWestinghouseProductCandidates;
exports.extractWestinghouseDownloadLinks = extractWestinghouseDownloadLinks;
exports.extractWestinghouseSkus = extractWestinghouseSkus;
exports.findWestinghouseOfficialPdf = findWestinghouseOfficialPdf;
exports.knownDimensionGuideForTarget = knownDimensionGuideForTarget;
exports.normalizeSku = normalizeSku;
exports.westinghouseProductUrlMatchesTarget = westinghouseProductUrlMatchesTarget;
