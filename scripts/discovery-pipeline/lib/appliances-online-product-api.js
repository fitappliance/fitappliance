const DEFAULT_USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';
const DEFAULT_TIMEOUT_MS = 30_000;
const AO_ORIGIN = 'https://www.appliancesonline.com.au';
const { createHash } = require('node:crypto');
const { normalizeRetailerPrice } = require('../../common/retailer-price.js');

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

async function fetchJsonWithBytes(url, {
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
    if (typeof response.text === 'function') {
      const text = await response.text();
      const bytes = Buffer.from(text);
      try {
        return { payload: JSON.parse(text), bytes };
      } catch (cause) {
        const error = new SyntaxError('AO API returned invalid JSON', { cause });
        error.code = 'AO_INVALID_JSON';
        error.rawResponseBytes = bytes;
        throw error;
      }
    }
    const payload = await response.json();
    return { payload, bytes: Buffer.from(JSON.stringify(payload)) };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`AO API timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function fetchJson(url, options = {}) {
  return (await fetchJsonWithBytes(url, options)).payload;
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

function explicitTimestamp(value, label = 'observedAt') {
  const parsed = new Date(String(value || ''));
  if (Number.isNaN(parsed.valueOf())) throw new TypeError(`${label} must be an explicit timestamp`);
  return parsed.toISOString();
}

function normalizedModel(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

class AoProductIdentityError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'AoProductIdentityError';
    this.code = code;
    Object.assign(this, details);
  }
}

function productRecord(productPayload) {
  return productPayload?.product || productPayload || {};
}

function aoAvailability(product) {
  if (product.available === true) return { availability: 'available', listingState: 'current' };
  if (product.available === false) return { availability: 'unavailable', listingState: 'unavailable' };
  return { availability: 'unknown', listingState: 'current' };
}

function exactRawBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value);
  throw new TypeError('AO product raw response bytes required');
}

async function buildAoRetailerSnapshot({
  adapter,
  canonicalProductId,
  expectedModel,
  productPayload,
  productRawBytes,
  productUrl,
  observedAt,
  rawSourceReference,
}) {
  const product = productRecord(productPayload);
  if (!product.productId) throw new TypeError('AO product response missing productId');
  if (!product.sku) throw new TypeError('AO product response missing sku');
  const canonicalUrl = normalizeAbsoluteUrl(productUrl);
  const payloadUrl = normalizeAbsoluteUrl(product.uri);
  if (!canonicalUrl || !payloadUrl) throw new TypeError('AO product URL and payload URI required');
  if (normalizedModel(product.sku) !== normalizedModel(expectedModel)) {
    throw new AoProductIdentityError(
      'AO_MODEL_MISMATCH',
      `AO product model mismatch: expected ${expectedModel}, received ${product.sku}`,
      {
        expectedModel: String(expectedModel),
        receivedModel: String(product.sku),
        expectedUrl: canonicalUrl,
        receivedUrl: payloadUrl,
      },
    );
  }
  const normalizePath = (value) => new URL(value).pathname.replace(/\/+$/, '');
  if (normalizePath(canonicalUrl) !== normalizePath(payloadUrl)) {
    throw new AoProductIdentityError(
      'AO_URI_MISMATCH',
      `AO product URI mismatch: ${new URL(canonicalUrl).pathname} != ${new URL(payloadUrl).pathname}`,
      {
        expectedModel: String(expectedModel),
        receivedModel: String(product.sku),
        expectedUrl: canonicalUrl,
        receivedUrl: payloadUrl,
      },
    );
  }
  const bytes = exactRawBytes(productRawBytes);
  const { normalizeRetailerSnapshot } = await import('../../../src/domain/retailer-source-adapter.mjs');
  const state = aoAvailability(product);
  return normalizeRetailerSnapshot(adapter, {
    observedAt: explicitTimestamp(observedAt),
    complete: false,
    canonicalProductIds: [canonicalProductId],
    rawPayloadSha256: createHash('sha256').update(bytes).digest('hex'),
    rawSourceReference,
    rows: [{
      canonicalProductId,
      retailerProductId: String(product.productId),
      url: canonicalUrl,
      title: String(product.title || `${product.manufacturer?.name || ''} ${product.sku}`).trim(),
      priceAud: normalizeRetailerPrice(product.price),
      imageUrl: normalizeAbsoluteUrl(product.image?.url || product.imageUrl || '') || null,
      ...state,
    }],
  });
}

async function buildAoFailedRetailerSnapshot({
  adapter,
  canonicalProductId,
  observedAt,
  rawSourceReference,
  collectionError,
  rawPayloadSha256 = null,
  failureContext = null,
}) {
  const { normalizeRetailerSnapshot } = await import('../../../src/domain/retailer-source-adapter.mjs');
  return normalizeRetailerSnapshot(adapter, {
    observedAt: explicitTimestamp(observedAt),
    complete: false,
    canonicalProductIds: [String(canonicalProductId || '').trim()],
    rawSourceReference,
    rawPayloadSha256,
    failureContext,
    collectionError,
    rows: [],
  });
}

function buildProductStubFromAo({
  discovery,
  productPayload,
  specificationsPayload,
  productUrl,
  observedAt,
}) {
  const product = productRecord(productPayload);
  const observationTimestamp = explicitTimestamp(observedAt);
  const availability = aoAvailability(product);
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
    unavailable: availability.availability !== 'available',
    retailers: [
      {
        n: 'Appliances Online',
        url: normalizeAbsoluteUrl(productPath),
        p: normalizeRetailerPrice(product.price),
        verified_at: observationTimestamp.slice(0, 10),
        source: 'appliances-online-api',
        stock: availability.availability === 'available'
          ? 'Yes'
          : availability.availability === 'unavailable' ? 'No' : null,
        availability_state: availability.availability,
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
  timeoutMs = DEFAULT_TIMEOUT_MS,
  observedAt,
} = {}) {
  const slug = slugFromProductUrl(discovery.url);
  if (!slug) throw new Error('AO product URL does not contain /product/<slug>');

  const observationTimestamp = explicitTimestamp(observedAt);
  const date = observationTimestamp.slice(0, 10).split('-').map((part) => Number(part)).join('-');
  const productUrl = `${AO_ORIGIN}/api/v2/product/slug/${encodeURIComponent(slug)}?date=${date}`;
  const productResponse = await fetchJsonWithBytes(productUrl, { fetchImpl, timeoutMs });
  const productPayload = productResponse.payload;
  const product = productRecord(productPayload);
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
    specificationsPayload,
    observedAt: observationTimestamp,
  });

  return {
    discovery,
    product: productStub,
    productPayload,
    productRawBytes: productResponse.bytes,
    productPayloadSha256: createHash('sha256').update(productResponse.bytes).digest('hex'),
    specificationsPayload,
    manualsPayload,
    selectedManual
  };
}

module.exports = {
  AO_ORIGIN,
  buildAoFailedRetailerSnapshot,
  buildAoRetailerSnapshot,
  AoProductIdentityError,
  buildProductStubFromAo,
  fetchAppliancesOnlineProductBundle,
  fetchJson,
  fetchJsonWithBytes,
  normalizeAbsoluteUrl,
  selectBestPdfManual,
  sleep,
  slugFromProductUrl
};
