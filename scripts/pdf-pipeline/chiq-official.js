const CHIQ_CDN_BASE_URL = 'https://chiq.com.au/cdn/shop/files';

function normalizeSku(value, { keepWildcard = false } = {}) {
  const allowed = keepWildcard ? /[^A-Z0-9*]+/g : /[^A-Z0-9]+/g;
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(allowed, '');
}

function collectLookupSkus(target = {}) {
  const values = [
    target.sku,
    target.model,
    target.product?.model,
    target.product?.sku
  ].filter(Boolean);

  const candidates = [];
  for (const value of values) {
    const raw = String(value || '').trim().toUpperCase();
    if (raw.includes('*')) continue;
    const normalized = normalizeSku(raw);
    if (normalized && /^[A-Z0-9.-]+$/.test(raw)) candidates.push(normalized);

    const tokenMatches = raw.match(/\b[A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*\b/g) || [];
    for (const token of tokenMatches) {
      const cleanToken = normalizeSku(token);
      if (cleanToken.length >= 4 && !cleanToken.includes('*')) candidates.push(cleanToken);
    }
  }

  return [...new Set(candidates.filter((sku) => sku.length >= 4))];
}

function buildChiqSpecUrls(sku) {
  const code = normalizeSku(sku);
  if (!code) return [];
  return [
    `${CHIQ_CDN_BASE_URL}/${encodeURIComponent(`${code}_SPEC.pdf`)}`,
    `${CHIQ_CDN_BASE_URL}/${encodeURIComponent(`${code}_Spec.pdf`)}`,
    `${CHIQ_CDN_BASE_URL}/${encodeURIComponent(`${code}_spec.pdf`)}`,
    `${CHIQ_CDN_BASE_URL}/${encodeURIComponent(`${code}_Specifications_Sheet.pdf`)}`,
    `${CHIQ_CDN_BASE_URL}/${encodeURIComponent(`${code}_specifications_sheet.pdf`)}`
  ];
}

function isPdfLikeResponse(response, url) {
  if (!response?.ok) return false;
  const type = String(response.headers?.get?.('content-type') || '').toLowerCase();
  return type.includes('pdf') || /\.pdf(?:$|\?)/i.test(String(url || ''));
}

async function probePdfUrl(url, fetchImpl) {
  try {
    const head = await fetchImpl(url, {
      method: 'HEAD',
      headers: {
        Accept: 'application/pdf',
        'User-Agent': 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)'
      }
    });
    if (isPdfLikeResponse(head, url)) return true;
    if (head?.ok) return false;
  } catch {
    // Some CDNs do not support HEAD consistently; fall through to a tiny GET.
  }

  try {
    const get = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/pdf',
        Range: 'bytes=0-5',
        'User-Agent': 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)'
      }
    });
    return isPdfLikeResponse(get, url);
  } catch {
    return false;
  }
}

async function findChiqOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch
} = {}) {
  if (!fetchImpl) throw new Error('CHIQ official finder requires fetch');
  const lookupSkus = collectLookupSkus(target);
  if (!lookupSkus.length) throw new Error('CHIQ official finder requires a concrete SKU');

  const attempted = [];
  for (const sku of lookupSkus) {
    for (const url of buildChiqSpecUrls(sku)) {
      attempted.push(url);
      if (await probePdfUrl(url, fetchImpl)) {
        return {
          sourceUrl: url,
          source: 'chiq-official-spec_sheet',
          resourceType: 'spec_sheet',
          productCode: sku
        };
      }
    }
  }

  throw new Error(`CHIQ official spec sheet not found: ${attempted.join(' | ')}`);
}

exports.buildChiqSpecUrls = buildChiqSpecUrls;
exports.collectLookupSkus = collectLookupSkus;
exports.findChiqOfficialPdf = findChiqOfficialPdf;
exports.normalizeSku = normalizeSku;
