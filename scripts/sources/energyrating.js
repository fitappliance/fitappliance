'use strict';

const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { fetchWithRetry } = require('../utils/fetch-utils.js');
const { writeJsonAtomically } = require('../utils/file-utils.js');
const { normalizeKey, toInteger, toNumber } = require('../utils/parse-utils.js');
const { validateProduct } = require('../schema.js');

const DEFAULT_METADATA_URL =
  'https://data.gov.au/data/api/3/action/package_show?id=energy-rating-for-household-appliances';
const DEFAULT_LOOKBACK_YEARS = 3;

const ENERGY_RESOURCE_CATEGORIES = [
  {
    category: 'fridge',
    emoji: '🧊',
    matcher: /fridges?\s+and\s+freezers?|\/rf_/i
  },
  {
    category: 'washing_machine',
    emoji: '🫧',
    matcher: /clothes\s+washers?|\/cw_/i
  },
  {
    category: 'dryer',
    emoji: '🌀',
    matcher: /clothes\s+dryers?|\/cd_/i
  },
  {
    category: 'dishwasher',
    emoji: '🍽️',
    matcher: /dishwashers?|\/dw_/i
  }
];

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map(value => value.trim());
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  const rows = [];

  for (let index = 1; index < lines.length; index += 1) {
    const fields = parseCsvLine(lines[index]);
    const row = {};

    headers.forEach((header, headerIndex) => {
      row[header] = fields[headerIndex] ?? '';
    });

    rows.push(row);
  }

  return rows;
}

function pickFirstDefined(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key];
    }
  }
  return null;
}

function mapStars(rawValue) {
  const parsed = toNumber(rawValue);
  if (parsed === null) {
    return null;
  }

  const mapped = Math.round(parsed);
  if (mapped < 1 || mapped > 6) {
    return null;
  }

  return mapped;
}

