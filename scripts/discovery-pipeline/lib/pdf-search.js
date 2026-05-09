const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';

const TRUSTED_FALLBACK_HOSTS = [
  'appliancesonline.com.au',
  'commercial.appliancesonline.com.au',
  'harveynorman.com.au',
  'thegoodguys.com.au',
];

const OFFICIAL_HOSTS_BY_BRAND = {
  asko: ['asko.com.au', 'au.asko.com'],
  beko: ['beko.com.au'],
  bosch: ['bosch-home.com.au', 'media3.bosch-home.com'],
  chiq: ['chiq.com.au'],
  electrolux: ['electrolux.com.au', 'resource.electrolux.com.au'],
  'fisher & paykel': ['fisherpaykel.com', 'fisherpaykel.com.au', 'dam.fisherpaykel.com'],
  fisherpaykel: ['fisherpaykel.com', 'fisherpaykel.com.au', 'dam.fisherpaykel.com'],
  haier: ['haier.com.au', 'haier.com'],
  hisense: ['hisense.com.au', 'hisense.com'],
  ilve: ['ilve.com.au'],
  lg: ['lg.com'],
  midea: ['midea.com.au', 'midea.com'],
  miele: ['miele.com.au'],
  mitsubishi: ['mitsubishielectric.com.au'],
  omega: ['omegaappliances.com.au'],
  samsung: ['samsung.com'],
  smeg: ['smeg.com.au'],
  solt: ['solt.house'],
  tcl: ['tcl.com'],
  westinghouse: ['westinghouse.com.au', 'resource.electrolux.com.au'],
  whirlpool: ['whirlpool.com.au'],
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}

