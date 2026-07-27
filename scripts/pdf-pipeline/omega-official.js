const { createHash } = require('node:crypto');

const DEFAULT_USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';
const SITEMAP_URL = 'https://omegaappliances.com.au/sitemap.xml';
const SPECIFICATION_SHEETS_URL = 'https://omegaappliances.co.nz/pages/specification-sheets';

let cachedSitemapXml = null;

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function getTargetSku(target = {}) {
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function boundedSkuPattern(sku) {
  const separated = [...normalizeSku(sku)].join('[-_.\\s/]*');
  return new RegExp(`(?:^|[^A-Z0-9])${separated}(?=$|[^A-Z0-9])`, 'i');
}

function extractLocsFromSitemap(xml) {
  return [...String(xml || '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => decodeHtml(match[1]).trim());
}

function isOmegaProductUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'omegaappliances.com.au'
      && /\/(?:archive\/)?[^?#]*\/p\//i.test(url.pathname);
  } catch {
    return false;
  }
}

function urlMatchesTargetSku(value, sku) {
  try {
    const pathname = decodeURIComponent(new URL(value).pathname);
    return boundedSkuPattern(sku).test(pathname);
  } catch {
    return false;
  }
}

function catalogStateForUrl(value) {
  return /\/archive\//i.test(new URL(value).pathname) ? 'archived' : 'current';
}

function pageIdentifiesTarget(html, sku) {
  const identityText = [];
  for (const match of String(html || '').matchAll(/<(?:title|h1)\b[^>]*>([\s\S]*?)<\/(?:title|h1)>/gi)) {
    identityText.push(decodeHtml(match[1]).replace(/<[^>]+>/g, ' '));
  }
  return identityText.some((value) => boundedSkuPattern(sku).test(value));
}

function classifyDownload(label, href) {
  const haystack = `${label || ''} ${href || ''}`;
  if (/warranty|energy\s*label|water\s*rating|wels/i.test(haystack)) return null;
  if (/spec(?:ification)?|data\s*sheet|product\s*card/i.test(haystack)) {
    return { resourceType: 'specification_sheet', score: 120 };
  }
  if (/install/i.test(haystack)) return { resourceType: 'installation_guide', score: 110 };
  if (/user|instruction|manual/i.test(haystack)) return { resourceType: 'user_manual', score: 100 };
  return { resourceType: 'family_manual', score: 10 };
}

function extractOmegaDownloadLinks(html, pageUrl) {
  const links = [];
  const anchorPattern = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || '').matchAll(anchorPattern)) {
    const href = match[1].match(/\bhref=["']([^"']+\.pdf(?:\?[^"']*)?)["']/i)?.[1];
    if (!href) continue;
    const label = decodeHtml(match[2]).replace(/<[^>]+>/g, ' ').trim();
    const classified = classifyDownload(label, href);
    if (!classified) continue;
    let sourceUrl;
    try { sourceUrl = new URL(decodeHtml(href), pageUrl).toString(); } catch { continue; }
    if (new URL(sourceUrl).hostname !== 'omegaappliances.com.au') continue;
    links.push({ sourceUrl, url: sourceUrl, label, ...classified });
  }
  const unique = new Map();
  for (const link of links) {
    const current = unique.get(link.sourceUrl);
    if (!current || link.score > current.score) unique.set(link.sourceUrl, link);
  }
  return [...unique.values()].sort((a, b) => b.score - a.score || a.sourceUrl.localeCompare(b.sourceUrl));
}

// Retained for the legacy NZ resource-page fixture and offline migration tools.
function extractOmegaSpecResources(html) {
  const resources = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || '').matchAll(anchorPattern)) {
    const href = decodeHtml(match[1]);
    const label = decodeHtml(match[2]).replace(/<[^>]+>/g, ' ');
    const labelSku = label.match(/\bSpecifications?\s*:\s*([A-Z0-9][A-Z0-9._-]{2,})\b/i)?.[1];
    const filenameSku = decodeURIComponent(href).match(/(?:Specifications?|Specification)-([A-Z0-9][A-Z0-9._-]{2,})\.pdf/i)?.[1];
    const sku = labelSku || filenameSku;
    if (!sku) continue;
    resources.push({
      sku: sku.trim(),
      normalizedSku: normalizeSku(sku),
      sourceUrl: href,
      url: href,
      source: 'omega-official-spec_sheet',
      resourceType: 'specification_sheet',
      score: 100,
    });
  }
  return resources;
}

