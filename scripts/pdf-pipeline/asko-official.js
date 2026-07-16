const { createHash } = require('node:crypto');

const API_BASE = 'https://api-storefront.asko.com/ggcommercewebservices/v2/asko-au/products/manuals/search';
const PRODUCT_API_BASE = 'https://api-storefront.asko.com/ggcommercewebservices/v2/asko-au/products/';
const MAXIMUM_RESPONSE_BYTES = 8 * 1024 * 1024;

function text(value) {
  return String(value ?? '').trim();
}

function exactModel(left, right) {
  return text(left).toUpperCase() === text(right).toUpperCase();
}

function documentType(description, url) {
  const value = `${description} ${url}`;
  if (/install/i.test(value)) return 'installation_guide';
  if (/product[\s_-]*sheet|specification|technical[\s_-]*data/i.test(value)) return 'specification_sheet';
  if (/instruction|user[\s_-]*manual|manual/i.test(value)) return 'user_manual';
  return 'family_manual';
}

function score(resource) {
  if (resource.resourceType === 'installation_guide') return 300;
  if (resource.resourceType === 'specification_sheet') return 250;
  if (resource.resourceType === 'user_manual') return 150;
  return 50;
}

function eligiblePdf(manual) {
  const description = text(manual?.desc);
  const url = text(manual?.url);
  if (!url || !/\.pdf(?:$|[?&#])/i.test(url)) return false;
  if (/energy|wels|water[\s_-]*rating|product[\s_-]*fiche/i.test(description)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function discoveryObjectPath(hash) {
  return `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`;
}

function pimDimensions(product) {
  const axes = new Map();
  for (const classification of product?.classifications ?? []) {
    for (const feature of classification?.features ?? []) {
      const axis = text(feature?.name).toLowerCase();
      if (!['width', 'height', 'depth'].includes(axis)
        || text(feature?.featureUnit?.symbol).toLowerCase() !== 'mm') continue;
      const values = (feature?.featureValues ?? []).map((entry) => Number(entry?.value));
      if (values.length !== 1 || !Number.isInteger(values[0]) || values[0] <= 0) return null;
      if (axes.has(axis) && axes.get(axis) !== values[0]) return null;
      axes.set(axis, values[0]);
    }
  }
  return ['width', 'height', 'depth'].every((axis) => axes.has(axis))
    ? ['width', 'height', 'depth'].map((axis) => axes.get(axis)).join('x') : null;
}

async function findAskoOfficialPdf(target, options = {}) {
  const model = text(target?.sku ?? target?.model);
  if (!model || /[*?]/.test(model)) return null;
  const discoveryUrl = new URL(API_BASE);
  discoveryUrl.searchParams.set('query', model);
  discoveryUrl.searchParams.set('lang', 'en_AU');
  discoveryUrl.searchParams.set('curr', 'AUD');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('ASKO official finder requires fetch');
  const response = await fetchImpl(discoveryUrl.toString(), {
    headers: { accept: 'application/json' },
    signal: options.signal,
  });
  if (!response?.ok) {
    const error = new Error(`ASKO manuals API returned HTTP ${response?.status ?? 'unknown'}`);
    error.status = response?.status;
    throw error;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > (options.maximumBytes ?? MAXIMUM_RESPONSE_BYTES)) {
    throw new Error('ASKO manuals API response size outside limits');
  }
  let payload;
  try { payload = JSON.parse(bytes.toString('utf8')); } catch {
    throw new Error('ASKO manuals API returned invalid JSON');
  }
  const candidates = Array.isArray(payload?.products) ? payload.products : [];
  const exactProducts = candidates.filter((product) => exactModel(product?.modelMark, model));
  let products = exactProducts;
  if (!products.length) {
    const { officialMarketApiModelVariant } = await import(
      '../../src/domain/official-model-variant-policy.mjs'
    );
    const identity = {
      brand: target?.brand ?? 'ASKO',
      model,
      category: target?.category,
    };
    products = candidates.filter((product) => (
      officialMarketApiModelVariant(identity, product?.modelMark) != null
    ));
  }
  if (!products.length) return null;
  const selectedModelsByCode = new Map();
  for (const product of products) {
    const productCode = text(product.code).split('/').at(-1);
    const matchedModel = text(product.modelMark);
    if (!productCode || !matchedModel) continue;
    const previous = selectedModelsByCode.get(productCode);
    if (previous && !exactModel(previous, matchedModel)) {
      throw new Error('ASKO manuals API product code maps to conflicting models');
    }
    selectedModelsByCode.set(productCode, matchedModel);
  }
  const productCodes = [...selectedModelsByCode.keys()];
  if (!productCodes.length) return null;
  const details = [];
  for (const productCode of productCodes) {
    const detailUrl = new URL(productCode, PRODUCT_API_BASE);
    detailUrl.searchParams.set('fields', 'FULL');
    detailUrl.searchParams.set('lang', 'en_AU');
    detailUrl.searchParams.set('curr', 'AUD');
    const detailResponse = await fetchImpl(detailUrl.toString(), {
      headers: { accept: 'application/json' }, signal: options.signal,
    });
    if (!detailResponse?.ok) {
      const error = new Error(`ASKO product API returned HTTP ${detailResponse?.status ?? 'unknown'}`);
      error.status = detailResponse?.status;
      throw error;
    }
    const detailBytes = Buffer.from(await detailResponse.arrayBuffer());
    if (!detailBytes.length || detailBytes.length > (options.maximumBytes ?? MAXIMUM_RESPONSE_BYTES)) {
      throw new Error('ASKO product API response size outside limits');
    }
    let detail;
    try { detail = JSON.parse(detailBytes.toString('utf8')); } catch {
      throw new Error('ASKO product API returned invalid JSON');
    }
    const selectedModel = selectedModelsByCode.get(productCode);
    if (!exactModel(detail?.modelMark, selectedModel) || text(detail?.code) !== productCode) {
      throw new Error('ASKO product API did not preserve selected model and product code');
    }
    details.push({ detail, detailBytes, detailUrl, productCode, dimensions: pimDimensions(detail) });
  }
  if (details.length > 1 && (details.some((entry) => !entry.dimensions)
    || new Set(details.map((entry) => entry.dimensions)).size !== 1)) {
    throw new Error('ASKO manuals API multiple product codes have incomplete or conflicting PIM dimensions');
  }
  if (typeof options.writeObject !== 'function') {
    throw new TypeError('ASKO official finder requires a discovery object writer');
  }
  const bound = [];
  for (const entry of details) {
    const hash = createHash('sha256').update(entry.detailBytes).digest('hex');
    const objectPath = discoveryObjectPath(hash);
    const resources = (Array.isArray(entry.detail?.documents) ? entry.detail.documents : [])
      .filter(eligiblePdf)
      .map((manual) => ({
        url: new URL(manual.url).toString(), resourceType: documentType(manual.desc, manual.url),
        description: text(manual.desc), matchedSku: text(entry.detail.modelMark),
        productCode: entry.productCode,
      }));
    if (!resources.length) continue;
    await options.writeObject(objectPath, entry.detailBytes);
    bound.push(...resources.map((resource) => ({
      ...resource,
      discoveryProvenance: {
        schemaVersion: 1, method: 'official_market_api', market: 'AU',
        discoveryUrl: entry.detailUrl.toString(), requestedModel: model,
        matchedModel: resource.matchedSku, artifactUrl: resource.url,
        discoveryContentSha256: hash, discoveryObjectPath: objectPath,
        discoveryByteSize: entry.detailBytes.length, documentId: resource.productCode,
      },
    })));
  }
  if (!bound.length) return null;
  bound.sort((left, right) => score(right) - score(left) || left.url.localeCompare(right.url));
  return {
    sourceUrl: bound[0].url,
    matchedSku: bound[0].matchedSku,
    resourceType: bound[0].resourceType,
    discoveryProvenance: bound[0].discoveryProvenance,
    resources: bound,
  };
}

module.exports = { findAskoOfficialPdf };
