const DEFAULT_USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';
const SPECIFICATION_SHEETS_URL = 'https://omegaappliances.co.nz/pages/specification-sheets';

let cachedSpecHtml = null;

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function getTargetSku(target = {}) {
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractOmegaSpecResources(html) {
  const resources = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || '').matchAll(anchorPattern)) {
    const href = decodeHtml(match[1]);
    const label = decodeHtml(match[2]).replace(/<[^>]+>/g, ' ');
    const labelSku = label.match(/\bSpecifications?\s*:\s*([A-Z0-9][A-Z0-9._-]{2,})\b/i)?.[1];
    const filenameSku = decodeURIComponent(href).match(/(?:Specifications?|Specification)-([A-Z0-9][A-Z0-9._-]{2,})\.pdf/i)?.[1];
    const sku = labelSku || filenameSku;
    if (!sku) continue;
    resources.push({
      sku: sku.trim(),
      normalizedSku: normalizeSku(sku),
      sourceUrl: href,
      url: href,
      source: 'omega-official-spec_sheet',
      resourceType: 'specification_sheet',
      score: 100
    });
  }
  return resources;
}

async function fetchText(url, {
  fetchImpl = globalThis.fetch,
  userAgent = DEFAULT_USER_AGENT,
  timeoutMs = 30_000
} = {}) {
  if (!fetchImpl) throw new Error('Omega official finder requires fetch');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml'
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function probePdfMagic(url, {
  fetchImpl = globalThis.fetch,
  userAgent = DEFAULT_USER_AGENT
} = {}) {
  if (!fetchImpl) throw new Error('Omega official finder requires fetch');
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Range: 'bytes=0-7',
      'User-Agent': userAgent
    }
  });
  if (!response.ok && response.status !== 206) return { ok: false, status: response.status };
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    ok: bytes.toString('latin1').startsWith('%PDF-'),
    status: response.status,
    contentType: response.headers?.get?.('content-type') || ''
  };
}

async function getSpecHtml(options) {
  if (cachedSpecHtml) return cachedSpecHtml;
  cachedSpecHtml = await fetchText(SPECIFICATION_SHEETS_URL, options);
  return cachedSpecHtml;
}

async function findOmegaOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  userAgent = DEFAULT_USER_AGENT,
  timeoutMs = 30_000,
  verifyPdf = true
} = {}) {
  const sku = getTargetSku(target);
  const normalizedSku = normalizeSku(sku);
  if (!normalizedSku) throw new Error('Omega official finder requires a SKU');

  const html = await getSpecHtml({ fetchImpl, userAgent, timeoutMs });
  const resources = extractOmegaSpecResources(html)
    .filter((resource) => resource.normalizedSku === normalizedSku)
    .sort((a, b) => b.score - a.score || a.sourceUrl.localeCompare(b.sourceUrl));

  if (resources.length === 0) {
    throw new Error(`Omega official specification sheet not found for ${sku}`);
  }

  if (verifyPdf) {
    const failures = [];
    for (const resource of resources) {
      const probe = await probePdfMagic(resource.sourceUrl, { fetchImpl, userAgent }).catch((error) => ({
        ok: false,
        error: error.message
      }));
      if (probe.ok) {
        return {
          ...resource,
          resources
        };
      }
      failures.push(`${resource.sourceUrl}: ${probe.error || probe.status || 'not pdf'}`);
    }
    throw new Error(`Omega official PDF probe failed for ${sku}: ${failures.join(' | ')}`);
  }

  return {
    ...resources[0],
    resources
  };
}

function clearOmegaCaches() {
  cachedSpecHtml = null;
}

exports.SPECIFICATION_SHEETS_URL = SPECIFICATION_SHEETS_URL;
exports.clearOmegaCaches = clearOmegaCaches;
exports.extractOmegaSpecResources = extractOmegaSpecResources;
exports.findOmegaOfficialPdf = findOmegaOfficialPdf;
exports.normalizeSku = normalizeSku;
exports.probePdfMagic = probePdfMagic;
