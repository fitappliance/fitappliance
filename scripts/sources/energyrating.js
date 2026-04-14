'use strict';

const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { fetchWithRetry } = require('../utils/fetch-utils.js');
const { writeJsonAtomically } = require('../utils/file-utils.js');
const { normalizeKey, toInteger, toNumber } = require('../utils/parse-utils.js');
const { validateProduct } = require('../schema.js');

const DEFAULT_METADATA_URL =
  'https://data.gov.au/data/api/3/action/package_show?id=energy-rating-for-household-appliances';

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

function mapEnergyRow(row) {
  return {
    brand: pickFirstDefined(row, ['Brand', 'Brand Name', 'brand']),
    model: pickFirstDefined(row, ['Model Name', 'Model', 'model']),
    w: toInteger(pickFirstDefined(row, ['Width', 'width', 'Width (mm)'])),
    h: toInteger(pickFirstDefined(row, ['Height', 'height', 'Height (mm)'])),
    d: toInteger(pickFirstDefined(row, ['Depth', 'depth', 'Depth (mm)'])),
    kwh_year: toInteger(
      pickFirstDefined(row, [
        'Annual Energy Consumption',
        'Annual Energy Consumption (kWh/year)',
        'kwh_year'
      ])
    ),
    stars: mapStars(pickFirstDefined(row, ['Star Rating', 'stars', 'StarRating'])),
    door_swing_mm: toNumber(pickFirstDefined(row, ['door_swing_mm', 'Door Swing', 'Door Swing (mm)'])) ?? null
  };
}

function mergeEnergyIntoProduct(baseProduct, mappedRow) {
  return {
    ...baseProduct,
    w: mappedRow.w ?? baseProduct.w,
    h: mappedRow.h ?? baseProduct.h,
    d: mappedRow.d ?? baseProduct.d,
    kwh_year: mappedRow.kwh_year ?? baseProduct.kwh_year,
    stars: mappedRow.stars ?? baseProduct.stars,
    door_swing_mm: mappedRow.door_swing_mm ?? baseProduct.door_swing_mm
  };
}

function resolveCsvUrl(metadataDocument) {
  const resources = metadataDocument?.result?.resources;
  if (!Array.isArray(resources)) {
    throw new Error('Energy Rating metadata is missing result.resources');
  }

  const csvResource =
    resources.find(resource => /csv/i.test(resource.format ?? '')) ??
    resources.find(resource => /\.csv(\?|$)/i.test(resource.url ?? ''));

  if (!csvResource?.url) {
    throw new Error('Energy Rating metadata does not include a CSV resource URL');
  }

  return csvResource.url;
}

async function syncEnergyRatingData({
  dataDir,
  metadataUrl = DEFAULT_METADATA_URL,
  today = new Date().toISOString().slice(0, 10),
  fetchWithRetryFn = fetchWithRetry,
  logger = console
}) {
  const appliancesPath = path.join(dataDir, 'appliances.json');
  const baseDocument = JSON.parse(await readFile(appliancesPath, 'utf8'));
  const productsById = new Map(baseDocument.products.map(product => [product.id, product]));
  const indexByBrandModel = new Map(
    baseDocument.products.map(product => [normalizeKey(`${product.brand}${product.model}`), product.id])
  );

  const metadataResponse = await fetchWithRetryFn(metadataUrl, {}, 3);
  if (metadataResponse.status >= 400) {
    throw new Error(`Energy Rating metadata fetch failed with HTTP ${metadataResponse.status}`);
  }

  const metadataDocument = await metadataResponse.json();
  const csvUrl = resolveCsvUrl(metadataDocument);

  const csvResponse = await fetchWithRetryFn(csvUrl, {}, 3);
  if (csvResponse.status >= 400) {
    throw new Error(`Energy Rating CSV fetch failed with HTTP ${csvResponse.status}`);
  }

  const csvText = await csvResponse.text();
  const rows = parseCsv(csvText);

  let updatedCount = 0;
  let discardedCount = 0;
  let unmatchedCount = 0;

  for (const row of rows) {
    const mappedRow = mapEnergyRow(row);
    const key = normalizeKey(`${mappedRow.brand ?? ''}${mappedRow.model ?? ''}`);
    const matchedId = indexByBrandModel.get(key);

    if (!matchedId) {
      unmatchedCount += 1;
      continue;
    }

    const baseProduct = productsById.get(matchedId);
    const mergedProduct = mergeEnergyIntoProduct(baseProduct, mappedRow);
    const errors = validateProduct(mergedProduct);

    if (errors.length > 0) {
      discardedCount += 1;
      logger.warn(
        `[energy-rating] Discarded row for ${baseProduct.brand} ${baseProduct.model} ` +
          `(mapped=${JSON.stringify(mappedRow)}): ${errors.join('; ')}`
      );
      continue;
    }

    productsById.set(matchedId, mergedProduct);
    updatedCount += 1;
  }

  const updatedDocument = {
    ...baseDocument,
    last_updated: today,
    products: baseDocument.products.map(product => productsById.get(product.id) ?? product)
  };

  await writeJsonAtomically(appliancesPath, updatedDocument);

  return {
    updatedCount,
    discardedCount,
    unmatchedCount,
    totalRows: rows.length
  };
}

module.exports = {
  DEFAULT_METADATA_URL,
  mapEnergyRow,
  parseCsv,
  syncEnergyRatingData
};
