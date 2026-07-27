const { createHash } = require('node:crypto');

const CHIQ_CDN_BASE_URL = 'https://chiq.com.au/cdn/shop/files';
const CHIQ_SITE_BASE_URL = 'https://www.chiq.com.au';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAXIMUM_BYTES = 8 * 1024 * 1024;
const DEFAULT_USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';

function normalizeSku(value, { keepWildcard = false } = {}) {
  const allowed = keepWildcard ? /[^A-Z0-9*]+/g : /[^A-Z0-9]+/g;
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(allowed, '');
}

function collectLookupSkus(target = {}) {
  const values = [
    target.sku,
    target.model,
    target.product?.model,
    target.product?.sku
  ].filter(Boolean);

  const candidates = [];
  for (const value of values) {
    const raw = String(value || '').trim().toUpperCase();
    if (raw.includes('*')) continue;
    const normalized = normalizeSku(raw);
    if (normalized && /^[A-Z0-9.-]+$/.test(raw)) candidates.push(normalized);

    const tokenMatches = raw.match(/\b[A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*\b/g) || [];
    for (const token of tokenMatches) {
      const cleanToken = normalizeSku(token);
      if (cleanToken.length >= 4 && !cleanToken.includes('*')) candidates.push(cleanToken);
    }
  }

  return [...new Set(candidates.filter((sku) => sku.length >= 4))];
}

function buildChiqSpecUrls(sku) {
  const code = normalizeSku(sku);
  if (!code) return [];
  return [
    `${CHIQ_CDN_BASE_URL}/${encodeURIComponent(`${code}_SPEC.pdf`)}`,
    `${CHIQ_CDN_BASE_URL}/${encodeURIComponent(`${code}_Spec.pdf`)}`,
    `${CHIQ_CDN_BASE_URL}/${encodeURIComponent(`${code}_spec.pdf`)}`,
    `${CHIQ_CDN_BASE_URL}/${encodeURIComponent(`${code}_Specifications_Sheet.pdf`)}`,
    `${CHIQ_CDN_BASE_URL}/${encodeURIComponent(`${code}_specifications_sheet.pdf`)}`
  ];
}

function buildChiqSearchUrl(sku) {
  const url = new URL('/search/suggest.json', CHIQ_SITE_BASE_URL);
  url.searchParams.set('q', normalizeSku(sku));
  url.searchParams.set('resources[type]', 'product');
  url.searchParams.set('resources[limit]', '10');
  return url.toString();
}

function isOfficialChiqUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && ['chiq.com.au', 'www.chiq.com.au'].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function absoluteChiqUrl(value, baseUrl = CHIQ_SITE_BASE_URL) {
  try {
    const url = new URL(String(value || '').trim().replace(/&amp;/g, '&'), baseUrl);
    if (!isOfficialChiqUrl(url)) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function productHandleMatchesSku(handle, sku) {
  const target = normalizeSku(sku);
  if (!target) return false;
  const raw = decodeURIComponent(String(handle || '')).replace(/\/+$/, '');
  const finalPathToken = raw.split('/').filter(Boolean).at(-1) || '';
  const finalHandleToken = finalPathToken.split('-').filter(Boolean).at(-1) || '';
  return normalizeSku(finalHandleToken) === target;
}

function productPageUrlForResult(result, sku) {
  const handle = String(result?.handle || '').trim();
  const rawUrl = String(result?.url || '').trim();
  const candidateHandle = handle || rawUrl.split(/[/?#]/).filter(Boolean).at(-1) || '';
  if (!productHandleMatchesSku(candidateHandle, sku)) return null;
  const url = absoluteChiqUrl(rawUrl || `/products/${handle}`);
  if (!url) return null;
  const parsed = new URL(url);
  if (!/^\/products\/[^/]+\/?$/i.test(parsed.pathname)
    || !productHandleMatchesSku(parsed.pathname, sku)) return null;
  parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/$/, '');
  return parsed.toString();
}

function exactModelMention(text, sku) {
  const model = String(sku || '').trim();
  if (!model) return false;
  const escaped = model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, 'i').test(String(text || ''));
}

function canonicalProductUrl(html, expectedUrl, sku) {
  const rawCanonical = String(html || '').match(
    /<link\b[^>]*\brel=["'][^"']*canonical[^"']*["'][^>]*\bhref=["']([^"']+)["'][^>]*>|<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["'][^"']*canonical[^"']*["'][^>]*>/i,
  );
  const canonical = absoluteChiqUrl(rawCanonical?.[1] || rawCanonical?.[2]);
  if (!canonical || !productHandleMatchesSku(new URL(canonical).pathname, sku)) return null;
  const expected = new URL(expectedUrl);
  const actual = new URL(canonical);
  if (actual.pathname.replace(/\/$/, '') !== expected.pathname.replace(/\/$/, '')) return null;
  actual.search = '';
  actual.pathname = actual.pathname.replace(/\/$/, '');
  return actual.toString();
}

function exactProductJson(payload, handle, sku) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (String(payload.handle || '') !== handle || !productHandleMatchesSku(payload.handle, sku)) return false;
  const variants = Array.isArray(payload.variants) ? payload.variants : [];
  return variants.some((variant) => normalizeSku(variant?.sku) === normalizeSku(sku));
}

function exactSpecificationModel(url, sku) {
  let filename;
  try {
    filename = decodeURIComponent(new URL(url).pathname.split('/').at(-1) || '');
  } catch {
    return false;
  }
  const stem = filename.replace(/\.pdf$/i, '');
  const marker = stem.match(/^(.+?)[_-](?:SPEC(?:IFICATION|IFICATIONS)?)(?:[_-]|$)/i);
  return Boolean(marker && normalizeSku(marker[1]) === normalizeSku(sku));
}

function extractExactSpecificationUrls(html, pageUrl, sku) {
  const urls = [];
  const anchorPattern = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || '').matchAll(anchorPattern)) {
    const rawHref = match[1]?.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const url = absoluteChiqUrl(rawHref, pageUrl);
    if (!url || !/\.pdf(?:$|[?#])/i.test(url)) continue;
    const label = `${match[1]?.match(/\baria-label=["']([^"']+)["']/i)?.[1] || ''} ${match[2].replace(/<[^>]+>/g, ' ')}`;
    if (!/\bspec(?:ification|ifications)?\b/i.test(`${label} ${url}`)) continue;
    if (!exactSpecificationModel(url, sku)) continue;
    urls.push(url);
  }
  return [...new Set(urls)];
}

function isPdfLikeResponse(response, url) {
  if (!response?.ok) return false;
  const type = String(response.headers?.get?.('content-type') || '').toLowerCase();
  return type.includes('pdf') || /\.pdf(?:$|\?)/i.test(String(url || ''));
}

async function probePdfUrl(url, fetchImpl) {
  try {
    const head = await fetchImpl(url, {
      method: 'HEAD',
      headers: {
        Accept: 'application/pdf',
        'User-Agent': DEFAULT_USER_AGENT
      }
    });
    if (isPdfLikeResponse(head, url)) return true;
    if (head?.ok) return false;
  } catch {
    // Some CDNs do not support HEAD consistently; fall through to a tiny GET.
  }

  try {
    const get = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/pdf',
        Range: 'bytes=0-5',
        'User-Agent': DEFAULT_USER_AGENT
      }
    });
    return isPdfLikeResponse(get, url);
  } catch {
    return false;
  }
}

