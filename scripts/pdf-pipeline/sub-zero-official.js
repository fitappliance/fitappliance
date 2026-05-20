const {
  subZeroModelMatchesSku
} = require('./parsers/sub-zero');

const SKU_LIST_URL = 'https://au.subzero-wolf.com/api/ProductSpecifications/GetSKUList?includeAccessories=False&includeDiscontinued=True&contextLanguage=en-AU';
const BASE_URL = 'https://au.subzero-wolf.com';
const USER_AGENT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function targetSku(target = {}) {
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function absoluteUrl(href, baseUrl = BASE_URL) {
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
      throw new Error(`Sub-Zero official finder failed HTTP ${response.status} for ${url}`);
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
      throw new Error(`Sub-Zero official finder failed HTTP ${response.status} for ${url}`);
    }
    if (typeof response.json === 'function') return response.json();
    return JSON.parse(await response.text());
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyDownload(label, href) {
  const haystack = `${label || ''} ${href || ''}`;
  if (/Quick\s+Reference\s+Guide/i.test(haystack) && /Standard\s+Installation|[-_]st\.pdf/i.test(haystack)) {
    return { resourceType: 'quick_reference_guide', score: 120 };
  }
  if (/Quick\s+Reference\s+Guide/i.test(haystack) && /Flush\s+Inset|[-_]fl\.pdf/i.test(haystack)) {
    return { resourceType: 'quick_reference_guide', score: 110 };
  }
  if (/Quick\s+Reference\s+Guide/i.test(haystack)) {
    return { resourceType: 'quick_reference_guide', score: 100 };
  }
  if (/Design\s+Guide/i.test(haystack)) {
    return { resourceType: 'design_guide', score: 40 };
  }
  if (/Use\s+and\s+Care|Owner|Manual/i.test(haystack)) {
    return { resourceType: 'user_manual', score: 10 };
  }
  return { resourceType: 'pdf', score: 1 };
}

function extractSubZeroDownloadLinks(html, pageUrl = BASE_URL) {
  const links = [];
  for (const match of String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1];
    const label = stripHtml(match[2]);
    if (!/\.pdf(?:$|[?#])|PDF|Guide/i.test(`${href} ${label}`)) continue;
    const classified = classifyDownload(label, href);
    links.push({
      url: absoluteUrl(href, pageUrl),
      sourceUrl: absoluteUrl(href, pageUrl),
      label,
      source: `sub-zero-official-${classified.resourceType}`,
      ...classified
    });
  }
  return [...new Map(links.map((link) => [link.url, link])).values()]
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}

function subZeroProductRowMatchesTarget(row = {}, target = {}) {
  const sku = targetSku(target);
  if (!sku) return false;
  return subZeroModelMatchesSku(row.ModelNumber, sku);
}

function productDetailUrlFromRow(row = {}) {
  const name = String(row.Name || '').trim();
  if (!name) return '';
  return absoluteUrl(`/en/trade-resources/product-specifications/product-specifications-detail/${encodeURIComponent(name)}`);
}

function compactSku(value) {
  return normalizeSku(value);
}

function buildLegacyProductDetailCandidates(target = {}) {
  const sku = compactSku(targetSku(target));
  const candidates = [];
  const builtInMatch = sku.match(/^ICBBI(\d{2})(.+)$/);
  if (!builtInMatch) return candidates;

  const inch = builtInMatch[1];
  const rest = builtInMatch[2];
  const base = '/en/trade-resources/product-specifications/product-specifications-detail/';
  const push = (slug) => candidates.push(absoluteUrl(`${base}${slug}`));

  if (/^FO/.test(rest)) push(`icb${inch}-inch-built-in-freezer-panel-ready`);
  if (/^RO/.test(rest)) push(`icb${inch}-inch-built-in-refrigerator-panel-ready`);
  if (/^RS/.test(rest)) push(`icb${inch}-inch-built-in-refrigerator`);
  if (/^SO/.test(rest)) {
    push(`icb${inch}-inch-built-in-side-by-side-refrigerator-freezer-panel-ready`);
    push(`icb${inch}-inch-built-in-side-by-side-refrigerator-freezer-panel-ready-legacy`);
  }
  if (/^SS/.test(rest)) push(`icb${inch}-inch-built-in-side-by-side-refrigerator-freezer`);
  if (/^SDO/.test(rest)) push(`icb${inch}-inch-built-in-side-by-side-refrigerator-freezer-dispenser-panel-ready`);
  if (/^SDS/.test(rest)) push(`icb${inch}-inch-built-in-side-by-side-refrigerator-freezer-dispenser-new`);
  if (/^SIDO/.test(rest)) push(`icb${inch}-inch-built-in-side-by-side-refrigerator-freezer-internal-dispenser-panel-ready`);
  if (/^SIDS/.test(rest)) push(`icb${inch}-inch-built-in-side-by-side-refrigerator-freezer-internal-dispenser`);
  if (/^UFDIDO/.test(rest)) push(`icb${inch}-inch-built-in-french-door-refrigerator-freezer-dispenser-panel-ready`);
  if (/^UFDIDS/.test(rest)) push(`icb${inch}-inch-built-in-french-door-refrigerator-freezer-dispenser-legacy`);
  if (/^UIDO/.test(rest)) push(`icb${inch}-inch-built-in-over-under-refrigerator-freezer-dispenser-panel-ready`);
  if (/^UIDS/.test(rest)) push(`icb${inch}-inch-built-in-over-under-refrigerator-freezer-dispenser-legacy`);

  return [...new Set(candidates)];
}

function htmlMentionsTargetModel(html, target = {}) {
  const sku = targetSku(target);
  const text = stripHtml(html);
  const modelMatches = [...text.matchAll(/\bModel\s*#?\s*([A-Z0-9][A-Z0-9/\-.]{4,40})(?=\s|$)/gi)]
    .map((match) => match[1].trim());
  return modelMatches.some((model) => subZeroModelMatchesSku(model, sku));
}

async function resourcesFromProductPage(productUrl, target, fetchImpl, timeoutMs) {
  const html = await fetchText(productUrl, fetchImpl, timeoutMs);
  if (!htmlMentionsTargetModel(html, target)) {
    throw new Error(`${productUrl}: page model did not match ${targetSku(target)}`);
  }
  const resources = extractSubZeroDownloadLinks(html, productUrl);
  if (resources.length === 0) {
    throw new Error(`${productUrl}: no downloadable PDFs`);
  }
  const qrg = resources.find((resource) => resource.resourceType === 'quick_reference_guide');
  if (!qrg) {
    throw new Error(`${productUrl}: no Quick Reference Guide PDF`);
  }
  return {
    sourceUrl: qrg.sourceUrl,
    source: qrg.source,
    resourceType: qrg.resourceType,
    productUrl,
    label: qrg.label,
    resources
  };
}

async function findSubZeroOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  skuListUrl = SKU_LIST_URL,
  timeoutMs = 30_000
} = {}) {
  if (!fetchImpl) throw new Error('Sub-Zero official finder requires fetch');
  const sku = targetSku(target);
  if (!sku || normalizeSku(sku).length < 6) throw new Error('Sub-Zero official finder requires a SKU');

  const errors = [];
  let rows = [];
  try {
    const payload = await fetchJson(skuListUrl, fetchImpl, timeoutMs);
    rows = Array.isArray(payload) ? payload : [];
  } catch (error) {
    errors.push(`sku-list: ${error.message}`);
  }

  const productUrls = rows
    .filter((row) => subZeroProductRowMatchesTarget(row, target))
    .map(productDetailUrlFromRow)
    .filter(Boolean);

  for (const url of [...productUrls, ...buildLegacyProductDetailCandidates(target)]) {
    try {
      return await resourcesFromProductPage(url, target, fetchImpl, timeoutMs);
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error(`Sub-Zero official PDF resources not found for ${sku}: ${errors.join(' | ')}`);
}

exports.SKU_LIST_URL = SKU_LIST_URL;
exports.buildLegacyProductDetailCandidates = buildLegacyProductDetailCandidates;
exports.extractSubZeroDownloadLinks = extractSubZeroDownloadLinks;
exports.findSubZeroOfficialPdf = findSubZeroOfficialPdf;
exports.subZeroProductRowMatchesTarget = subZeroProductRowMatchesTarget;