function pickFirstNumeric(row, keys) {
  for (const key of keys) {
    const parsed = toNumber(row[key]);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function mapEnergyRow(row, context = {}) {
  const mapped = {
    brand: pickFirstDefined(row, ['Brand', 'Brand Name', 'brand']),
    model: pickFirstDefined(row, ['Model Name', 'Model No', 'Model', 'model']),
    w: toInteger(pickFirstDefined(row, ['Width', 'width', 'Width (mm)'])),
    h: toInteger(pickFirstDefined(row, ['Height', 'height', 'Height (mm)'])),
    d: toInteger(pickFirstDefined(row, ['Depth', 'depth', 'Depth (mm)'])),
    kwh_year: toInteger(
      pickFirstDefined(row, [
        'Labelled energy consumption (kWh/year)',
        'Annual Energy Consumption',
        'Annual Energy Consumption (kWh/year)',
        'kwh_year'
      ])
    ),
    stars: mapStars(
      pickFirstNumeric(row, ['New Star', 'Star2009', 'Star Rating', 'stars', 'StarRating', 'Star Rating (old)'])
    ),
    door_swing_mm: toNumber(pickFirstDefined(row, ['door_swing_mm', 'Door Swing', 'Door Swing (mm)'])) ?? null
  };

  if (context.category) {
    mapped.cat = context.category;
  }

  if (context.emoji) {
    mapped.emoji = context.emoji;
  }

  return mapped;
}

function mergeEnergyIntoProduct(baseProduct, mappedRow, fallbackFeatures = []) {
  const hasExistingFeatures = Array.isArray(baseProduct.features) && baseProduct.features.length > 0;

  return {
    ...baseProduct,
    w: mappedRow.w ?? baseProduct.w,
    h: mappedRow.h ?? baseProduct.h,
    d: mappedRow.d ?? baseProduct.d,
    kwh_year: mappedRow.kwh_year ?? baseProduct.kwh_year,
    stars: mappedRow.stars ?? baseProduct.stars,
    door_swing_mm: mappedRow.door_swing_mm ?? baseProduct.door_swing_mm,
    features: hasExistingFeatures ? baseProduct.features : fallbackFeatures,
    unavailable: typeof baseProduct.unavailable === 'boolean' ? baseProduct.unavailable : baseProduct.price === null
  };
}

function resolveCategoryResources(metadataDocument, categories = ENERGY_RESOURCE_CATEGORIES) {
  const resources = metadataDocument?.result?.resources;
  if (!Array.isArray(resources)) {
    throw new Error('Energy Rating metadata is missing result.resources');
  }

  const csvResources = resources.filter(
    resource => /csv/i.test(resource.format ?? '') || /\.csv(\?|$)/i.test(resource.url ?? '')
  );
  const selectedResources = [];

  for (const category of categories) {
    const matchedResource = csvResources.find(resource => {
      const resourceText = `${resource.name ?? ''} ${resource.url ?? ''}`;
      return category.matcher.test(resourceText);
    });

    if (!matchedResource) {
      continue;
    }

    selectedResources.push({
      category: category.category,
      emoji: category.emoji,
      name: matchedResource.name ?? category.category,
      url: matchedResource.url
    });
  }

  if (selectedResources.length > 0) {
    return selectedResources;
  }

  const fallbackResource =
    csvResources[0] ??
    resources.find(resource => /csv/i.test(resource.format ?? '') || /\.csv(\?|$)/i.test(resource.url ?? ''));

  if (!fallbackResource?.url) {
    throw new Error('Energy Rating metadata does not include a CSV resource URL');
  }

  return [
    {
      category: 'fridge',
      emoji: '🧊',
      name: fallbackResource.name ?? 'Fallback CSV',
      url: fallbackResource.url
    }
  ];
}

function parseDateOrNull(rawValue) {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return null;
  }

  const parsed = new Date(rawValue.trim());
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function isLikelyNonsense(value) {
  if (typeof value !== 'string') {
    return true;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return true;
  }

  return trimmed === '-' || trimmed.toLowerCase() === 'n/a';
}

function buildFeatures(row, category) {
  const rawFeatures = [
    pickFirstDefined(row, ['Configuration', 'Configuration1', 'Type']),
    pickFirstDefined(row, ['Type', 'Designation']),
    pickFirstDefined(row, ['Loading', 'MachineAction', 'Control']),
    pickFirstDefined(row, ['Product Class'])
  ];
  const uniqueFeatures = [];

  for (const rawFeature of rawFeatures) {
    if (isLikelyNonsense(rawFeature)) {
      continue;
    }

    if (!uniqueFeatures.includes(rawFeature.trim())) {
      uniqueFeatures.push(rawFeature.trim());
    }
  }

  if (uniqueFeatures.length === 0) {
    uniqueFeatures.push(category === 'fridge' ? 'Fridge/Freezer' : 'Energy Rated');
  }

  return uniqueFeatures;
}

function buildEnergyProduct(row, context = {}) {
  const mapped = mapEnergyRow(row, context);

  if (!mapped.brand || !mapped.model) {
    return null;
  }

  const registration =
    pickFirstDefined(row, ['Registration Number', 'Submit_ID', 'Record ID']) ?? `${mapped.brand}-${mapped.model}`;
  const id = `${context.category ?? 'fridge'}-${normalizeKey(registration)}`;

  return {
    id,
    cat: context.category ?? 'fridge',
    brand: mapped.brand,
    model: mapped.model,
    w: mapped.w,
    h: mapped.h,
    d: mapped.d,
    kwh_year: mapped.kwh_year,
    stars: mapped.stars,
    price: null,
    emoji: context.emoji ?? '🧊',
    door_swing_mm: mapped.door_swing_mm ?? null,
    features: buildFeatures(row, context.category ?? 'fridge'),
    retailers: [],
    sponsored: false,
    unavailable: true
  };
}

function isActiveRecord(row, cutoffDate) {
  const availabilityStatus = pickFirstDefined(row, ['Availability Status', 'Availability']);
  if (availabilityStatus && !/available|active/i.test(availabilityStatus)) {
    return false;
  }

  const submitStatus = pickFirstDefined(row, ['SubmitStatus', 'Submit Status']);
  if (submitStatus && !/approved/i.test(submitStatus)) {
    return false;
  }

  if (!cutoffDate) {
    return true;
  }

  const trackedDates = ['ExpDate', 'GrandDate', 'Registration Date', 'Date Registered'];
  const parsedDates = trackedDates
    .map(key => parseDateOrNull(row[key]))
    .filter(date => date !== null);

  if (parsedDates.length === 0) {
    return true;
  }

  return parsedDates.some(date => date >= cutoffDate);
}

async function fetchEnergyDatasets({
  metadataUrl = DEFAULT_METADATA_URL,
  categories = ENERGY_RESOURCE_CATEGORIES,
  fetchWithRetryFn = fetchWithRetry
}) {
  const metadataResponse = await fetchWithRetryFn(metadataUrl, {}, 3);
  if (metadataResponse.status >= 400) {
    throw new Error(`Energy Rating metadata fetch failed with HTTP ${metadataResponse.status}`);
  }

  const metadataDocument = await metadataResponse.json();
  const resources = resolveCategoryResources(metadataDocument, categories);
  const datasets = [];

  for (const resource of resources) {
    const csvResponse = await fetchWithRetryFn(resource.url, {}, 3);
    if (csvResponse.status >= 400) {
      throw new Error(`Energy Rating CSV fetch failed with HTTP ${csvResponse.status} (${resource.name})`);
    }

    const csvText = await csvResponse.text();
    datasets.push({
      ...resource,
      rows: parseCsv(csvText)
    });
  }

  return datasets;
}

async function syncEnergyRatingData({
  dataDir,
  metadataUrl = DEFAULT_METADATA_URL,
  today = new Date().toISOString().slice(0, 10),
  lookbackYears = DEFAULT_LOOKBACK_YEARS,
  categories = ENERGY_RESOURCE_CATEGORIES,
  fetchWithRetryFn = fetchWithRetry,
  logger = console,
  write = true
}) {
  const appliancesPath = path.join(dataDir, 'appliances.json');
  const baseDocument = JSON.parse(await readFile(appliancesPath, 'utf8'));
  const productsById = new Map(baseDocument.products.map(product => [product.id, { ...product }]));
  const indexByBrandModel = new Map(
    baseDocument.products.map(product => [normalizeKey(`${product.brand}${product.model}`), product.id])
  );

  const cutoffDate = new Date(today);
  cutoffDate.setFullYear(cutoffDate.getFullYear() - lookbackYears);
  const datasets = await fetchEnergyDatasets({
    metadataUrl,
    categories,
    fetchWithRetryFn
  });

  let updatedCount = 0;
  let insertedCount = 0;
  let discardedCount = 0;
  let skippedInactiveCount = 0;
  let totalRows = 0;

  for (const dataset of datasets) {
    for (const row of dataset.rows) {
      totalRows += 1;

      if (!isActiveRecord(row, cutoffDate)) {
        skippedInactiveCount += 1;
        continue;
      }

      const energyProduct = buildEnergyProduct(row, {
        category: dataset.category,
        emoji: dataset.emoji
      });

      if (!energyProduct) {
        discardedCount += 1;
        continue;
      }

      const key = normalizeKey(`${energyProduct.brand}${energyProduct.model}`);
      const matchedId = productsById.has(energyProduct.id)
        ? energyProduct.id
        : indexByBrandModel.get(key);
      const targetId = matchedId ?? energyProduct.id;
      const baseProduct = matchedId ? productsById.get(matchedId) : null;
      const mergedProduct = baseProduct
        ? mergeEnergyIntoProduct(baseProduct, energyProduct, energyProduct.features)
        : energyProduct;
      const errors = validateProduct(mergedProduct);

      if (errors.length > 0) {
        discardedCount += 1;
        logger.warn(
          `[energy-rating] Discarded row for ${energyProduct.brand} ${energyProduct.model} ` +
            `(mapped=${JSON.stringify({
              w: energyProduct.w,
              h: energyProduct.h,
              d: energyProduct.d,
              kwh_year: energyProduct.kwh_year,
              stars: energyProduct.stars,
              door_swing_mm: energyProduct.door_swing_mm
            })}): ${errors.join('; ')}`
        );
        continue;
      }

      if (baseProduct) {
        updatedCount += 1;
      } else {
        insertedCount += 1;
      }

      productsById.set(targetId, mergedProduct);
      indexByBrandModel.set(key, targetId);
    }
  }

  const updatedDocument = {
    ...baseDocument,
    last_updated: today,
    products: Array.from(productsById.values()).sort((left, right) => {
      const catCompare = left.cat.localeCompare(right.cat);
      if (catCompare !== 0) {
        return catCompare;
      }

      const brandCompare = left.brand.localeCompare(right.brand);
      if (brandCompare !== 0) {
        return brandCompare;
      }

      return left.model.localeCompare(right.model);
    })
  };

  if (write) {
    await writeJsonAtomically(appliancesPath, updatedDocument);
  }

  return {
    updatedCount,
    insertedCount,
    discardedCount,
    skippedInactiveCount,
    totalRows
  };
}

module.exports = {
  DEFAULT_LOOKBACK_YEARS,
  DEFAULT_METADATA_URL,
  ENERGY_RESOURCE_CATEGORIES,
  buildEnergyProduct,
  fetchEnergyDatasets,
  isActiveRecord,
  mapEnergyRow,
  parseCsv,
  resolveCategoryResources,
  syncEnergyRatingData
};
