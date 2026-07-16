const { createHash } = require('node:crypto');
const { load } = require('cheerio');

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAXIMUM_HTML_BYTES = 8 * 1024 * 1024;
const DEFAULT_USER_AGENT = 'FitAppliance-EvidenceBot/1.0 (+https://www.fitappliance.com.au/about/editorial-standards)';
const PRODUCT_HOST = 'www.bosch-home.com.au';
const DOCUMENT_HOSTS = new Set(['media3.bsh-group.com', 'media3.bosch-home.com']);
const DOCUMENT_TYPES = new Map([
  ['product-specification', 'specification_sheet'],
  ['user-manuals', 'user_manual'],
  ['installation-instruction', 'installation_guide'],
]);
const DOCUMENT_PRIORITY = new Map([
  ['specification_sheet', 0],
  ['user_manual', 1],
  ['installation_guide', 2],
]);

function requiredModel(value) {
  const model = String(value ?? '').trim().toUpperCase();
  if (!model) throw new TypeError('Bosch exact model required');
  if (/[*?]/.test(model)) throw new TypeError('Bosch exact model cannot contain a wildcard');
  return model;
}

function exactModelMention(value, model) {
  const escaped = model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, 'i').test(String(value ?? ''));
}

function boschProductPageUrl(model) {
  return `https://${PRODUCT_HOST}/en/mkt-product/${encodeURIComponent(requiredModel(model))}`;
}

function decodeReactPayload(value) {
  return String(value ?? '')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&');
}

function approvedDocumentUrl(value) {
  let url;
  try { url = new URL(String(value ?? '').trim()); } catch { return null; }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || !DOCUMENT_HOSTS.has(host)) return null;
  if (!/\.pdf$/i.test(url.pathname)) return null;
  url.hash = '';
  return url.toString();
}

function extractBoschDocumentResources(html) {
  const decoded = decodeReactPayload(html);
  const resources = [];
  const seen = new Set();
  for (const match of decoded.matchAll(/\{[^{}]{1,8192}\}/g)) {
    const candidate = match[0];
    if (!candidate.includes('"titleKey"') || !candidate.includes('"url"')) continue;
    let document;
    try { document = JSON.parse(candidate); } catch { continue; }
    const resourceType = DOCUMENT_TYPES.get(String(document.titleKey ?? '').trim());
    const url = resourceType ? approvedDocumentUrl(document.url) : null;
    const filename = String(document.filename ?? '').trim();
    if (!url || !filename || !/\.pdf$/i.test(filename) || seen.has(url)) continue;
    seen.add(url);
    resources.push({
      id: String(document.id ?? '').trim() || null,
      titleKey: String(document.titleKey).trim(),
      type: String(document.type ?? '').trim() || null,
      filename,
      url,
      resourceType,
      requiredAttempt: true,
    });
  }
  return resources.sort((left, right) => (
    DOCUMENT_PRIORITY.get(left.resourceType) - DOCUMENT_PRIORITY.get(right.resourceType)
      || left.url.localeCompare(right.url)
  ));
}

function productPageProvesExactModel(html, model) {
  const $ = load(String(html ?? ''));
  const identityText = [
    $('title').text(),
    $('h1').map((_, element) => $(element).text()).get().join(' '),
    $('meta[name="title"],meta[name="description"],meta[property="og:title"]')
      .map((_, element) => $(element).attr('content')).get().join(' '),
  ].join(' ');
  if (!exactModelMention(identityText, model)) return false;
  const canonical = $('link[rel="canonical"]').attr('href');
  if (!canonical) return true;
  try {
    const url = new URL(canonical);
    const pageModel = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) ?? '');
    return url.hostname.toLowerCase() === PRODUCT_HOST && requiredModel(pageModel) === model;
  } catch {
    return false;
  }
}

async function fetchProductHtml(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maximumHtmlBytes = DEFAULT_MAXIMUM_HTML_BYTES,
  userAgent = DEFAULT_USER_AGENT,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Bosch official finder requires fetch');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': userAgent },
    });
    if (!response?.ok) throw new Error(`Bosch product page returned HTTP ${response?.status ?? 'unknown'}`);
    const finalUrl = new URL(response.url || url);
    if (finalUrl.protocol !== 'https:' || finalUrl.hostname.toLowerCase() !== PRODUCT_HOST) {
      throw new Error('Bosch product page escaped the official Australian host');
    }
    const expectedPath = new URL(url).pathname.replace(/\/$/, '');
    if (finalUrl.pathname.replace(/\/$/, '') !== expectedPath) {
      throw new Error('Bosch product page redirected to a different model');
    }
    const contentType = String(response.headers?.get?.('content-type') ?? '').toLowerCase();
    if (contentType && !contentType.startsWith('text/html') && !contentType.startsWith('application/xhtml+xml')) {
      throw new Error('Bosch product page returned non-HTML content');
    }
    const declaredLength = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maximumHtmlBytes) {
      throw new Error('Bosch product page exceeds maximum HTML size');
    }
    const bytes = response.arrayBuffer
      ? Buffer.from(await response.arrayBuffer())
      : Buffer.from(await response.text(), 'utf8');
    if (!bytes.length || bytes.length > maximumHtmlBytes) {
      throw new Error('Bosch product page HTML size outside limits');
    }
    return { bytes, html: bytes.toString('utf8'), finalUrl: finalUrl.toString() };
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Bosch product page timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function findBoschOfficialPdf(target = {}, options = {}) {
  const model = requiredModel(target.model ?? target.sku ?? target.product?.model);
  if (typeof options.writeObject !== 'function') {
    throw new TypeError('Bosch content-addressed object writer required');
  }
  const productPageUrl = boschProductPageUrl(model);
  const page = await fetchProductHtml(productPageUrl, options);
  if (!productPageProvesExactModel(page.html, model)) {
    throw new Error(`Bosch product page does not prove exact model ${model}`);
  }
  const resources = extractBoschDocumentResources(page.html);
  if (!resources.length) throw new Error(`Bosch exact-model technical documents not found for ${model}`);

  const discoveryContentSha256 = createHash('sha256').update(page.bytes).digest('hex');
  const discoveryObjectPath = `evidence/web/sha256/${discoveryContentSha256.slice(0, 2)}/${discoveryContentSha256.slice(2, 4)}/${discoveryContentSha256}.html`;
  await options.writeObject(discoveryObjectPath, page.bytes);
  const enriched = resources.map((resource) => ({
    ...resource,
    discoveryProvenance: {
      schemaVersion: 1,
      method: 'official_product_page',
      market: 'AU',
      discoveryUrl: page.finalUrl,
      requestedModel: model,
      matchedModel: model,
      artifactUrl: resource.url,
      artifactLinkUrl: resource.url,
      discoveryContentSha256,
      discoveryObjectPath,
      discoveryByteSize: page.bytes.length,
      discoveryRecordType: 'serialized_technical_document_manifest',
      ...(resource.id ? { documentId: resource.id } : {}),
      documentTitleKey: resource.titleKey,
      originalFileName: resource.filename,
    },
  }));
  return {
    sourceUrl: enriched[0].url,
    source: `bosch-official-${enriched[0].resourceType}`,
    resourceType: enriched[0].resourceType,
    productPageUrl: page.finalUrl,
    resources: enriched,
    discoveryProvenance: enriched[0].discoveryProvenance,
  };
}

exports.boschProductPageUrl = boschProductPageUrl;
exports.extractBoschDocumentResources = extractBoschDocumentResources;
exports.findBoschOfficialPdf = findBoschOfficialPdf;
