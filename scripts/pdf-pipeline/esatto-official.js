const SITEMAP_URL = 'https://esatto.house/sitemap.xml';
const SEARCH_URL = 'https://esatto.house/search';
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

function extractProductUrlsFromSearch(html, searchUrl) {
  const source = String(html || '').replace(/\\\//g, '/').replace(/\\u0026/gi, '&');
  const values = [];
  const patterns = [
    /\bdata-url=["']([^"']+)["']/gi,
    /\bhref=["']([^"']+)["']/gi,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      try {
        const url = absoluteUrl(match[1], searchUrl);
        if (isCoreProductUrl(url)) values.push(url);
      } catch { /* Ignore non-URL search decorations. */ }
    }
  }
  return [...new Set(values)].sort();
}

function isCoreProductUrl(url) {
  return /esatto\.house\/(?:refrigeration|dishwashers|laundry|discontinued-products)\//i.test(url);
}

function catalogStateForUrl(url) {
  return /\/discontinued-products\//i.test(url) ? 'archived' : 'current';
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

function boundedSkuPattern(sku) {
  const separated = [...sku].join('[-_.\\s/]*');
  return new RegExp(`(?:^|[^A-Z0-9])${separated}(?=$|[^A-Z0-9])`, 'i');
}

function textHasTargetSku(value, target = {}) {
  const sku = targetSku(target);
  return sku.length >= 4 && boundedSkuPattern(sku).test(String(value || ''));
}

function exactProductDownloadScope(html, target = {}) {
  const sku = targetSku(target);
  const productDetailTags = String(html || '').match(
    /<[^>]*\bdata-controller=["']ProductDetail["'][^>]*>/gi,
  ) || [];
  for (const tag of productDetailTags) {
    const encodedContext = /\bdata-context=(["'])([\s\S]*?)\1/i.exec(tag)?.[2];
    if (!encodedContext) continue;
    let context;
    try { context = JSON.parse(decodeHtml(encodedContext)); } catch { continue; }
    const product = context?.product;
    const identitySignals = [
      ...(product?.variants || []).map((variant) => variant?.sku),
      product?.firstInStockVariant?.sku,
      ...(product?.tags || []).map((tagValue) => String(tagValue).replace(/^sku-/i, '')),
    ].filter(Boolean);
    if (!identitySignals.some((value) => normalizeSku(value) === sku)) continue;
    return decodeHtml(product?.description || '');
  }
  if (productDetailTags.length > 0) return null;
  return textHasTargetSku(html, target) ? String(html || '') : null;
}

function urlMatchesTargetSku(url, target = {}) {
  const sku = targetSku(target);
  if (!sku || sku.length < 4) return false;
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  let pathname = parsed.pathname;
  try { pathname = decodeURIComponent(pathname); } catch { /* Keep encoded path. */ }
  if (boundedSkuPattern(sku).test(pathname)) return true;
  return [...parsed.searchParams.values()].some((value) => (
    normalizeSku(value) === sku || boundedSkuPattern(sku).test(value)
  ));
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
  const source = String(html || '').replace(/\\\//g, '/').replace(/\\u0026/gi, '&');
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
  const rawPdfPattern = /(?:https?:\/\/|\/)[^\s"'<>]+\.pdf(?:\?[^\s"'<>]*)?/gi;
  for (const match of source.matchAll(rawPdfPattern)) {
    const href = match[0];
    let url;
    try { url = absoluteUrl(href, pageUrl); } catch { continue; }
    const classified = classifyDownload('', href);
    links.push({ url, label: '', ...classified });
  }
  const unique = new Map();
  for (const link of links) {
    const current = unique.get(link.url);
    if (!current || link.score > current.score || (!current.label && link.label)) unique.set(link.url, link);
  }
  return [...unique.values()].sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}

async function persistDiscoverySource({
  text,
  sourceUrl,
  requestedModel,
  contentType,
  extension,
  method,
  writeObject,
}) {
  if (typeof writeObject !== 'function') return null;
  const bytes = Buffer.from(text, 'utf8');
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
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

function candidateDiscoveryProvenance(pageProvenance, {
  productUrl,
  requestedModel,
  artifactUrl,
}) {
  if (!pageProvenance) return null;
  return {
    schemaVersion: 1,
    method: 'official_product_page',
    market: 'AU',
    discoveryUrl: productUrl,
    requestedModel,
    matchedModel: requestedModel,
    artifactUrl,
    artifactLinkUrl: artifactUrl,
    discoveryContentSha256: pageProvenance.contentSha256,
    discoveryObjectPath: pageProvenance.objectPath,
    discoveryByteSize: pageProvenance.byteSize,
  };
}

function supportedLane(laneId, required, status, provenance, candidateCount, reason = null) {
  return { laneId, required, supported: true, status, candidateCount, provenance, reason };
}

function esattoSourceLanes({
  sitemapProvenance,
  sitemapError,
  searchProvenance,
  searchError,
  pageProvenance,
  productDetailCount,
  documentCount,
  pageErrors,
}) {
  const indexStatus = sitemapProvenance ? 'complete' : 'retryable';
  const searchStatus = searchProvenance ? 'complete' : 'retryable';
  const dependentStatus = sitemapProvenance && searchProvenance && pageErrors.length === 0
    ? 'complete'
    : 'retryable';
  const indexReason = indexStatus === 'complete'
    ? null
    : sitemapError ?? 'Immutable sitemap provenance was not persisted.';
  const searchReason = searchStatus === 'complete'
    ? null
    : searchError ?? 'Immutable official-search provenance was not persisted.';
  const dependentReason = dependentStatus === 'complete'
    ? null
    : pageErrors[0] ?? sitemapError ?? searchError ?? 'Immutable product-page provenance was not persisted.';
  const dependentProvenance = pageProvenance.length
    ? pageProvenance
    : [sitemapProvenance, searchProvenance].filter(Boolean);
  return [
    supportedLane('current_product', true, indexStatus, sitemapProvenance ? [sitemapProvenance] : [], 0, indexReason),
    supportedLane('discontinued_archive', true, indexStatus, sitemapProvenance ? [sitemapProvenance] : [], 0, indexReason),
    supportedLane(
      'support_search_api', true, searchStatus, searchProvenance ? [searchProvenance] : [], 0, searchReason,
    ),
    supportedLane(
      'official_document_cdn', true, dependentStatus, dependentProvenance,
      documentCount, dependentReason,
    ),
    supportedLane(
      'official_product_detail', true, dependentStatus, dependentProvenance,
      productDetailCount, dependentReason,
    ),
  ];
}

async function findEsattoOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  sitemapUrl = SITEMAP_URL,
  searchUrl = SEARCH_URL,
  timeoutMs = 30_000,
  writeObject = null
} = {}) {
  if (!fetchImpl) throw new Error('Esatto official finder requires fetch');
  const sku = targetSku(target);
  if (!sku || sku.length < 4) throw new Error('Esatto official finder requires a SKU');

  let sitemapXml = '';
  let sitemapProvenance = null;
  let sitemapError = null;
  try {
    sitemapXml = await fetchText(sitemapUrl, fetchImpl, timeoutMs);
    sitemapProvenance = await persistDiscoverySource({
      text: sitemapXml,
      sourceUrl: sitemapUrl,
      requestedModel: sku,
      contentType: 'application/xml',
      extension: 'xml',
      method: 'official_sitemap',
      writeObject,
    });
  } catch (error) {
    sitemapError = `Sitemap discovery failed: ${error.message}`;
  }
  const exactSearchUrl = new URL(searchUrl);
  exactSearchUrl.searchParams.set('q', sku);
  let searchHtml = '';
  let searchProvenance = null;
  let searchError = null;
  try {
    searchHtml = await fetchText(exactSearchUrl.toString(), fetchImpl, timeoutMs);
    searchProvenance = await persistDiscoverySource({
      text: searchHtml,
      sourceUrl: exactSearchUrl.toString(),
      requestedModel: sku,
      contentType: 'text/html',
      extension: 'html',
      method: 'official_site_search',
      writeObject,
    });
  } catch (error) {
    searchError = `Official search failed: ${error.message}`;
  }
  const productUrls = [...new Set([
    ...extractLocsFromSitemap(sitemapXml),
    ...extractProductUrlsFromSearch(searchHtml, exactSearchUrl.toString()),
  ].filter(isCoreProductUrl).filter((url) => urlMatchesTargetSku(url, target)))].sort();

  if (productUrls.length === 0) {
    return {
      sourceUrl: null,
      source: 'esatto-official-no-candidate',
      resources: [],
      sourceLanes: esattoSourceLanes({
        sitemapProvenance,
        sitemapError,
        searchProvenance,
        searchError,
        pageProvenance: [],
        productDetailCount: 0,
        documentCount: 0,
        pageErrors: [],
      }),
      reason: `Esatto product page not found for ${target.sku || target.model}`,
    };
  }

  const errors = [];
  const resources = [];
  const pageProvenance = [];
  for (const productUrl of productUrls) {
    try {
      const html = await fetchText(productUrl, fetchImpl, timeoutMs);
      const rawPageProvenance = await persistDiscoverySource({
        text: html,
        sourceUrl: productUrl,
        requestedModel: sku,
        contentType: 'text/html',
        extension: 'html',
        method: 'official_product_page',
        writeObject,
      });
      if (rawPageProvenance) pageProvenance.push(rawPageProvenance);
      const downloadScope = exactProductDownloadScope(html, target);
      if (downloadScope == null) {
        errors.push(`${productUrl}: product page does not identify exact model ${sku}`);
        continue;
      }
      const productDiscovery = candidateDiscoveryProvenance(rawPageProvenance, {
        productUrl,
        requestedModel: sku,
        artifactUrl: productUrl,
      });
      resources.push({
        sourceUrl: productUrl,
        url: productUrl,
        resourceType: 'product_page',
        sourceLaneId: 'official_product_detail',
        sourceModelHint: sku,
        catalogState: catalogStateForUrl(productUrl),
        ...(productDiscovery ? { discoveryProvenance: productDiscovery } : {}),
      });
      const links = extractEsattoDownloadLinks(downloadScope, productUrl);
      for (const link of links) {
        const discoveryProvenance = candidateDiscoveryProvenance(rawPageProvenance, {
          productUrl,
          requestedModel: sku,
          artifactUrl: link.url,
        });
        resources.push({
          sourceUrl: link.url,
          url: link.url,
          resourceType: link.resourceType,
          sourceLaneId: 'official_document_cdn',
          sourceModelHint: sku,
          catalogState: catalogStateForUrl(productUrl),
          label: link.label,
          ...(discoveryProvenance ? { discoveryProvenance } : {}),
        });
      }
    } catch (error) {
      errors.push(`${productUrl}: ${error.message}`);
    }
  }
  const documents = resources.filter((resource) => resource.sourceLaneId === 'official_document_cdn');
  const best = documents.find((resource) => resource.resourceType === 'user_manual')
    || documents.find((resource) => resource.resourceType === 'product_card')
    || documents[0]
    || null;
  const catalogStates = new Set(resources
    .filter((resource) => resource.sourceLaneId === 'official_product_detail')
    .map((resource) => resource.catalogState));
  const catalogState = catalogStates.size === 1 ? [...catalogStates][0] : 'mixed';
  return {
    sourceUrl: best?.sourceUrl ?? null,
    source: best ? `esatto-official-${best.resourceType}` : 'esatto-official-product-page',
    resourceType: best?.resourceType ?? 'product_page',
    productUrl: resources.find((resource) => resource.sourceLaneId === 'official_product_detail')?.sourceUrl,
    label: best?.label ?? '',
    resources,
    catalogState,
    sourceLanes: esattoSourceLanes({
      sitemapProvenance,
      sitemapError,
      searchProvenance,
      searchError,
      pageProvenance,
      productDetailCount: resources.filter((resource) => resource.sourceLaneId === 'official_product_detail').length,
      documentCount: documents.length,
      pageErrors: errors,
    }),
    ...(best?.discoveryProvenance ? { discoveryProvenance: best.discoveryProvenance } : {}),
    ...(errors.length ? { reason: errors.join(' | ') } : {}),
  };
}

exports.extractEsattoDownloadLinks = extractEsattoDownloadLinks;
exports.findEsattoOfficialPdf = findEsattoOfficialPdf;
exports.urlMatchesTargetSku = urlMatchesTargetSku;
