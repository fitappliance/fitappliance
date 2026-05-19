const CATEGORY_MAP = {
  dishwasher: 'DISHWASHER',
  dryer: 'DRYER',
  fridge: 'FRIDGE',
  freezer: 'FRIDGE',
  refrigerator: 'FRIDGE',
  washing_machine: 'WASHING_MACHINE',
  'washing-machine': 'WASHING_MACHINE',
  washer: 'WASHING_MACHINE'
};

function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function compactWhitespace(text) {
  return normalizeWhitespace(text).replace(/\s+/g, ' ').trim();
}

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function normalizeCategory(category) {
  const key = String(category || '').trim().toLowerCase();
  return CATEGORY_MAP[key] || category;
}

function getTargetSku(target = {}) {
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function parseMm(value, label) {
  const number = Number.parseFloat(String(value || '').replace(/,/g, ''));
  if (!Number.isFinite(number)) throw new Error(`Unable to parse Robinhood ${label}`);
  return Math.round(number);
}

function parseCmToMm(value, label) {
  return Math.round(parseMm(value, label) * 10);
}

function assertSkuInText(text, sku) {
  const normalizedText = normalizeSku(text);
  const normalizedSku = normalizeSku(sku);
  if (!normalizedSku || !normalizedText.includes(normalizedSku)) {
    throw new Error(`Robinhood parser could not verify SKU ${sku} against document text.`);
  }
}

function assertCategoryCompatible(category, text) {
  if (category === 'FRIDGE' && /\b(?:fridge|freezer|refrigerator|beverage cabinet|wine cabinet)\b/i.test(text)) return;
  if (category === 'DISHWASHER' && /\bdishwasher\b/i.test(text)) return;
  if (category === 'DRYER' && /\bdryer\b/i.test(text)) return;
  if (category === 'WASHING_MACHINE' && /\b(?:washing machine|washer)\b/i.test(text)) return;
  throw new Error(`Robinhood parser could not verify category ${category || 'unknown'} against document text.`);
}

function dimensionsFromProductDimension(text) {
  const flat = compactWhitespace(text);
  const patterns = [
    /Product Dimensions?\s*\(?(?:W\s*[x*×]\s*D\s*[x*×]\s*H|W\*D\*H|WxDxH)\)?(?:\s*mm)?\s*W?\s*(\d+(?:\.\d+)?)\s*(?:x|\*|×)\s*D?\s*(\d+(?:\.\d+)?)\s*(?:x|\*|×)\s*H?\s*(\d+(?:\.\d+)?)(?:\s*mm)?/i,
    /Product Dimensions?\s*\(mm\)\s*W\s*(\d+(?:\.\d+)?)\s*x\s*D\s*(\d+(?:\.\d+)?)\s*x\s*H\s*(\d+(?:\.\d+)?)/i,
    /Dimensions?\s*\(WxDxH\)\s*:?\s*(\d+(?:\.\d+)?)\s*(?:x|\*|×)\s*(\d+(?:\.\d+)?)\s*(?:x|\*|×)\s*(\d+(?:\.\d+)?)(?:\s*mm)?/i,
    /Net Dimensions?\s*\(W\s*(?:×|x)\s*D\s*(?:×|x)\s*H\)\s*(\d+(?:\.\d+)?)\s*(?:x|\*|×)\s*(\d+(?:\.\d+)?)\s*(?:x|\*|×)\s*(\d+(?:\.\d+)?)/i,
    /Dimension\s*\(WxDxH\)\s*(\d+(?:\.\d+)?)\s*(?:x|\*|×)\s*(\d+(?:\.\d+)?)\s*(?:x|\*|×)\s*(\d+(?:\.\d+)?)/i
  ];

  for (const pattern of patterns) {
    const match = flat.match(pattern);
    if (match) {
      return {
        width_mm: parseMm(match[1], 'width'),
        depth_mm: parseMm(match[2], 'depth'),
        height_mm: parseMm(match[3], 'height')
      };
    }
  }

  const rangedHeight = flat.match(/Product Dimensions?\s*\(W\*D\*H\)\s*(\d+(?:\.\d+)?)\s*\*\s*(\d+(?:\.\d+)?)\s*\*\s*\(?(\d+(?:\.\d+)?)(?:\s*-\s*\d+(?:\.\d+)?)?\)?\s*mm/i);
  if (rangedHeight) {
    return {
      width_mm: parseMm(rangedHeight[1], 'width'),
      depth_mm: parseMm(rangedHeight[2], 'depth'),
      height_mm: parseMm(rangedHeight[3], 'height')
    };
  }

  return null;
}

function extractRobinhoodDimensions(text) {
  const dimensions = dimensionsFromProductDimension(text);
  if (!dimensions) throw new Error('Robinhood parser could not find explicit W/D/H product dimensions.');
  return dimensions;
}

function extractFridgeClearance(text) {
  const flat = compactWhitespace(text);
  const full = flat.match(/Allow\s+at\s+least\s+(\d+(?:\.\d+)?)\s*cm\s+of\s+space\s+around\s+the\s+back\s+and\s+sides\s+of\s+the\s+appliance[\s\S]{0,180}?at\s+least\s+(\d+(?:\.\d+)?)\s*cm\s+above/i);
  if (full) {
    const sideRear = parseCmToMm(full[1], 'fridge side/rear clearance');
    return {
      top_mm: parseCmToMm(full[2], 'fridge top clearance'),
      left_mm: sideRear,
      right_mm: sideRear,
      rear_mm: sideRear
    };
  }

  if (/closer\s+than\s+\d+(?:\.\d+)?\s*mm\s+to\s+the\s+rear\s+wall/i.test(flat)) {
    throw new Error('Robinhood fridge text has rear spacing but no explicit top and side clearance.');
  }

  throw new Error('Robinhood fridge explicit top and side clearance not found.');
}

function extractDishwasherClearance(text) {
  const flat = compactWhitespace(text);
  if (
    /back\s+should\s+rest\s+against\s+the\s+wall\s+behind\s+it/i.test(flat)
    && /sides,\s+along\s+the\s+adjacent\s+cabinets\s+or\s+walls/i.test(flat)
  ) {
    return {
      top_mm: 0,
      left_mm: 0,
      right_mm: 0,
      rear_mm: 0
    };
  }
  throw new Error('Robinhood dishwasher explicit cabinet fit clearance not found.');
}

function extractDryerClearance(text) {
  const flat = compactWhitespace(text);
  const match = flat.match(/placed\s+in\s+a\s+ventilated\s+area\s+with\s+not\s+less\s+than\s+(\d+(?:\.\d+)?)\s*cm\s+distance\s+from\s+the\s+wall/i);
  if (!match) throw new Error('Robinhood dryer explicit rear wall clearance not found.');
  return {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: parseCmToMm(match[1], 'dryer rear clearance')
  };
}

function extractRobinhoodClearance(text, category) {
  if (category === 'FRIDGE') return extractFridgeClearance(text);
  if (category === 'DISHWASHER') return extractDishwasherClearance(text);
  if (category === 'DRYER') return extractDryerClearance(text);
  throw new Error(`Robinhood parser does not yet have fail-closed clearance logic for ${category}.`);
}

function assertDimensionsMatchCatalog(dimensions, product = {}, { toleranceMm = 15 } = {}) {
  const checks = [
    ['width_mm', 'w'],
    ['height_mm', 'h'],
    ['depth_mm', 'd']
  ];
  const mismatches = checks.filter(([pdfKey, productKey]) => (
    Number.isFinite(product?.[productKey])
    && Math.abs(product[productKey] - dimensions[pdfKey]) > toleranceMm
  ));
  if (mismatches.length > 0) {
    const details = mismatches.map(([pdfKey, productKey]) => `${productKey} catalog=${product[productKey]} pdf=${dimensions[pdfKey]}`).join(', ');
    throw new Error(`Robinhood parser rejected dimensions due to catalog cross-check mismatch: ${details}`);
  }
}

function parseRobinhoodText(text, context = {}) {
  const source = normalizeWhitespace(text);
  const target = context.target || {};
  const sku = getTargetSku(target);
  const targetCategory = normalizeCategory(target.category || target.cat || target.product?.cat);

  assertSkuInText(source, sku);
  assertCategoryCompatible(targetCategory, source);
  const dimensions = extractRobinhoodDimensions(source);
  assertDimensionsMatchCatalog(dimensions, target.product);
  const clearance = extractRobinhoodClearance(source, targetCategory);

  return {
    data: {
      brand: 'Robinhood',
      sku,
      category: targetCategory,
      dimensions: {
        height_mm: dimensions.height_mm,
        width_mm: dimensions.width_mm,
        depth_mm: dimensions.depth_mm,
        door_open_90_depth_mm: null
      },
      clearance_requirements: clearance,
      flags: {
        requires_plumbing: targetCategory === 'DISHWASHER' || targetCategory === 'WASHING_MACHINE',
        ventilation_required: true,
        reversible_door: null
      },
      metadata: {
        source_pdf_url: context.sourceUrl,
        extraction_date: context.extractionDate || new Date().toISOString(),
        confidence_score: 0.91,
        source_type: 'robinhood-official'
      }
    }
  };
}

exports.extractRobinhoodClearance = extractRobinhoodClearance;
exports.extractRobinhoodDimensions = extractRobinhoodDimensions;
exports.normalizeSku = normalizeSku;
exports.parseRobinhoodText = parseRobinhoodText;
