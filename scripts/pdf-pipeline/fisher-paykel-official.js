require('dotenv').config({ quiet: true });

const { createHash } = require('node:crypto');

const FP_BASE_URL = 'https://www.fisherpaykel.com';
const FP_SUPPORT_BASE_URL = 'https://mf-support.mfe.fisherpaykel.com';
const DEFAULT_USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';
const DEFAULT_TIMEOUT_MS = 20_000;
const MAXIMUM_SUPPORT_API_BYTES = 8 * 1024 * 1024;

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

async function fetchResponse(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT
} = {}, init = {}) {
  if (!fetchImpl) throw new Error('Fisher & Paykel official finder requires fetch');
  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    return await fetchImpl(url, {
      ...init,
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml',
        ...(init.headers || {})
      },
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Fisher & Paykel fetch timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function fetchHtml(url, opts = {}) {
  const response = await fetchResponse(url, opts);
  if (!response.ok) {
    throw new Error(`Fisher & Paykel fetch failed with HTTP ${response.status}`);
  }
  return await response.text();
}

async function jsonResponseWithBytes(response, maximumBytes = MAXIMUM_SUPPORT_API_BYTES) {
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > maximumBytes) {
    throw new Error('Fisher & Paykel JSON response size outside limits');
  }
  let payload;
  try { payload = JSON.parse(bytes.toString('utf8')); } catch {
    throw new Error('Fisher & Paykel API returned invalid JSON');
  }
  return { payload, bytes };
}

async function fetchJsonWithBytes(url, opts = {}, init = {}) {
  const response = await fetchResponse(url, opts, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(`Fisher & Paykel fetch failed with HTTP ${response.status}`);
  }
  return jsonResponseWithBytes(response, opts.maximumSupportApiBytes);
}

async function fetchJson(url, opts = {}, init = {}) {
  return (await fetchJsonWithBytes(url, opts, init)).payload;
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
  const haystack = `${context || ''} ${urlText}`;
  if (/Parts?\s+Manual|Spare\s+Parts?|fpa[-_/ ]parts|parts[-_/ ]dishwashers|exploded\s+(?:view|diagram)/i.test(haystack)) {
    return 'parts_manual';
  }
  if (/\/QRG\/|QRG[-_]?AU/i.test(urlText)) return 'quick_reference_guide';
  if (/EnergyLabel|Energy\s*Label/i.test(urlText)) return 'energy_label';
  if (/Install(?:ation)?|Install[-_ ]?Guide/i.test(urlText)) return 'installation_manual';
  if (/UserGuide|User[-_]?Manual/i.test(urlText)) return 'user_manual';

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
    parts_manual: -30,
    energy_label: -20
  }[resource.type] ?? 0;
}

