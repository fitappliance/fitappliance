const DEFAULT_USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';
const DEFAULT_TIMEOUT_MS = 30_000;
const AO_ORIGIN = 'https://www.appliancesonline.com.au';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAbsoluteUrl(value, origin = AO_ORIGIN) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw, origin).toString();
  } catch {
    return '';
  }
}

function slugFromProductUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const productIndex = parts.indexOf('product');
    return productIndex >= 0 && parts[productIndex + 1]
      ? parts[productIndex + 1]
      : '';
  } catch {
    return '';
  }
}

async function fetchJson(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT
} = {}) {
  if (!fetchImpl) throw new Error('fetchJson requires a fetch implementation');
  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: 'application/json',
        'user-agent': userAgent
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`AO API HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`AO API timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function categoryFromDiscoveryCategory(category) {
  return {
    dishwasher: 'dishwasher',
    dryer: 'dryer',
    fridge: 'fridge',
    washing_machine: 'washing_machine'
  }[category] || category || 'unknown';
}

function flattenSpecificationAttributes(specifications) {
  const groups = specifications?.groupedAttributes || {};
  return Object.values(groups)
    .flatMap((group) => Array.isArray(group?.attributes) ? group.attributes : [])
    .filter(Boolean);
}

function attributeValue(attributes, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const match = attributes.find((attribute) => wanted.has(String(attribute.displayName || '').trim().toLowerCase()));
  return match?.value ?? null;
}

function parseMm(value) {
  const raw = String(value || '');
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function buildProductStubFromAo({
  discovery,
  productPayload,
  specificationsPayload,
  productUrl
}) {
  const product = productPayload?.product || productPayload || {};
  const attributes = flattenSpecificationAttributes(specificationsPayload);
  const brand = product.manufacturer?.name || discovery.brand;
  const sku = product.sku || discovery.model;
  const title = product.title || `${brand} ${sku}`;
  const category = categoryFromDiscoveryCategory(discovery.category);
  const w = parseMm(attributeValue(attributes, ['Width (mm)', 'Width']));
  const h = parseMm(attributeValue(attributes, ['Height (mm)', 'Height']));
  const d = parseMm(attributeValue(attributes, ['Depth (mm)', 'Depth']));
  const productPath = product.uri || new URL(productUrl).pathname;

  return {
    id: `ao-${product.productId || sku}`,
    cat: category,
    brand,
    model: sku,
    displayName: title,
    title,
    slug: `ao-${String(sku).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    w,
    h,
    d,
    unavailable: false,
    retailers: [
      {
        n: 'Appliances Online',
        url: normalizeAbsoluteUrl(productPath),
        p: Number.isFinite(Number(product.price)) ? Number(product.price) : null,
        verified_at: new Date().toISOString().slice(0, 10),
        source: 'appliances-online-api'
      }
    ],
    discovery: {
      retailer: 'Appliances Online',
      retailer_key: 'appliancesonline',
      product_id: product.productId || null,
      product_url: normalizeAbsoluteUrl(productPath),
      source: 'appliances-online-api'
    }
  };
}

function scoreManual(manual) {
  const haystack = `${manual?.name || ''} ${manual?.description || ''} ${manual?.url || ''}`.toLowerCase();
  if (!/\.pdf($|[?#])/i.test(String(manual?.url || ''))) return -100;

  let score = 0;
  if (/spec|specification|data\s*sheet|datasheet|fact\s*sheet|factsheet/.test(haystack)) score += 50;
  if (/quick|reference|qrg/.test(haystack)) score += 25;
  if (/install|installation/.test(haystack)) score += 20;
  if (/manual/.test(haystack)) score += 10;
  if (/warranty|energy|label|brochure|catalogue|catalog/.test(haystack)) score -= 20;
  return score;
}

function selectBestPdfManual(manualsPayload) {
  const manuals = Array.isArray(manualsPayload?.manuals) ? manualsPayload.manuals : [];
  return manuals
    .map((manual) => ({
      ...manual,
      url: normalizeAbsoluteUrl(manual.url),
      score: scoreManual(manual)
    }))
    .filter((manual) => manual.url && manual.score >= 0)
    .sort((a, b) => b.score - a.score || (a.displayOrder ?? 999) - (b.displayOrder ?? 999))[0] || null;
}

async function fetchAppliancesOnlineProductBundle(discovery, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const slug = slugFromProductUrl(discovery.url);
  if (!slug) throw new Error('AO product URL does not contain /product/<slug>');

  const date = new Date().toISOString().slice(0, 10).split('-').map((part) => Number(part)).join('-');
  const productUrl = `${AO_ORIGIN}/api/v2/product/slug/${encodeURIComponent(slug)}?date=${date}`;
  const productPayload = await fetchJson(productUrl, { fetchImpl, timeoutMs });
  const product = productPayload?.product || productPayload || {};
  const productId = product.productId;
  const sku = product.sku || discovery.model;
  if (!productId) throw new Error('AO API product response missing productId');
  if (!sku) throw new Error('AO API product response missing sku');

  const [specificationsPayload, manualsPayload] = await Promise.all([
    fetchJson(`${AO_ORIGIN}/api/v2/product/specifications/sku/${encodeURIComponent(sku)}`, { fetchImpl, timeoutMs }),
    fetchJson(`${AO_ORIGIN}/api/product/manuals/id/${productId}`, { fetchImpl, timeoutMs })
  ]);

  const selectedManual = selectBestPdfManual(manualsPayload);
  const productStub = buildProductStubFromAo({
    discovery,
    productPayload,
    productUrl: discovery.url,
    specificationsPayload
  });

  return {
    discovery,
    product: productStub,
    productPayload,
    specificationsPayload,
    manualsPayload,
    selectedManual
  };
}

module.exports = {
  AO_ORIGIN,
  buildProductStubFromAo,
  fetchAppliancesOnlineProductBundle,
  fetchJson,
  normalizeAbsoluteUrl,
  selectBestPdfManual,
  sleep,
  slugFromProductUrl
};
