const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; FitApplianceBot/1.0; +https://www.fitappliance.com.au/about)';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_SEARCH_ENGINES = ['bing'];

const TRUSTED_THIRD_PARTY_HOSTS = [
  'appliancesonline.com.au',
  'commercial.appliancesonline.com.au',
  'manualslib.com',
  'www.manualslib.com',
  'usermanuals.au',
  'www.usermanuals.au',
  'device.report',
  'www.device.report'
];

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function normalizeBrand(value) {
  return String(value || '').trim();
}

function hostnameForUrl(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isTrustedThirdPartyUrl(url) {
  const hostname = hostnameForUrl(url);
  return TRUSTED_THIRD_PARTY_HOSTS.some((trusted) => (
    hostname === trusted || hostname.endsWith(`.${trusted}`)
  ));
}

function absolutizeUrl(rawUrl, baseUrl) {
  const cleaned = String(rawUrl || '')
    .trim()
    .replace(/&amp;/g, '&')
    .replace(/\\\//g, '/');
  if (!cleaned) return '';
  try {
    if (cleaned.startsWith('//')) return `https:${cleaned}`;
    return new URL(cleaned, baseUrl).toString();
  } catch {
    return '';
  }
}

function decodeDuckDuckGoRedirect(rawUrl) {
  const absolute = absolutizeUrl(rawUrl, 'https://duckduckgo.com/');
  if (!absolute) return '';
  try {
    const parsed = new URL(absolute);
    const redirected = parsed.searchParams.get('uddg');
    return redirected ? decodeURIComponent(redirected) : absolute;
  } catch {
    return absolute;
  }
}

function decodeSearchRedirect(rawUrl) {
  const absolute = decodeDuckDuckGoRedirect(rawUrl);
  if (!absolute) return '';
  try {
    const parsed = new URL(absolute);
    for (const key of ['u', 'url', 'target']) {
      const redirected = parsed.searchParams.get(key);
      if (redirected && /^https?:\/\//i.test(redirected)) return redirected;
    }
  } catch {
    return absolute;
  }
  return absolute;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildThirdPartySearchQueries(target = {}) {
  const sku = String(target.sku || target.model || target.product?.model || '').trim();
  const brand = normalizeBrand(target.brand || target.product?.brand);
  const category = String(target.category || target.cat || target.product?.cat || '').replace(/_/g, ' ');
  const quotedSku = sku ? `"${sku}"` : '';
  const quotedBrand = brand ? `"${brand}"` : '';
  const categoryText = category ? `"${category}"` : '';
  const base = [quotedSku, quotedBrand].filter(Boolean).join(' ');

  return unique([
    `${base} ${categoryText} ("user manual" OR "installation guide" OR "specification sheet") filetype:pdf`,
    `${base} "manual" "pdf"`,
    `site:commercial.appliancesonline.com.au ${quotedSku} ${quotedBrand} ("manual" OR "specifications")`,
    `site:appliancesonline.com.au ${quotedSku} ${quotedBrand} ("manual" OR "specifications")`,
    `site:manualslib.com ${quotedSku} ${quotedBrand} "manual"`,
    `site:usermanuals.au ${quotedSku} ${quotedBrand} "manual"`,
    `site:device.report ${quotedSku} ${quotedBrand} "pdf"`
  ].map((query) => query.replace(/\s+/g, ' ').trim()).filter(Boolean));
}

function extractHrefValues(html) {
  const values = [];
  const source = String(html || '');
  const attrPattern = /\b(?:href|data-href|data-url|src)=["']([^"']+)["']/gi;
  let match;
  while ((match = attrPattern.exec(source))) values.push(match[1]);
  return values;
}

function extractSearchResultUrls(html) {
  return unique(extractHrefValues(html)
    .map(decodeSearchRedirect)
    .filter((url) => /^https?:\/\//i.test(url))
    .filter((url) => isTrustedThirdPartyUrl(url)));
}

function extractPdfUrlsFromHtml(html, pageUrl) {
  const urls = [];
  const source = String(html || '');
  for (const rawUrl of extractHrefValues(source)) {
    const absolute = absolutizeUrl(rawUrl, pageUrl);
    if (/\.pdf(?:$|[?#])/i.test(absolute)) urls.push(absolute);
  }

  const loosePdfPattern = /(https?:\\?\/\\?\/[^"'<>\s]+?\.pdf(?:\?[^"'<>\s]*)?)/gi;
  let match;
  while ((match = loosePdfPattern.exec(source))) {
    urls.push(absolutizeUrl(match[1], pageUrl));
  }
  return unique(urls);
}

function scoreThirdPartyCandidateUrl(url, target = {}) {
  if (!isTrustedThirdPartyUrl(url)) return -1000;
  const sku = normalizeSku(target.sku || target.model || target.product?.model);
  const brand = normalizeSku(target.brand || target.product?.brand);
  const normalizedUrl = normalizeSku(url);
  let score = 0;
  if (/\.pdf(?:$|[?#])/i.test(url)) score += 50;
  if (sku && normalizedUrl.includes(sku)) score += 50;
  if (brand && normalizedUrl.includes(brand)) score += 10;
  if (/spec|data|dimension|install|manual|guide|qrg/i.test(url)) score += 12;
  if (/commercial\.appliancesonline\.com\.au/i.test(url)) score += 10;
  if (/appliancesonline\.com\.au/i.test(url)) score += 8;
  if (/manualslib|usermanuals|device\.report/i.test(url)) score += 4;
  return score;
}

async function fetchText(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT
} = {}) {
  if (!fetchImpl) throw new Error('third-party fallback requires fetch');
  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    const response = await fetchImpl(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/pdf'
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`third-party fetch failed with HTTP ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`third-party fetch timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function buildSearchUrl(engine, query) {
  if (engine === 'bing') {
    return `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  }
  if (engine === 'brave') {
    return `https://search.brave.com/search?q=${encodeURIComponent(query)}`;
  }
  return `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
}

async function discoverThirdPartyPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  maxQueries = 4,
  searchEngines = DEFAULT_SEARCH_ENGINES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT
} = {}) {
  const queries = buildThirdPartySearchQueries(target).slice(0, maxQueries);
  const candidateUrls = [];
  const errors = [];

  for (const query of queries) {
    for (const engine of searchEngines) {
      const searchUrl = buildSearchUrl(engine, query);
      try {
        const html = await fetchText(searchUrl, { fetchImpl, timeoutMs, userAgent });
        candidateUrls.push(...extractSearchResultUrls(html));
      } catch (error) {
        errors.push(`${engine} ${query}: ${error.message}`);
      }
    }
  }

  const trustedCandidates = unique(candidateUrls)
    .filter(isTrustedThirdPartyUrl)
    .sort((a, b) => scoreThirdPartyCandidateUrl(b, target) - scoreThirdPartyCandidateUrl(a, target));

  const directPdf = trustedCandidates.find((url) => /\.pdf(?:$|[?#])/i.test(url));
  if (directPdf) {
    return {
      sourceUrl: directPdf,
      source: `third-party-fallback:${hostnameForUrl(directPdf)}`,
      candidates: trustedCandidates
    };
  }

  for (const pageUrl of trustedCandidates.slice(0, 5)) {
    try {
      const html = await fetchText(pageUrl, { fetchImpl, timeoutMs, userAgent });
      const pdfs = extractPdfUrlsFromHtml(html, pageUrl)
        .filter(isTrustedThirdPartyUrl)
        .sort((a, b) => scoreThirdPartyCandidateUrl(b, target) - scoreThirdPartyCandidateUrl(a, target));
      if (pdfs[0]) {
        return {
          sourceUrl: pdfs[0],
          source: `third-party-fallback:${hostnameForUrl(pdfs[0])}`,
          sourcePageUrl: pageUrl,
          candidates: trustedCandidates
        };
      }
    } catch (error) {
      errors.push(`${pageUrl}: ${error.message}`);
    }
  }

  throw new Error(`Third-party PDF not found for ${target.brand || ''} ${target.sku || ''}: ${errors.slice(0, 3).join(' | ')}`.trim());
}

exports.TRUSTED_THIRD_PARTY_HOSTS = TRUSTED_THIRD_PARTY_HOSTS;
exports.buildSearchUrl = buildSearchUrl;
exports.buildThirdPartySearchQueries = buildThirdPartySearchQueries;
exports.discoverThirdPartyPdf = discoverThirdPartyPdf;
exports.extractPdfUrlsFromHtml = extractPdfUrlsFromHtml;
exports.extractSearchResultUrls = extractSearchResultUrls;
exports.isTrustedThirdPartyUrl = isTrustedThirdPartyUrl;
exports.scoreThirdPartyCandidateUrl = scoreThirdPartyCandidateUrl;
