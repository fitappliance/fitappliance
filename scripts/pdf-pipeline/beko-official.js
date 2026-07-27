const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAXIMUM_HTML_BYTES = 8 * 1024 * 1024;
const { createHash } = require('node:crypto');

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function absoluteUrl(rawUrl, baseUrl = 'https://www.beko.com/au-en/') {
  const cleaned = String(rawUrl || '').trim().replace(/&amp;/g, '&');
  if (!cleaned) return '';
  try {
    if (cleaned.startsWith('//')) return `https:${cleaned}`;
    return new URL(cleaned, baseUrl).toString();
  } catch {
    return '';
  }
}

function extractHrefValues(html) {
  const values = [];
  const source = String(html || '');
  const pattern = /\b(?:href|data-href|data-url)=["']([^"']+)["']/gi;
  let match;
  while ((match = pattern.exec(source))) values.push(match[1]);
  return values;
}

function extractSearchResultUrls(html) {
  const urls = [];
  for (const rawHref of extractHrefValues(html)) {
    const url = absoluteUrl(rawHref, 'https://www.bing.com/');
    if (!url) continue;
    try {
      const parsed = new URL(url);
      const redirected = parsed.searchParams.get('url') || parsed.searchParams.get('u');
      const candidate = redirected && /^https?:\/\//i.test(redirected) ? redirected : url;
      if (/^https:\/\/www\.beko\.com\//i.test(candidate)) urls.push(candidate);
    } catch {
      // Ignore malformed search result links.
    }
  }
  return [...new Set(urls)];
}

function extractPdfUrlsFromPage(html, pageUrl) {
  return extractPdfResourcesFromPage(html, pageUrl).map((resource) => resource.url);
}

function documentType(label, url) {
  const text = `${label || ''} ${url || ''}`;
  if (/install/i.test(text)) return 'installation_guide';
  if (/spec|product\/\d+\.pdf/i.test(text)) return 'specification_sheet';
  if (/manual|instruction|user/i.test(text)) return 'user_manual';
  return 'family_manual';
}

function extractPdfResourcesFromPage(html, pageUrl) {
  const resources = [];
  const source = String(html || '');
  const anchorPattern = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  for (const match of source.matchAll(anchorPattern)) {
    const attrs = match[1] || '';
    const rawHref = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!rawHref) continue;
    const url = absoluteUrl(rawHref, pageUrl);
    if (!/\.pdf(?:$|[?#])/i.test(url) || !/^https:\/\/www\.beko\.com\//i.test(url)) continue;
    const label = `${attrs.match(/\baria-label=["']([^"']+)["']/i)?.[1] || ''} ${match[2].replace(/<[^>]+>/g, ' ')}`.trim();
    resources.push({ url, label, resourceType: documentType(label, url) });
  }
  const seen = new Set();
  return resources.filter((resource) => {
    if (seen.has(resource.url)) return false;
    seen.add(resource.url);
    return true;
  });
}

function categoryUrlsForTarget(target = {}) {
  const category = String(target.category || target.cat || target.product?.cat || '').toLowerCase();
  const base = 'https://www.beko.com/au-en/home-appliances/';
  if (category === 'fridge') {
    return [
      `${base}fridge`,
      `${base}fridge-freezer`,
      `${base}freezer`
    ];
  }
  if (category === 'dishwasher') {
    return [
      `${base}freestanding-dishwasher`,
      `${base}integrated-dishwasher`,
      `${base}built-under`
    ];
  }
  if (category === 'dryer') return [`${base}tumble-dryer`];
  if (category === 'washing_machine') {
    return [
      `${base}washing-machines`,
      `${base}freestanding-washer-dryer`
    ];
  }
  return [
    `${base}fridge`,
    `${base}fridge-freezer`,
    `${base}freezer`,
    `${base}freestanding-dishwasher`,
    `${base}integrated-dishwasher`,
    `${base}built-under`,
    `${base}washing-machines`,
    `${base}freestanding-washer-dryer`,
    `${base}tumble-dryer`
  ];
}

function extractProductPageUrlsForSku(html, pageUrl, sku) {
  const target = normalizeSku(sku);
  if (!target) return [];
  const urls = [];
  const source = String(html || '');

  const hrefs = extractHrefValues(source);
  for (const rawHref of hrefs) {
    const url = absoluteUrl(rawHref, pageUrl);
    if (productPageUrlMatchesSku(url, target)) {
      urls.push(url);
    }
  }

  const skuIndex = source.toUpperCase().indexOf(String(sku || '').toUpperCase());
  if (skuIndex >= 0) {
    const window = source.slice(Math.max(0, skuIndex - 6000), skuIndex + 8000);
    for (const rawHref of extractHrefValues(window)) {
      const url = absoluteUrl(rawHref, pageUrl);
      if (productPageUrlMatchesSku(url, target)) {
        urls.push(url);
      }
    }
  }

  return [...new Set(urls)];
}

function productPageUrlMatchesSku(rawUrl, sku) {
  const target = normalizeSku(sku);
  if (!target) return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.toLowerCase() !== 'www.beko.com'
      || !parsed.pathname.startsWith('/au-en/home-appliances/')) return false;
    const slug = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).at(-1) || '');
    return normalizeSku(slug.split('-').at(-1)) === target;
  } catch {
    return false;
  }
}

