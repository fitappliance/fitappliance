const { createHash } = require('node:crypto');

const SITEMAP_URL = 'https://www.smeg.com/au/sitemap/products.xml';
const DEFAULT_TIMEOUT_MS = 20_000;
const MAXIMUM_SITEMAP_BYTES = 24 * 1024 * 1024;
const MAXIMUM_PRODUCT_PAGE_BYTES = 8 * 1024 * 1024;

function normalizeModel(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function exactSmegProductUrl(value, model) {
  try {
    const url = new URL(decodeXml(value));
    const segments = url.pathname.split('/').filter(Boolean);
    return url.protocol === 'https:'
      && url.hostname.toLowerCase() === 'www.smeg.com'
      && segments.length === 3
      && segments[0].toLowerCase() === 'au'
      && segments[1].toLowerCase() === 'products'
      && normalizeModel(decodeURIComponent(segments[2])) === normalizeModel(model)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function extractSmegProductUrlFromSitemap(xml, model) {
  const target = normalizeModel(model);
  if (!target || /[*?]/.test(String(model || ''))) return null;
  for (const match of String(xml || '').matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)) {
    const exact = exactSmegProductUrl(match[1].trim(), target);
    if (exact) return exact;
  }
  return null;
}

function attribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(tag || '').match(new RegExp(`\\b${escaped}=["']([^"']+)["']`, 'i'))?.[1] ?? null;
}

function canonicalProductUrl(html) {
  for (const match of String(html || '').matchAll(/<link\b[^>]*>/gi)) {
    const rel = attribute(match[0], 'rel');
    if (String(rel || '').split(/\s+/).some((value) => value.toLowerCase() === 'canonical')) {
      return attribute(match[0], 'href');
    }
  }
  return null;
}

function exactModelMention(html, model) {
  const target = String(model || '').trim();
  if (!target) return false;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, 'i').test(String(html || ''));
}

