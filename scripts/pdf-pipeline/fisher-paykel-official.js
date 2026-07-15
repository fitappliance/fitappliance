require('dotenv').config({ quiet: true });

const FP_BASE_URL = 'https://www.fisherpaykel.com';
const FP_SUPPORT_BASE_URL = 'https://mf-support.mfe.fisherpaykel.com';
const DEFAULT_USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';
const DEFAULT_TIMEOUT_MS = 20_000;

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

async function fetchJson(url, opts = {}, init = {}) {
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
  return await response.json();
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
  for (const item of collectStructuredDocumentResources(payload?.documentResources)) {
    const type = classifyResource(item.context, item.url);
    resources.push({
      url: item.url,
      type,
      score: scoreResource({ type }),
      evidenceScope: 'exact_support_product'
    });
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

  for (const market of markets) {
    const searchUrl = `${FP_SUPPORT_BASE_URL}/api/search?q=${encodeURIComponent(exactSku)}&market=${encodeURIComponent(String(market).toUpperCase())}`;
    let hit;
    try {
      hit = extractExactSupportHit(await fetchJson(searchUrl, opts), exactSku);
    } catch (error) {
      failures.push({ market, stage: 'search', message: error.message });
      continue;
    }
    if (!hit) continue;

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
    let supportSlug;
    if (lookupResponse.ok) {
      productPayload = await lookupResponse.json();
      supportSlug = String(productPayload?.canonicalPath || '').split('/').filter(Boolean).at(-1) || exactSku;
    } else if (lookupResponse.status >= 300 && lookupResponse.status < 400) {
      const location = lookupResponse.headers.get('location');
      supportSlug = String(location || '').split('?')[0].split('/').filter(Boolean).at(-1);
      if (!supportSlug) {
        failures.push({ market, stage: 'product_redirect', message: 'missing support product location' });
        continue;
      }
      const productApiUrl = `${FP_SUPPORT_BASE_URL}/${marketPath}/api/support/products/${encodeURIComponent(supportSlug)}`;
      try {
        productPayload = await fetchJson(productApiUrl, opts);
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
    const supportApiUrl = `${FP_SUPPORT_BASE_URL}/${marketPath}/api/support/products/${encodeURIComponent(supportSlug)}`;
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
          ...(resource.articleId || resource.distributionVersionId ? {
            documentId: resource.articleId || resource.distributionVersionId
          } : {}),
          ...((resource.distributionName || documentFileName(resource.url)) ? {
            originalFileName: resource.distributionName || documentFileName(resource.url)
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
      productPageUrl: new URL(supportProductPath, FP_BASE_URL).toString().replace(/\/$/, ''),
      resources,
      failures,
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
    failures
  };
}

async function findFisherPaykelProductPage(sku, opts = {}) {
  const exactSku = normalizeSku(sku);
  const variants = buildFisherPaykelSkuSearchVariants(sku);
  let lastSearch = {
    productPageUrl: null,
    searchUrl: '',
    searchHtml: '',
    matchedSku: variants[0] || exactSku,
    matchScope: 'none',
  };

  for (const variant of variants) {
    const url = `${FP_BASE_URL}/au/search/?q=${encodeURIComponent(variant)}`;
    const html = await fetchHtml(url, opts);
    const productPageUrl = extractProductPageUrls(html, variant)[0] || null;
    lastSearch = {
      productPageUrl,
      searchUrl: url,
      searchHtml: html,
      matchedSku: variant,
      matchScope: productPageUrl
        ? (variant === exactSku ? 'exact_model' : 'search_variant')
        : 'none',
    };
    if (productPageUrl) return lastSearch;
  }

  return lastSearch;
}

async function findFisherPaykelOfficialPdf(target, opts = {}) {
  const sku = target?.sku || target?.model || target?.product?.model || target?.product?.sku;
  if (!sku) throw new Error('Fisher & Paykel official finder requires sku/model');
  const productTask = (async () => {
    const search = await findFisherPaykelProductPage(sku, opts);
    const resources = [];
    const failures = [];
    if (search.productPageUrl) {
      try {
        const evidenceScope = search.matchScope === 'exact_model'
          ? 'exact_product_page'
          : 'research_only_search_variant';
        resources.push(...extractPdfResources(await fetchHtml(search.productPageUrl, opts)).map((resource) => ({
          ...resource,
          evidenceScope,
          sourceModelHint: search.matchedSku,
        })));
      } catch (error) {
        failures.push({ market: 'AU', stage: 'product_page', message: error.message });
      }
    }
    return { ...search, resources, failures };
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
        resources: [],
        failures: [{ market: 'AU', stage: 'product_search', message: productResult.reason?.message || String(productResult.reason) }]
      };
  const support = supportResult.status === 'fulfilled'
    ? supportResult.value
    : {
        matchedSku: normalizeSku(sku), supportMarket: null, supportSearchUrl: null,
        supportApiUrl: null, productPageUrl: null, resources: [],
        failures: [{ market: 'AU/NZ', stage: 'support', message: supportResult.reason?.message || String(supportResult.reason) }]
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
  }));
  for (const resource of [...productResources, ...exactSupportResources]) {
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
exports.findFisherPaykelOfficialPdf = findFisherPaykelOfficialPdf;
exports.findFisherPaykelProductPage = findFisherPaykelProductPage;
exports.findFisherPaykelSupportProduct = findFisherPaykelSupportProduct;
exports.normalizeSku = normalizeSku;
exports.resolveSalesforceDistributionPdf = resolveSalesforceDistributionPdf;
