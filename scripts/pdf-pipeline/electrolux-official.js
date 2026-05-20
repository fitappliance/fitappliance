const SITEMAP_URL = 'https://www.electrolux.com.au/sitemap.xml';
const USER_AGENT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const RESOURCE_BASE = 'https://resource.electrolux.com.au/Public/File/?Id=';
const { electroluxModelMatchesSku } = require('./parsers/electrolux');

const KNOWN_DIMENSION_GUIDES = [
  { id: '51297', models: ['EBE4507BC', 'EBE4507SC'] },
  { id: '51296', models: ['EBE5367SC', 'EBE5307BC', 'EBE5307SC'] },
  { id: '51292', models: ['ERE5047SC', 'EFE4227SC'] }
];

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
  return /electrolux\.com\.au\/(?:support|fridges-and-freezers\/(?:fridges|freezers)|dishwashing\/dishwashers|laundry\/(?:washing-machines|dryers|washer-dryer))\//i.test(url);
}

function buildElectroluxProductCandidates(sitemapXml) {
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

function extractElectroluxSkus(text) {
  return [...String(text || '').toUpperCase().matchAll(/\b(?:E|K|W)[A-Z]{1,4}\d[A-Z0-9]*(?:-[LR])?\b/g)]
    .map((match) => normalizeSku(match[0]))
    .filter((sku) => sku.length >= 5);
}

function buildLookupCandidates(target = {}) {
  return [...new Set(extractElectroluxSkus(collectLookupText(target)))];
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
    if (candidates.some((candidate) => guide.models.some((model) => electroluxModelMatchesSku(model, candidate)))) {
      return {
        sourceUrl: `${RESOURCE_BASE}${guide.id}`,
        source: 'electrolux-official-known-dimension_sheet',
        resourceType: 'dimension_sheet',
        productUrl: null,
        label: `Known Electrolux dimension guide ${guide.id}`
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
  return normalizeSku(slug.replace(/-(?:l|r|scs|wcs)$/i, ''));
}

function electroluxProductUrlMatchesTarget(url, target = {}) {
  const productSku = stripVariantSuffix(productSlugFromUrl(url));
  if (!productSku || productSku.length < 5) return false;
  return buildLookupCandidates(target).some((candidate) => (
    candidate === productSku
    || productSku.startsWith(candidate)
    || candidate.startsWith(productSku)
    || electroluxModelMatchesSku(productSku, candidate)
    || electroluxModelMatchesSku(candidate, productSku)
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
  if (/terms|conditions|sale|warranty|privacy|cyber\s+security/i.test(haystack)) {
    return { type: 'non_spec_document', score: -100 };
  }
  if (/dimension/i.test(haystack)) return { type: 'dimension_sheet', score: 100 };
  if (/install/i.test(haystack)) return { type: 'installation_manual', score: 80 };
  if (/fact/i.test(haystack)) return { type: 'fact_sheet', score: 60 };
  if (/manual|user/i.test(haystack)) return { type: 'user_manual', score: 50 };
  return { type: 'pdf', score: 10 };
}

function extractElectroluxDownloadLinks(html, pageUrl) {
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
      || attrs.match(/\bdata-ga4-file-name=["']([^"']+)["']/i)?.[1]
      || body.replace(/<[^>]+>/g, ' ')
    );
    if (!/documenthandler|RequestPdf|\.pdf(?:$|[?#])/i.test(href)) continue;
    const classified = classifyDownloadType(label, href);
    if (classified.score < 0) continue;
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
      throw new Error(`Electrolux official finder failed HTTP ${response.status} for ${url}`);
    }
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function findElectroluxOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  knownOnly = false,
  sitemapUrl = SITEMAP_URL,
  timeoutMs = 30_000
} = {}) {
  if (!fetchImpl) throw new Error('Electrolux official finder requires fetch');
  if (buildLookupCandidates(target).length === 0) {
    throw new Error('Electrolux official finder requires a SKU');
  }

  const knownGuide = knownDimensionGuideForTarget(target);
  if (knownOnly && knownGuide) return knownGuide;
  if (knownOnly) {
    throw new Error(`Electrolux known dimension guide not found for ${target.sku || target.model}`);
  }

  const sitemapXml = await fetchText(sitemapUrl, fetchImpl, timeoutMs);
  const productUrls = buildElectroluxProductCandidates(sitemapXml)
    .filter((url) => electroluxProductUrlMatchesTarget(url, target));
  if (productUrls.length === 0) {
    if (knownGuide) return knownGuide;
    throw new Error(`Electrolux product page not found for ${target.sku || target.model}`);
  }

  const errors = [];
  for (const productUrl of productUrls) {
    try {
      const html = await fetchText(productUrl, fetchImpl, timeoutMs);
      const links = extractElectroluxDownloadLinks(html, productUrl);
      const best = links.find((link) => link.type === 'dimension_sheet')
        || links.find((link) => link.type === 'installation_manual')
        || links.find((link) => link.type === 'fact_sheet')
        || links.find((link) => link.type === 'user_manual');
      if (best) {
        return {
          sourceUrl: best.url,
          source: `electrolux-official-${best.type}`,
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

  throw new Error(`Electrolux PDF not found: ${errors.join(' | ')}`);
}

exports.buildElectroluxProductCandidates = buildElectroluxProductCandidates;
exports.extractElectroluxDownloadLinks = extractElectroluxDownloadLinks;
exports.extractElectroluxSkus = extractElectroluxSkus;
exports.findElectroluxOfficialPdf = findElectroluxOfficialPdf;
exports.knownDimensionGuideForTarget = knownDimensionGuideForTarget;
exports.normalizeSku = normalizeSku;
exports.electroluxProductUrlMatchesTarget = electroluxProductUrlMatchesTarget;