async function fetchBoundedText(url, {
  fetchImpl,
  timeoutMs,
  maximumBytes,
  accept,
}) {
  if (!isOfficialChiqUrl(url)) throw new Error('CHIQ discovery escaped the official host');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: accept, 'User-Agent': DEFAULT_USER_AGENT },
      signal: controller.signal,
    });
    if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'unknown'}`);
    if (response.url && !isOfficialChiqUrl(response.url)) {
      throw new Error('CHIQ discovery redirect escaped the official host');
    }
    const text = await response.text();
    if (!text || Buffer.byteLength(text) > maximumBytes) {
      throw new Error('CHIQ discovery response size outside limits');
    }
    return text;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`timeout after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function persistDiscoverySource(text, {
  sourceUrl,
  requestedModel,
  method,
  contentType,
  writeObject,
}) {
  const bytes = Buffer.from(String(text || ''), 'utf8');
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const extension = contentType === 'application/json' ? 'json' : 'html';
  const objectPath = `evidence/web/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.${extension}`;
  await writeObject(objectPath, bytes);
  return {
    schemaVersion: 1,
    method,
    market: 'AU',
    discoveryUrl: sourceUrl,
    requestedModel,
    contentType,
    contentSha256,
    objectPath,
    byteSize: bytes.length,
  };
}