function scorePdfUrl(url, target = {}) {
  const normalizedUrl = normalizeSku(url);
  const sku = normalizeSku(target.sku || target.model || target.product?.model);
  let score = 0;
  if (sku && normalizedUrl.includes(sku)) score += 80;
  if (/\/bekoglobal\/au\/en\/pdf\/product\//i.test(url)) score += 140;
  if (/install/i.test(url)) score += 45;
  if (/spec|product\/\d+\.pdf|specification/i.test(url)) score += 25;
  if (/product-documents/i.test(url)) score += 15;
  if (/user-manual|manual/i.test(url)) score += 8;
  if (/energy|wels|label/i.test(url)) score -= 100;
  return score;
}

function buildSearchQueries(target = {}) {
  const sku = String(target.sku || target.model || target.product?.model || '').trim();
  const brand = String(target.brand || target.product?.brand || 'Beko').trim();
  return [
    `site:beko.com/au-en/home-appliances "${sku}" "${brand}"`,
    `site:beko.com/content/dam "${sku}" "${brand}" filetype:pdf`,
    `"${sku}" "Beko" "Specification Sheet" filetype:pdf`
  ].filter((query) => query.includes('""') === false);
}

async function fetchText(url, {
  fetchImpl = globalThis.fetch,
  scraplingImpl = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT,
  maximumBytes = DEFAULT_MAXIMUM_HTML_BYTES,
} = {}) {
  if (!fetchImpl) throw new Error('Beko official finder requires fetch');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/pdf'
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`timeout after ${timeoutMs}ms`);
    if (typeof scraplingImpl !== 'function' || new URL(url).hostname.toLowerCase() !== 'www.beko.com') {
      throw error;
    }
    const result = await scraplingImpl(url, { timeoutMs, maximumBytes });
    const finalUrl = new URL(result?.finalUrl || url).toString();
    if (new URL(finalUrl).hostname.toLowerCase() !== 'www.beko.com') {
      throw new Error('Beko Scrapling fallback escaped the official host');
    }
    const bytes = Buffer.from(result?.bytes ?? []);
    if (!bytes.length || bytes.length > maximumBytes) throw new Error('Beko HTML size outside limits');
    if (!/^text\/html(?:;|$)/i.test(String(result?.contentType || ''))) {
      throw new Error('Beko Scrapling fallback returned non-HTML content');
    }
    return bytes.toString('utf8');
  } finally {
    clearTimeout(timeout);
  }
}

async function defaultScraplingImpl(url, options) {
  const { fetchViaScrapling } = await import('../../src/domain/scrapling-transport.mjs');
  return fetchViaScrapling(url, options);
}

async function persistDiscoveryHtml(html, {
  sourceUrl,
  requestedModel,
  method,
  writeObject,
}) {
  if (typeof writeObject !== 'function') return null;
  const bytes = Buffer.from(String(html || ''), 'utf8');
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const objectPath = `evidence/web/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.html`;
  await writeObject(objectPath, bytes);
  return {
    schemaVersion: 1,
    method,
    market: 'AU',
    discoveryUrl: sourceUrl,
    requestedModel,
    contentType: 'text/html',
    contentSha256,
    objectPath,
    byteSize: bytes.length,
  };
}

