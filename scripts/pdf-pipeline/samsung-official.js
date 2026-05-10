require('dotenv').config({ quiet: true });

const SAMSUNG_AU_BASE_URL = 'https://www.samsung.com';
const DEFAULT_USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';
const DEFAULT_TIMEOUT_MS = 60_000;

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
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function absoluteSamsungUrl(url) {
  const decoded = decodeHtml(url)
    .replace(/\\\//g, '/')
    .split(/["'<>\s]/)[0]
    .replace(/%22.*$/i, '');
  return new URL(decoded, SAMSUNG_AU_BASE_URL).toString();
}

async function fetchHtml(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT
} = {}) {
  if (!fetchImpl) throw new Error('Samsung official finder requires fetch');
  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetchImpl(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml'
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Samsung official fetch failed with HTTP ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Samsung official fetch timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function buildSamsungSupportModelVariants(sku) {
  const exact = normalizeSku(sku);
  if (!exact) return [];
  const variants = new Set([exact]);
  if (!exact.endsWith('SA')) variants.add(`${exact}SA`);
  return [...variants];
}

function classifySamsungResource(resource = {}) {
  const haystack = [
    resource.type,
    resource.contentsTypeCode,
    resource.description,
    resource.englishDescription,
    resource.fileName,
    resource.url,
    resource.downloadUrl
  ].filter(Boolean).join(' ');

  if (/quick\s+reference|qrg/i.test(haystack)) return 'quick_reference_guide';
  if (/spec(?:ification)?\s*(?:sheet|guide)?|brochure|data\s*sheet/i.test(haystack)) return 'specification_sheet';
  if (/install(?:ation)?/i.test(haystack)) return 'installation_manual';
  if (/user\s*manual|owners?\s*manual|\bUM\b/i.test(haystack)) return 'user_manual';
  return 'pdf';
}

function languageCodes(manual = {}) {
  return (Array.isArray(manual.languageList) ? manual.languageList : [])
    .map((entry) => String(entry.code || entry.orgCode || entry.name || '').toUpperCase())
    .filter(Boolean);
}

function areaCodes(manual = {}) {
  return (Array.isArray(manual.areaList) ? manual.areaList : [])
    .map((entry) => String(entry.code || entry.orgCode || '').toUpperCase())
    .filter(Boolean);
}

function scoreSamsungResource(resource) {
  const typeScore = {
    specification_sheet: 110,
    quick_reference_guide: 100,
    installation_manual: 80,
    user_manual: 55,
    pdf: 20
  }[resource.type] ?? 0;
  const languageScore = String(resource.language || '').toUpperCase() === 'EN' ? 30 : -40;
  const areaScore = Array.isArray(resource.areas) && resource.areas.includes('AU') ? 25 : 0;
  const urlScore = /CDSite=UNI_AU|\/au\//i.test(resource.url || '') ? 8 : 0;
  return typeScore + languageScore + areaScore + urlScore;
}

function normalizeManualResource(manual, sku) {
  const url = manual.downloadUrl || manual.url || manual.filePath;
  if (!url) return null;
  const languages = languageCodes(manual);
  const areas = areaCodes(manual);
  const language = languages.includes('EN') ? 'EN' : languages[0] || '';
  const resource = {
    url: absoluteSamsungUrl(url),
    type: classifySamsungResource(manual),
    language,
    areas,
    sku: normalizeSku(manual.modelName || sku),
    fileName: manual.fileName || '',
    score: 0
  };
  resource.score = scoreSamsungResource(resource);
  return resource;
}

function parseContentsJsonBlocks(html) {
  const blocks = [];
  const pattern = /<li\b[^>]*data-sdf-prop=["']contents["'][^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = pattern.exec(String(html || '')))) {
    const raw = decodeHtml(match[1]).trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Samsung occasionally ships malformed or escaped blobs. Other URL
      // extractors below still scan the raw HTML, so keep this fail-soft.
    }
  }
  return blocks;
}

function extractRawPdfUrls(html, sku) {
  const resources = [];
  const patterns = [
    /https?:\\?\/\\?\/[^"'<>\s]+?(?:\.pdf|ContentsFile\.aspx)(?:\?[^"'<>\s]*)?/gi,
    /\b(?:href|data-url)=["']([^"']+(?:\.pdf|ContentsFile\.aspx)(?:\?[^"']*)?)["']/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(String(html || '')))) {
      const rawUrl = match[1] || match[0];
      const context = String(html || '').slice(Math.max(0, match.index - 180), match.index + rawUrl.length + 180);
      const resource = {
        url: absoluteSamsungUrl(rawUrl),
        type: classifySamsungResource({ url: rawUrl, description: context }),
        language: /[_-]EN(?:[_\-.]|$)|language=EN|_EN_pdf/i.test(rawUrl) ? 'EN' : '',
        areas: /UNI_AU|\/au\//i.test(rawUrl) ? ['AU'] : [],
        sku: normalizeSku(sku),
        fileName: rawUrl.split('/').pop() || '',
        score: 0
      };
      resource.score = scoreSamsungResource(resource);
      resources.push(resource);
    }
  }

  return resources;
}

function extractSamsungPdfResources(html, sku = '') {
  const resources = [];
  for (const block of parseContentsJsonBlocks(html)) {
    const manuals = Array.isArray(block.manuals) ? block.manuals : [];
    for (const manual of manuals) {
      const resource = normalizeManualResource(manual, sku);
      if (resource) resources.push(resource);
    }
  }
  resources.push(...extractRawPdfUrls(html, sku));

  const deduped = new Map();
  for (const resource of resources) {
    if (!resource.url) continue;
    const existing = deduped.get(resource.url);
    if (!existing || resource.score > existing.score) {
      deduped.set(resource.url, resource);
    }
  }

  return [...deduped.values()].sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}

async function findSamsungOfficialPdf(target, opts = {}) {
  const sku = target?.sku || target?.model || target?.product?.model || target?.product?.sku;
  if (!sku) throw new Error('Samsung official finder requires sku/model');
  const variants = buildSamsungSupportModelVariants(sku);
  let lastError = null;

  for (const variant of variants) {
    const supportUrl = `${SAMSUNG_AU_BASE_URL}/au/support/model/${variant}/`;
    try {
      const html = await fetchHtml(supportUrl, opts);
      const resources = extractSamsungPdfResources(html, sku);
      const best = resources.find((resource) => resource.score > 0) || null;
      if (best) {
        return {
          sku,
          matchedSku: variant,
          supportUrl,
          sourceUrl: best.url,
          source: `samsung-official-${best.type}`,
          resourceType: best.type,
          resources
        };
      }
    } catch (error) {
      lastError = error;
    }
  }

  return {
    sku,
    matchedSku: variants[variants.length - 1] || normalizeSku(sku),
    supportUrl: variants.length ? `${SAMSUNG_AU_BASE_URL}/au/support/model/${variants.at(-1)}/` : '',
    sourceUrl: null,
    source: 'samsung-official',
    resources: [],
    reason: lastError ? lastError.message : 'pdf_resource_not_found'
  };
}

exports.absoluteSamsungUrl = absoluteSamsungUrl;
exports.buildSamsungSupportModelVariants = buildSamsungSupportModelVariants;
exports.extractSamsungPdfResources = extractSamsungPdfResources;
exports.findSamsungOfficialPdf = findSamsungOfficialPdf;
exports.normalizeSku = normalizeSku;
exports.scoreSamsungResource = scoreSamsungResource;
