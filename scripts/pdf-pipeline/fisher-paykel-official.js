require('dotenv').config({ quiet: true });

const FP_BASE_URL = 'https://www.fisherpaykel.com';
const DEFAULT_USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';
const DEFAULT_TIMEOUT_MS = 60_000;

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
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

function absoluteFisherPaykelUrl(url) {
  return new URL(decodeHtml(url).replace(/\\\//g, '/'), FP_BASE_URL).toString();
}

async function fetchHtml(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT
} = {}) {
  if (!fetchImpl) throw new Error('Fisher & Paykel official finder requires fetch');
  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    const response = await fetchImpl(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml'
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Fisher & Paykel fetch failed with HTTP ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Fisher & Paykel fetch timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function extractProductPageUrls(searchHtml, sku) {
  const targetSku = normalizeSku(sku);
  if (!targetSku) return [];
  const urls = new Set();
  const hrefPattern = /href=["']([^"']+\.html[^"']*)["'][^>]*class=["'][^"']*\bpdp\b[^"']*["']|class=["'][^"']*\bpdp\b[^"']*["'][^>]*href=["']([^"']+\.html[^"']*)["']/gi;
  let match;
  while ((match = hrefPattern.exec(String(searchHtml || '')))) {
    const rawUrl = match[1] || match[2];
    if (!rawUrl) continue;
    const normalizedUrl = normalizeSku(rawUrl);
    if (normalizedUrl.includes(targetSku)) {
      urls.add(absoluteFisherPaykelUrl(rawUrl));
    }
  }

  const genericHrefPattern = /href=["']([^"']+\.html[^"']*)["']/gi;
  while ((match = genericHrefPattern.exec(String(searchHtml || '')))) {
    const rawUrl = match[1];
    if (!rawUrl) continue;
    const normalizedUrl = normalizeSku(rawUrl);
    if (normalizedUrl.includes(targetSku)) {
      urls.add(absoluteFisherPaykelUrl(rawUrl));
    }
  }

  return [...urls];
}

function buildFisherPaykelSkuSearchVariants(sku) {
  const exact = normalizeSku(sku);
  if (!exact) return [];
  const variants = new Set([exact]);

  // Older F&P feeds can omit the product revision digit from the public model
  // page/PDF (for example E450LXFD -> E450LXFD1). Try this before broader
  // suffix stripping so we stay specific and avoid unrelated family matches.
  if (!/\d$/.test(exact) && exact.length >= 5 && /\d/.test(exact)) {
    variants.add(`${exact}1`);
  }

  // F&P retailer feeds sometimes append finish/channel suffixes (for example
  // RF610ADUQSX4). Strip only long suffixes from a model that already has a
  // clear alpha+numeric base; never fall back to very broad searches.
  const knownSuffixMatch = exact.match(/^(.*?)(?:QSX\d+|SX\d+|XFD|WFD|BFD)$/);
  if (knownSuffixMatch) {
    const base = knownSuffixMatch[1];
    if (base.length >= 5 && /\d/.test(base)) {
      variants.add(base);
    }
  }

  return [...variants];
}

function classifyResource(context, url) {
  const urlText = String(url || '');
  if (/\/QRG\/|QRG[-_]?AU/i.test(urlText)) return 'quick_reference_guide';
  if (/EnergyLabel|Energy\s*Label/i.test(urlText)) return 'energy_label';
  if (/Install(?:ation)?|Install[-_ ]?Guide/i.test(urlText)) return 'installation_manual';
  if (/UserGuide|User[-_]?Manual/i.test(urlText)) return 'user_manual';

  const haystack = `${context || ''} ${urlText}`;
  if (/QRG|Quick\s+Reference/i.test(haystack)) return 'quick_reference_guide';
  if (/Specification|Spec\s+Sheet|Data\s*Sheet/i.test(haystack)) return 'specification_sheet';
  if (/Install|Installation/i.test(haystack)) return 'installation_manual';
  if (/User\s+Guide|UserGuide|User\s+Manual/i.test(haystack)) return 'user_manual';
  if (/EnergyLabel|Energy\s+Label/i.test(haystack)) return 'energy_label';
  return 'pdf';
}

function scoreResource(resource) {
  return {
    quick_reference_guide: 100,
    specification_sheet: 90,
    installation_manual: 70,
    user_manual: 20,
    pdf: 10,
    energy_label: -20
  }[resource.type] ?? 0;
}

function extractPdfResources(productHtml) {
  const resources = [];
  const html = String(productHtml || '');
  const pdfPattern = /\b(?:href|data-url)=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi;
  let match;
  while ((match = pdfPattern.exec(html))) {
    const rawUrl = match[1];
    const anchorEnd = html.indexOf('</a>', match.index);
    const contextEnd = anchorEnd >= 0 ? anchorEnd + 4 : match.index + 220;
    const context = html.slice(Math.max(0, match.index - 120), Math.min(html.length, contextEnd));
    const url = absoluteFisherPaykelUrl(rawUrl);
    const type = classifyResource(context, url);
    resources.push({
      url,
      type,
      score: scoreResource({ type })
    });
  }

  const statePdfPattern = /(https?:\\?\/\\?\/[^"'<>\s]+?\.pdf(?:\?[^"'<>\s]*)?)/gi;
  while ((match = statePdfPattern.exec(html))) {
    const rawUrl = match[1];
    const context = html.slice(Math.max(0, match.index - 180), Math.min(html.length, match.index + rawUrl.length + 180));
    const url = absoluteFisherPaykelUrl(rawUrl);
    const type = classifyResource(context, url);
    resources.push({
      url,
      type,
      score: scoreResource({ type })
    });
  }

  const deduped = new Map();
  for (const resource of resources) {
    const existing = deduped.get(resource.url);
    if (!existing || resource.score > existing.score) {
      deduped.set(resource.url, resource);
    }
  }

  return [...deduped.values()].sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}

async function findFisherPaykelProductPage(sku, opts = {}) {
  const variants = buildFisherPaykelSkuSearchVariants(sku);
  let lastSearch = { productPageUrl: null, searchUrl: '', searchHtml: '', matchedSku: variants[0] || normalizeSku(sku) };

  for (const variant of variants) {
    const url = `${FP_BASE_URL}/au/search/?q=${encodeURIComponent(variant)}`;
    const html = await fetchHtml(url, opts);
    const productPageUrl = extractProductPageUrls(html, variant)[0] || null;
    lastSearch = { productPageUrl, searchUrl: url, searchHtml: html, matchedSku: variant };
    if (productPageUrl) return lastSearch;
  }

  return lastSearch;
}

async function findFisherPaykelOfficialPdf(target, opts = {}) {
  const sku = target?.sku || target?.model || target?.product?.model || target?.product?.sku;
  if (!sku) throw new Error('Fisher & Paykel official finder requires sku/model');
  const { productPageUrl, searchUrl, matchedSku } = await findFisherPaykelProductPage(sku, opts);
  if (!productPageUrl) {
    return {
      sku,
      searchUrl,
      productPageUrl: null,
      sourceUrl: null,
      source: 'fisher-paykel-official',
      matchedSku,
      reason: 'product_page_not_found'
    };
  }

  const productHtml = await fetchHtml(productPageUrl, opts);
  const resources = extractPdfResources(productHtml);
  const best = resources.find((resource) => resource.score > 0) || null;
  if (!best) {
    return {
      sku,
      searchUrl,
      productPageUrl,
      sourceUrl: null,
      source: 'fisher-paykel-official',
      resources,
      reason: 'pdf_resource_not_found'
    };
  }

  return {
    sku,
    matchedSku,
    searchUrl,
    productPageUrl,
    sourceUrl: best.url,
    source: `fisher-paykel-official-${best.type}`,
    resourceType: best.type,
    resources
  };
}

exports.extractProductPageUrls = extractProductPageUrls;
exports.extractPdfResources = extractPdfResources;
exports.buildFisherPaykelSkuSearchVariants = buildFisherPaykelSkuSearchVariants;
exports.findFisherPaykelOfficialPdf = findFisherPaykelOfficialPdf;
exports.findFisherPaykelProductPage = findFisherPaykelProductPage;
exports.normalizeSku = normalizeSku;
