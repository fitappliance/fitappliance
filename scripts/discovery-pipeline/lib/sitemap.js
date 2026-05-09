const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
});

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function parseSitemapXml(xml) {
  const parsed = parser.parse(xml);
  const urlLocs = asArray(parsed?.urlset?.url).map((entry) => entry?.loc).filter(Boolean);
  const sitemapLocs = asArray(parsed?.sitemapindex?.sitemap).map((entry) => entry?.loc).filter(Boolean);
  return [...urlLocs, ...sitemapLocs].map(String);
}

async function fetchText(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 30000,
  userAgent = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)',
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required for sitemap discovery.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: 'application/xml,text/xml,text/plain,*/*',
        'accept-language': 'en-AU,en;q=0.9',
        'user-agent': userAgent,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Sitemap fetch failed for ${url}: HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function looksLikeSitemapUrl(url) {
  const lower = String(url || '').toLowerCase();
  return lower.endsWith('.xml') || lower.includes('sitemap');
}

async function collectSitemapUrls(seedUrls, {
  delayMs = 1000,
  fetchImpl,
  maxSitemaps = 25,
  timeoutMs = 30000,
  userAgent,
} = {}) {
  const queue = [...seedUrls];
  const visited = new Set();
  const productUrls = [];
  const fetchedSitemaps = [];

  while (queue.length > 0 && fetchedSitemaps.length < maxSitemaps) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);
    fetchedSitemaps.push(sitemapUrl);

    const xml = await fetchText(sitemapUrl, { fetchImpl, timeoutMs, userAgent });
    const locs = parseSitemapXml(xml);
    for (const loc of locs) {
      if (looksLikeSitemapUrl(loc) && !visited.has(loc)) {
        queue.push(loc);
      } else {
        productUrls.push(loc);
      }
    }

    if (delayMs > 0 && queue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { fetchedSitemaps, productUrls };
}

module.exports = {
  collectSitemapUrls,
  fetchText,
  looksLikeSitemapUrl,
  parseSitemapXml,
};
