const { extractText } = require('../2-extract-text');

const CATEGORY_MAP = {
  fridge: 'FRIDGE',
  refrigerator: 'FRIDGE',
  dishwasher: 'DISHWASHER',
  dryer: 'DRYER',
  washing_machine: 'WASHING_MACHINE',
  washer: 'WASHING_MACHINE'
};

function normalizeCategory(category) {
  const key = String(category || '').trim().toLowerCase();
  return CATEGORY_MAP[key] || category;
}

function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function parseNumber(value, label) {
  const match = String(value || '').match(/\d+(?:\.\d+)?/);
  if (!match) throw new Error(`Unable to parse Euromaid ${label} from "${value}"`);
  return Math.round(Number(match[0]));
}

function parseRangeMax(value, label) {
  const values = [...String(value || '').matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  if (values.length === 0) throw new Error(`Unable to parse Euromaid ${label} from "${value}"`);
  return Math.round(Math.max(...values));
}

function getTargetSku(options = {}) {
  const target = options.target || {};
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function getTargetCategory(options = {}) {
  const target = options.target || {};
  return normalizeCategory(target.category || target.cat || target.product?.cat);
}

function assertEuromaidDocument(text, sku, sourceUrl = '') {
  const target = normalizeSku(sku);
  if (!target || target.length < 3) throw new Error('Euromaid parser requires a SKU/model target.');
  const normalizedText = normalizeSku(text);
  const normalizedUrl = normalizeSku(sourceUrl);
  if (normalizedText.includes(target) || normalizedUrl.includes(target)) return;
  throw new Error(`Euromaid parser could not verify SKU ${sku} against document text or official source URL.`);
}

function parseDimensionTriplet(value, order) {
  const parts = String(value || '').split(/\s*x\s*/i);
  if (parts.length !== 3) throw new Error(`Euromaid parser expected a three-part dimension row, got "${value}"`);
  const parsed = {
    [order[0]]: parseRangeMax(parts[0], order[0]),
    [order[1]]: parseRangeMax(parts[1], order[1]),
    [order[2]]: parseRangeMax(parts[2], order[2])
  };
  return parsed;
}

function splitSideClearance(totalSide) {
  if (totalSide < 0) throw new Error('Euromaid clearance row is smaller than product width.');
  return {
    left_mm: Math.floor(totalSide / 2),
    right_mm: Math.ceil(totalSide / 2)
  };
}

function extractFridgeFromSpec(text) {
  const source = normalizeWhitespace(text).replace(/×/g, 'x');
  const block = source.match(/DIMENSIONS\s*\(\s*H\s*x\s*W\s*x\s*D\s*\)[\s\S]{0,700}?Product\s*\(mm\)\s*([0-9.\s-]+x[0-9.\s-]+x[0-9.\s-]+)[\s\S]{0,260}?Min\s+Clearance\*?\s*\(mm\)\s*([0-9.\s-]+x[0-9.\s-]+x[0-9.\s-]+)/i);
  if (!block) {
    throw new Error('Euromaid fridge parser requires explicit Product and Min Clearance dimensions.');
  }
  const product = parseDimensionTriplet(block[1], ['height', 'width', 'depth']);
  const clearanceBox = parseDimensionTriplet(block[2], ['height', 'width', 'depth']);
  if (clearanceBox.height < product.height || clearanceBox.width < product.width || clearanceBox.depth < product.depth) {
    throw new Error('Euromaid fridge Min Clearance is smaller than product dimensions.');
  }
  const side = splitSideClearance(clearanceBox.width - product.width);
  return {
    dimensions: {
      height_mm: product.height,
      width_mm: product.width,
      depth_mm: product.depth,
      door_open_90_depth_mm: null
    },
    clearance: {
      top_mm: clearanceBox.height - product.height,
      ...side,
      rear_mm: clearanceBox.depth - product.depth
    }
  };
}

function extractDishwasherFromSpec(text) {
  const source = normalizeWhitespace(text).replace(/×/g, 'x');
  const block = source.match(/(?:WEIGHTS\s*&\s*)?DIMENSIONS\s*\(\s*W\s*x\s*H\s*x\s*D\s*\)[\s\S]{0,800}?Product(?:\s+un-?boxed)?\s*\(mm\)\s*([0-9.\s-]+x[0-9.\s-]+x[0-9.\s-]+)[\s\S]{0,320}?Cut-?Out\s*\(mm\)\s*([0-9.\s-]+x[0-9.\s-]+x[0-9.\s-]+)/i);
  if (!block) {
    throw new Error('Euromaid dishwasher parser requires explicit Product and Cut-Out dimensions.');
  }
  const product = parseDimensionTriplet(block[1], ['width', 'height', 'depth']);
  const cutout = parseDimensionTriplet(block[2], ['width', 'height', 'depth']);
  if (cutout.width < product.width || cutout.height < product.height || cutout.depth < product.depth) {
    throw new Error('Euromaid dishwasher Cut-Out is smaller than product dimensions.');
  }
  const side = splitSideClearance(cutout.width - product.width);
  const doorOpen = [...source.matchAll(/\b(1[01]\d{2})\s*mm\s*\(with\s+the\s+door\s+opened\s+90/gi)]
    .map((match) => parseNumber(match[1], 'door-open depth'))
    .sort((a, b) => b - a)[0] || null;
  return {
    dimensions: {
      height_mm: product.height,
      width_mm: product.width,
      depth_mm: product.depth,
      door_open_90_depth_mm: doorOpen
    },
    clearance: {
      top_mm: cutout.height - product.height,
      ...side,
      rear_mm: cutout.depth - product.depth
    }
  };
}

function parseEuromaidText(text, options = {}) {
  const sku = getTargetSku(options);
  const category = getTargetCategory(options);
  const sourceUrl = options.sourceUrl || options.target?.source_url;
  if (!sku) throw new Error('Euromaid parser requires a SKU/model target.');
  if (!sourceUrl) throw new Error('Euromaid parser requires sourceUrl metadata.');
  if (!category) throw new Error('Euromaid parser requires category metadata.');

  assertEuromaidDocument(text, sku, sourceUrl);

  let parsed;
  if (category === 'FRIDGE') {
    parsed = extractFridgeFromSpec(text);
  } else if (category === 'DISHWASHER') {
    parsed = extractDishwasherFromSpec(text);
  } else {
    throw new Error(`Euromaid ${category} parser requires explicit full clearance data before ingest.`);
  }

  const extractionDate = options.extractionDate || new Date().toISOString();
  return {
    data: {
      brand: options.target?.brand || options.target?.product?.brand || 'Euromaid',
      sku,
      category,
      dimensions: parsed.dimensions,
      clearance_requirements: parsed.clearance,
      flags: {
        requires_plumbing: category === 'DISHWASHER',
        ventilation_required: category === 'FRIDGE',
        reversible_door: null
      },
      metadata: {
        source_pdf_url: sourceUrl,
        extraction_date: extractionDate,
        confidence_score: 0.9
      }
    },
    warnings: []
  };
}

async function parseEuromaidPdf(pdfPath, options = {}) {
  const { text } = await extractText(pdfPath);
  return parseEuromaidText(text, options);
}

exports.extractDishwasherFromSpec = extractDishwasherFromSpec;
exports.extractFridgeFromSpec = extractFridgeFromSpec;
exports.normalizeSku = normalizeSku;
exports.parseEuromaidPdf = parseEuromaidPdf;
exports.parseEuromaidText = parseEuromaidText;
