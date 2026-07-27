const FACTSHEET_ENDPOINT = 'https://resource.electrolux.com.au/Factsheet/RequestPdf';
const USER_AGENT = 'curl/8.7.1';
const DEFAULT_MAXIMUM_TEXT_BYTES = 8 * 1024 * 1024;
const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const CURL_MAX_BUFFER = 35 * 1024 * 1024;

const GROUP_BRANDS = new Map([
  ['electrolux', 'Electrolux'],
  ['kelvinator', 'Kelvinator'],
  ['westinghouse', 'Westinghouse']
]);

const BRAND_SITEMAPS = new Map([
  ['Electrolux', 'https://www.electrolux.com.au/sitemap.xml'],
  ['Kelvinator', 'https://www.kelvinator.com.au/sitemap.xml'],
  ['Westinghouse', 'https://www.westinghouse.com.au/sitemap.xml']
]);

const BRAND_PRODUCT_HOSTS = new Map([
  ['Electrolux', 'www.electrolux.com.au'],
  ['Kelvinator', 'www.kelvinator.com.au'],
  ['Westinghouse', 'www.westinghouse.com.au']
]);

function resolveElectroluxGroupBrand(target = {}) {
  const raw = target.brand || target.product?.brand || '';
  return GROUP_BRANDS.get(String(raw).trim().toLowerCase()) || null;
}

function exactModel(target = {}) {
  const raw = target.sku || target.model || target.product?.model || target.product?.sku || '';
  const model = String(raw).trim().toUpperCase();
  if (!model || model.length < 5 || model.length > 40 || !/^[A-Z0-9*./-]+$/.test(model)) {
    throw new Error('Electrolux group factsheet resolver requires an exact model');
  }
  return model;
}

