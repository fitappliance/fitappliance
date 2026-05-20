const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const DEFAULT_TIMEOUT_MS = 20_000;

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
  const urls = [];
  for (const rawHref of extractHrefValues(html)) {
    const url = absoluteUrl(rawHref, pageUrl);
    if (/\.pdf(?:$|[?#])/i.test(url) && /^https:\/\/www\.beko\.com\//i.test(url)) {
      urls.push(url);
    }
  }
  return [...new Set(urls)];
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
  if (/\/bekoglobal\/au\/en\/pdf\/product\//i.test(url)) score += 50;
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
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT
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
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function findBekoOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT
} = {}) {
  const queries = buildSearchQueries(target);
  const candidatePages = [];
  const candidatePdfs = [];
  const errors = [];
  const sku = target.sku || target.model || target.product?.model;

  for (const categoryUrl of categoryUrlsForTarget(target)) {
    try {
      const html = await fetchText(categoryUrl, { fetchImpl, timeoutMs, userAgent });
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
      const html = await fetchText(pageUrl, { fetchImpl, timeoutMs, userAgent });
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
exports.extractProductPageUrlsForSku = extractProductPageUrlsForSku;
exports.extractSearchResultUrls = extractSearchResultUrls;
exports.findBekoOfficialPdf = findBekoOfficialPdf;
exports.scorePdfUrl = scorePdfUrl;