function extractDuckDuckGoResultUrls(html) {
  const urls = [];
  const seen = new Set();
  const decodedHtml = decodeHtmlEntities(html);
  const matches = decodedHtml.matchAll(/uddg=([^&"'>]+)/g);

  for (const match of matches) {
    try {
      const url = decodeURIComponent(match[1]);
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    } catch {
      // Ignore malformed search-result redirect payloads.
    }
  }

  return urls;
}

function extractYahooResultUrls(html) {
  const urls = [];
  const seen = new Set();
  const decodedHtml = decodeHtmlEntities(html);
  const matches = decodedHtml.matchAll(/\/RU=([^/]+)\/RK=/g);

  for (const match of matches) {
    try {
      const url = decodeURIComponent(match[1]);
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    } catch {
      // Ignore malformed Yahoo redirect payloads.
    }
  }

  return urls;
}

function hostMatches(host, allowedHost) {
  return host === allowedHost || host.endsWith(`.${allowedHost}`);
}

function getAllowedHostsForBrand(brand) {
  const key = String(brand || '').trim().toLowerCase();
  return [
    ...(OFFICIAL_HOSTS_BY_BRAND[key] || []),
    ...TRUSTED_FALLBACK_HOSTS,
  ];
}

function isPdfUrl(value) {
  try {
    const parsed = new URL(value);
    return /\.pdf($|[?#])/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function isAcceptedPdfUrl(value, { brand } = {}) {
  if (!isPdfUrl(value)) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  return getAllowedHostsForBrand(brand).some((allowedHost) => hostMatches(host, allowedHost));
}

function scorePdfUrl(value, discovery) {
  const url = String(value || '');
  const haystack = normalizeToken(url);
  const model = normalizeToken(discovery?.model);
  const brand = String(discovery?.brand || '').trim().toLowerCase();
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return '';
    }
  })();

  let score = 0;
  if (model && haystack.includes(model)) score += 60;
  if ((OFFICIAL_HOSTS_BY_BRAND[brand] || []).some((allowedHost) => hostMatches(host, allowedHost))) score += 35;
  if (/spec|specification|data.?sheet|datasheet|fact.?sheet|factsheet/i.test(url)) score += 30;
  if (/install|installation|manual|quick.?reference|qrg/i.test(url)) score += 15;
  if (/warranty|energy|label|catalog|catalogue|brochure/i.test(url)) score -= 20;
  return score;
}

function buildSearchQueries(discovery) {
  const brand = String(discovery?.brand || '').trim();
  const model = String(discovery?.model || '').trim();
  const officialHosts = OFFICIAL_HOSTS_BY_BRAND[brand.toLowerCase()] || [];
  const base = `${brand} ${model}`.trim();
  const queries = [
    `"${model}" "${brand}" (specification sheet OR datasheet OR factsheet OR installation manual) filetype:pdf`,
    `"${base}" dimensions pdf`,
  ];

  for (const host of officialHosts.slice(0, 2)) {
    queries.unshift(`site:${host} "${model}" filetype:pdf`);
  }

  return [...new Set(queries.filter((query) => query.trim()))];
}

function buildDirectPdfCandidates(discovery) {
  const brand = String(discovery?.brand || '').trim().toLowerCase();
  const model = String(discovery?.model || '').trim().toUpperCase();
  if (!model) return [];

  if (brand === 'bosch') {
    return [`https://media3.bosch-home.com/Documents/specsheet/en-AU/${encodeURIComponent(model)}.pdf`];
  }

  return [];
}

async function verifyLikelyPdfUrl(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT,
} = {}) {
  if (!fetchImpl) return false;
  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: 'application/pdf,*/*',
        range: 'bytes=0-4',
        'user-agent': userAgent,
      },
      signal: controller.signal,
    });
    if (!response.ok && response.status !== 206) return false;
    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
    if (contentType.includes('application/pdf')) return true;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.toString('latin1', 0, 5) === '%PDF-';
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function fetchDuckDuckGoHtml(query, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT,
} = {}) {
  if (!fetchImpl) throw new Error('fetchDuckDuckGoHtml requires fetch');
  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const url = new URL('https://duckduckgo.com/html/');
    url.searchParams.set('q', query);
    const response = await fetchImpl(String(url), {
      headers: {
        accept: 'text/html',
        'user-agent': userAgent,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`DuckDuckGo PDF search HTTP ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`DuckDuckGo PDF search timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function fetchYahooHtml(query, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT,
} = {}) {
  if (!fetchImpl) throw new Error('fetchYahooHtml requires fetch');
  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const url = new URL('https://search.yahoo.com/search');
    url.searchParams.set('p', query);
    const response = await fetchImpl(String(url), {
      headers: {
        accept: 'text/html',
        'user-agent': userAgent,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Yahoo PDF search HTTP ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Yahoo PDF search timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function fetchSearchHtml(query, engine, opts) {
  if (engine === 'yahoo') return fetchYahooHtml(query, opts);
  return fetchDuckDuckGoHtml(query, opts);
}

function extractSearchResultUrls(html, engine) {
  if (engine === 'yahoo') return extractYahooResultUrls(html);
  return extractDuckDuckGoResultUrls(html);
}

async function searchPdfForDiscovery(discovery, {
  delayMs = 250,
  fetchImpl = globalThis.fetch,
  searchEngines = ['duckduckgo', 'yahoo'],
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  for (const url of buildDirectPdfCandidates(discovery)) {
    if (
      isAcceptedPdfUrl(url, discovery)
      && await verifyLikelyPdfUrl(url, { fetchImpl, timeoutMs })
    ) {
      return {
        url,
        source: 'direct-manufacturer-pattern',
        query: 'direct-pattern',
        score: scorePdfUrl(url, discovery),
      };
    }
  }

  const queries = buildSearchQueries(discovery);

  for (let index = 0; index < queries.length; index += 1) {
    const query = queries[index];
    for (const engine of searchEngines) {
      let html = '';
      try {
        html = await fetchSearchHtml(query, engine, { fetchImpl, timeoutMs });
      } catch {
        continue;
      }
      const candidates = extractSearchResultUrls(html, engine)
        .filter((url) => isAcceptedPdfUrl(url, discovery))
        .map((url) => ({ url, score: scorePdfUrl(url, discovery) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);

      if (candidates[0]) {
        return {
          url: candidates[0].url,
          source: `${engine}-html`,
          query,
          score: candidates[0].score,
        };
      }
    }

    if (delayMs > 0 && index < queries.length - 1) {
      await sleep(delayMs);
    }
  }

  return null;
}

module.exports = {
  buildDirectPdfCandidates,
  buildSearchQueries,
  extractDuckDuckGoResultUrls,
  extractYahooResultUrls,
  isAcceptedPdfUrl,
  searchPdfForDiscovery,
  scorePdfUrl,
  verifyLikelyPdfUrl,
};