function normalizeModel(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractSitemapUrls(xml) {
  return [...String(xml || '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => decodeHtml(match[1]).trim());
}

function productUrlMatchesExactModel(value, model, host) {
  try {
    const url = new URL(value);
    const finalToken = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || '');
    return url.protocol === 'https:'
      && url.hostname.toLowerCase() === host
      && normalizeModel(finalToken) === normalizeModel(model);
  } catch {
    return false;
  }
}

function exactModelMention(value, model) {
  const escaped = String(model || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Boolean(escaped
    && new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, 'i').test(String(value || '')));
}

function pageIdentifiesExactModel(html, model) {
  const identityText = [...String(html || '').matchAll(
    /<(?:title|h1)\b[^>]*>([\s\S]*?)<\/(?:title|h1)>/gi,
  )].map((match) => decodeHtml(match[1]).replace(/<[^>]+>/g, ' ')).join(' ');
  return exactModelMention(identityText, model);
}

function absoluteOfficialUrl(value, pageUrl, brand) {
  try {
    const url = new URL(decodeHtml(value), pageUrl);
    const productHost = BRAND_PRODUCT_HOSTS.get(brand);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (![productHost, 'resource.electrolux.com.au'].includes(url.hostname.toLowerCase())) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function unwrapDocumentHandlerUrl(linkUrl) {
  const wrapper = new URL(linkUrl);
  if (!/\/documenthandler\.ashx$/i.test(wrapper.pathname)) {
    return { sourceUrl: wrapper.toString(), artifactLinkUrl: wrapper.toString() };
  }
  const encoded = wrapper.searchParams.get('file');
  if (!encoded) return { sourceUrl: wrapper.toString(), artifactLinkUrl: wrapper.toString() };

  const decoded = Buffer.from(encoded, 'base64url').toString('utf8').trim();
  if (!decoded.toLowerCase().startsWith('https://')) {
    return { sourceUrl: wrapper.toString(), artifactLinkUrl: wrapper.toString() };
  }
  try {
    const direct = new URL(decoded);
    const supportedPath = /^\/(?:Factsheet\/RequestPdf|Public\/File\/?)/i.test(direct.pathname);
    if (direct.hostname.toLowerCase() !== 'resource.electrolux.com.au'
      || direct.username || direct.password || !supportedPath) {
      return null;
    }
    direct.hash = '';
    return { sourceUrl: direct.toString(), artifactLinkUrl: wrapper.toString() };
  } catch {
    return null;
  }
}

function classifyDownload(label, url) {
  const text = `${label || ''} ${url || ''}`;
  if (/dimension/i.test(text)) return { resourceType: 'dimension_sheet', score: 100, requiredAttempt: true };
  if (/fact/i.test(text)) return { resourceType: 'fact_sheet', score: 90, requiredAttempt: true };
  if (/install/i.test(text)) return { resourceType: 'installation_guide', score: 80, requiredAttempt: false };
  if (/user|manual|instruction/i.test(text)) return { resourceType: 'user_manual', score: 50, requiredAttempt: false };
  return null;
}

function extractProductDocuments(html, pageUrl, brand) {
  const resources = [];
  const anchorPattern = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || '').matchAll(anchorPattern)) {
    const attrs = match[1] || '';
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href || !/documenthandler|RequestPdf|\.pdf(?:$|[?#])/i.test(href)) continue;
    const linkUrl = absoluteOfficialUrl(href, pageUrl, brand);
    if (!linkUrl) continue;
    const resolvedUrl = unwrapDocumentHandlerUrl(linkUrl);
    if (!resolvedUrl) continue;
    const label = decodeHtml([
      attrs.match(/\bdata-ga4-file-name=["']([^"']+)["']/i)?.[1],
      attrs.match(/\bdata-ga4-download-type=["']([^"']+)["']/i)?.[1],
      match[2].replace(/<[^>]+>/g, ' '),
    ].filter(Boolean).join(' ')).trim();
    const classification = classifyDownload(label, resolvedUrl.sourceUrl);
    if (!classification) continue;
    resources.push({
      sourceUrl: resolvedUrl.sourceUrl,
      url: resolvedUrl.sourceUrl,
      artifactLinkUrl: resolvedUrl.artifactLinkUrl,
      label,
      ...classification,
    });
  }
  const seen = new Set();
  return resources
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url))
    .filter((resource) => {
      if (seen.has(resource.url)) return false;
      seen.add(resource.url);
      return true;
    });
}

async function fetchText(url, {
  fetchImpl,
  timeoutMs,
  maximumBytes,
  expectedHost,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/xml;q=0.9'
      }
    });
    if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'unknown'}`);
    if (response.url && new URL(response.url).hostname.toLowerCase() !== expectedHost) {
      throw new Error('Electrolux product discovery escaped the official host');
    }
    const text = await response.text();
    if (!text || Buffer.byteLength(text) > maximumBytes) {
      throw new Error('Electrolux product discovery response size outside limits');
    }
    return text;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`timeout after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function persistDiscoverySource(text, {
  sourceUrl,
  requestedModel,
  contentType,
  extension,
  method,
  writeObject,
}) {
  const bytes = Buffer.from(String(text || ''), 'utf8');
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

function candidateDiscoveryProvenance(pageProvenance, artifactUrl, model, artifactLinkUrl = artifactUrl) {
  return {
    schemaVersion: 1,
    method: 'official_product_page',
    market: 'AU',
    discoveryUrl: pageProvenance.discoveryUrl,
    requestedModel: model,
    matchedModel: model,
    artifactUrl,
    artifactLinkUrl,
    discoveryContentSha256: pageProvenance.contentSha256,
    discoveryObjectPath: pageProvenance.objectPath,
    discoveryByteSize: pageProvenance.byteSize,
  };
}

function sourceLane(laneId, required, supported, status, provenance, reason = null) {
  return { laneId, required, supported, status, candidateCount: 0, provenance, reason };
}

function typedSourceLanes({ sitemapProvenance, pageProvenance, documentCount, error }) {
  const currentComplete = Boolean(sitemapProvenance && pageProvenance);
  const detailComplete = Boolean(pageProvenance);
  const documentComplete = detailComplete && documentCount > 0;
  const reason = error || 'Exact Electrolux product evidence was not completed.';
  return [
    sourceLane('current_product', true, true, currentComplete ? 'complete' : 'retryable',
      currentComplete ? [sitemapProvenance] : [], currentComplete ? null : reason),
    sourceLane('discontinued_archive', false, false, 'unsupported', [],
      'The bounded Electrolux resolver does not enumerate a discontinued archive.'),
    sourceLane('support_search_api', false, false, 'unsupported', [],
      'No supported Electrolux AU product search API is used by this resolver.'),
    sourceLane('official_document_cdn', true, true, documentComplete ? 'complete' : 'retryable',
      documentComplete ? [pageProvenance] : [], documentComplete ? null : reason),
    sourceLane('official_product_detail', true, true, detailComplete ? 'complete' : 'retryable',
      detailComplete ? [pageProvenance] : [], detailComplete ? null : reason),
  ];
}

async function findTypedElectroluxProductDocuments(target, {
  pageFetchImpl,
  timeoutMs,
  maximumBytes,
  writeObject,
}) {
  if (!pageFetchImpl) throw new Error('Electrolux typed discovery requires fetch');
  const brand = resolveElectroluxGroupBrand(target);
  const model = exactModel(target);
  const sitemapUrl = BRAND_SITEMAPS.get(brand);
  const productHost = BRAND_PRODUCT_HOSTS.get(brand);
  if (!sitemapUrl || !productHost) throw new Error(`No typed product discovery for ${brand}`);

  let sitemapProvenance = null;
  let pageProvenance = null;
  let pageIdentityValid = false;
  let productUrl = null;
  let documentResources = [];
  let error = null;
  try {
    const sitemapXml = await fetchText(sitemapUrl, {
      fetchImpl: pageFetchImpl, timeoutMs, maximumBytes, expectedHost: productHost,
    });
    sitemapProvenance = await persistDiscoverySource(sitemapXml, {
      sourceUrl: sitemapUrl,
      requestedModel: model,
      contentType: 'application/xml',
      extension: 'xml',
      method: 'official_sitemap',
      writeObject,
    });
    const exactUrls = [...new Set(extractSitemapUrls(sitemapXml)
      .filter((url) => productUrlMatchesExactModel(url, model, productHost)))];
    if (exactUrls.length !== 1) {
      throw new Error(exactUrls.length
        ? `Electrolux sitemap returned ambiguous exact product pages for ${model}`
        : `Electrolux sitemap returned no exact product page for ${model}`);
    }
    productUrl = exactUrls[0];
    const html = await fetchText(productUrl, {
      fetchImpl: pageFetchImpl, timeoutMs, maximumBytes, expectedHost: productHost,
    });
    pageProvenance = await persistDiscoverySource(html, {
      sourceUrl: productUrl,
      requestedModel: model,
      contentType: 'text/html',
      extension: 'html',
      method: 'official_product_page',
      writeObject,
    });
    if (!pageIdentifiesExactModel(html, model)) {
      throw new Error(`Electrolux product page does not identify exact model ${model}`);
    }
    pageIdentityValid = true;
    documentResources = extractProductDocuments(html, productUrl, brand);
    if (!documentResources.length) {
      throw new Error(`Electrolux product page has no supported documents for ${model}`);
    }
  } catch (cause) {
    error = cause.message;
  }

  const resources = pageIdentityValid && pageProvenance && productUrl ? [{
    sourceUrl: productUrl,
    url: productUrl,
    resourceType: 'product_page',
    sourceLaneId: 'official_product_detail',
    sourceModelHint: model,
    requiredAttempt: false,
    discoveryProvenance: candidateDiscoveryProvenance(pageProvenance, productUrl, model),
  }, ...documentResources.map((resource) => ({
    ...resource,
    sourceLaneId: 'official_document_cdn',
    sourceModelHint: model,
    discoveryProvenance: candidateDiscoveryProvenance(
      pageProvenance,
      resource.sourceUrl,
      model,
      resource.artifactLinkUrl,
    ),
  }))] : [];
  const best = resources.find((resource) => resource.resourceType === 'dimension_sheet')
    || resources.find((resource) => resource.resourceType === 'fact_sheet')
    || resources.find((resource) => resource.sourceLaneId === 'official_document_cdn')
    || null;
  return {
    sourceUrl: best?.sourceUrl ?? null,
    source: best ? `${brand.toLowerCase()}-official-${best.resourceType}` : `${brand.toLowerCase()}-official-no-candidate`,
    resourceType: best?.resourceType ?? 'product_page',
    verifiedAlias: model,
    productUrl,
    resources,
    sourceLanes: typedSourceLanes({
      sitemapProvenance,
      pageProvenance: pageIdentityValid ? pageProvenance : null,
      documentCount: documentResources.length,
      error,
    }),
    ...(best?.discoveryProvenance ? { discoveryProvenance: best.discoveryProvenance } : {}),
    ...(error ? { reason: error } : {}),
  };
}

function buildElectroluxGroupFactsheetUrl(target = {}) {
  const brand = resolveElectroluxGroupBrand(target);
  if (!brand) {
    throw new Error(`Unsupported Electrolux group brand: ${target.brand || target.product?.brand || ''}`);
  }
  const url = new URL(FACTSHEET_ENDPOINT);
  url.searchParams.set('modelNumber', exactModel(target));
  url.searchParams.set('brand', brand);
  return url.toString();
}

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  return headers[name] || headers[name.toLowerCase()] || '';
}

