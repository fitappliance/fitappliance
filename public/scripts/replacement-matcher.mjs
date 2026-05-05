function normalizeToken(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

const PRACTICAL_REPLACEMENT_BUFFER = Object.freeze({
  width: 10,
  height: 20,
  depth: 10
});

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractModelCode(value) {
  return normalizeText(value)
    .split(' ')
    .find((token) => token.length >= 4 && /[a-z]/.test(token) && /\d/.test(token)) ?? '';
}

function isGenericDisplayName(displayName, product = {}) {
  const normalizedDisplay = normalizeText(displayName);
  const brand = normalizeText(product?.brand);
  if (!normalizedDisplay || !brand) return false;
  const genericLabels = [
    `${brand} fridge`,
    `${brand} refrigerator`,
    `${brand} dishwasher`,
    `${brand} dryer`,
    `${brand} washing machine`,
    `${brand} washer`
  ];
  return genericLabels.includes(normalizedDisplay);
}

function productLabel(product = {}) {
  const brand = String(product.brand ?? '').trim();
  const model = String(product.model ?? '').trim();
  const displayName = String(product.displayName ?? '').trim();
  if (displayName && !isGenericDisplayName(displayName, product)) return displayName;
  const brandModel = [brand, model].filter(Boolean).join(' ');
  if (brandModel) return brandModel;
  return displayName || brand;
}

function isVerifiedRetailerProductPageUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url ?? '').trim());
  } catch {
    return false;
  }
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const pathname = parsed.pathname.replace(/\/+$/, '').toLowerCase();
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  if (!host || pathname === '' || pathname === '/') return false;
  if (['q', 'query', 'searchterm', 'text', 'keyword'].some((key) => parsed.searchParams.has(key))) return false;
  if (/\/(search|searchdisplay|catalogsearch|collections?|category|categories|cart|checkout)(\/|$)/i.test(pathname)) {
    return false;
  }

  if (host.endsWith('jbhifi.com.au')) return /^\/products\//.test(pathname);
  if (host.endsWith('appliancesonline.com.au') || host.endsWith('appliances-online.com.au')) return /^\/product\//.test(pathname);
  if (host.endsWith('binglee.com.au')) return /^\/products\//.test(pathname);
  if (host.endsWith('harveynorman.com.au')) return /\.html$/.test(pathname);
  if (host.endsWith('thegoodguys.com.au')) return /^\/[^/]+-[^/]+$/.test(pathname);

  return false;
}

export function hasVerifiedRetailerLink(product = {}) {
  return Array.isArray(product?.retailers) && product.retailers.some((retailer) => (
    isVerifiedRetailerProductPageUrl(retailer?.url ?? retailer?.href ?? retailer?.u ?? retailer?.link)
  ));
}

function verifiedRetailerLinkCount(product = {}) {
  if (!Array.isArray(product?.retailers)) return 0;
  return product.retailers.filter((retailer) => (
    isVerifiedRetailerProductPageUrl(retailer?.url ?? retailer?.href ?? retailer?.u ?? retailer?.link)
  )).length;
}

function hasCompleteDimensions(product = {}) {
  return [product?.w, product?.h, product?.d].every((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
  });
}

function scoreProduct(query, product) {
  const normalizedQuery = normalizeText(query);
  const compactQuery = normalizeToken(query);
  if (!normalizedQuery || compactQuery.length < 3) return 0;

  const model = normalizeToken(product?.model);
  const queryModelCode = extractModelCode(query);
  const productModelCode = extractModelCode(product?.model);
  const displayName = normalizeText(product?.displayName);
  const label = normalizeText(productLabel(product));
  const brandModel = normalizeText(`${product?.brand ?? ''} ${product?.model ?? ''}`);

  if (queryModelCode && productModelCode && queryModelCode === productModelCode) return 98;
  if (queryModelCode.length >= 5 && productModelCode && productModelCode.startsWith(queryModelCode)) return 96;
  if (queryModelCode.length >= 5 && model && model.startsWith(queryModelCode)) return 94;
  if (model && model === compactQuery) return 100;
  if (model && compactQuery.includes(model)) return 95;
  if (model && model.includes(compactQuery)) return 90;
  if (brandModel && brandModel.includes(normalizedQuery)) return 84;
  if (displayName && displayName.includes(normalizedQuery)) return 78;
  if (label && label.includes(normalizedQuery)) return 70;
  return 0;
}

export function findReplacementSource(query, products, { category, retailerOnly = false } = {}) {
  const rows = Array.isArray(products) ? products : [];
  const wantedCategory = String(category ?? '').trim();
  const candidates = rows
    .filter((product) => !wantedCategory || product?.cat === wantedCategory)
    .filter((product) => !retailerOnly || hasVerifiedRetailerLink(product))
    .map((product) => ({
      product,
      score: scoreProduct(query, product)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return productLabel(left.product).localeCompare(productLabel(right.product), 'en-AU', { sensitivity: 'base' });
    });

  if (candidates.length === 0) return null;
  const best = candidates[0];
  return {
    product: best.product,
    confidence: best.score >= 90 ? 'high' : best.score >= 75 ? 'medium' : 'low',
    label: productLabel(best.product)
  };
}

export function getReplacementSuggestionRows(products, { category, limit = 160, retailerOnly = true } = {}) {
  const rows = Array.isArray(products) ? products : [];
  const wantedCategory = String(category ?? '').trim();
  return rows
    .filter((product) => !wantedCategory || product?.cat === wantedCategory)
    .filter((product) => product?.model || product?.displayName)
    .filter((product) => !retailerOnly || hasVerifiedRetailerLink(product))
    .filter(hasCompleteDimensions)
    .sort((left, right) => {
      const retailerDelta = verifiedRetailerLinkCount(right) - verifiedRetailerLinkCount(left);
      if (retailerDelta !== 0) return retailerDelta;
      const scoreDelta = Number(right?.priorityScore ?? 0) - Number(left?.priorityScore ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      return productLabel(left).localeCompare(productLabel(right), 'en-AU', { sensitivity: 'base' });
    })
    .slice(0, Number.isFinite(Number(limit)) ? Math.max(0, Number(limit)) : 160);
}

export function buildReplacementDimensionState(product = {}) {
  const w = Number(product.w);
  const h = Number(product.h);
  const d = Number(product.d);
  if (![w, h, d].every((value) => Number.isFinite(value) && value > 0)) {
    return {
      dimensions: { w: null, h: null, d: null },
      label: productLabel(product),
      note: 'We found the old model, but it is missing complete dimensions. Please measure the cavity directly.'
    };
  }
  const label = productLabel(product);
  const productDimensions = { w: Math.round(w), h: Math.round(h), d: Math.round(d) };
  const dimensions = {
    w: productDimensions.w + PRACTICAL_REPLACEMENT_BUFFER.width,
    h: productDimensions.h + PRACTICAL_REPLACEMENT_BUFFER.height,
    d: productDimensions.d + PRACTICAL_REPLACEMENT_BUFFER.depth
  };
  return {
    productDimensions,
    dimensions,
    label,
    note: `${label} dimensions plus practical clearance are a starting point. Measure the actual cavity before buying.`
  };
}