function candidateDiscoveryProvenance(pageProvenance, artifactUrl, matchedModel) {
  return {
    schemaVersion: 1,
    method: 'official_product_page',
    market: 'AU',
    discoveryUrl: pageProvenance.discoveryUrl,
    requestedModel: pageProvenance.requestedModel,
    matchedModel,
    artifactUrl,
    artifactLinkUrl: artifactUrl,
    discoveryContentSha256: pageProvenance.contentSha256,
    discoveryObjectPath: pageProvenance.objectPath,
    discoveryByteSize: pageProvenance.byteSize,
  };
}

function sourceLane(laneId, required, supported, status, provenance, reason = null) {
  return {
    laneId,
    required,
    supported,
    status,
    candidateCount: 0,
    provenance,
    reason,
  };
}

function chiqSourceLanes({ search, productJson, productPage, specificationCount, errors }) {
  const searchComplete = Boolean(search?.valid);
  const productComplete = Boolean(productJson?.valid && productPage?.valid);
  const detailComplete = Boolean(productPage?.valid);
  const documentComplete = detailComplete && specificationCount > 0;
  const reason = (fallback) => errors.at(-1) || fallback;
  return [
    sourceLane(
      'current_product', true, true,
      productComplete ? 'complete' : 'retryable',
      productComplete ? [productJson.provenance, productPage.provenance] : [],
      productComplete ? null : reason('Exact Shopify product identity was not completed.'),
    ),
    sourceLane(
      'discontinued_archive', false, false, 'unsupported', [],
      'The bounded CHIQ resolver does not enumerate a discontinued archive.',
    ),
    sourceLane(
      'support_search_api', true, true,
      searchComplete ? 'complete' : 'retryable',
      search?.provenance ? [search.provenance] : [],
      searchComplete ? null : reason('Official Shopify product search was not completed.'),
    ),
    sourceLane(
      'official_document_cdn', true, true,
      documentComplete ? 'complete' : 'retryable',
      documentComplete ? [productPage.provenance] : [],
      documentComplete ? null : reason('No exact-model specification PDF was linked from the product page.'),
    ),
    sourceLane(
      'official_product_detail', true, true,
      detailComplete ? 'complete' : 'retryable',
      detailComplete ? [productPage.provenance] : [],
      detailComplete ? null : reason('Exact CHIQ product page was not completed.'),
    ),
  ];
}

