'use strict';

const { normalizeBrandName } = require('./brand-name.js');

const CATEGORY_LABELS = {
  fridge: 'Fridge',
  dishwasher: 'Dishwasher',
  washing_machine: 'Washing Machine',
  dryer: 'Dryer'
};

function slugifyBrandKey(brand) {
  return normalizeBrandName(brand)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeConfigLabel(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\bMount\b/i, 'Mount')
    .split(' ')
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === 'and') return 'and';
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ')
    .replace(/\s+/g, '-');
}

function getModelToken(model) {
  return String(model ?? '').trim().split(/\s+/)[0] ?? '';
}

function inferSeriesFromModel(product, dictionary = {}) {
  const brandKey = slugifyBrandKey(product?.brand);
  const brandDictionary = dictionary?.[brandKey];
  if (!brandDictionary || typeof brandDictionary !== 'object') return null;

  const token = getModelToken(product?.model).toUpperCase().replace(/\s+/g, '');
  if (!token) return null;

  const prefixes = Object.keys(brandDictionary).sort((left, right) => right.length - left.length);
  for (const prefix of prefixes) {
    const normalizedPrefix = String(prefix).toUpperCase().replace(/\s+/g, '');
    if (token.startsWith(normalizedPrefix)) {
      return brandDictionary[prefix];
    }
  }

  return null;
}

function extractCapacityLitres(model) {
  const match = String(model ?? '').match(/(\d{2,4})\s*L\b/i);
  return match ? `${match[1]}L` : null;
}

function extractCapacityKg(model) {
  const match = String(model ?? '').match(/(\d+(?:\.\d+)?)\s*kg\b/i);
  return match ? `${match[1]}kg` : null;
}

function inferFridgeConfiguration(product) {
  const feature = product?.features?.[0];
  if (typeof feature === 'string' && feature.trim()) return normalizeConfigLabel(feature);
  const model = String(product?.model ?? '');
  if (/French Door/i.test(model)) return 'French-Door';
  if (/Top Mount/i.test(model)) return 'Top-Mount';
  if (/Bottom Mount/i.test(model)) return 'Bottom-Mount';
  if (/Side by Side/i.test(model)) return 'Side-by-Side';
  return 'Fridge';
}

function inferDishwasherType(product) {
  const feature = String(product?.features?.[0] ?? '').trim();
  if (/built.?in/i.test(feature)) return 'Built-in';
  if (/drawer/i.test(feature)) return 'Drawer';
  if (/freestanding/i.test(feature)) return 'Freestanding';
  return 'Built-in';
}

function inferWasherLoadType(product) {
  if (product?.top_loader === true) return 'Top Loader';
  const features = Array.isArray(product?.features) ? product.features.join(' ') : '';
  const model = String(product?.model ?? '');
  if (/front/i.test(features) || /front loader/i.test(model)) return 'Front Loader';
  if (/top/i.test(features) || /top loader/i.test(model)) return 'Top Loader';
  return 'Front Loader';
}

function inferDryerTechnology(product) {
  const features = Array.isArray(product?.features) ? product.features.join(' ') : '';
  const model = String(product?.model ?? '');
  if (/heat pump/i.test(features) || /heat pump/i.test(model)) return 'Heat Pump';
  if (/condenser/i.test(features) || /condenser/i.test(model)) return 'Condenser';
  if (/vented/i.test(features) || /vented/i.test(model)) return 'Vented';
  return 'Dryer';
}

function buildReadableSpec(product) {
  const category = String(product?.cat ?? '');

  if (category === 'fridge') {
    const capacity = extractCapacityLitres(product?.model);
    const configuration = inferFridgeConfiguration(product);
    if (capacity) return `${capacity} ${configuration}`;
    return configuration.replace(/-/g, ' ');
  }

  if (category === 'dishwasher') {
    const placeMatch = String(product?.model ?? '').match(/(\d{1,2})\s*Place\b/i);
    const type = inferDishwasherType(product);
    if (placeMatch) return `${placeMatch[1]}-place ${type}`;
    return `${type} Dishwasher`;
  }

  if (category === 'washing_machine') {
    const capacity = extractCapacityKg(product?.model);
    const loadType = inferWasherLoadType(product);
    if (capacity) return `${capacity} ${loadType}`;
    return loadType;
  }

  if (category === 'dryer') {
    const capacity = extractCapacityKg(product?.model);
    const technology = inferDryerTechnology(product);
    if (capacity) return `${capacity} ${technology}`;
    return technology;
  }

  return CATEGORY_LABELS[category] ?? 'Appliance';
}

function buildDisplayName(product, dictionary = {}) {
  const brand = normalizeBrandName(product?.brand);
  const series = inferSeriesFromModel(product, dictionary);
  if (series) return `${brand} ${series}`.trim();
  const categoryLabel = CATEGORY_LABELS[String(product?.cat ?? '')] ?? 'Appliance';
  return `${brand} ${categoryLabel}`.trim();
}

function enrichReadableCopy(product, { seriesDictionary = {} } = {}) {
  const series = inferSeriesFromModel(product, seriesDictionary);
  return {
    ...product,
    series,
    displayName: buildDisplayName(product, seriesDictionary),
    readableSpec: buildReadableSpec(product)
  };
}

module.exports = {
  CATEGORY_LABELS,
  buildDisplayName,
  buildReadableSpec,
  enrichReadableCopy,
  inferSeriesFromModel,
  normalizeConfigLabel,
  slugifyBrandKey
};