async function fetchText(url, {
  fetchImpl = globalThis.fetch,
  userAgent = DEFAULT_USER_AGENT,
  timeoutMs = 30_000,
  accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
} = {}) {
  if (!fetchImpl) throw new Error('Omega official finder requires fetch');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': userAgent, Accept: accept },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function probePdfMagic(url, {
  fetchImpl = globalThis.fetch,
  userAgent = DEFAULT_USER_AGENT,
  timeoutMs = 30_000,
} = {}) {
  if (!fetchImpl) throw new Error('Omega official finder requires fetch');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-7', 'User-Agent': userAgent },
      signal: controller.signal,
    });
    if (!response.ok && response.status !== 206) return { ok: false, status: response.status };
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      ok: bytes.toString('latin1').startsWith('%PDF-'),
      status: response.status,
      contentType: response.headers?.get?.('content-type') || '',
    };
  } finally {
    clearTimeout(timer);
  }
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

function sourceLane(laneId, required, supported, status, provenance, candidateCount, reason = null) {
  return { laneId, required, supported, status, candidateCount, provenance, reason };
}

function omegaSourceLanes({ sitemapProvenance, sitemapError, resources, pageErrors }) {
  const sitemapComplete = !sitemapError;
  const detailComplete = sitemapComplete && pageErrors.length === 0;
  const productResources = resources.filter((resource) => resource.sourceLaneId === 'official_product_detail');
  const documentResources = resources.filter((resource) => resource.sourceLaneId === 'official_document_cdn');
  const currentCount = productResources.filter((resource) => resource.catalogState === 'current').length;
  const archiveCount = productResources.filter((resource) => resource.catalogState === 'archived').length;
  const sitemapReason = sitemapComplete ? null : sitemapError || 'Official sitemap inventory was not completed.';
  const detailReason = detailComplete ? null : pageErrors[0] || sitemapReason;
  const detailProvenance = productResources
    .map((resource) => resource.discoveryProvenance)
    .filter(Boolean)
    .map((provenance) => ({
      schemaVersion: 1,
      method: 'official_product_page',
      market: 'AU',
      discoveryUrl: provenance.discoveryUrl,
      requestedModel: provenance.requestedModel,
      contentType: 'text/html',
      contentSha256: provenance.discoveryContentSha256,
      objectPath: provenance.discoveryObjectPath,
      byteSize: provenance.discoveryByteSize,
    }));
  const inventoryProvenance = sitemapProvenance ? [sitemapProvenance] : [];
  const dependentProvenance = detailProvenance.length ? detailProvenance : inventoryProvenance;
  return [
    sourceLane('current_product', true, true, sitemapComplete ? 'complete' : 'retryable', inventoryProvenance, currentCount, sitemapReason),
    sourceLane('discontinued_archive', true, true, sitemapComplete ? 'complete' : 'retryable', inventoryProvenance, archiveCount, sitemapReason),
    sourceLane('support_search_api', false, false, 'unsupported', [], 0, 'Omega robots policy does not expose a supported search API.'),
    sourceLane('official_document_cdn', true, true, detailComplete ? 'complete' : 'retryable', dependentProvenance, documentResources.length, detailReason),
    sourceLane('official_product_detail', true, true, detailComplete ? 'complete' : 'retryable', dependentProvenance, productResources.length, detailReason),
  ];
}

async function getSitemapXml(options) {
  if (cachedSitemapXml) return cachedSitemapXml;
  cachedSitemapXml = await fetchText(options.sitemapUrl, options);
  return cachedSitemapXml;
}

