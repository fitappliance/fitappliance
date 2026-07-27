require('dotenv').config({ quiet: true });

const { createHash } = require('node:crypto');

const SAMSUNG_AU_BASE_URL = 'https://www.samsung.com';
const SAMSUNG_AU_APPLIANCE_SITEMAP_URL = `${SAMSUNG_AU_BASE_URL}/au/da-sitemap.xml`;
const SAMSUNG_AU_SUPPORT_SEARCH_URL = 'https://esapi.samsung.com/support/search/suggestdetail/v6';
const DEFAULT_USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';
const DEFAULT_TIMEOUT_MS = 60_000;
const sitemapCache = new WeakMap();
const SAMSUNG_SOURCE_LANES = Object.freeze([
  Object.freeze({ laneId: 'current_product', required: true, supported: true }),
  Object.freeze({ laneId: 'discontinued_archive', required: false, supported: false }),
  Object.freeze({ laneId: 'support_search_api', required: true, supported: true }),
  Object.freeze({ laneId: 'official_document_cdn', required: true, supported: true }),
  Object.freeze({ laneId: 'official_product_detail', required: true, supported: true }),
]);

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
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function absoluteSamsungUrl(url) {
  const decoded = decodeHtml(url)
    .replace(/\\\//g, '/')
    .split(/["'<>\s]/)[0]
    .replace(/%22.*$/i, '');
  return new URL(decoded, SAMSUNG_AU_BASE_URL).toString();
}

async function fetchSamsungDocument(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT,
  accept = 'text/html,application/xhtml+xml',
} = {}) {
  if (!fetchImpl) throw new Error('Samsung official finder requires fetch');
  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetchImpl(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: accept,
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Samsung official fetch failed with HTTP ${response.status}`);
    }
    const bytes = typeof response.arrayBuffer === 'function'
      ? Buffer.from(await response.arrayBuffer())
      : Buffer.from(await response.text());
    return {
      bytes,
      html: bytes.toString('utf8'),
      finalUrl: response.url || String(url),
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Samsung official fetch timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function fetchHtml(url, options = {}) {
  return (await fetchSamsungDocument(url, options)).html;
}

async function persistLanePayload({
  bytes, contentType, extension, discoveryUrl, requestedModel, method, writeObject,
}) {
  if (typeof writeObject !== 'function') return null;
  const payload = Buffer.from(bytes);
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

function sourceLane(laneId, status, provenance = [], candidateCount = 0, reason = null) {
  const descriptor = SAMSUNG_SOURCE_LANES.find((lane) => lane.laneId === laneId);
  if (!descriptor) throw new Error(`Unknown Samsung source lane: ${laneId}`);
  return { ...descriptor, status, candidateCount, provenance, reason };
}

function unsupportedLane(laneId, reason) {
  return sourceLane(laneId, 'unsupported', [], 0, reason);
}

function exactModelPattern(model) {
  const normalized = normalizeSku(model);
  if (!normalized) return null;
  const body = [...normalized]
    .map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^A-Z0-9]*');
  return new RegExp(`(^|[^A-Z0-9])${body}(?![A-Z0-9])`, 'i');
}

function hasExactSamsungModelMention(value, model) {
  return exactModelPattern(model)?.test(decodeHtml(value)) ?? false;
}

function exactSamsungDocumentUrl(sourceUrl, model) {
  let decoded;
  try { decoded = decodeURIComponent(String(sourceUrl)); } catch { decoded = String(sourceUrl); }
  return hasExactSamsungModelMention(decoded, model);
}

function buildSamsungSupportModelVariants(sku) {
  const exact = normalizeSku(sku);
  if (!exact) return [];
  const variants = new Set([exact]);
  if (!exact.endsWith('SA')) variants.add(`${exact}SA`);
  return [...variants];
}

function classifySamsungResource(resource = {}) {
  const explicitType = String(resource.contentsTypeCode || resource.type || '');
  const explicitUrl = String(resource.downloadUrl || resource.url || '');
  if (/^UM$/i.test(explicitType) || /[?&]CDCttType=UM(?:&|$)/i.test(explicitUrl)) {
    return 'user_manual';
  }
  const haystack = [
    resource.type,
    resource.contentsTypeCode,
    resource.description,
    resource.englishDescription,
    resource.fileName,
    resource.url,
    resource.downloadUrl
  ].filter(Boolean).join(' ');

  if (/quick\s+reference|qrg/i.test(haystack)) return 'quick_reference_guide';
  if (/spec(?:ification)?\s*(?:sheet|guide)?|brochure|data\s*sheet/i.test(haystack)) return 'specification_sheet';
  if (/install(?:ation)?/i.test(haystack)) return 'installation_manual';
  if (/user\s*manual|owners?\s*manual|\bUM\b/i.test(haystack)) return 'user_manual';
  return 'pdf';
}

function languageCodes(manual = {}) {
  return (Array.isArray(manual.languageList) ? manual.languageList : [])
    .map((entry) => String(entry.code || entry.orgCode || entry.name || '').toUpperCase())
    .filter(Boolean);
}

function areaCodes(manual = {}) {
  return (Array.isArray(manual.areaList) ? manual.areaList : [])
    .map((entry) => String(entry.code || entry.orgCode || '').toUpperCase())
    .filter(Boolean);
}

function scoreSamsungResource(resource) {
  const typeScore = {
    specification_sheet: 110,
    quick_reference_guide: 100,
    installation_manual: 80,
    user_manual: 55,
    pdf: 20
  }[resource.type] ?? 0;
  const languageScore = String(resource.language || '').toUpperCase() === 'EN' ? 30 : -40;
  const areaScore = Array.isArray(resource.areas) && resource.areas.includes('AU') ? 25 : 0;
  const urlScore = /CDSite=UNI_AU|\/au\//i.test(resource.url || '') ? 8 : 0;
  return typeScore + languageScore + areaScore + urlScore;
}

function normalizeManualResource(manual, sku) {
  const url = manual.downloadUrl || manual.url || manual.filePath;
  if (!url) return null;
  const languages = languageCodes(manual);
  const areas = areaCodes(manual);
  const language = languages.includes('EN') ? 'EN' : languages[0] || '';
  const resource = {
    url: absoluteSamsungUrl(url),
    type: classifySamsungResource(manual),
    language,
    areas,
    sku: normalizeSku(manual.modelName || sku),
    fileName: manual.fileName || '',
    score: 0
  };
  resource.score = scoreSamsungResource(resource);
  return resource;
}

function parseContentsJsonBlocks(html) {
  const blocks = [];
  const pattern = /<li\b[^>]*data-sdf-prop=["']contents["'][^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = pattern.exec(String(html || '')))) {
    const raw = decodeHtml(match[1]).trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Samsung occasionally ships malformed or escaped blobs. Other URL
      // extractors below still scan the raw HTML, so keep this fail-soft.
    }
  }
  return blocks;
}

function extractRawPdfUrls(html, sku) {
  const resources = [];
  const patterns = [
    /https?:\\?\/\\?\/[^"'<>\s]+?(?:\.pdf|ContentsFile\.aspx)(?:\?[^"'<>\s]*)?/gi,
    /\b(?:href|data-url)=["']([^"']+(?:\.pdf|ContentsFile\.aspx)(?:\?[^"']*)?)["']/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(String(html || '')))) {
      const rawUrl = match[1] || match[0];
      const context = String(html || '').slice(Math.max(0, match.index - 180), match.index + rawUrl.length + 180);
      const resource = {
        url: absoluteSamsungUrl(rawUrl),
        type: classifySamsungResource({ url: rawUrl, description: context }),
        language: /[_-]EN(?:[_\-.]|$)|language=EN|_EN_pdf/i.test(rawUrl) ? 'EN' : '',
        areas: /UNI_AU|\/au\//i.test(rawUrl) ? ['AU'] : [],
        sku: normalizeSku(sku),
        fileName: rawUrl.split('/').pop() || '',
        score: 0
      };
      resource.score = scoreSamsungResource(resource);
      resources.push(resource);
    }
  }

  return resources;
}

function extractSamsungPdfResources(html, sku = '') {
  const resources = [];
  for (const block of parseContentsJsonBlocks(html)) {
    const manuals = Array.isArray(block.manuals) ? block.manuals : [];
    for (const manual of manuals) {
      const resource = normalizeManualResource(manual, sku);
      if (resource) resources.push(resource);
    }
  }
  resources.push(...extractRawPdfUrls(html, sku));

  const deduped = new Map();
  for (const resource of resources) {
    if (!resource.url) continue;
    const existing = deduped.get(resource.url);
    if (!existing || resource.score > existing.score) {
      deduped.set(resource.url, resource);
    }
  }

  return [...deduped.values()].sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}

function extractSamsungProductPageUrls(xml, sku = '') {
  const exact = normalizeSku(sku);
  if (!exact) return [];
  const variants = new Set([exact, ...(exact.endsWith('SA') ? [] : [`${exact}SA`])]);
  const urls = [];
  const pattern = /<loc>([^<]+)<\/loc>/gi;
  let match;
  while ((match = pattern.exec(String(xml || '')))) {
    let url;
    try {
      url = new URL(decodeHtml(match[1]).trim());
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' || url.hostname !== 'www.samsung.com'
      || !url.pathname.startsWith('/au/') || url.pathname.startsWith('/au/support/')) continue;
    const decodedPath = decodeURIComponent(url.pathname);
    if (![...variants].some((variant) => hasExactSamsungModelMention(decodedPath, variant))) continue;
    url.hash = '';
    urls.push(url.toString());
  }
  return [...new Set(urls)].sort();
}

function samsungSupportSearchUrl(sku) {
  const url = new URL(SAMSUNG_AU_SUPPORT_SEARCH_URL);
  url.searchParams.set('siteCd', 'au');
  url.searchParams.set('suggestionValue', normalizeSku(sku));
  url.searchParams.set('stage', 'front');
  url.searchParams.set('TypeCode', '');
  url.searchParams.set('SubTypeCode', '');
  url.searchParams.set('start', '');
  return url.toString();
}

function extractSamsungSupportSearchResults(value, sku) {
  let payload;
  try { payload = typeof value === 'string' ? JSON.parse(value) : value; } catch { return []; }
  const exactModel = normalizeSku(sku);
  const resultLists = payload?.response?.resultData?.resultList;
  if (payload?.response?.statusCode !== 200 || !Array.isArray(resultLists)) return [];
  const matches = [];
  for (const resultList of resultLists) {
    for (const row of resultList?.contentList ?? []) {
      const modelCode = String(row?.modelCode ?? '').trim();
      if (normalizeSku(row?.modelName) !== exactModel || !modelCode) continue;
      let supportUrl;
      try {
        supportUrl = new URL(
          row.linkUrl || `/au/support/model/${modelCode}/`,
          SAMSUNG_AU_BASE_URL,
        );
      } catch {
        continue;
      }
      if (supportUrl.protocol !== 'https:' || supportUrl.hostname !== 'www.samsung.com'
        || !supportUrl.pathname.startsWith('/au/support/model/')
        || !hasExactSamsungModelMention(supportUrl.pathname, modelCode)) continue;
      supportUrl.hash = '';
      if (!supportUrl.pathname.endsWith('/')) supportUrl.pathname += '/';
      matches.push({ modelName: exactModel, modelCode, supportUrl: supportUrl.toString() });
    }
  }
  const unique = new Map(matches.map((row) => [normalizeSku(row.modelCode), row]));
  return [...unique.values()].sort((left, right) => left.modelCode.localeCompare(right.modelCode));
}

function extractSamsungProductBridgeUrls(html, modelCode) {
  const urls = [];
  const pattern = /\bhref=["']([^"']+)["']/gi;
  let match;
  while ((match = pattern.exec(String(html ?? '')))) {
    let url;
    try { url = new URL(decodeHtml(match[1]), SAMSUNG_AU_BASE_URL); } catch { continue; }
    if (url.protocol !== 'https:' || url.hostname !== 'www.samsung.com'
      || !url.pathname.startsWith('/au/c/p/')
      || !hasExactSamsungModelMention(url.pathname, modelCode)) continue;
    url.hash = '';
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    urls.push(url.toString());
  }
  return [...new Set(urls)].sort();
}

async function fetchSamsungApplianceSitemapDocument(opts = {}) {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Samsung official finder requires fetch');
  if (!sitemapCache.has(fetchImpl)) {
    const promise = fetchSamsungDocument(SAMSUNG_AU_APPLIANCE_SITEMAP_URL, { ...opts, fetchImpl });
    sitemapCache.set(fetchImpl, promise);
    promise.catch(() => sitemapCache.delete(fetchImpl));
  }
  return sitemapCache.get(fetchImpl);
}

async function fetchSamsungApplianceSitemap(opts = {}) {
  return (await fetchSamsungApplianceSitemapDocument(opts)).html;
}

async function findSamsungProductPageUrls(sku, opts = {}) {
  try {
    return extractSamsungProductPageUrls(await fetchSamsungApplianceSitemap(opts), sku);
  } catch {
    return [];
  }
}

function candidateDiscoveryProvenance(pageProvenance, artifactUrl, requestedModel) {
  return {
    schemaVersion: 1,
    method: 'official_product_page',
    market: 'AU',
    discoveryUrl: pageProvenance.discoveryUrl,
    requestedModel: normalizeSku(requestedModel),
    matchedModel: normalizeSku(requestedModel),
    artifactUrl,
    artifactLinkUrl: artifactUrl,
    discoveryContentSha256: pageProvenance.contentSha256,
    discoveryObjectPath: pageProvenance.objectPath,
    discoveryByteSize: pageProvenance.byteSize,
  };
}

async function discoverSamsungSupportEvidence(sku, opts = {}) {
  const searchUrl = samsungSupportSearchUrl(sku);
  const search = await fetchSamsungDocument(searchUrl, {
    ...opts,
    accept: 'application/json',
  });
  const searchProvenance = await persistLanePayload({
    bytes: search.bytes,
    contentType: 'application/json',
    extension: 'json',
    discoveryUrl: search.finalUrl,
    requestedModel: sku,
    method: 'official_support_search_api',
    writeObject: opts.writeObject,
  });
  if (!searchProvenance) throw new TypeError('Samsung content-addressed discovery writer required');
  const results = extractSamsungSupportSearchResults(search.html, sku);
  const supportPageProvenance = [];
  const supportResources = [];
  const productBridgeUrls = [];
  const errors = [];
  for (const result of results.slice(0, 4)) {
    try {
      const page = await fetchSamsungDocument(result.supportUrl, opts);
      if (!hasExactSamsungModelMention(page.html, sku)
        || !hasExactSamsungModelMention(page.html, result.modelCode)) {
        throw new Error(`Samsung AU support page does not bind ${sku} to ${result.modelCode}`);
      }
      const provenance = await persistLanePayload({
        bytes: page.bytes,
        contentType: 'text/html',
        extension: 'html',
        discoveryUrl: page.finalUrl,
        requestedModel: sku,
        method: 'official_support_product_page',
        writeObject: opts.writeObject,
      });
      supportPageProvenance.push(provenance);
      supportResources.push(...extractSamsungPdfResources(page.html, sku)
        .filter((resource) => resource.score > 0 && exactSamsungDocumentUrl(resource.url, sku))
        .map((resource) => ({
          ...resource,
          sourceUrl: resource.url,
          resourceType: resource.type,
          sourceModelHint: normalizeSku(sku),
          sourceLaneId: 'official_document_cdn',
          requiredAttempt: true,
          discoveryProvenance: candidateDiscoveryProvenance(provenance, resource.url, sku),
        })));
      productBridgeUrls.push(...extractSamsungProductBridgeUrls(page.html, result.modelCode)
        .map((sourceUrl) => ({ sourceUrl, modelCode: result.modelCode })));
    } catch (error) {
      errors.push(`${result.supportUrl}: ${error.message}`);
    }
  }
  return {
    searchProvenance,
    results,
    supportPageProvenance,
    supportResources,
    supportPagesComplete: supportPageProvenance.length === results.slice(0, 4).length,
    productBridgeUrls,
    errors,
  };
}

async function discoverSamsungProductPageEvidence(sku, opts = {}) {
  const sitemap = await fetchSamsungApplianceSitemapDocument(opts);
  const sitemapProvenance = await persistLanePayload({
    bytes: sitemap.bytes,
    contentType: 'application/xml',
    extension: 'xml',
    discoveryUrl: sitemap.finalUrl,
    requestedModel: sku,
    method: 'official_sitemap',
    writeObject: opts.writeObject,
  });
  if (!sitemapProvenance) throw new TypeError('Samsung content-addressed discovery writer required');
  let supportEvidence;
  try {
    supportEvidence = await discoverSamsungSupportEvidence(sku, opts);
  } catch (error) {
    supportEvidence = {
      searchProvenance: null,
      results: [],
      supportPageProvenance: [],
      supportResources: [],
      supportPagesComplete: false,
      productBridgeUrls: [],
      errors: [error.message],
    };
  }

  const sitemapProductUrls = extractSamsungProductPageUrls(sitemap.html, sku)
    .map((sourceUrl) => ({ sourceUrl, modelCode: null }));
  const productInputs = [...sitemapProductUrls, ...supportEvidence.productBridgeUrls];
  const uniqueProductInputs = [...new Map(productInputs.map((entry) => [entry.sourceUrl, entry])).values()];
  if (!uniqueProductInputs.length) {
    return {
      sitemapProvenance,
      supportEvidence,
      productUrls: [],
      productPageProvenance: null,
      resources: supportEvidence.supportResources,
      productPageErrors: [],
      errors: [...supportEvidence.errors],
    };
  }

  const errors = [...supportEvidence.errors];
  const productPageErrors = [];
  for (const input of uniqueProductInputs.slice(0, 4)) {
    try {
      const page = await fetchSamsungDocument(input.sourceUrl, opts);
      if (!hasExactSamsungModelMention(page.html, sku)
        || (input.modelCode && !hasExactSamsungModelMention(page.html, input.modelCode))) {
        throw new Error(`Samsung AU product page does not prove exact model ${sku}`);
      }
      const productPageProvenance = await persistLanePayload({
        bytes: page.bytes,
        contentType: 'text/html',
        extension: 'html',
        discoveryUrl: page.finalUrl,
        requestedModel: sku,
        method: 'official_product_page',
        writeObject: opts.writeObject,
      });
      const documentResources = extractSamsungPdfResources(page.html, sku)
        .filter((resource) => resource.score > 0 && exactSamsungDocumentUrl(resource.url, sku))
        .map((resource) => ({
          ...resource,
          sourceUrl: resource.url,
          resourceType: resource.type,
          sourceModelHint: normalizeSku(sku),
          sourceLaneId: 'official_document_cdn',
          requiredAttempt: true,
          discoveryProvenance: candidateDiscoveryProvenance(
            productPageProvenance,
            resource.url,
            sku,
          ),
        }));
      const productPageResource = {
        url: page.finalUrl,
        sourceUrl: page.finalUrl,
        source: 'samsung-official-product-page',
        resourceType: 'product_page',
        documentType: 'product_page',
        sourceModelHint: normalizeSku(sku),
        sourceLaneId: 'official_product_detail',
        requiredAttempt: true,
        discoveryProvenance: candidateDiscoveryProvenance(
          productPageProvenance,
          page.finalUrl,
          sku,
        ),
      };
      const resources = [...new Map([
        ...supportEvidence.supportResources,
        ...documentResources,
        productPageResource,
      ].map((resource) => [
        `${resource.sourceLaneId}:${resource.sourceUrl ?? resource.url}`,
        resource,
      ])).values()];
      return {
        sitemapProvenance,
        supportEvidence,
        productUrls: [page.finalUrl],
        productPageProvenance,
        resources,
        productPageErrors,
        errors,
      };
    } catch (error) {
      const message = `${input.sourceUrl}: ${error.message}`;
      productPageErrors.push(message);
      errors.push(message);
    }
  }
  return {
    sitemapProvenance,
    supportEvidence,
    productUrls: uniqueProductInputs.map((entry) => entry.sourceUrl),
    productPageProvenance: null,
    resources: supportEvidence.supportResources,
    productPageErrors,
    errors,
  };
}

function samsungSourceLanes(evidence) {
  const pageProvenance = evidence.productPageProvenance ? [evidence.productPageProvenance] : [];
  const inventoryProvenance = [
    evidence.sitemapProvenance,
    evidence.supportEvidence?.searchProvenance,
  ].filter(Boolean);
  const supportProvenance = [
    evidence.supportEvidence?.searchProvenance,
    ...(evidence.supportEvidence?.supportPageProvenance ?? []),
  ].filter(Boolean);
  const documents = evidence.resources.filter((resource) => resource.sourceLaneId === 'official_document_cdn');
  const productPages = evidence.resources.filter((resource) => resource.sourceLaneId === 'official_product_detail');
  const pageFailed = !evidence.supportEvidence?.searchProvenance
    || evidence.supportEvidence?.supportPagesComplete !== true
    || (evidence.productPageErrors?.length ?? 0) > 0;
  const pageReason = pageFailed ? evidence.errors[0] || 'Exact Samsung AU product page could not be fetched.' : null;
  return [
    sourceLane('current_product', 'complete', [evidence.sitemapProvenance], 0, null),
    unsupportedLane('discontinued_archive', 'Samsung Australia does not expose a bounded discontinued-appliance archive.'),
    sourceLane(
      'support_search_api',
      evidence.supportEvidence?.searchProvenance ? 'complete' : 'retryable',
      supportProvenance,
      0,
      evidence.supportEvidence?.searchProvenance
        ? null
        : evidence.supportEvidence?.errors[0] || 'Samsung AU support search did not complete.',
    ),
    sourceLane(
      'official_document_cdn',
      pageFailed ? 'retryable' : 'complete',
      pageProvenance.length ? pageProvenance : inventoryProvenance,
      documents.length,
      pageReason,
    ),
    sourceLane(
      'official_product_detail',
      pageFailed ? 'retryable' : 'complete',
      pageProvenance.length ? pageProvenance : inventoryProvenance,
      productPages.length,
      pageReason,
    ),
  ];
}

async function findSamsungOfficialPdf(target, opts = {}) {
  const sku = target?.sku || target?.model || target?.product?.model || target?.product?.sku;
  if (!sku) throw new Error('Samsung official finder requires sku/model');
  if (typeof opts.writeObject === 'function') {
    const evidence = await discoverSamsungProductPageEvidence(sku, opts);
    const productDocuments = evidence.resources
      .filter((resource) => resource.sourceLaneId === 'official_document_cdn');
    const primary = productDocuments[0] ?? null;
    return {
      sku,
      matchedSku: normalizeSku(sku),
      supportUrl: evidence.supportEvidence?.results[0]?.supportUrl ?? '',
      sourceUrl: primary?.sourceUrl ?? null,
      source: primary ? `samsung-official-${primary.resourceType}` : 'samsung-official',
      resourceType: primary?.resourceType ?? null,
      resources: evidence.resources,
      productUrls: evidence.productUrls,
      sourceLanes: samsungSourceLanes(evidence),
      sourceLaneId: primary?.sourceLaneId ?? null,
      requiredAttempt: primary?.requiredAttempt ?? false,
      discoveryProvenance: primary?.discoveryProvenance ?? null,
      reason: evidence.errors[0] ?? (primary ? null : 'pdf_resource_not_found'),
    };
  }
  const variants = buildSamsungSupportModelVariants(sku);
  let lastError = null;
  let matched = null;

  for (const variant of variants) {
    const supportUrl = `${SAMSUNG_AU_BASE_URL}/au/support/model/${variant}/`;
    try {
      const html = await fetchHtml(supportUrl, opts);
      const resources = extractSamsungPdfResources(html, sku);
      const best = resources.find((resource) => resource.score > 0) || null;
      if (best) {
        matched = {
          sku,
          matchedSku: variant,
          supportUrl,
          sourceUrl: best.url,
          source: `samsung-official-${best.type}`,
          resourceType: best.type,
          resources
        };
        break;
      }
    } catch (error) {
      lastError = error;
    }
  }

  const productUrls = await findSamsungProductPageUrls(sku, opts);
  if (matched) return { ...matched, productUrls };

  return {
    sku,
    matchedSku: variants[variants.length - 1] || normalizeSku(sku),
    supportUrl: variants.length ? `${SAMSUNG_AU_BASE_URL}/au/support/model/${variants.at(-1)}/` : '',
    sourceUrl: null,
    source: 'samsung-official',
    resources: [],
    productUrls,
    reason: lastError ? lastError.message : 'pdf_resource_not_found'
  };
}

exports.absoluteSamsungUrl = absoluteSamsungUrl;
exports.buildSamsungSupportModelVariants = buildSamsungSupportModelVariants;
exports.extractSamsungProductPageUrls = extractSamsungProductPageUrls;
exports.extractSamsungPdfResources = extractSamsungPdfResources;
exports.findSamsungOfficialPdf = findSamsungOfficialPdf;
exports.normalizeSku = normalizeSku;
exports.scoreSamsungResource = scoreSamsungResource;
exports.hasExactSamsungModelMention = hasExactSamsungModelMention;
