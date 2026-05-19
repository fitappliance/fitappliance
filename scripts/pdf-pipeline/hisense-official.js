const OCC_BASE_URL = 'https://dtc-aus-api.hisense.com/occ/v2/au';
const ASSET_BASE_URL = 'https://dtc-aus-api.hisense.com';
const DEFAULT_FIELDS = 'FULL';

function normalizeSku(value, { keepWildcard = false } = {}) {
  const allowed = keepWildcard ? /[^A-Z0-9*]+/g : /[^A-Z0-9]+/g;
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(allowed, '');
}

function wildcardMatches(pattern, value) {
  const source = normalizeSku(pattern, { keepWildcard: true });
  const target = normalizeSku(value);
  if (!source || !target || !source.includes('*')) return false;
  if (source.replace(/\*/g, '').length < 5) return false;
  const regex = new RegExp(`^${source.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return regex.test(target);
}

function hisenseProductCodeMatchesSku(productCode, sku) {
  const code = normalizeSku(productCode);
  const target = normalizeSku(sku, { keepWildcard: true });
  if (!code || !target) return false;
  if (code === normalizeSku(target)) return true;
  if (target.includes('*')) return wildcardMatches(target, code);
  if (code.includes('*')) return wildcardMatches(code, target);
  return false;
}

function buildHisenseOccProductUrl(sku, { fields = DEFAULT_FIELDS } = {}) {
  const code = encodeURIComponent(String(sku || '').trim().toUpperCase());
  const params = new URLSearchParams({
    fields,
    lang: 'en',
    curr: 'AUD'
  });
  return `${OCC_BASE_URL}/products/${code}?${params}`;
}

function buildHisenseOccSearchUrl(query) {
  const params = new URLSearchParams({
    query: String(query || '').trim(),
    fields: 'products(code,name,url,specificationDoc,productManual),pagination',
    lang: 'en',
    curr: 'AUD'
  });
  return `${OCC_BASE_URL}/products/search?${params}`;
}

function resolveHisenseAssetUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${ASSET_BASE_URL}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

function scoreResource(resource = {}) {
  const haystack = `${resource.name || ''} ${resource.url || ''}`;
  let score = 0;
  if (/spec|specification/i.test(haystack)) score += 100;
  if (/manual|user/i.test(haystack)) score += 25;
  if (/\.pdf(?:$|\?)/i.test(haystack)) score += 5;
  return score;
}

function selectHisensePdfResource(product = {}) {
  const candidates = [
    product.specificationDoc ? {
      ...product.specificationDoc,
      type: 'specification_doc'
    } : null,
    product.productManual ? {
      ...product.productManual,
      type: 'product_manual'
    } : null
  ].filter((resource) => resource?.url);

  return candidates
    .map((resource, index) => ({
      type: resource.type,
      url: resolveHisenseAssetUrl(resource.url),
      name: resource.name || '',
      score: scoreResource(resource),
      index
    }))
    .filter((resource) => /\.pdf(?:$|\?)/i.test(resource.url) || /\.pdf$/i.test(resource.name))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0] || null;
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
    if (raw) candidates.push(raw);
    const withoutWildcard = raw.replace(/\*/g, '');
    if (withoutWildcard && withoutWildcard !== raw) candidates.push(withoutWildcard);
    const tokenMatches = raw.match(/\b[A-Z]{2,}[A-Z0-9]*\d[A-Z0-9*]*\b/g) || [];
    for (const token of tokenMatches) {
      if (normalizeSku(token).length >= 4) {
        candidates.push(token);
        const cleanToken = token.replace(/\*/g, '');
        if (cleanToken !== token) candidates.push(cleanToken);
      }
    }
  }
  return [...new Set(candidates.filter((sku) => normalizeSku(sku).length >= 4))];
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)'
    }
  });
  if (!response.ok) {
    const error = new Error(`Hisense OCC request failed with HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function productToResult(product, target, sourceSuffix = 'specification_doc') {
  const resource = selectHisensePdfResource(product);
  if (!resource) return null;
  return {
    sourceUrl: resource.url,
    source: `hisense-official-${resource.type || sourceSuffix}`,
    resourceType: resource.type || sourceSuffix,
    productCode: product.code || '',
    productName: product.name || '',
    documentName: resource.name || ''
  };
}

async function findHisenseOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch
} = {}) {
  if (!fetchImpl) throw new Error('Hisense official finder requires fetch');
  const lookupSkus = collectLookupSkus(target);
  if (!lookupSkus.length) throw new Error('Hisense official finder requires a SKU');

  const errors = [];
  for (const sku of lookupSkus) {
    try {
      const product = await fetchJson(buildHisenseOccProductUrl(sku), fetchImpl);
      if (hisenseProductCodeMatchesSku(product.code, sku)) {
        const result = productToResult(product, target);
        if (result) return result;
      }
    } catch (error) {
      errors.push(`${sku}: ${error.message}`);
    }
  }

  for (const sku of lookupSkus) {
    try {
      const payload = await fetchJson(buildHisenseOccSearchUrl(sku), fetchImpl);
      const matches = (Array.isArray(payload.products) ? payload.products : [])
        .filter((product) => hisenseProductCodeMatchesSku(product.code, sku));
      if (matches.length > 1) {
        throw new Error(`Hisense search was ambiguous for ${sku}: ${matches.map((item) => item.code).join(', ')}`);
      }
      if (matches.length === 1) {
        const result = productToResult(matches[0], target);
        if (result) return result;
      }
    } catch (error) {
      errors.push(`search ${sku}: ${error.message}`);
    }
  }

  throw new Error(`Hisense official PDF not found: ${errors.join(' | ')}`.trim());
}

exports.buildHisenseOccProductUrl = buildHisenseOccProductUrl;
exports.buildHisenseOccSearchUrl = buildHisenseOccSearchUrl;
exports.findHisenseOfficialPdf = findHisenseOfficialPdf;
exports.hisenseProductCodeMatchesSku = hisenseProductCodeMatchesSku;
exports.normalizeSku = normalizeSku;
exports.resolveHisenseAssetUrl = resolveHisenseAssetUrl;
exports.selectHisensePdfResource = selectHisensePdfResource;