function candidateDiscoveryProvenance(pageProvenance, artifactUrl, matchedModel) {
  if (!pageProvenance) return null;
  return {
    schemaVersion: 1,
    method: pageProvenance.method,
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

function sourceLane(laneId, required, supported, status, provenance, candidateCount, reason = null) {
  return { laneId, required, supported, status, candidateCount, provenance, reason };
}

function laneProvenanceForResources(resources) {
  const seen = new Set();
  return resources.flatMap((resource) => {
    const candidate = resource.discoveryProvenance;
    if (!candidate?.discoveryContentSha256 || !candidate.discoveryObjectPath) return [];
    const key = `${candidate.discoveryUrl}\0${candidate.discoveryContentSha256}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      schemaVersion: 1,
      method: candidate.method,
      market: 'AU',
      discoveryUrl: candidate.discoveryUrl,
      requestedModel: candidate.requestedModel,
      contentType: 'text/html',
      contentSha256: candidate.discoveryContentSha256,
      objectPath: candidate.discoveryObjectPath,
      byteSize: candidate.discoveryByteSize,
    }];
  });
}

function bekoSourceLanes({ supportProvenance, resources, errors }) {
  const productPages = resources.filter((resource) => (
    resource.sourceLaneId === 'official_product_detail'
  ));
  const currentPages = productPages.filter((resource) => resource.catalogState === 'current');
  const documents = resources.filter((resource) => resource.sourceLaneId === 'official_document_cdn');
  const detailProvenance = laneProvenanceForResources(productPages);
  const documentProvenance = laneProvenanceForResources(documents);
  const supportComplete = Boolean(supportProvenance);
  const detailComplete = productPages.length > 0 && detailProvenance.length > 0;
  const documentComplete = documents.length > 0 && documentProvenance.length > 0;
  return [
    sourceLane(
      'current_product', false, true,
      currentPages.length > 0 ? 'complete' : 'retryable',
      laneProvenanceForResources(currentPages), currentPages.length,
      currentPages.length > 0 ? null : errors[0] || 'Exact current-product page was not persisted.',
    ),
    sourceLane(
      'discontinued_archive', false, false, 'unsupported', [], 0,
      'The bounded Beko resolver uses exact support lookup and does not enumerate an archive.',
    ),
    sourceLane(
      'support_search_api', true, true, supportComplete ? 'complete' : 'retryable',
      supportProvenance ? [supportProvenance] : [], 0,
      supportComplete ? null : errors[0] || 'Exact Beko support lookup was not persisted.',
    ),
    sourceLane(
      'official_document_cdn', true, true, documentComplete ? 'complete' : 'retryable',
      documentProvenance, documents.length,
      documentComplete ? null : errors[0] || 'No hash-bound official document was discovered.',
    ),
    sourceLane(
      'official_product_detail', true, true, detailComplete ? 'complete' : 'retryable',
      detailProvenance, productPages.length,
      detailComplete ? null : errors[0] || 'No exact-model official detail page was persisted.',
    ),
  ];
}

function exactModelMention(html, sku) {
  const model = String(sku || '').trim().toUpperCase();
  if (!model) return false;
  const escaped = model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, 'i').test(String(html || ''));
}

function manualSearchApiUrlForTarget(target = {}) {
  const sku = String(target.sku || target.model || target.product?.model || '').trim();
  if (!sku) throw new TypeError('Beko support search requires an exact model');
  return `https://www.beko.com/content/bekoglobal/au/en/support/user-manual/jcr:content/root/responsivegrid/responsivegrid/productsearch.ajax.html?search=${encodeURIComponent(sku)}`;
}

function extractManualResultUrlForSku(html, sku) {
  const target = normalizeSku(sku);
  if (!target) return null;
  const source = String(html || '');
  const anchorPattern = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  for (const match of source.matchAll(anchorPattern)) {
    const rawHref = match[1]?.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!rawHref) continue;
    const url = absoluteUrl(rawHref);
    if (!url) continue;
    let parsed;
    try { parsed = new URL(url); } catch { continue; }
    if (parsed.hostname.toLowerCase() !== 'www.beko.com'
      || parsed.pathname !== '/au-en/support/user-manuals-result'
      || normalizeSku(parsed.searchParams.get('search')) !== target
      || !exactModelMention(match[2], sku)) continue;
    return parsed.toString();
  }
  return null;
}

async function resultFromDiscoveryPage(target, discoveryUrl, html, writeObject) {
  const sku = String(target.sku || target.model || target.product?.model || '').trim();
  if (!exactModelMention(html, sku)) return null;
  const resources = extractPdfResourcesFromPage(html, discoveryUrl);
  const isCurrentProductPage = productPageUrlMatchesSku(discoveryUrl, sku);
  const productPageUrl = isCurrentProductPage
    ? discoveryUrl
    : extractProductPageUrlsForSku(html, discoveryUrl, sku)[0] || null;
  const pageProvenance = await persistDiscoveryHtml(html, {
    sourceUrl: discoveryUrl,
    requestedModel: sku,
    method: isCurrentProductPage ? 'official_product_page' : 'official_support_result',
    writeObject,
  });
  const ranked = resources
    .map((resource) => ({ ...resource, score: scorePdfUrl(resource.url, target) }))
    .filter((resource) => resource.score > 0)
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url));
  if (!ranked.length) return null;
  const enriched = ranked.map((resource) => ({
    ...resource,
    sourceLaneId: 'official_document_cdn',
    sourceModelHint: sku,
    requiredAttempt: resource.resourceType === 'specification_sheet',
    ...(pageProvenance ? {
      discoveryProvenance: candidateDiscoveryProvenance(pageProvenance, resource.url, sku),
    } : {}),
  }));
  const pageResource = {
    url: discoveryUrl,
    sourceUrl: discoveryUrl,
    resourceType: 'product_page',
    sourceLaneId: 'official_product_detail',
    sourceModelHint: sku,
    catalogState: isCurrentProductPage ? 'current' : 'support',
    score: -1,
    requiredAttempt: false,
    ...(pageProvenance ? {
      discoveryProvenance: candidateDiscoveryProvenance(pageProvenance, discoveryUrl, sku),
    } : {}),
  };
  const best = enriched[0] || pageResource;
  return {
    sourceUrl: best.url,
    source: `beko-official-${best.resourceType}`,
    resourceType: best.resourceType,
    requiredAttempt: best.requiredAttempt,
    productPageUrl,
    resources: [...enriched, pageResource],
    discoveryProvenance: best.discoveryProvenance,
  };
}

function combineDiscoveryResults(results) {
  const available = results.filter(Boolean);
  const resources = [];
  const seen = new Set();
  for (const result of available) {
    for (const resource of result.resources ?? []) {
      if (seen.has(resource.url)) continue;
      seen.add(resource.url);
      resources.push(resource);
    }
  }
  resources.sort((left, right) => right.score - left.score || left.url.localeCompare(right.url));
  if (!resources.length) return null;
  const best = resources[0];
  return {
    sourceUrl: best.url,
    source: `beko-official-${best.resourceType}`,
    resourceType: best.resourceType,
    requiredAttempt: best.requiredAttempt,
    productPageUrl: available.find((result) => result.productPageUrl)?.productPageUrl ?? null,
    resources,
    discoveryProvenance: best.discoveryProvenance,
  };
}

async function findBekoOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  scraplingImpl = defaultScraplingImpl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT,
  writeObject = null,
} = {}) {
  const queries = buildSearchQueries(target);
  const candidatePages = [];
  const candidatePdfs = [];
  const errors = [];
  const sku = target.sku || target.model || target.product?.model;
  let supportProvenance = null;

  const manualSearchApiUrl = manualSearchApiUrlForTarget(target);
  try {
    const searchHtml = await fetchText(manualSearchApiUrl, {
      fetchImpl, scraplingImpl, timeoutMs, userAgent,
    });
    supportProvenance = await persistDiscoveryHtml(searchHtml, {
      sourceUrl: manualSearchApiUrl,
      requestedModel: sku,
      method: 'official_support_search_api',
      writeObject,
    });
    const manualSearchUrl = extractManualResultUrlForSku(searchHtml, sku);
    if (!manualSearchUrl) {
      errors.push(`${manualSearchApiUrl}: no exact-model support result`);
      throw Object.assign(new Error('Beko AU support search returned no exact model'), {
        code: 'BEKO_SUPPORT_EXACT_MODEL_NOT_FOUND',
      });
    }
    const html = await fetchText(manualSearchUrl, {
      fetchImpl, scraplingImpl, timeoutMs, userAgent,
    });
    const supportResult = await resultFromDiscoveryPage(target, manualSearchUrl, html, writeObject);
    if (supportResult) {
      const results = [supportResult];
      if (supportResult.productPageUrl) {
        try {
          const productHtml = await fetchText(supportResult.productPageUrl, {
            fetchImpl, scraplingImpl, timeoutMs, userAgent,
          });
          results.push(await resultFromDiscoveryPage(
            target,
            supportResult.productPageUrl,
            productHtml,
            writeObject,
          ));
        } catch (error) {
          errors.push(`${supportResult.productPageUrl}: ${error.message}`);
        }
      }
      const direct = combineDiscoveryResults(results);
      if (direct) {
        direct.sourceLanes = bekoSourceLanes({
          supportProvenance,
          resources: direct.resources,
          errors,
        });
        return direct;
      }
    }
    errors.push(`${manualSearchUrl}: no exact-model PDF result`);
  } catch (error) {
    if (error?.code !== 'BEKO_SUPPORT_EXACT_MODEL_NOT_FOUND') {
      errors.push(`${manualSearchApiUrl}: ${error.message}`);
    }
  }

  for (const categoryUrl of categoryUrlsForTarget(target)) {
    try {
      const html = await fetchText(categoryUrl, { fetchImpl, scraplingImpl, timeoutMs, userAgent });
      candidatePages.push(...extractProductPageUrlsForSku(html, categoryUrl, sku));
    } catch (error) {
      errors.push(`${categoryUrl}: ${error.message}`);
    }
  }

  for (const query of queries) {
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    try {
      const html = await fetchText(searchUrl, { fetchImpl, timeoutMs, userAgent });
      for (const url of extractSearchResultUrls(html)) {
        if (/\.pdf(?:$|[?#])/i.test(url)) candidatePdfs.push(url);
        if (/\/au-en\/home-appliances\//i.test(url)) candidatePages.push(url);
      }
    } catch (error) {
      errors.push(`${query}: ${error.message}`);
    }
  }

  for (const pageUrl of [...new Set(candidatePages)].slice(0, 6)) {
    try {
      const html = await fetchText(pageUrl, { fetchImpl, scraplingImpl, timeoutMs, userAgent });
      candidatePdfs.push(...extractPdfUrlsFromPage(html, pageUrl));
    } catch (error) {
      errors.push(`${pageUrl}: ${error.message}`);
    }
  }

  const ranked = [...new Set(candidatePdfs)]
    .map((url) => ({ url, score: scorePdfUrl(url, target) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

  if (!ranked[0]) {
    return {
      sourceUrl: null,
      source: 'beko-official-no-candidate',
      resourceType: 'product_page',
      resources: [],
      sourceLanes: bekoSourceLanes({ supportProvenance, resources: [], errors }),
      reason: `Beko official PDF resources not found for ${target.sku || target.model || ''}: ${errors.slice(0, 2).join(' | ')}`.trim(),
    };
  }

  const fallback = {
    sourceUrl: ranked[0].url,
    source: 'beko-official',
    resourceType: /manual/i.test(ranked[0].url) ? 'user_manual' : 'specification_sheet',
    candidates: ranked,
    resources: [],
  };
  fallback.sourceLanes = bekoSourceLanes({ supportProvenance, resources: [], errors });
  return fallback;
}

exports.absoluteUrl = absoluteUrl;
exports.buildSearchQueries = buildSearchQueries;
exports.categoryUrlsForTarget = categoryUrlsForTarget;
exports.extractPdfUrlsFromPage = extractPdfUrlsFromPage;
exports.extractPdfResourcesFromPage = extractPdfResourcesFromPage;
exports.extractManualResultUrlForSku = extractManualResultUrlForSku;
exports.extractProductPageUrlsForSku = extractProductPageUrlsForSku;
exports.extractSearchResultUrls = extractSearchResultUrls;
exports.findBekoOfficialPdf = findBekoOfficialPdf;
exports.manualSearchApiUrlForTarget = manualSearchApiUrlForTarget;
exports.productPageUrlMatchesSku = productPageUrlMatchesSku;
exports.scorePdfUrl = scorePdfUrl;