function exactCatalogUrl(value, model) {
  try {
    const url = new URL(decodeXml(value));
    const segments = url.pathname.split('/').filter(Boolean);
    return url.protocol === 'https:'
      && url.hostname.toLowerCase() === 'pi-exchange.smeg.it'
      && segments.length === 3
      && segments[0].toLowerCase() === 'catalog'
      && normalizeModel(decodeURIComponent(segments[1])) === normalizeModel(model)
      && segments[2].toLowerCase() === 'en-au'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function extractSmegProductResources(html, productUrl, model) {
  const canonical = exactSmegProductUrl(canonicalProductUrl(html), model);
  if (!canonical || canonical !== new URL(productUrl).toString()) {
    throw new Error('Smeg canonical product model does not match the requested model');
  }
  if (!exactModelMention(html, model)) {
    throw new Error('Smeg product page does not mention the exact requested model');
  }
  const resources = [];
  for (const match of String(html || '').matchAll(/<a\b[^>]*>/gi)) {
    const sourceUrl = exactCatalogUrl(attribute(match[0], 'href'), model);
    if (sourceUrl) resources.push({ sourceUrl, resourceType: 'specification_sheet' });
  }
  return [...new Map(resources.map((resource) => [resource.sourceUrl, resource])).values()];
}

async function fetchBoundedText(url, {
  fetchImpl,
  timeoutMs,
  maximumBytes,
  acceptedContentTypes,
}) {
  if (typeof fetchImpl !== 'function') throw new Error('Smeg official finder requires fetch');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: acceptedContentTypes.join(','),
        'User-Agent': 'FitApplianceEvidenceBot/1.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!acceptedContentTypes.some((type) => contentType.startsWith(type))) {
      throw new Error(`unexpected content type ${contentType || 'missing'}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > maximumBytes) {
      throw new Error(`response size outside limit 1-${maximumBytes}`);
    }
    return bytes;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`timeout after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function persistDiscovery(bytes, {
  sourceUrl,
  requestedModel,
  method,
  contentType,
  extension,
  writeObject,
}) {
  if (typeof writeObject !== 'function') return null;
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

function sourceLane(laneId, required, supported, status, provenance, candidateCount, reason = null) {
  return { laneId, required, supported, status, candidateCount, provenance, reason };
}

function sourceLanes({ sitemapProvenance = null, pageProvenance = null, documentCount = 0, reason = null }) {
  const currentComplete = Boolean(sitemapProvenance);
  const pageComplete = Boolean(pageProvenance);
  return [
    sourceLane(
      'current_product', true, true, currentComplete ? 'complete' : 'retryable',
      sitemapProvenance ? [sitemapProvenance] : [], 0,
      currentComplete ? null : reason || 'Smeg AU product sitemap was not persisted.',
    ),
    sourceLane(
      'discontinued_archive', false, false, 'unsupported', [], 0,
      'Smeg AU does not expose a bounded public discontinued-product archive.',
    ),
    sourceLane(
      'support_search_api', false, false, 'unsupported', [], 0,
      'Smeg AU does not expose a bounded exact-model public support search API.',
    ),
    sourceLane(
      'official_document_cdn', true, true,
      pageComplete && documentCount > 0 ? 'complete' : 'retryable',
      pageProvenance ? [pageProvenance] : [], documentCount,
      pageComplete && documentCount > 0 ? null : reason || 'No exact-model product-sheet link was persisted.',
    ),
    sourceLane(
      'official_product_detail', true, true, pageComplete ? 'complete' : 'retryable',
      pageProvenance ? [pageProvenance] : [], pageComplete ? 1 : 0,
      pageComplete ? null : reason || 'No exact-model Smeg AU product page was persisted.',
    ),
  ];
}

function candidateProvenance(pageProvenance, model, artifactUrl) {
  return {
    schemaVersion: 1,
    method: 'official_product_page',
    market: 'AU',
    discoveryUrl: pageProvenance.discoveryUrl,
    requestedModel: model,
    matchedModel: model,
    artifactUrl,
    artifactLinkUrl: artifactUrl,
    discoveryContentSha256: pageProvenance.contentSha256,
    discoveryObjectPath: pageProvenance.objectPath,
    discoveryByteSize: pageProvenance.byteSize,
  };
}

async function findSmegOfficialEvidence(target = {}, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  writeObject = null,
} = {}) {
  const model = String(target.sku || target.model || target.product?.model || '').trim();
  if (!model || /[*?]/.test(model)) throw new TypeError('Smeg official finder requires an exact model');
  let sitemapProvenance = null;
  try {
    const sitemapBytes = await fetchBoundedText(SITEMAP_URL, {
      fetchImpl,
      timeoutMs,
      maximumBytes: MAXIMUM_SITEMAP_BYTES,
      acceptedContentTypes: ['application/xml', 'text/xml'],
    });
    sitemapProvenance = await persistDiscovery(sitemapBytes, {
      sourceUrl: SITEMAP_URL,
      requestedModel: model,
      method: 'official_product_sitemap',
      contentType: 'application/xml',
      extension: 'xml',
      writeObject,
    });
    const productUrl = extractSmegProductUrlFromSitemap(sitemapBytes.toString('utf8'), model);
    if (!productUrl) {
      const reason = `Exact model ${model} was not present in the persisted Smeg AU product sitemap.`;
      return {
        sourceUrl: null,
        source: 'smeg-official-no-exact-product',
        resourceType: 'product_page',
        resources: [],
        sourceLanes: sourceLanes({ sitemapProvenance, reason }),
        reason,
      };
    }
    const pageBytes = await fetchBoundedText(productUrl, {
      fetchImpl,
      timeoutMs,
      maximumBytes: MAXIMUM_PRODUCT_PAGE_BYTES,
      acceptedContentTypes: ['text/html'],
    });
    const pageProvenance = await persistDiscovery(pageBytes, {
      sourceUrl: productUrl,
      requestedModel: model,
      method: 'official_product_page',
      contentType: 'text/html',
      extension: 'html',
      writeObject,
    });
    const documents = extractSmegProductResources(pageBytes.toString('utf8'), productUrl, model);
    if (!pageProvenance || !documents.length) {
      const reason = 'Exact Smeg product page or product-sheet link was not persisted.';
      return {
        sourceUrl: null,
        source: 'smeg-official-no-persisted-document',
        resourceType: 'product_page',
        resources: [],
        sourceLanes: sourceLanes({ sitemapProvenance, pageProvenance, reason }),
        reason,
      };
    }
    const resources = [
      ...documents.map((document) => ({
        ...document,
        sourceLaneId: 'official_document_cdn',
        sourceModelHint: model,
        requiredAttempt: true,
        discoveryProvenance: candidateProvenance(pageProvenance, model, document.sourceUrl),
      })),
      {
        sourceUrl: productUrl,
        resourceType: 'product_page',
        sourceLaneId: 'official_product_detail',
        sourceModelHint: model,
        requiredAttempt: false,
      },
    ];
    return {
      sourceUrl: documents[0].sourceUrl,
      source: 'smeg-official-product-catalog',
      resourceType: 'specification_sheet',
      productPageUrl: productUrl,
      resources,
      discoveryProvenance: resources[0].discoveryProvenance,
      sourceLanes: sourceLanes({
        sitemapProvenance,
        pageProvenance,
        documentCount: documents.length,
      }),
    };
  } catch (error) {
    const reason = String(error?.message || error);
    return {
      sourceUrl: null,
      source: 'smeg-official-retryable',
      resourceType: 'product_page',
      resources: [],
      sourceLanes: sourceLanes({ sitemapProvenance, reason }),
      reason,
    };
  }
}

exports.extractSmegProductResources = extractSmegProductResources;
exports.extractSmegProductUrlFromSitemap = extractSmegProductUrlFromSitemap;
exports.findSmegOfficialEvidence = findSmegOfficialEvidence;