async function findOmegaOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  userAgent = DEFAULT_USER_AGENT,
  timeoutMs = 30_000,
  verifyPdf = true,
  sitemapUrl = SITEMAP_URL,
  writeObject = null,
} = {}) {
  const rawSku = getTargetSku(target);
  const sku = normalizeSku(rawSku);
  if (!sku) throw new Error('Omega official finder requires a SKU');

  let sitemapXml = '';
  let sitemapProvenance = null;
  let sitemapError = null;
  try {
    sitemapXml = await getSitemapXml({ fetchImpl, userAgent, timeoutMs, sitemapUrl });
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

  const productUrls = [...new Set(extractLocsFromSitemap(sitemapXml)
    .filter(isOmegaProductUrl)
    .filter((url) => urlMatchesTargetSku(url, sku)))].sort();
  const resources = [];
  const pageErrors = [];

  for (const productUrl of productUrls) {
    try {
      const html = await fetchText(productUrl, { fetchImpl, userAgent, timeoutMs });
      const pageProvenance = await persistDiscoverySource({
        text: html,
        sourceUrl: productUrl,
        requestedModel: sku,
        contentType: 'text/html',
        extension: 'html',
        method: 'official_product_page',
        writeObject,
      });
      if (!pageIdentifiesTarget(html, sku)) {
        pageErrors.push(`${productUrl}: product page does not identify exact model ${sku}`);
        continue;
      }
      const catalogState = catalogStateForUrl(productUrl);
      const productDiscovery = candidateDiscoveryProvenance(pageProvenance, {
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
        catalogState,
        requiredAttempt: false,
        ...(productDiscovery ? { discoveryProvenance: productDiscovery } : {}),
      });
      for (const link of extractOmegaDownloadLinks(html, productUrl)) {
        const discoveryProvenance = candidateDiscoveryProvenance(pageProvenance, {
          productUrl,
          requestedModel: sku,
          artifactUrl: link.sourceUrl,
        });
        resources.push({
          ...link,
          sourceLaneId: 'official_document_cdn',
          sourceModelHint: sku,
          catalogState,
          requiredAttempt: true,
          ...(discoveryProvenance ? { discoveryProvenance } : {}),
        });
      }
    } catch (error) {
      pageErrors.push(`${productUrl}: ${error.message}`);
    }
  }

  const documents = resources.filter((resource) => resource.sourceLaneId === 'official_document_cdn');
  let best = documents[0] || null;
  if (verifyPdf && documents.length) {
    best = null;
    for (const resource of documents) {
      const probe = await probePdfMagic(resource.sourceUrl, {
        fetchImpl,
        userAgent,
        timeoutMs,
      }).catch((error) => ({ ok: false, error: error.message }));
      if (probe.ok) {
        best = resource;
        break;
      }
      pageErrors.push(`${resource.sourceUrl}: ${probe.error || probe.status || 'not pdf'}`);
    }
  }

  const sourceLanes = omegaSourceLanes({ sitemapProvenance, sitemapError, resources, pageErrors });
  const result = {
    sourceUrl: best?.sourceUrl ?? null,
    source: best ? `omega-official-${best.resourceType}` : 'omega-official-no-candidate',
    resourceType: best?.resourceType ?? 'product_page',
    productUrl: resources.find((resource) => resource.sourceLaneId === 'official_product_detail')?.sourceUrl,
    resources,
    sourceLanes,
    ...(best?.discoveryProvenance ? { discoveryProvenance: best.discoveryProvenance } : {}),
  };
  if (pageErrors.length) result.reason = pageErrors.join(' | ');
  else if (!best) result.reason = `Omega Australian product document not found for ${rawSku}`;
  return result;
}

function clearOmegaCaches() {
  cachedSitemapXml = null;
}

exports.SITEMAP_URL = SITEMAP_URL;
exports.SPECIFICATION_SHEETS_URL = SPECIFICATION_SHEETS_URL;
exports.clearOmegaCaches = clearOmegaCaches;
exports.extractOmegaDownloadLinks = extractOmegaDownloadLinks;
exports.extractOmegaSpecResources = extractOmegaSpecResources;
exports.findOmegaOfficialPdf = findOmegaOfficialPdf;
exports.normalizeSku = normalizeSku;
exports.probePdfMagic = probePdfMagic;