function visibleArticleText(value) {
  return decodeHtml(String(value || ''))
    .replace(/https?:\/\/[^\s"'<>]+/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
}

function modelLikeTokens(value) {
  return visibleArticleText(value)
    .match(/\b[A-Za-z]{2,}[A-Za-z0-9-]*\d[A-Za-z0-9-]*\b/g)
    ?.map(normalizeSku) ?? [];
}

function isBoundedFamilyToken(token, targetSku) {
  if (!token || token.length >= targetSku.length || token.length < 6) return false;
  const familyStem = token.slice(0, -1);
  const revision = token.at(-1);
  return /\d/.test(revision)
    && targetSku.startsWith(familyStem)
    && targetSku.endsWith(revision);
}

function hasConflictingModelToken(value, sku) {
  const targetSku = normalizeSku(sku);
  if (!targetSku) return true;
  const prefix = targetSku.match(/^[A-Z]{2,}/)?.[0] ?? targetSku.slice(0, 2);
  return modelLikeTokens(value).some((token) => (
    token !== targetSku
      && token.startsWith(prefix)
      && !isBoundedFamilyToken(token, targetSku)
  ));
}

function isExplicitDimensionResourceType(type) {
  return [
    'quick_reference_guide',
    'specification_sheet',
    'installation_manual',
    'user_manual'
  ].includes(type);
}

function isDimensionCandidateResource(resource) {
  return resource?.evidenceScope !== 'research_only_search_variant'
    && resource?.type !== 'parts_manual'
    && resource?.type !== 'energy_label'
    && Number(resource?.score) > 0;
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

function containsExactSku(value, sku) {
  const targetSku = normalizeSku(sku);
  if (!targetSku) return false;
  const text = decodeHtml(String(value || '')).replace(/<[^>]*>/g, ' ');
  return text
    .split(/[^A-Za-z0-9]+/)
    .some((token) => normalizeSku(token) === targetSku);
}

function productIdentityText(html) {
  const values = [];
  const source = String(html || '');
  for (const match of source.matchAll(/<(?:title|h1)\b[^>]*>([\s\S]*?)<\/(?:title|h1)>/gi)) {
    values.push(decodeHtml(match[1]).replace(/<[^>]+>/g, ' '));
  }
  for (const match of source.matchAll(/<meta\b[^>]*(?:property|name)=["'](?:og:title|twitter:title)["'][^>]*content=["']([^"']+)["'][^>]*>/gi)) {
    values.push(decodeHtml(match[1]));
  }
  return values.join(' ').replace(/\s+/g, ' ').trim();
}

function classifyFisherPaykelProductPage(html, sourceUrl, sku) {
  const identityText = productIdentityText(html);
  const exactModelVisible = containsExactSku(identityText, sku);
  let accessoryRoute = false;
  try {
    accessoryRoute = /(?:^|\/)accessories(?:\/|$)|-accessories(?:\/|$)/i.test(new URL(sourceUrl).pathname);
  } catch {
    // URL validation is handled by the resolver contract.
  }
  const accessoryName = /\b(?:door\s+panels?|front\s+panels?|handle\s+kits?|stacking\s+kits?|joiner\s+kits?|installation\s+kits?|trim\s+kits?|water\s+filters?)\b/i
    .test(identityText);
  if (exactModelVisible && accessoryRoute && accessoryName) {
    return {
      classification: 'NON_APPLIANCE_ACCESSORY',
      reasonCode: 'official_non_appliance_accessory',
      sourceUrl: String(sourceUrl),
      exactModelVisible: true,
      accessoryRoute: true,
      accessoryName: true,
    };
  }
  return {
    classification: 'UNRESOLVED_APPLIANCE_IDENTITY',
    reasonCode: null,
    sourceUrl: String(sourceUrl || ''),
    exactModelVisible,
    accessoryRoute,
    accessoryName,
  };
}

async function persistLanePayload({
  bytes,
  contentType,
  extension,
  discoveryUrl,
  requestedModel,
  method,
  market = 'AU',
  writeObject,
}) {
  if (typeof writeObject !== 'function') return null;
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes || ''));
  if (!payload.length) return null;
  const contentSha256 = createHash('sha256').update(payload).digest('hex');
  const objectPath = `evidence/web/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.${extension}`;
  await writeObject(objectPath, payload);
  return {
    schemaVersion: 1,
    method,
    market: String(market).toUpperCase(),
    discoveryUrl,
    requestedModel: normalizeSku(requestedModel),
    contentType,
    contentSha256,
    objectPath,
    byteSize: payload.length,
  };
}

function productPageCandidateProvenance(provenance, { sourceUrl, sku, artifactUrl }) {
  if (!provenance) return null;
  return {
    schemaVersion: 1,
    method: 'official_product_page',
    market: 'AU',
    discoveryUrl: sourceUrl,
    requestedModel: normalizeSku(sku),
    matchedModel: normalizeSku(sku),
    artifactUrl,
    artifactLinkUrl: artifactUrl,
    discoveryContentSha256: provenance.contentSha256,
    discoveryObjectPath: provenance.objectPath,
    discoveryByteSize: provenance.byteSize,
  };
}

function supportProductCandidateProvenance(provenance, { sourceUrl, sku }) {
  if (!provenance) return null;
  return {
    schemaVersion: 1,
    method: 'official_support_api',
    market: 'AU',
    discoveryUrl: provenance.discoveryUrl,
    requestedModel: normalizeSku(sku),
    matchedModel: normalizeSku(sku),
    artifactUrl: sourceUrl,
    artifactLinkUrl: sourceUrl,
    discoveryContentSha256: provenance.contentSha256,
    discoveryObjectPath: provenance.objectPath,
    discoveryByteSize: provenance.byteSize,
  };
}

function extractExactSupportHit(payload, sku) {
  const targetSku = normalizeSku(sku);
  if (!targetSku) return null;
  for (const hit of payload?.hits || []) {
    const document = hit?.document;
    if (normalizeSku(document?.model_no) === targetSku) return document;
  }
  return null;
}

function isSalesforceDistributionUrl(value) {
  try {
    const url = new URL(value);
    return /(?:^|\.)salesforce\.com$/i.test(url.hostname) && /\/sfc\/p\//i.test(url.pathname);
  } catch {
    return false;
  }
}

function normalizeDocumentUrl(value) {
  try {
    const decoded = decodeHtml(String(value || '')).replace(/\\\//g, '/');
    const url = new URL(decoded, FP_BASE_URL);
    const nestedPdf = url.searchParams.get('pdfUrl');
    if (nestedPdf) return new URL(nestedPdf).toString();
    return url.toString();
  } catch {
    return null;
  }
}

function documentFileName(value) {
  try {
    const url = new URL(value);
    const name = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || '');
    return name || null;
  } catch {
    return null;
  }
}

function isDocumentUrl(value) {
  return /\.pdf(?:$|[?#])/i.test(String(value || '')) || isSalesforceDistributionUrl(value);
}

function extractDocumentUrls(value) {
  const urls = new Set();
  const html = String(value || '');
  const attributePattern = /\b(?:href|src|data-url)=["']([^"']+)["']/gi;
  let match;
  while ((match = attributePattern.exec(html))) {
    const url = normalizeDocumentUrl(match[1]);
    if (url && isDocumentUrl(url)) urls.add(url);
  }

  const embeddedPattern = /(https?:\\?\/\\?\/[^"'<>\s]+)/gi;
  while ((match = embeddedPattern.exec(html))) {
    const url = normalizeDocumentUrl(match[1]);
    if (url && isDocumentUrl(url)) urls.add(url);
  }
  return [...urls];
}

function collectStructuredDocumentResources(value, context = '', output = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectStructuredDocumentResources(item, context, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;

  const nextContext = [
    context,
    value.name,
    value.title,
    value.resourceTitle,
    value.type,
    value.subType
  ].filter(Boolean).join(' ');
  for (const key of ['url', 'fileUrl', 'downloadUrl', 'cdnUrl']) {
    const url = normalizeDocumentUrl(value[key]);
    if (url && isDocumentUrl(url)) output.push({ url, context: nextContext });
  }
  for (const [key, child] of Object.entries(value)) {
    if (!['url', 'fileUrl', 'downloadUrl', 'cdnUrl'].includes(key)) {
      collectStructuredDocumentResources(child, nextContext, output);
    }
  }
  return output;
}

function extractSupportProductResources(payload, sku) {
  const targetSku = normalizeSku(sku);
  if (!targetSku || normalizeSku(payload?.product?.modelNumber) !== targetSku) return [];

  const resources = [];
  const documentResources = Array.isArray(payload?.documentResources) ? payload.documentResources : [];
  for (const [index, record] of documentResources.entries()) {
    const documentTitleKey = [
      record?.subType,
      record?.resourceTitle || record?.resource_title || record?.title,
    ].filter(Boolean).join('|');
    const originalFileName = String(record?.name ?? '').trim();
    const bindableRecord = documentTitleKey && originalFileName;
    for (const item of collectStructuredDocumentResources(record)) {
      const type = classifyResource(item.context, item.url);
      resources.push({
        url: item.url,
        type,
        score: scoreResource({ type }),
        evidenceScope: 'exact_support_product',
        ...(bindableRecord ? {
          supportDocumentId: `documentResources:${index}`,
          supportDocumentTitleKey: documentTitleKey,
          supportOriginalFileName: originalFileName,
        } : {}),
      });
    }
  }

  for (const article of payload?.product?.articles || []) {
    const articleScope = [article.title, article.summary, article.articleBody].filter(Boolean).join(' ');
    const context = [article.articleType, article.title].filter(Boolean).join(' ');
    const type = classifyResource(context, '');
    const exactModelArticle = containsExactSku(articleScope, targetSku);
    if (type === 'parts_manual' && !exactModelArticle) continue;
    if (!exactModelArticle && (
      !isExplicitDimensionResourceType(type)
      || hasConflictingModelToken(articleScope, targetSku)
    )) continue;
    for (const url of extractDocumentUrls(article.articleBody)) {
      const resolvedType = classifyResource(context, url);
      resources.push({
        url,
        type: resolvedType,
        score: scoreResource({ type: resolvedType }),
        articleId: article.id || null,
        articleUrlName: article.urlName || null,
        evidenceScope: resolvedType === 'parts_manual'
          ? 'exact_model_identity_article'
          : exactModelArticle
            ? 'exact_model_article'
            : 'exact_support_product_article'
      });
    }
  }

  const deduped = new Map();
  for (const resource of resources) {
    const existing = deduped.get(resource.url);
    if (!existing || resource.score > existing.score) deduped.set(resource.url, resource);
  }
  return [...deduped.values()].sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}

function parseSalesforceDistributionUrl(value) {
  const url = new URL(value);
  const parts = url.pathname.split('/').filter(Boolean);
  const publicIndex = parts.findIndex((part, index) => part === 'p' && parts[index - 1] === 'sfc');
  if (publicIndex < 0 || parts.length < publicIndex + 5) {
    throw new Error('Unsupported Salesforce content distribution URL');
  }
  const [orgPublic, keyPrefix, recordSuffix, token] = parts.slice(publicIndex + 1, publicIndex + 5);
  if (keyPrefix !== 'a' || !orgPublic || !recordSuffix || !token) {
    throw new Error('Unsupported Salesforce content distribution identity');
  }
  return {
    origin: url.origin,
    orgPublic,
    orgId: `00D${orgPublic}`,
    keyPrefix,
    recordSuffix,
    recordId: `05D${recordSuffix}`,
    token,
    basePath: `/sfc/ld/${orgPublic}/${keyPrefix}/${recordSuffix}/${token}`,
    distributionPath: `/${keyPrefix}/${recordSuffix}/${token}`
  };
}

async function resolveSalesforceDistributionPdf(publicUrl, opts = {}) {
  const identity = parseSalesforceDistributionUrl(publicUrl);
  const appUrl = `${identity.origin}${identity.basePath}/forceContent/contentDistributionApp.app?aura.format=JSON&aura.formatAdapter=LIGHTNING_OUT`;
  const appPayload = await fetchJson(appUrl, opts, {
    headers: { Referer: `${identity.origin}/sfc/p/` }
  });
  const auraContext = appPayload?.auraConfig?.context;
  if (!auraContext?.fwuid || !auraContext?.loaded) {
    throw new Error('Salesforce content distribution bootstrap is incomplete');
  }

  const message = {
    actions: [{
      id: '7;a',
      descriptor: 'serviceComponent://ui.content.components.forceContent.contentDistributionViewer.ContentDistributionViewerController/ACTION$getContentDistributionInfo',
      callingDescriptor: 'UNKNOWN',
      params: {
        recordId: identity.recordId,
        isInternalView: '',
        dpt: ''
      }
    }]
  };
  const context = {
    mode: 'PROD',
    fwuid: auraContext.fwuid,
    app: 'forceContent:contentDistributionApp',
    loaded: auraContext.loaded,
    dn: [],
    globals: {},
    uad: true
  };
  const body = new URLSearchParams({
    message: JSON.stringify(message),
    'aura.context': JSON.stringify(context),
    'aura.pageURI': `/sfc/p/#${identity.orgPublic}/${identity.keyPrefix}/${identity.recordSuffix}/${identity.token}`,
    'aura.token': 'null'
  });
  const auraUrl = `${identity.origin}${identity.basePath}/aura?r=0&ui-content-components-forceContent-contentDistributionViewer.ContentDistributionViewer.getContentDistributionInfo=1`;
  const auraPayload = await fetchJson(auraUrl, opts, {
    method: 'POST',
    headers: {
      Referer: `${identity.origin}/sfc/p/`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    },
    body
  });
  const action = auraPayload?.actions?.find((candidate) => candidate?.state === 'SUCCESS');
  const metadata = action?.returnValue;
  if (!metadata?.versionId || !metadata?.viewId || metadata.allowOriginalDownload !== true || !/^PDF$/i.test(metadata.fileType || '')) {
    throw new Error('Salesforce content distribution does not expose an original PDF');
  }

  const downloadUrl = new URL('/sfc/dist/version/download/', identity.origin);
  downloadUrl.searchParams.set('oid', identity.orgId);
  downloadUrl.searchParams.set('ids', metadata.versionId);
  downloadUrl.searchParams.set('d', identity.distributionPath);
  downloadUrl.searchParams.set('operationContext', 'DELIVERY');
  downloadUrl.searchParams.set('viewId', metadata.viewId);
  downloadUrl.searchParams.set('dpt', '');
  return {
    url: downloadUrl.toString(),
    name: metadata.name || null,
    versionId: metadata.versionId,
    viewId: metadata.viewId,
    sourceUrl: publicUrl
  };
}

async function findFisherPaykelSupportProduct(sku, opts = {}) {
  const exactSku = normalizeSku(sku);
  const markets = opts.supportMarkets || ['AU', 'NZ'];
  const failures = [];
  const searchAttempts = [];
  const exactHits = [];

  for (const market of markets) {
    const searchUrl = `${FP_SUPPORT_BASE_URL}/api/search?q=${encodeURIComponent(exactSku)}&market=${encodeURIComponent(String(market).toUpperCase())}`;
    try {
      const { payload, bytes } = await fetchJsonWithBytes(searchUrl, opts);
      const provenance = await persistLanePayload({
        bytes,
        contentType: 'application/json',
        extension: 'json',
        discoveryUrl: searchUrl,
        requestedModel: exactSku,
        method: 'official_support_search_api',
        market,
        writeObject: opts.writeObject,
      });
      const hit = extractExactSupportHit(payload, exactSku);
      searchAttempts.push({ market: String(market).toUpperCase(), searchUrl, status: 'complete', provenance });
      if (hit) exactHits.push({ market, searchUrl, hit });
    } catch (error) {
      failures.push({ market, stage: 'search', message: error.message });
      searchAttempts.push({
        market: String(market).toUpperCase(),
        searchUrl,
        status: 'retryable',
        provenance: null,
        reason: error.message,
      });
    }
  }

  for (const { market, searchUrl, hit } of exactHits) {
    const marketPath = String(market).toLowerCase();
    const lookupUrl = `${FP_SUPPORT_BASE_URL}/${marketPath}/api/support/products/${encodeURIComponent(exactSku)}`;
    let lookupResponse;
    try {
      lookupResponse = await fetchResponse(lookupUrl, opts, {
        redirect: 'manual',
        headers: { Accept: 'application/json' }
      });
    } catch (error) {
      failures.push({ market, stage: 'product_lookup', message: error.message });
      continue;
    }

    let productPayload;
    let productBytes;
    let productApiUrl;
    let supportSlug;
    if (lookupResponse.ok) {
      ({ payload: productPayload, bytes: productBytes } = await jsonResponseWithBytes(
        lookupResponse,
        opts.maximumSupportApiBytes,
      ));
      supportSlug = String(productPayload?.canonicalPath || '').split('/').filter(Boolean).at(-1) || exactSku;
      productApiUrl = lookupUrl;
    } else if (lookupResponse.status >= 300 && lookupResponse.status < 400) {
      const location = lookupResponse.headers.get('location');
      supportSlug = String(location || '').split('?')[0].split('/').filter(Boolean).at(-1);
      if (!supportSlug) {
        failures.push({ market, stage: 'product_redirect', message: 'missing support product location' });
        continue;
      }
      productApiUrl = `${FP_SUPPORT_BASE_URL}/${marketPath}/api/support/products/${encodeURIComponent(supportSlug)}`;
      try {
        ({ payload: productPayload, bytes: productBytes } = await fetchJsonWithBytes(productApiUrl, opts));
      } catch (error) {
        failures.push({ market, stage: 'product', message: error.message });
        continue;
      }
    } else {
      failures.push({ market, stage: 'product_lookup', message: `HTTP ${lookupResponse.status}` });
      continue;
    }

    if (normalizeSku(productPayload?.product?.modelNumber) !== exactSku) {
      failures.push({ market, stage: 'identity', message: 'support product model mismatch' });
      continue;
    }

    const extracted = extractSupportProductResources(productPayload, exactSku);
    const resolved = [];
    for (const resource of extracted) {
      if (!isSalesforceDistributionUrl(resource.url)) {
        resolved.push(resource);
        continue;
      }
      try {
        const pdf = await resolveSalesforceDistributionPdf(resource.url, opts);
        resolved.push({
          ...resource,
          url: pdf.url,
          distributionUrl: resource.url,
          distributionName: pdf.name,
          distributionVersionId: pdf.versionId
        });
      } catch (error) {
        failures.push({ market, stage: 'salesforce_distribution', sourceUrl: resource.url, message: error.message });
      }
    }

    const deduped = new Map();
    for (const resource of resolved) {
      const existing = deduped.get(resource.url);
      if (!existing || resource.score > existing.score) deduped.set(resource.url, resource);
    }
    const supportApiUrl = productApiUrl;
    const productApiProvenance = await persistLanePayload({
      bytes: productBytes,
      contentType: 'application/json',
      extension: 'json',
      discoveryUrl: supportApiUrl,
      requestedModel: exactSku,
      method: 'official_support_api',
      market,
      writeObject: opts.writeObject,
    });
    const discoveryFields = productApiProvenance ? {
      discoveryContentSha256: productApiProvenance.contentSha256,
      discoveryObjectPath: productApiProvenance.objectPath,
      discoveryByteSize: productApiProvenance.byteSize,
    } : null;
    const resources = [...deduped.values()]
      .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
      .map((resource) => ({
        ...resource,
        discoveryProvenance: {
          schemaVersion: 1,
          method: 'official_support_api',
          market: 'AU',
          sourceMarket: String(market).toUpperCase(),
          discoveryUrl: supportApiUrl,
          requestedModel: exactSku,
          matchedModel: exactSku,
          artifactUrl: resource.url,
          ...(discoveryFields && (resource.articleId || resource.supportDocumentId) ? {
            artifactLinkUrl: resource.distributionUrl || resource.url,
            ...discoveryFields,
          } : {}),
          ...(resource.supportDocumentId ? {
            discoveryRecordType: 'support_document_resource',
            documentId: resource.supportDocumentId,
            documentTitleKey: resource.supportDocumentTitleKey,
          } : resource.articleId || resource.distributionVersionId ? {
            documentId: resource.articleId || resource.distributionVersionId,
          } : {}),
          ...((resource.supportOriginalFileName || resource.distributionName || documentFileName(resource.url)) ? {
            originalFileName: resource.supportOriginalFileName
              || resource.distributionName || documentFileName(resource.url)
          } : {})
        }
      }));
    // The support backend has returned inconsistent category breadcrumbs for
    // archived products. The category-neutral route is stable and preserves
    // the exact product slug, so do not use canonicalPath as identity evidence.
    const supportProductPath = `/${marketPath}/support/products/${supportSlug}`;
    return {
      sku: exactSku,
      matchedSku: exactSku,
      supportMarket: String(market).toUpperCase(),
      supportSearchUrl: searchUrl,
      supportApiUrl,
      productApiProvenance,
      productPageUrl: new URL(supportProductPath, FP_BASE_URL).toString().replace(/\/$/, ''),
      resources,
      failures,
      searchAttempts,
      productLookupComplete: true,
      sourceHit: hit
    };
  }

  return {
    sku: exactSku,
    matchedSku: exactSku,
    supportMarket: null,
    supportSearchUrl: null,
    productPageUrl: null,
    resources: [],
    failures,
    searchAttempts,
    productApiProvenance: null,
    productLookupComplete: exactHits.length === 0 && searchAttempts.every((attempt) => attempt.status === 'complete')
  };
}

async function findFisherPaykelProductPage(sku, opts = {}) {
  const exactSku = normalizeSku(sku);
  const variants = buildFisherPaykelSkuSearchVariants(sku);
  const searchAttempts = [];
  let lastSearch = {
    productPageUrl: null,
    searchUrl: '',
    searchHtml: '',
    matchedSku: variants[0] || exactSku,
    matchScope: 'none',
    searchAttempts,
  };

  for (const variant of variants) {
    const url = `${FP_BASE_URL}/au/search/?q=${encodeURIComponent(variant)}`;
    let html;
    try {
      html = await fetchHtml(url, opts);
      searchAttempts.push({ variant, searchUrl: url, status: 'complete', searchHtml: html });
    } catch (error) {
      searchAttempts.push({ variant, searchUrl: url, status: 'retryable', searchHtml: '', reason: error.message });
      continue;
    }
    const productPageUrl = extractProductPageUrls(html, variant)[0] || null;
    lastSearch = {
      productPageUrl,
      searchUrl: url,
      searchHtml: html,
      matchedSku: variant,
      matchScope: productPageUrl
        ? (variant === exactSku ? 'exact_model' : 'search_variant')
        : 'none',
      searchAttempts,
    };
    if (productPageUrl) return lastSearch;
  }

  return lastSearch;
}

function sourceLane(laneId, status, provenance, candidateCount, reason = null) {
  return {
    laneId,
    required: true,
    supported: true,
    status,
    candidateCount,
    provenance,
    reason,
  };
}

function fisherPaykelSourceLanes({ product, support, resources }) {
  const exactSku = normalizeSku(product.requestedSku);
  const exactSearch = product.searchAttempts.find((attempt) => normalizeSku(attempt.variant) === exactSku);
  const currentProvenance = exactSearch?.provenance ? [exactSearch.provenance] : [];
  const australianSupportAttempts = support.searchAttempts
    .filter((attempt) => String(attempt.market).toUpperCase() === 'AU');
  const supportProvenance = australianSupportAttempts
    .map((attempt) => attempt.provenance)
    .filter(Boolean);
  const supportComplete = australianSupportAttempts.length > 0
    && australianSupportAttempts.every((attempt) => attempt.status === 'complete' && attempt.provenance);
  const currentComplete = exactSearch?.status === 'complete' && currentProvenance.length > 0;
  const productPageProvenance = product.productPageProvenance ? [product.productPageProvenance] : [];
  const supportDetailProvenance = support.productApiProvenance?.market === 'AU'
    ? [support.productApiProvenance]
    : [];
  const dependentProvenance = [
    ...productPageProvenance,
    ...supportDetailProvenance,
    ...currentProvenance,
    ...supportProvenance,
  ];
  const detailComplete = currentComplete
    && supportComplete
    && !product.productPageError
    && support.productLookupComplete === true
    && dependentProvenance.length > 0;
  const productCandidates = resources.filter((resource) => resource.sourceLaneId === 'official_product_detail');
  const documentCandidates = resources.filter((resource) => resource.sourceLaneId === 'official_document_cdn');
  const currentReason = currentComplete
    ? null
    : exactSearch?.reason || 'Immutable exact-model current-product search provenance was not persisted.';
  const supportReason = supportComplete
    ? null
    : support.searchAttempts.find((attempt) => attempt.status !== 'complete')?.reason
      || 'Immutable support search provenance was not persisted.';
  const detailReason = detailComplete
    ? null
    : product.productPageError || support.failures.at(-1)?.message || currentReason || supportReason
      || 'Exact product detail and document inventory were not fully inspected.';
  return [
    sourceLane('current_product', currentComplete ? 'complete' : 'retryable', currentProvenance, 0, currentReason),
    sourceLane('discontinued_archive', supportComplete ? 'complete' : 'retryable', supportProvenance, 0, supportReason),
    sourceLane('support_search_api', supportComplete ? 'complete' : 'retryable', supportProvenance, 0, supportReason),
    sourceLane('official_document_cdn', detailComplete ? 'complete' : 'retryable', dependentProvenance, documentCandidates.length, detailReason),
    sourceLane('official_product_detail', detailComplete ? 'complete' : 'retryable', dependentProvenance, productCandidates.length, detailReason),
  ];
}

async function findFisherPaykelOfficialPdf(target, opts = {}) {
  const sku = target?.sku || target?.model || target?.product?.model || target?.product?.sku;
  if (!sku) throw new Error('Fisher & Paykel official finder requires sku/model');
  const productTask = (async () => {
    const search = await findFisherPaykelProductPage(sku, opts);
    const resources = [];
    const failures = [];
    for (const attempt of search.searchAttempts) {
      if (attempt.status !== 'complete') {
        failures.push({ market: 'AU', stage: 'product_search', message: attempt.reason });
        continue;
      }
      attempt.provenance = await persistLanePayload({
        bytes: attempt.searchHtml,
        contentType: 'text/html',
        extension: 'html',
        discoveryUrl: attempt.searchUrl,
        requestedModel: sku,
        method: 'official_product_search',
        writeObject: opts.writeObject,
      });
    }
    let productPageProvenance = null;
    let productIdentityFinding = null;
    let productPageError = null;
    if (search.productPageUrl) {
      try {
        const evidenceScope = search.matchScope === 'exact_model'
          ? 'exact_product_page'
          : 'research_only_search_variant';
        const productHtml = await fetchHtml(search.productPageUrl, opts);
        productPageProvenance = await persistLanePayload({
          bytes: productHtml,
          contentType: 'text/html',
          extension: 'html',
          discoveryUrl: search.productPageUrl,
          requestedModel: sku,
          method: 'official_product_page',
          writeObject: opts.writeObject,
        });
        productIdentityFinding = search.matchScope === 'exact_model'
          ? classifyFisherPaykelProductPage(productHtml, search.productPageUrl, sku)
          : null;
        const accessory = productIdentityFinding?.classification === 'NON_APPLIANCE_ACCESSORY';
        const pageDiscovery = productPageCandidateProvenance(productPageProvenance, {
          sourceUrl: search.productPageUrl,
          sku,
          artifactUrl: search.productPageUrl,
        });
        if (search.matchScope === 'exact_model' && !accessory) {
          resources.push({
            url: search.productPageUrl,
            type: 'product_page',
            score: 0,
            evidenceScope,
            sourceModelHint: search.matchedSku,
            sourceLaneId: 'official_product_detail',
            requiredAttempt: false,
            ...(pageDiscovery ? { discoveryProvenance: pageDiscovery } : {}),
          });
        }
        if (!accessory) {
          resources.push(...extractPdfResources(productHtml).map((resource) => ({
            ...resource,
            evidenceScope,
            sourceModelHint: search.matchedSku,
            sourceLaneId: 'official_document_cdn',
            ...(productPageCandidateProvenance(productPageProvenance, {
              sourceUrl: search.productPageUrl,
              sku,
              artifactUrl: resource.url,
            }) ? {
              discoveryProvenance: productPageCandidateProvenance(productPageProvenance, {
                sourceUrl: search.productPageUrl,
                sku,
                artifactUrl: resource.url,
              }),
            } : {}),
          })));
        }
      } catch (error) {
        productPageError = error.message;
        failures.push({ market: 'AU', stage: 'product_page', message: error.message });
      }
    }
    return {
      ...search,
      requestedSku: normalizeSku(sku),
      resources,
      failures,
      productPageProvenance,
      productIdentityFinding,
      productPageError,
    };
  })();
  const supportTask = findFisherPaykelSupportProduct(sku, opts);
  const [productResult, supportResult] = await Promise.allSettled([productTask, supportTask]);
  const product = productResult.status === 'fulfilled'
    ? productResult.value
    : {
        productPageUrl: null,
        searchUrl: `${FP_BASE_URL}/au/search/?q=${encodeURIComponent(normalizeSku(sku))}`,
        matchedSku: normalizeSku(sku),
        matchScope: 'none',
        requestedSku: normalizeSku(sku),
        searchAttempts: [],
        resources: [],
        failures: [{ market: 'AU', stage: 'product_search', message: productResult.reason?.message || String(productResult.reason) }],
        productPageProvenance: null,
        productIdentityFinding: null,
        productPageError: productResult.reason?.message || String(productResult.reason),
      };
  const support = supportResult.status === 'fulfilled'
    ? supportResult.value
    : {
        matchedSku: normalizeSku(sku), supportMarket: null, supportSearchUrl: null,
        supportApiUrl: null, productPageUrl: null, resources: [],
        failures: [{ market: 'AU/NZ', stage: 'support', message: supportResult.reason?.message || String(supportResult.reason) }],
        searchAttempts: [], productApiProvenance: null, productLookupComplete: false,
      };
  const {
    productPageUrl: discoveredProductPageUrl,
    searchUrl,
    matchedSku,
    matchScope,
    resources: productResources,
    failures: productFailures,
  } = product;
  const merged = new Map();
  const exactSupportResources = support.resources.map((resource) => ({
    ...resource,
    evidenceScope: 'exact_support_product_article',
    sourceModelHint: support.matchedSku,
    sourceLaneId: 'official_document_cdn',
  }));
  const supportProductPage = support.productPageUrl ? [{
    url: support.productPageUrl,
    type: 'product_page',
    score: 0,
    evidenceScope: 'exact_support_product',
    sourceModelHint: support.matchedSku,
    sourceLaneId: 'official_product_detail',
    requiredAttempt: false,
    ...(supportProductCandidateProvenance(support.productApiProvenance, {
      sourceUrl: support.productPageUrl,
      sku,
    }) ? {
      discoveryProvenance: supportProductCandidateProvenance(support.productApiProvenance, {
        sourceUrl: support.productPageUrl,
        sku,
      }),
    } : {}),
  }] : [];
  for (const resource of [...productResources, ...exactSupportResources, ...supportProductPage]) {
    const existing = merged.get(resource.url);
    if (!existing) {
      merged.set(resource.url, resource);
      continue;
    }
    const preferred = resource.discoveryProvenance && !existing.discoveryProvenance
      ? resource
      : existing;
    merged.set(resource.url, {
      ...existing,
      ...preferred,
      score: Math.max(existing.score ?? 0, resource.score ?? 0),
    });
  }
  const resources = [...merged.values()]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.url.localeCompare(b.url));
  const sourceLanes = fisherPaykelSourceLanes({ product, support, resources });
  const best = resources.find(isDimensionCandidateResource) || null;
  const exactProductPageUrl = matchScope === 'exact_model'
    ? discoveredProductPageUrl
    : support.productPageUrl;
  const fallbackProductPageUrl = matchScope === 'search_variant'
    ? discoveredProductPageUrl
    : null;
  if (best) {
    return {
      sku,
      matchedSku: support.matchedSku || matchedSku,
      searchUrl,
      supportSearchUrl: support.supportSearchUrl,
      supportApiUrl: support.supportApiUrl,
      supportMarket: support.supportMarket,
      productPageUrl: exactProductPageUrl,
      fallbackProductPageUrl,
      supportProductPageUrl: support.productPageUrl,
      sourceUrl: best.url,
      discoveryProvenance: best.discoveryProvenance,
      source: best.discoveryProvenance
        ? `fisher-paykel-official-support-${best.type}`
        : `fisher-paykel-official-${best.type}`,
      resourceType: best.type,
      dimensionResourceCount: resources.filter(isDimensionCandidateResource).length,
      resources,
      sourceLanes,
      productIdentityFinding: product.productIdentityFinding,
      failures: [...productFailures, ...support.failures]
    };
  }

  return {
    sku,
    matchedSku: support.matchedSku || matchedSku,
    searchUrl,
    productPageUrl: exactProductPageUrl,
    fallbackProductPageUrl,
    supportSearchUrl: support.supportSearchUrl,
    supportMarket: support.supportMarket,
    sourceUrl: null,
    source: 'fisher-paykel-official',
    dimensionResourceCount: 0,
    resources,
    sourceLanes,
    productIdentityFinding: product.productIdentityFinding,
    failures: [...productFailures, ...support.failures],
    reason: resources.length || support.productPageUrl
      ? 'dimension_resource_not_found'
      : exactProductPageUrl
        ? 'pdf_resource_not_found'
        : 'product_page_not_found'
  };
}

exports.extractExactSupportHit = extractExactSupportHit;
exports.extractProductPageUrls = extractProductPageUrls;
exports.extractPdfResources = extractPdfResources;
exports.extractSupportProductResources = extractSupportProductResources;
exports.buildFisherPaykelSkuSearchVariants = buildFisherPaykelSkuSearchVariants;
exports.classifyFisherPaykelProductPage = classifyFisherPaykelProductPage;
exports.findFisherPaykelOfficialPdf = findFisherPaykelOfficialPdf;
exports.findFisherPaykelProductPage = findFisherPaykelProductPage;
exports.findFisherPaykelSupportProduct = findFisherPaykelSupportProduct;
exports.normalizeSku = normalizeSku;
exports.resolveSalesforceDistributionPdf = resolveSalesforceDistributionPdf;
