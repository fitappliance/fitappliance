function normalizeToken(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function productLabel(product = {}) {
  const brand = String(product.brand ?? '').trim();
  const model = String(product.model ?? '').trim();
  const displayName = String(product.displayName ?? '').trim();
  if (displayName) return displayName;
  return [brand, model].filter(Boolean).join(' ');
}

function scoreProduct(query, product) {
  const normalizedQuery = normalizeText(query);
  const compactQuery = normalizeToken(query);
  if (!normalizedQuery || compactQuery.length < 3) return 0;

  const model = normalizeToken(product?.model);
  const displayName = normalizeText(product?.displayName);
  const label = normalizeText(productLabel(product));
  const brandModel = normalizeText(`${product?.brand ?? ''} ${product?.model ?? ''}`);

  if (model && model === compactQuery) return 100;
  if (model && compactQuery.includes(model)) return 95;
  if (model && model.includes(compactQuery)) return 90;
  if (brandModel && brandModel.includes(normalizedQuery)) return 84;
  if (displayName && displayName.includes(normalizedQuery)) return 78;
  if (label && label.includes(normalizedQuery)) return 70;
  return 0;
}

export function findReplacementSource(query, products, { category } = {}) {
  const rows = Array.isArray(products) ? products : [];
  const wantedCategory = String(category ?? '').trim();
  const candidates = rows
    .filter((product) => !wantedCategory || product?.cat === wantedCategory)
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
  return {
    dimensions: { w: Math.round(w), h: Math.round(h), d: Math.round(d) },
    label,
    note: `${label} dimensions are a starting point. Measure the actual cavity before buying.`
  };
}

