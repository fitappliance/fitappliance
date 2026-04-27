'use strict';

const { canonicalizeBrand } = require('../../brand-canon.js');

function normalizeModelForMatch(value) {
  return String(value ?? '')
    .toUpperCase()
    .normalize('NFKD')
    .replace(/[^A-Z0-9]+/g, '');
}

function normalizeBrandForMatch(value) {
  return canonicalizeBrand(value).toLowerCase();
}

function levenshtein(a, b) {
  const left = String(a ?? '');
  const right = String(b ?? '');
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    let last = i - 1;
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const old = previous[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, last + cost);
      last = old;
    }
  }

  return previous[right.length];
}

function scoreModel(scrapedModel, catalogModel) {
  const scraped = normalizeModelForMatch(scrapedModel);
  const catalog = normalizeModelForMatch(catalogModel);
  if (!scraped || !catalog) return 0;
  if (scraped === catalog) return 1;
  if ((catalog.startsWith(scraped) || scraped.startsWith(catalog)) && Math.abs(catalog.length - scraped.length) <= 3) {
    return 0.9;
  }

  const distance = levenshtein(scraped, catalog);
  if (distance <= 2) return 0.85;
  return 0;
}

function matchProductToCatalog(scraped, catalog, opts = {}) {
  const minConfidence = opts.minConfidence ?? 0.85;
  if (!scraped || !Array.isArray(catalog)) return null;

  const scrapedBrand = normalizeBrandForMatch(scraped.brand);
  if (!scrapedBrand) return null;

  let best = null;
  for (const product of catalog) {
    if (normalizeBrandForMatch(product?.brand) !== scrapedBrand) continue;

    const confidence = scoreModel(scraped.model, product?.model ?? product?.sku ?? product?.id);
    if (confidence < minConfidence) continue;
    if (!best || confidence > best.confidence) {
      best = {
        matched: true,
        catalogId: product.id ?? product.slug ?? product.model,
        confidence,
        scraped,
        catalogProduct: product,
      };
    }
  }

  return best;
}

module.exports = {
  matchProductToCatalog,
  normalizeModelForMatch,
};

