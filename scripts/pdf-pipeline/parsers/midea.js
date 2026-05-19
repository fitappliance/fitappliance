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

function parseMm(value, label) {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Unable to parse Midea ${label} from "${value}"`);
  return Math.round(Number(match[1]));
}

function getTargetSku(options = {}) {
  const target = options.target || {};
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function getTargetCategory(options = {}) {
  const target = options.target || {};
  return normalizeCategory(target.category || target.cat || target.product?.cat);
}

function assertMideaDocument(text, sku, sourceUrl = '') {
  const target = normalizeSku(sku);
  if (!target || target.length < 4) throw new Error('Midea parser requires a SKU/model target.');
  const normalizedText = normalizeSku(text);
  const normalizedUrl = normalizeSku(sourceUrl);
  if (normalizedText.includes(target) || normalizedUrl.includes(target)) return;
  throw new Error(`Midea parser could not verify SKU ${sku} against document text or official source URL.`);
}

function extractDishwasherDimensions(text) {
  const source = normalizeWhitespace(text);
  const match = source.match(/Product\s+Dimensions\s+W\s*x\s*D\s*x\s*H\s+(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*mm/i);
  if (!match) {
    throw new Error('Midea dishwasher parser requires explicit Product Dimensions W x D x H.');
  }

  const doorOpenMatches = [...source.matchAll(/\b(\d{4})\s*mm\b/g)]
    .map((candidate) => Number(candidate[1]))
    .filter((value) => value >= 900 && value <= 1400);
  const doorOpen = doorOpenMatches.length ? Math.max(...doorOpenMatches) : null;

  return {
    width_mm: parseMm(match[1], 'width'),
    depth_mm: parseMm(match[2], 'depth'),
    height_mm: parseMm(match[3], 'height'),
    door_open_90_depth_mm: doorOpen
  };
}

function extractDishwasherOpening(text, dimensions) {
  const source = normalizeWhitespace(text);
  const openingWindowMatch = source.match(/Selecting\s+the\s+best\s+location\s+for\s+the\s+dishwasher[\s\S]{0,1800}?600\s*mm\s*\(\s*for\s+60cm\s+model\s*\)/i);
  if (!openingWindowMatch) {
    throw new Error('Midea dishwasher parser requires explicit cabinet opening dimensions.');
  }
  const window = openingWindowMatch[0];
  const depth = window.match(/\b(5[0-9]{2})\s*mm\b/)?.[1];
  const height = window.match(/\b(8[0-9]{2})\s*mm\b/)?.[1];
  const width = window.match(/\b(600)\s*mm\s*\(\s*for\s+60cm\s+model\s*\)/i)?.[1];
  if (!depth || !height || !width) {
    throw new Error('Midea dishwasher parser requires explicit 60cm cabinet width, height, and depth.');
  }

  const opening = {
    width: parseMm(width, 'cabinet width'),
    height: parseMm(height, 'cabinet height'),
    depth: parseMm(depth, 'cabinet depth')
  };
  const totalSide = opening.width - dimensions.width_mm;
  const top = opening.height - dimensions.height_mm;
  const rear = opening.depth - dimensions.depth_mm;
  if (totalSide < 0 || top < 0 || rear < 0) {
    throw new Error('Midea dishwasher cabinet opening is smaller than product dimensions.');
  }

  return {
    top_mm: top,
    left_mm: Math.floor(totalSide / 2),
    right_mm: Math.ceil(totalSide / 2),
    rear_mm: rear
  };
}

function parseMideaText(text, options = {}) {
  const sku = getTargetSku(options);
  const category = getTargetCategory(options);
  const sourceUrl = options.sourceUrl || options.target?.source_url;
  if (!sku) throw new Error('Midea parser requires a SKU/model target.');
  if (!sourceUrl) throw new Error('Midea parser requires sourceUrl metadata.');
  if (!category) throw new Error('Midea parser requires category metadata.');

  assertMideaDocument(text, sku, sourceUrl);

  let dimensions;
  let clearance;
  if (category === 'DISHWASHER') {
    dimensions = extractDishwasherDimensions(text);
    clearance = extractDishwasherOpening(text, dimensions);
  } else {
    throw new Error(`Midea ${category} parser requires explicit clearance rules before ingest.`);
  }

  const extractionDate = options.extractionDate || new Date().toISOString();
  return {
    data: {
      brand: options.target?.brand || options.target?.product?.brand || 'Midea',
      sku,
      category,
      dimensions,
      clearance_requirements: clearance,
      flags: {
        requires_plumbing: category === 'DISHWASHER' || category === 'WASHING_MACHINE',
        ventilation_required: false,
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

async function parseMideaPdf(pdfPath, options = {}) {
  const { text } = await extractText(pdfPath);
  return parseMideaText(text, options);
}

exports.normalizeSku = normalizeSku;
exports.parseMideaPdf = parseMideaPdf;
exports.parseMideaText = parseMideaText;
