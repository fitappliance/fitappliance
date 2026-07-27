const { createHash } = require('node:crypto');

const OCC_BASE_URL = 'https://dtc-aus-api.hisense.com/occ/v2/au';
const ASSET_BASE_URL = 'https://dtc-aus-api.hisense.com';
const SITE_BASE_URL = 'https://hisense.com.au';
const SITEMAP_INDEX_URL = `${SITE_BASE_URL}/sitemap.xml`;
const DEFAULT_FIELDS = 'FULL';
const MAX_DISCOVERY_BYTES = 8 * 1024 * 1024;

const HISENSE_SOURCE_LANES = Object.freeze([
  Object.freeze({ laneId: 'current_product', required: true, supported: true }),
  Object.freeze({ laneId: 'discontinued_archive', required: false, supported: false }),
  Object.freeze({ laneId: 'support_search_api', required: true, supported: true }),
  Object.freeze({ laneId: 'official_document_cdn', required: true, supported: true }),
  Object.freeze({ laneId: 'official_product_detail', required: true, supported: true }),
]);

function normalizeSku(value, { keepWildcard = false } = {}) {
  const allowed = keepWildcard ? /[^A-Z0-9*]+/g : /[^A-Z0-9]+/g;
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(allowed, '');
}

function wildcardMatches(pattern, value) {
  const source = normalizeSku(pattern, { keepWildcard: true });
  const target = normalizeSku(value);
  if (!source || !target || !source.includes('*')) return false;
  if (source.replace(/\*/g, '').length < 5) return false;
  const regex = new RegExp(`^${source.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return regex.test(target);
}

function hisenseProductCodeMatchesSku(productCode, sku) {
  const code = normalizeSku(productCode);
  const target = normalizeSku(sku, { keepWildcard: true });
  if (!code || !target) return false;
  if (code === normalizeSku(target)) return true;
  if (target.includes('*')) return wildcardMatches(target, code);
  if (code.includes('*')) return wildcardMatches(code, target);
  return false;
}

function buildHisenseOccProductUrl(sku, { fields = DEFAULT_FIELDS } = {}) {
  const code = encodeURIComponent(String(sku || '').trim().toUpperCase());
  const params = new URLSearchParams({
    fields,
    lang: 'en',
    curr: 'AUD'
  });
  return `${OCC_BASE_URL}/products/${code}?${params}`;
}

function buildHisenseOccSearchUrl(query) {
  const params = new URLSearchParams({
    query: String(query || '').trim(),
    fields: 'products(code,name,url,specificationDoc,productManual),pagination',
    lang: 'en',
    curr: 'AUD'
  });
  return `${OCC_BASE_URL}/products/search?${params}`;
}

function resolveHisenseAssetUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${ASSET_BASE_URL}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

function resolveHisenseProductPageUrl(url) {
  const page = new URL(String(url || '').trim(), SITE_BASE_URL);
  page.hash = '';
  page.pathname = page.pathname.replace(/-+\/?$/, '');
  return page.toString();
}

function scoreResource(resource = {}) {
  const haystack = `${resource.name || ''} ${resource.url || ''}`;
  let score = 0;
  if (/spec|specification/i.test(haystack)) score += 100;
  if (/manual|user/i.test(haystack)) score += 25;
  if (/\.pdf(?:$|\?)/i.test(haystack)) score += 5;
  return score;
}

function selectHisensePdfResource(product = {}) {
  const candidates = [
    product.specificationDoc ? {
      ...product.specificationDoc,
      type: 'specification_doc'
    } : null,
    product.productManual ? {
      ...product.productManual,
      type: 'product_manual'
    } : null
  ].filter((resource) => resource?.url);

  return candidates
    .map((resource, index) => ({
      type: resource.type,
      url: resolveHisenseAssetUrl(resource.url),
      name: resource.name || '',
      score: scoreResource(resource),
      index
    }))
    .filter((resource) => /\.pdf(?:$|\?)/i.test(resource.url) || /\.pdf$/i.test(resource.name))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0] || null;
}

function extractXmlLocs(xml) {
  return [...String(xml || '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => match[1]
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim())
    .filter(Boolean);
}

function hisenseProductUrlMatchesSku(url, sku) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.hostname.toLowerCase() !== 'hisense.com.au') return false;
  const match = parsed.pathname.match(/^\/product\/([^/]+)(?:\/|$)/i);
  return Boolean(match && normalizeSku(decodeURIComponent(match[1])) === normalizeSku(sku));
}

function sourceLane(laneId, status, provenance = [], candidateCount = 0, reason = null) {
  const descriptor = HISENSE_SOURCE_LANES.find((lane) => lane.laneId === laneId);
  if (!descriptor) throw new Error(`Unknown Hisense source lane: ${laneId}`);
  return { ...descriptor, status, candidateCount, provenance, reason };
}

function unsupportedLane(laneId, reason) {
  return sourceLane(laneId, 'unsupported', [], 0, reason);
}

function uniqueProvenance(values) {
  const seen = new Set();
  return values.filter(Boolean).filter((value) => {
    const key = `${value.method}\0${value.discoveryUrl}\0${value.contentSha256}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function persistDiscoveryPayload({
  bytes,
  contentType,
  extension,
  discoveryUrl,
  requestedModel,
  method,
  writeObject,
}) {
  if (typeof writeObject !== 'function') return null;
  const payload = Buffer.from(bytes ?? []);
  if (!payload.length || payload.length > MAX_DISCOVERY_BYTES) {
    throw new Error(`Hisense discovery payload size outside limits: ${discoveryUrl}`);
  }
  const contentSha256 = createHash('sha256').update(payload).digest('hex');
  const objectPath = `evidence/web/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.${extension}`;
  await writeObject(objectPath, payload);
  return {
    schemaVersion: 1,
    method,
    market: 'AU',
    discoveryUrl,
    requestedModel: normalizeSku(requestedModel),
    contentType,
    contentSha256,
    objectPath,
    byteSize: payload.length,
  };
}

async function readResponseBytes(response) {
  if (typeof response.arrayBuffer === 'function') {
    return Buffer.from(await response.arrayBuffer());
  }
  if (typeof response.text === 'function') {
    return Buffer.from(await response.text(), 'utf8');
  }
  if (typeof response.json === 'function') {
    return Buffer.from(JSON.stringify(await response.json()), 'utf8');
  }
  throw new Error('Hisense response body is unavailable');
}

async function fetchBoundedDocument(url, {
  fetchImpl,
  expectedHost,
  contentType,
  extension,
  requestedModel,
  method,
  writeObject,
}) {
  const requestedUrl = new URL(url);
  if (requestedUrl.protocol !== 'https:' || requestedUrl.hostname.toLowerCase() !== expectedHost) {
    throw new Error(`Hisense discovery escaped ${expectedHost}: ${url}`);
  }
  const response = await fetchImpl(requestedUrl.toString(), {
    headers: {
      Accept: contentType === 'application/json' ? 'application/json' : '*/*',
      'User-Agent': 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)',
    },
  });
  const finalUrl = new URL(response.url || requestedUrl);
  if (finalUrl.protocol !== 'https:' || finalUrl.username || finalUrl.password
    || finalUrl.hostname.toLowerCase() !== expectedHost) {
    throw new Error(`Hisense discovery redirected outside ${expectedHost}: ${url}`);
  }
  const bytes = await readResponseBytes(response);
  if (!bytes.length || bytes.length > MAX_DISCOVERY_BYTES) {
    throw new Error(`Hisense discovery payload size outside limits: ${url}`);
  }
  const provenance = await persistDiscoveryPayload({
    bytes,
    contentType,
    extension,
    discoveryUrl: finalUrl.toString(),
    requestedModel,
    method,
    writeObject,
  });
  return {
    ok: Boolean(response.ok),
    status: Number(response.status),
    finalUrl: finalUrl.toString(),
    bytes,
    provenance,
  };
}

function parseJsonDocument(document, label) {
  try {
    return JSON.parse(document.bytes.toString('utf8'));
  } catch {
    throw new Error(`Hisense ${label} returned invalid JSON`);
  }
}

function candidateProvenance(laneProvenance, {
  requestedModel,
  matchedModel,
  artifactUrl,
  method = laneProvenance?.method,
  artifactLinkUrl = null,
}) {
  if (!laneProvenance) return null;
  const result = {
    schemaVersion: 1,
    method,
    market: 'AU',
    discoveryUrl: laneProvenance.discoveryUrl,
    requestedModel: normalizeSku(requestedModel),
    matchedModel: normalizeSku(matchedModel),
    artifactUrl,
    discoveryContentSha256: laneProvenance.contentSha256,
    discoveryObjectPath: laneProvenance.objectPath,
    discoveryByteSize: laneProvenance.byteSize,
  };
  if (artifactLinkUrl) result.artifactLinkUrl = artifactLinkUrl;
  return result;
}

function resourceDescriptors(product = {}) {
  const definitions = [
    ['specificationDoc', 'specification_doc', 100],
    ['installationGuide', 'installation_guide', 90],
    ['setupGuide', 'setup_guide', 80],
    ['productManual', 'product_manual', 60],
    ['additionalManual', 'additional_manual', 50],
    ['brochure', 'brochure', 20],
  ];
  const resources = [];
  for (const [field, resourceType, score] of definitions) {
    const values = Array.isArray(product[field]) ? product[field] : [product[field]];
    for (const value of values.filter(Boolean)) {
      const entry = typeof value === 'string' ? { url: value } : value;
      if (!entry.url) continue;
      const sourceUrl = resolveHisenseAssetUrl(entry.url);
      if (!/\.pdf(?:$|\?)/i.test(sourceUrl) && !/\.pdf$/i.test(entry.name || '')) continue;
      const parsed = new URL(sourceUrl);
      if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'dtc-aus-api.hisense.com') continue;
      resources.push({ sourceUrl: parsed.toString(), resourceType, score, name: entry.name || '' });
    }
  }
  return resources;
}

