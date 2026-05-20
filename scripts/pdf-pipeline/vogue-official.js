const DEFAULT_TIMEOUT_MS = 20_000;
const TRADE_DEPOT_MANUAL_BASE_URL = 'https://trade-depot.s3.ap-southeast-2.amazonaws.com/files/products/manuals/';

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function buildTradeDepotManualUrl(sku) {
  const normalized = normalizeSku(sku);
  if (!normalized) throw new Error('VOGUE finder requires a SKU/model target.');
  return `${TRADE_DEPOT_MANUAL_BASE_URL}${encodeURIComponent(normalized)}_User_Manual.pdf`;
}

function getHeader(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  if (typeof headers.get === 'undefined' && typeof headers[Symbol.iterator] === 'function') {
    const target = String(name).toLowerCase();
    for (const [key, value] of headers) {
      if (String(key).toLowerCase() === target) return String(value || '');
    }
  }
  return headers[name] || headers[String(name).toLowerCase()] || '';
}

async function probeUrl(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (!fetchImpl) throw new Error('VOGUE official finder requires fetch');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 FitApplianceBot/1.0',
        Accept: 'application/pdf,*/*;q=0.8'
      },
      signal: controller.signal
    });
    if (response.ok) {
      const contentType = getHeader(response.headers, 'content-type');
      return !contentType || /pdf|octet-stream/i.test(contentType);
    }
    return false;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`timeout after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function findVogueOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const sku = String(target.sku || target.model || target.product?.model || '').trim();
  const sourceUrl = buildTradeDepotManualUrl(sku);
  const exists = await probeUrl(sourceUrl, { fetchImpl, timeoutMs });
  if (!exists) {
    throw new Error(`VOGUE PDF resources not found for ${sku}`);
  }

  return {
    sourceUrl,
    source: 'vogue-trade-depot-manual',
    resourceType: 'user_manual'
  };
}

exports.buildTradeDepotManualUrl = buildTradeDepotManualUrl;
exports.findVogueOfficialPdf = findVogueOfficialPdf;
exports.normalizeSku = normalizeSku;
