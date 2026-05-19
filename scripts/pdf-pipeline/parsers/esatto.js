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
  if (!match) throw new Error(`Unable to parse Esatto ${label} from "${value}"`);
  return Math.round(Number(match[1]));
}

function parseDistanceToMm(value, unit = '') {
  const amount = parseMm(value, 'distance');
  return /cm/i.test(unit) ? amount * 10 : amount;
}

function getTargetSku(options = {}) {
  const target = options.target || {};
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function getTargetCategory(options = {}) {
  const target = options.target || {};
  return normalizeCategory(target.category || target.cat || target.product?.cat);
}

function assertEsattoDocument(text, sku, sourceUrl = '') {
  const target = normalizeSku(sku);
  if (!target || target.length < 4) throw new Error('Esatto parser requires a SKU/model target.');
  const normalizedText = normalizeSku(text);
  const normalizedUrl = normalizeSku(sourceUrl);
  if (normalizedText.includes(target) || normalizedUrl.includes(target)) return;
  throw new Error(`Esatto parser could not verify SKU ${sku} against document text or official source URL.`);
}

function findModelBlocks(text, sku) {
  const source = normalizeWhitespace(text);
  const target = normalizeSku(sku);
  const modelMatches = [...source.matchAll(/Model\s*:\s*([^\n]+)/gi)];
  if (modelMatches.length === 0) return [];

  return modelMatches
    .filter((match) => normalizeSku(match[1]).includes(target))
    .map((match) => {
      const nextModel = modelMatches.find((candidate) => candidate.index > match.index);
      const end = nextModel ? nextModel.index : Math.min(source.length, match.index + 1200);
      return source.slice(match.index, end);
    });
}

function findProductDimensionRows(text) {
  const source = normalizeWhitespace(text);
  const rows = [];
  const productDimensionsPattern = /Product\s+Dimensions\s*:\s*W\s*:?\s*(\d+(?:\.\d+)?)\s*(?:mm)?\s*(?:[×x,]\s*)D\s*:?\s*(\d+(?:\.\d+)?)\s*(?:mm)?\s*(?:[×x,]\s*)H\s*:?\s*(\d+(?:\.\d+)?)\s*(?:mm|\(\s*mm\s*\))?/gi;
  for (const match of source.matchAll(productDimensionsPattern)) {
    rows.push({
      width_mm: parseMm(match[1], 'width'),
      depth_mm: parseMm(match[2], 'depth'),
      height_mm: parseMm(match[3], 'height'),
      door_open_90_depth_mm: null
    });
  }
  return rows;
}

function extractFridgeDimensions(text, sku) {
  const source = normalizeWhitespace(text);
  const modelBlocks = findModelBlocks(source, sku);
  if (modelBlocks.length > 0) {
    for (const block of modelBlocks) {
      const rows = findProductDimensionRows(block);
      if (rows.length === 1) return rows[0];
      if (rows.length > 1) {
        throw new Error(`Esatto fridge parser found multiple Product Dimensions rows for model ${sku}.`);
      }
    }
    throw new Error(`Esatto fridge parser requires a model-specific Product Dimensions row for ${sku}.`);
  }

  const rows = findProductDimensionRows(source);
  if (rows.length === 1) return rows[0];
  if (rows.length > 1) {
    throw new Error(`Esatto fridge parser requires a model-specific Product Dimensions row for ${sku}.`);
  }
  if (rows.length === 0) {
    throw new Error('Esatto fridge parser requires explicit Product Dimensions W x D x H.');
  }
}

function extractFridgeClearance(text) {
  const source = normalizeWhitespace(text);
  const match = source.match(/Allow\s+at\s+least\s+(\d+(?:\.\d+)?)\s*(cm|mm)\s+clear\s+space\s+at\s+the\s+back,\s*(\d+(?:\.\d+)?)\s*(cm|mm)\s+at\s+the\s+sides[\s\S]{0,180}?(\d+(?:\.\d+)?)\s*(cm|mm)\s+between\s+the\s+top/i);
  if (!match) {
    throw new Error('Esatto fridge parser requires explicit back, side, and top clearances.');
  }
  const rear = parseDistanceToMm(match[1], match[2]);
  const side = parseDistanceToMm(match[3], match[4]);
  const top = parseDistanceToMm(match[5], match[6]);
  return {
    top_mm: top,
    left_mm: side,
    right_mm: side,
    rear_mm: rear
  };
}

function extractDishwasherDimensionCandidates(text) {
  const source = normalizeWhitespace(text);
  const candidates = [];
  const dimensionPattern = /Height\s*\(H\)\s*Width\s*\(W\)\s*Depth\s*\(D1\)\s*Depth\s*\(D2\)\s*(\d+(?:\.\d+)?)\s*mm\s+(\d+(?:\.\d+)?)\s*mm\s+(\d+(?:\.\d+)?)\s*mm\s*\(with\s+the\s+door\s+closed\)[\s\S]{0,80}?(\d+(?:\.\d+)?)\s*mm\s*\(with\s+the\s+door\s+opened\s+90°\)/gi;
  for (const match of source.matchAll(dimensionPattern)) {
    candidates.push({
      height_mm: parseMm(match[1], 'height'),
      width_mm: parseMm(match[2], 'width'),
      depth_mm: parseMm(match[3], 'depth'),
      door_open_90_depth_mm: parseMm(match[4], 'door open depth')
    });
  }
  if (candidates.length === 0) {
    throw new Error('Esatto dishwasher parser requires explicit Height/Width/Depth technical dimensions.');
  }
  return candidates;
}

function matchDishwasherOpening(text, dimensionCandidates) {
  const source = normalizeWhitespace(text);
  const candidates = [];
  const directOpeningPattern = /90\s*°\s*90\s*°[\s\S]{0,120}?(\d+(?:\.\d+)?)\s*mm\s+(\d+(?:\.\d+)?)\s*mm\s+(\d+(?:\.\d+)?)\s*mm/gi;
  for (const match of source.matchAll(directOpeningPattern)) {
    candidates.push({
      width: parseMm(match[1], 'cabinet width'),
      height: parseMm(match[2], 'cabinet height'),
      depth: parseMm(match[3], 'cabinet depth')
    });
  }

  const labelledOpeningPattern = /(\d+(?:\.\d+)?)\s*mm\s*\(\s*for\s+60cm\s+model\s*\)[\s\S]{0,220}?90\s*°\s*90\s*°[\s\S]{0,120}?(\d+(?:\.\d+)?)\s*mm\s+(\d+(?:\.\d+)?)\s*mm\s+(\d+(?:\.\d+)?)\s*mm/gi;
  for (const match of source.matchAll(labelledOpeningPattern)) {
    candidates.push({
      width: parseMm(match[1], 'cabinet width'),
      height: parseMm(match[3], 'cabinet height'),
      depth: parseMm(match[4], 'cabinet depth')
    });
  }

  const validOpenings = candidates
    .flatMap((opening) => dimensionCandidates.map((dimensions) => ({
      dimensions,
      opening,
      totalSide: opening.width - dimensions.width_mm,
      top: opening.height - dimensions.height_mm,
      rear: opening.depth - dimensions.depth_mm
    })))
    .filter((candidate) => candidate.totalSide >= 0 && candidate.top >= 0 && candidate.rear >= 0)
    .sort((a, b) => (a.totalSide + a.top + a.rear) - (b.totalSide + b.top + b.rear));

  if (validOpenings.length === 0) {
    throw new Error('Esatto dishwasher parser requires explicit cabinet opening dimensions.');
  }
  const { dimensions, totalSide, top, rear } = validOpenings[0];
  return {
    dimensions: {
      ...dimensions,
      door_open_90_depth_mm: null
    },
    clearance: {
      top_mm: top,
      left_mm: Math.floor(totalSide / 2),
      right_mm: Math.ceil(totalSide / 2),
      rear_mm: rear
    }
  };
}

function inferRequiresPlumbing(category) {
  return category === 'DISHWASHER' || category === 'WASHING_MACHINE';
}

function parseEsattoText(text, options = {}) {
  const sku = getTargetSku(options);
  const category = getTargetCategory(options);
  const sourceUrl = options.sourceUrl || options.target?.source_url;
  if (!sku) throw new Error('Esatto parser requires a SKU/model target.');
  if (!sourceUrl) throw new Error('Esatto parser requires sourceUrl metadata.');
  if (!category) throw new Error('Esatto parser requires category metadata.');
  assertEsattoDocument(text, sku, sourceUrl);

  let dimensions;
  let clearance;
  if (category === 'FRIDGE') {
    dimensions = extractFridgeDimensions(text, sku);
    clearance = extractFridgeClearance(text);
  } else if (category === 'DISHWASHER') {
    const matched = matchDishwasherOpening(text, extractDishwasherDimensionCandidates(text));
    dimensions = matched.dimensions;
    clearance = matched.clearance;
  } else {
    throw new Error(`Esatto ${category} parser requires explicit clearance rules before ingest.`);
  }

  const extractionDate = options.extractionDate || new Date().toISOString();
  return {
    data: {
      brand: options.target?.brand || options.target?.product?.brand || 'Esatto',
      sku,
      category,
      dimensions,
      clearance_requirements: clearance,
      flags: {
        requires_plumbing: inferRequiresPlumbing(category),
        ventilation_required: category === 'FRIDGE',
        reversible_door: /reversible\s+door/i.test(text) ? true : null
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

async function parseEsattoPdf(pdfPath, options = {}) {
  const { text } = await extractText(pdfPath);
  return parseEsattoText(text, options);
}

exports.parseEsattoPdf = parseEsattoPdf;
exports.parseEsattoText = parseEsattoText;