async function findChiqViaShopify(target, {
  fetchImpl,
  writeObject,
  timeoutMs,
  maximumBytes,
}) {
  const lookupSkus = collectLookupSkus(target);
  if (lookupSkus.length !== 1) {
    throw new Error('CHIQ typed discovery requires one concrete exact SKU');
  }
  const sku = lookupSkus[0];
  const errors = [];
  let search = null;
  let productJson = null;
  let productPage = null;
  let productUrl = null;
  let specificationUrls = [];

  const searchUrl = buildChiqSearchUrl(sku);
  try {
    const searchText = await fetchBoundedText(searchUrl, {
      fetchImpl, timeoutMs, maximumBytes, accept: 'application/json',
    });
    const searchProvenance = await persistDiscoverySource(searchText, {
      sourceUrl: searchUrl,
      requestedModel: sku,
      method: 'official_shopify_product_search',
      contentType: 'application/json',
      writeObject,
    });
    let payload;
    try {
      payload = JSON.parse(searchText);
    } catch {
      throw new Error('CHIQ Shopify search returned invalid JSON');
    }
    const products = payload?.resources?.results?.products;
    if (!Array.isArray(products)) throw new Error('CHIQ Shopify search response schema invalid');
    const exactProductUrls = [...new Set(products
      .map((result) => productPageUrlForResult(result, sku))
      .filter(Boolean))];
    search = { provenance: searchProvenance, valid: true };
    if (exactProductUrls.length !== 1) {
      throw new Error(exactProductUrls.length
        ? 'CHIQ Shopify search returned ambiguous exact products'
        : 'CHIQ Shopify search returned no exact product');
    }
    productUrl = exactProductUrls[0];

    const handle = new URL(productUrl).pathname.split('/').filter(Boolean).at(-1);
    const productJsonUrl = `${productUrl}.js`;
    const productJsonText = await fetchBoundedText(productJsonUrl, {
      fetchImpl, timeoutMs, maximumBytes, accept: 'application/json',
    });
    const productJsonProvenance = await persistDiscoverySource(productJsonText, {
      sourceUrl: productJsonUrl,
      requestedModel: sku,
      method: 'official_shopify_product_json',
      contentType: 'application/json',
      writeObject,
    });
    let productPayload;
    try {
      productPayload = JSON.parse(productJsonText);
    } catch {
      throw new Error('CHIQ Shopify product endpoint returned invalid JSON');
    }
    if (!exactProductJson(productPayload, handle, sku)) {
      throw new Error('CHIQ Shopify product endpoint did not bind the exact variant SKU');
    }
    productJson = { provenance: productJsonProvenance, valid: true };

    const productHtml = await fetchBoundedText(productUrl, {
      fetchImpl, timeoutMs, maximumBytes, accept: 'text/html,application/xhtml+xml',
    });
    const productPageProvenance = await persistDiscoverySource(productHtml, {
      sourceUrl: productUrl,
      requestedModel: sku,
      method: 'official_product_page',
      contentType: 'text/html',
      writeObject,
    });
    const canonical = canonicalProductUrl(productHtml, productUrl, sku);
    if (!canonical || !exactModelMention(productHtml, sku)) {
      throw new Error('CHIQ product page did not preserve exact canonical model identity');
    }
    productUrl = canonical;
    specificationUrls = extractExactSpecificationUrls(productHtml, productUrl, sku);
    productPage = { provenance: productPageProvenance, valid: true };
  } catch (error) {
    errors.push(error.message);
  }

  const sourceLanes = chiqSourceLanes({
    search,
    productJson,
    productPage,
    specificationCount: specificationUrls.length,
    errors,
  });
  if (!productPage?.valid || !specificationUrls.length) {
    return {
      sourceUrl: null,
      source: 'chiq-official-no-exact-specification',
      resourceType: 'product_page',
      productCode: sku,
      productUrl,
      resources: [],
      sourceLanes,
      reason: errors.at(-1) || 'Exact-model specification PDF was not found.',
    };
  }

  const pageDiscovery = candidateDiscoveryProvenance(
    productPage.provenance,
    productUrl,
    sku,
  );
  const resources = [{
    url: productUrl,
    sourceUrl: productUrl,
    source: 'chiq-official-product_page',
    resourceType: 'product_page',
    sourceLaneId: 'official_product_detail',
    sourceModelHint: sku,
    requiredAttempt: false,
    discoveryProvenance: pageDiscovery,
  }, ...specificationUrls.map((url) => ({
    url,
    sourceUrl: url,
    source: 'chiq-official-specification_sheet',
    resourceType: 'specification_sheet',
    sourceLaneId: 'official_document_cdn',
    sourceModelHint: sku,
    requiredAttempt: true,
    discoveryProvenance: candidateDiscoveryProvenance(productPage.provenance, url, sku),
  }))];

  return {
    sourceUrl: specificationUrls[0],
    source: 'chiq-official-specification_sheet',
    resourceType: 'specification_sheet',
    productCode: sku,
    productUrl,
    resources,
    sourceLanes,
    discoveryProvenance: resources[1].discoveryProvenance,
  };
}

async function findChiqOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  writeObject = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maximumBytes = DEFAULT_MAXIMUM_BYTES,
} = {}) {
  if (!fetchImpl) throw new Error('CHIQ official finder requires fetch');
  if (typeof writeObject === 'function') {
    return findChiqViaShopify(target, {
      fetchImpl, writeObject, timeoutMs, maximumBytes,
    });
  }

  const lookupSkus = collectLookupSkus(target);
  if (!lookupSkus.length) throw new Error('CHIQ official finder requires a concrete SKU');

  const attempted = [];
  for (const sku of lookupSkus) {
    for (const url of buildChiqSpecUrls(sku)) {
      attempted.push(url);
      if (await probePdfUrl(url, fetchImpl)) {
        return {
          sourceUrl: url,
          source: 'chiq-official-spec_sheet',
          resourceType: 'spec_sheet',
          productCode: sku
        };
      }
    }
  }

  throw new Error(`CHIQ official spec sheet not found: ${attempted.join(' | ')}`);
}

exports.buildChiqSearchUrl = buildChiqSearchUrl;
exports.buildChiqSpecUrls = buildChiqSpecUrls;
exports.collectLookupSkus = collectLookupSkus;
exports.extractExactSpecificationUrls = extractExactSpecificationUrls;
exports.findChiqOfficialPdf = findChiqOfficialPdf;
exports.normalizeSku = normalizeSku;
exports.productHandleMatchesSku = productHandleMatchesSku;