async function electroluxGroupFetch(url, options = {}) {
  const isHead = String(options.method || 'GET').toUpperCase() === 'HEAD';
  const args = [
    '-L',
    '--fail',
    '--silent',
    '--show-error',
    '--max-time',
    '60',
    '--user-agent',
    headerValue(options.headers, 'User-Agent') || USER_AGENT,
    '--header',
    `Accept: ${headerValue(options.headers, 'Accept') || 'application/pdf'}`
  ];
  if (isHead) args.push('--head');
  args.push(String(url));

  let stdout;
  try {
    ({ stdout } = await execFileAsync('curl', args, {
      encoding: isHead ? 'utf8' : 'buffer',
      maxBuffer: CURL_MAX_BUFFER,
      signal: options.signal
    }));
  } catch (error) {
    const detail = String(error.stderr || error.message || '').trim();
    throw new Error(`Electrolux group curl fetch failed: ${detail}`);
  }

  if (isHead) {
    const contentTypes = [...String(stdout).matchAll(/^content-type:\s*([^\r\n]+)/gim)];
    const contentType = contentTypes.at(-1)?.[1]?.trim() || '';
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => name.toLowerCase() === 'content-type' ? contentType : null }
    };
  }

  const body = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  if (body.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error('Electrolux group curl fetch did not return PDF magic bytes');
  }
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        if (name.toLowerCase() === 'content-type') return 'application/pdf';
        if (name.toLowerCase() === 'content-length') return String(body.length);
        return null;
      }
    },
    arrayBuffer: async () => body
  };
}

