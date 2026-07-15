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
    if (/\/au-en\/home-appliances\//i.test(url) && normalizeSku(url).includes(target)) {
      urls.push(url);
    }
  }

  const skuIndex = source.toUpperCase().indexOf(String(sku || '').toUpperCase());
  if (skuIndex >= 0) {
    const window = source.slice(Math.max(0, skuIndex - 6000), skuIndex + 8000);
    for (const rawHref of extractHrefValues(window)) {
      const url = absoluteUrl(rawHref, pageUrl);
      if (/\/au-en\/home-appliances\//i.test(url) && normalizeSku(url).includes(target)) {
        urls.push(url);
      }
    }
  }

  return [...new Set(urls)];
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

function exactModelMention(html, sku) {
  const model = String(sku || '').trim().toUpperCase();
  if (!model) return false;
  const escaped = model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, 'i').test(String(html || ''));
}

async function resultFromDiscoveryPage(target, discoveryUrl, html, writeObject) {
  const sku = String(target.sku || target.model || target.product?.model || '').trim();
  if (!exactModelMention(html, sku)) return null;
  const resources = extractPdfResourcesFromPage(html, discoveryUrl);
  if (!resources.length) return null;
  const productPageUrl = extractProductPageUrlsForSku(html, discoveryUrl, sku)[0] || null;
  let discoveryFields = null;
  if (typeof writeObject === 'function') {
    const bytes = Buffer.from(html, 'utf8');
    const discoveryContentSha256 = createHash('sha256').update(bytes).digest('hex');
    const discoveryObjectPath = `evidence/web/sha256/${discoveryContentSha256.slice(0, 2)}/${discoveryContentSha256.slice(2, 4)}/${discoveryContentSha256}.html`;
    await writeObject(discoveryObjectPath, bytes);
    discoveryFields = { discoveryContentSha256, discoveryObjectPath, discoveryByteSize: bytes.length };
  }
  const ranked = resources
    .map((resource) => ({ ...resource, score: scorePdfUrl(resource.url, target) }))
    .filter((resource) => resource.score > 0)
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url));
  if (!ranked.length) return null;
  const enriched = ranked.map((resource) => ({
    ...resource,
    requiredAttempt: resource.resourceType === 'specification_sheet',
    ...(discoveryFields ? {
      discoveryProvenance: {
        schemaVersion: 1,
        method: 'official_product_page',
        market: 'AU',
        discoveryUrl,
        requestedModel: sku,
        matchedModel: sku,
        artifactUrl: resource.url,
        artifactLinkUrl: resource.url,
        ...discoveryFields,
      },
    } : {}),
  }));
  const best = enriched[0];
  return {
    sourceUrl: best.url,
    source: `beko-official-${best.resourceType}`,
    resourceType: best.resourceType,
    requiredAttempt: best.requiredAttempt,
    productPageUrl,
    resources: enriched,
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

  const manualSearchUrl = `https://www.beko.com/au-en/support/user-manuals-result?search=${encodeURIComponent(String(sku || '').trim())}`;
  try {
    const html = await fetchText(manualSearchUrl, { fetchImpl, scraplingImpl, timeoutMs, userAgent });
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
      if (direct) return direct;
    }
    errors.push(`${manualSearchUrl}: no exact-model PDF result`);
  } catch (error) {
    errors.push(`${manualSearchUrl}: ${error.message}`);
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
    throw new Error(`Beko official PDF resources not found for ${target.sku || target.model || ''}: ${errors.slice(0, 2).join(' | ')}`.trim());
  }

  return {
    sourceUrl: ranked[0].url,
    source: 'beko-official',
    resourceType: /manual/i.test(ranked[0].url) ? 'user_manual' : 'specification_sheet',
    candidates: ranked
  };
}

exports.absoluteUrl = absoluteUrl;
exports.buildSearchQueries = buildSearchQueries;
exports.categoryUrlsForTarget = categoryUrlsForTarget;
exports.extractPdfUrlsFromPage = extractPdfUrlsFromPage;
exports.extractPdfResourcesFromPage = extractPdfResourcesFromPage;
exports.extractProductPageUrlsForSku = extractProductPageUrlsForSku;
exports.extractSearchResultUrls = extractSearchResultUrls;
exports.findBekoOfficialPdf = findBekoOfficialPdf;
exports.scorePdfUrl = scorePdfUrl;