function extractPagePdfResources(html, pageUrl) {
  const values = [...String(html || '').matchAll(/(?:href|src)=["']([^"']+?\.pdf(?:\?[^"']*)?)["']/gi)]
    .map((match) => match[1].replace(/&amp;/g, '&'));
  const resources = [];
  for (const value of values) {
    let url;
    try { url = new URL(value, pageUrl); } catch { continue; }
    if (url.protocol !== 'https:' || !['hisense.com.au', 'dtc-aus-api.hisense.com'].includes(url.hostname.toLowerCase())) continue;
    const type = /spec/i.test(url.pathname) ? 'specification_doc'
      : /install/i.test(url.pathname) ? 'installation_guide'
        : 'product_manual';
    resources.push({ sourceUrl: url.toString(), resourceType: type, score: scoreResource({ name: url.pathname }) });
  }
  return resources;
}

function uniqueResources(resources) {
  const seen = new Set();
  return resources
    .sort((left, right) => right.score - left.score || left.sourceUrl.localeCompare(right.sourceUrl))
    .filter((resource) => {
      if (seen.has(resource.sourceUrl)) return false;
      seen.add(resource.sourceUrl);
      return true;
    });
}

async function loadProductSitemap(requestedModel, options) {
  const index = await fetchBoundedDocument(options.sitemapIndexUrl, {
    ...options,
    expectedHost: 'hisense.com.au',
    contentType: 'application/xml',
    extension: 'xml',
    requestedModel,
    method: 'official_sitemap_index',
  });
  if (!index.ok) throw new Error(`Hisense sitemap index failed with HTTP ${index.status}`);
  const sitemapUrls = extractXmlLocs(index.bytes.toString('utf8'))
    .filter((url) => {
      try {
        const parsed = new URL(url);
        return parsed.hostname.toLowerCase() === 'hisense.com.au' && /sitemap-products(?:-|\.)/i.test(parsed.pathname);
      } catch { return false; }
    });
  if (!sitemapUrls.length) throw new Error('Hisense sitemap index has no product sitemap');
  if (sitemapUrls.length > 8) throw new Error('Hisense product sitemap inventory exceeds bounded limit');

  const provenance = [index.provenance];
  const productUrls = [];
  for (const sitemapUrl of sitemapUrls) {
    const sitemap = await fetchBoundedDocument(sitemapUrl, {
      ...options,
      expectedHost: 'hisense.com.au',
      contentType: 'application/xml',
      extension: 'xml',
      requestedModel,
      method: 'official_product_sitemap',
    });
    if (!sitemap.ok) throw new Error(`Hisense product sitemap failed with HTTP ${sitemap.status}`);
    provenance.push(sitemap.provenance);
    productUrls.push(...extractXmlLocs(sitemap.bytes.toString('utf8')));
  }
  return {
    provenance: uniqueProvenance(provenance),
    productUrl: productUrls.find((url) => hisenseProductUrlMatchesSku(url, requestedModel)) || null,
  };
}

async function findHisenseOfficialEvidence(target = {}, {
  fetchImpl = globalThis.fetch,
  writeObject = null,
  sitemapIndexUrl = SITEMAP_INDEX_URL,
} = {}) {
  if (!fetchImpl) throw new Error('Hisense official evidence finder requires fetch');
  const requestedModel = normalizeSku(target.sku || target.model || target.product?.model);
  if (!requestedModel || /[*?]/.test(String(target.sku || target.model || ''))) {
    throw new Error('Hisense official evidence finder requires an exact SKU');
  }

  const errors = { current: [], search: [], documents: [], detail: [] };
  let sitemap = null;
  let direct = null;
  let search = null;
  let exactProduct = null;
  let productRecordProvenance = null;
  let productPage = null;
  let productPageUrl = null;

  try {
    sitemap = await loadProductSitemap(requestedModel, {
      fetchImpl, writeObject, sitemapIndexUrl,
    });
    productPageUrl = sitemap.productUrl;
  } catch (error) {
    errors.current.push(error.message);
    errors.documents.push(error.message);
    errors.detail.push(error.message);
  }

  try {
    direct = await fetchBoundedDocument(buildHisenseOccProductUrl(requestedModel), {
      fetchImpl,
      writeObject,
      expectedHost: 'dtc-aus-api.hisense.com',
      contentType: 'application/json',
      extension: 'json',
      requestedModel,
      method: 'official_market_api',
    });
    const payload = parseJsonDocument(direct, 'direct product endpoint');
    if (direct.ok && payload?.code && !hisenseProductCodeMatchesSku(payload.code, requestedModel)) {
      throw new Error('Hisense direct product endpoint returned a mismatched model');
    }
    if (direct.ok && hisenseProductCodeMatchesSku(payload?.code, requestedModel)) {
      exactProduct = payload;
      productRecordProvenance = direct.provenance;
      if (payload.url) productPageUrl = resolveHisenseProductPageUrl(payload.url);
    }
  } catch (error) {
    errors.current.push(error.message);
    errors.documents.push(error.message);
    errors.detail.push(error.message);
  }

  try {
    search = await fetchBoundedDocument(buildHisenseOccSearchUrl(requestedModel), {
      fetchImpl,
      writeObject,
      expectedHost: 'dtc-aus-api.hisense.com',
      contentType: 'application/json',
      extension: 'json',
      requestedModel,
      method: 'official_market_api',
    });
    if (!search.ok) throw new Error(`Hisense search endpoint failed with HTTP ${search.status}`);
    const payload = parseJsonDocument(search, 'search endpoint');
    const matches = (Array.isArray(payload.products) ? payload.products : [])
      .filter((product) => hisenseProductCodeMatchesSku(product.code, requestedModel));
    const codes = [...new Set(matches.map((product) => normalizeSku(product.code)))];
    if (codes.length > 1 || matches.length > 1) {
      throw new Error(`Hisense search was ambiguous for ${requestedModel}: ${codes.join(', ')}`);
    }
    if (!exactProduct && matches.length === 1) {
      exactProduct = matches[0];
      productRecordProvenance = search.provenance;
      if (exactProduct.url) productPageUrl = resolveHisenseProductPageUrl(exactProduct.url);
    }
  } catch (error) {
    errors.search.push(error.message);
    errors.documents.push(error.message);
    errors.detail.push(error.message);
  }

  if (productPageUrl) {
    try {
      productPage = await fetchBoundedDocument(productPageUrl, {
        fetchImpl,
        writeObject,
        expectedHost: 'hisense.com.au',
        contentType: 'text/html',
        extension: 'html',
        requestedModel,
        method: 'official_product_page',
      });
      if (!productPage.ok || !hisenseProductUrlMatchesSku(productPage.finalUrl, requestedModel)) {
        throw new Error(`Hisense exact product page unavailable for ${requestedModel}`);
      }
    } catch (error) {
      productPage = null;
      errors.documents.push(error.message);
      errors.detail.push(error.message);
    }
  }

  const documentResources = [];
  if (exactProduct && productRecordProvenance) {
    for (const resource of resourceDescriptors(exactProduct)) {
      documentResources.push({
        ...resource,
        url: resource.sourceUrl,
        source: `hisense-official-${resource.resourceType}`,
        sourceLaneId: 'official_document_cdn',
        sourceModelHint: requestedModel,
        requiredAttempt: true,
        discoveryProvenance: candidateProvenance(productRecordProvenance, {
          requestedModel,
          matchedModel: exactProduct.code,
          artifactUrl: resource.sourceUrl,
        }),
      });
    }
  }
  if (productPage?.provenance) {
    for (const resource of extractPagePdfResources(productPage.bytes.toString('utf8'), productPage.finalUrl)) {
      documentResources.push({
        ...resource,
        url: resource.sourceUrl,
        source: `hisense-official-${resource.resourceType}`,
        sourceLaneId: 'official_document_cdn',
        sourceModelHint: requestedModel,
        requiredAttempt: true,
        discoveryProvenance: candidateProvenance(productPage.provenance, {
          requestedModel,
          matchedModel: requestedModel,
          artifactUrl: resource.sourceUrl,
          method: 'official_product_page',
          artifactLinkUrl: resource.sourceUrl,
        }),
      });
    }
  }
  const documents = uniqueResources(documentResources);
  const resources = [...documents];
  if (productPage?.provenance) {
    resources.push({
      url: productPage.finalUrl,
      sourceUrl: productPage.finalUrl,
      source: 'hisense-official-product-page',
      resourceType: 'product_page',
      documentType: 'product_page',
      sourceLaneId: 'official_product_detail',
      sourceModelHint: requestedModel,
      requiredAttempt: false,
      discoveryProvenance: candidateProvenance(productPage.provenance, {
        requestedModel,
        matchedModel: requestedModel,
        artifactUrl: productPage.finalUrl,
        method: 'official_product_page',
        artifactLinkUrl: productPage.finalUrl,
      }),
    });
  }

  const currentProvenance = uniqueProvenance([
    ...(sitemap?.provenance || []),
    direct?.provenance,
  ]);
  const searchProvenance = uniqueProvenance([search?.provenance]);
  const documentProvenance = uniqueProvenance([
    direct?.provenance,
    search?.provenance,
    productPage?.provenance,
  ]);
  const detailProvenance = uniqueProvenance([
    ...(sitemap?.provenance || []),
    direct?.provenance,
    search?.provenance,
    productPage?.provenance,
  ]);
  const currentComplete = Boolean(sitemap && direct && currentProvenance.length && errors.current.length === 0);
  const searchComplete = Boolean(search && searchProvenance.length && errors.search.length === 0);
  const documentComplete = Boolean(direct && search && documentProvenance.length && errors.documents.length === 0);
  const detailComplete = Boolean(direct && search && detailProvenance.length && errors.detail.length === 0);

  const retryable = (laneId, provenance, reason) => sourceLane(
    laneId,
    'retryable',
    provenance,
    0,
    reason || 'Hisense source lane did not produce immutable completion provenance.',
  );
  const sourceLanes = [
    currentComplete
      ? sourceLane('current_product', 'complete', currentProvenance, 0, null)
      : retryable('current_product', currentProvenance, errors.current[0]),
    unsupportedLane('discontinued_archive', 'Hisense Australia exposes no separate enumerable discontinued-product archive.'),
    searchComplete
      ? sourceLane('support_search_api', 'complete', searchProvenance, 0, null)
      : retryable('support_search_api', searchProvenance, errors.search[0]),
    documentComplete
      ? sourceLane('official_document_cdn', 'complete', documentProvenance, documents.length, null)
      : retryable('official_document_cdn', documentProvenance, errors.documents[0]),
    detailComplete
      ? sourceLane('official_product_detail', 'complete', detailProvenance, productPage ? 1 : 0, null)
      : retryable('official_product_detail', detailProvenance, errors.detail[0]),
  ];
  const primary = documents[0] || null;
  return {
    ...(primary || {}),
    ...(productPage ? { productPageUrl: productPage.finalUrl } : {}),
    resources,
    sourceLanes,
  };
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
    if (raw) candidates.push(raw);
    const withoutWildcard = raw.replace(/\*/g, '');
    if (withoutWildcard && withoutWildcard !== raw) candidates.push(withoutWildcard);
    const tokenMatches = raw.match(/\b[A-Z]{2,}[A-Z0-9]*\d[A-Z0-9*]*\b/g) || [];
    for (const token of tokenMatches) {
      if (normalizeSku(token).length >= 4) {
        candidates.push(token);
        const cleanToken = token.replace(/\*/g, '');
        if (cleanToken !== token) candidates.push(cleanToken);
      }
    }
  }
  return [...new Set(candidates.filter((sku) => normalizeSku(sku).length >= 4))];
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)'
    }
  });
  if (!response.ok) {
    const error = new Error(`Hisense OCC request failed with HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function productToResult(product, target, sourceSuffix = 'specification_doc') {
  const resource = selectHisensePdfResource(product);
  if (!resource) return null;
  return {
    sourceUrl: resource.url,
    source: `hisense-official-${resource.type || sourceSuffix}`,
    resourceType: resource.type || sourceSuffix,
    productCode: product.code || '',
    productName: product.name || '',
    documentName: resource.name || '',
    ...(product.url ? { productPageUrl: resolveHisenseProductPageUrl(product.url) } : {})
  };
}

async function findHisenseOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch
} = {}) {
  if (!fetchImpl) throw new Error('Hisense official finder requires fetch');
  const lookupSkus = collectLookupSkus(target);
  if (!lookupSkus.length) throw new Error('Hisense official finder requires a SKU');

  const errors = [];
  for (const sku of lookupSkus) {
    try {
      const product = await fetchJson(buildHisenseOccProductUrl(sku), fetchImpl);
      if (hisenseProductCodeMatchesSku(product.code, sku)) {
        const result = productToResult(product, target);
        if (result) return result;
      }
    } catch (error) {
      errors.push(`${sku}: ${error.message}`);
    }
  }

  for (const sku of lookupSkus) {
    try {
      const payload = await fetchJson(buildHisenseOccSearchUrl(sku), fetchImpl);
      const matches = (Array.isArray(payload.products) ? payload.products : [])
        .filter((product) => hisenseProductCodeMatchesSku(product.code, sku));
      if (matches.length > 1) {
        throw new Error(`Hisense search was ambiguous for ${sku}: ${matches.map((item) => item.code).join(', ')}`);
      }
      if (matches.length === 1) {
        const result = productToResult(matches[0], target);
        if (result) return result;
      }
    } catch (error) {
      errors.push(`search ${sku}: ${error.message}`);
    }
  }

  throw new Error(`Hisense official PDF not found: ${errors.join(' | ')}`.trim());
}

exports.buildHisenseOccProductUrl = buildHisenseOccProductUrl;
exports.buildHisenseOccSearchUrl = buildHisenseOccSearchUrl;
exports.findHisenseOfficialEvidence = findHisenseOfficialEvidence;
exports.findHisenseOfficialPdf = findHisenseOfficialPdf;
exports.HISENSE_SOURCE_LANES = HISENSE_SOURCE_LANES;
exports.hisenseProductCodeMatchesSku = hisenseProductCodeMatchesSku;
exports.normalizeSku = normalizeSku;
exports.resolveHisenseAssetUrl = resolveHisenseAssetUrl;
exports.resolveHisenseProductPageUrl = resolveHisenseProductPageUrl;
exports.selectHisensePdfResource = selectHisensePdfResource;