async function findElectroluxGroupFactsheet(target = {}, {
  fetchImpl = electroluxGroupFetch,
  pageFetchImpl = globalThis.fetch,
  timeoutMs = 30_000,
  maximumBytes = DEFAULT_MAXIMUM_TEXT_BYTES,
  writeObject = null,
} = {}) {
  if (typeof writeObject === 'function') {
    return findTypedElectroluxProductDocuments(target, {
      pageFetchImpl,
      timeoutMs,
      maximumBytes,
      writeObject,
    });
  }
  if (!fetchImpl) throw new Error('Electrolux group factsheet resolver requires fetch');
  const brand = resolveElectroluxGroupBrand(target);
  const model = exactModel(target);
  const sourceUrl = buildElectroluxGroupFactsheetUrl(target);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(sourceUrl, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/pdf' }
    });
    if (!response.ok) {
      throw new Error(`Official factsheet returned HTTP ${response.status} for ${model}`);
    }
    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
    if (!contentType.includes('application/pdf')) {
      throw new Error(`Official factsheet response is not a PDF for ${model}`);
    }
    return {
      sourceUrl,
      source: `${brand.toLowerCase()}-official-fact_sheet`,
      resourceType: 'fact_sheet',
      verifiedAlias: model,
      productUrl: null,
      label: `${brand} ${model} Fact Sheet`
    };
  } finally {
    clearTimeout(timer);
  }
}

exports.buildElectroluxGroupFactsheetUrl = buildElectroluxGroupFactsheetUrl;
exports.electroluxGroupFetch = electroluxGroupFetch;
exports.findElectroluxGroupFactsheet = findElectroluxGroupFactsheet;
exports.resolveElectroluxGroupBrand = resolveElectroluxGroupBrand;
