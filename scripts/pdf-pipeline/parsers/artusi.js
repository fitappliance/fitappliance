const CATEGORY_MAP = {
  dishwasher: 'DISHWASHER',
  fridge: 'FRIDGE',
  refrigerator: 'FRIDGE',
  dryer: 'DRYER',
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
  if (!Number.isFinite(number)) throw new Error(`Unable to parse Artusi ${label}`);
  return Math.round(number);
}

function assertSkuInText(text, sku, sourceUrl = '') {
  const normalizedSku = normalizeSku(sku);
  const normalizedText = normalizeSku(text);
  const normalizedUrl = normalizeSku(sourceUrl);
  if (!normalizedSku || normalizedSku.length < 4) throw new Error('Artusi parser requires a SKU/model target.');
  if (normalizedText.includes(normalizedSku) || normalizedUrl.includes(normalizedSku)) return;
  throw new Error(`Artusi parser could not verify SKU ${sku} against document text or official source URL.`);
}

function assertCategoryCompatible(category, text) {
  if (category === 'DISHWASHER' && /\bdishwasher\b/i.test(text)) return;
  if (category === 'FRIDGE' && /\b(?:fridge|refrigerator|freezer|refrigeration)\b/i.test(text)) return;
  if (category === 'DRYER' && /\bdryer\b/i.test(text)) return;
  if (category === 'WASHING_MACHINE' && /\b(?:washing machine|washer)\b/i.test(text)) return;
  throw new Error(`Artusi parser could not verify category ${category || 'unknown'} against document text.`);
}

function extractArtusiDimensions(text, category) {
  const source = compactWhitespace(text);

  const dishwasherMatch = source.match(/TECHNICAL INFORMATION[\s\S]{0,900}?Height\s*\(H\)\s*Width\s*\(W\)\s*Depth\s*\(D1\)\s*Depth\s*\(D2\)\s*(\d+(?:\.\d+)?)\s*mm\s*(\d+(?:\.\d+)?)\s*mm\s*(\d+(?:\.\d+)?)\s*mm\s*\(with the door closed\)\s*(\d+(?:\.\d+)?)\s*mm\s*\(with the door opened 90/i);
  if (dishwasherMatch) {
    return {
      height_mm: parseMm(dishwasherMatch[1], 'height'),
      width_mm: parseMm(dishwasherMatch[2], 'width'),
      depth_mm: parseMm(dishwasherMatch[3], 'depth'),
      door_open_90_depth_mm: parseMm(dishwasherMatch[4], 'door-open depth')
    };
  }

  const productSpecMatch = source.match(/Product Specifications\s+(\d+(?:\.\d+)?)\s*mm\s*Wide\s+(\d+(?:\.\d+)?)\s*mm\s*(?:Deep\s+(\d+(?:\.\d+)?)\s*mm\s*High|High\s+(\d+(?:\.\d+)?)\s*mm\s*Deep)/i);
  if (productSpecMatch) {
    const isWideDeepHigh = productSpecMatch[3] != null;
    const height = isWideDeepHigh ? productSpecMatch[3] : productSpecMatch[2];
    const depth = isWideDeepHigh ? productSpecMatch[2] : productSpecMatch[4];
    return {
      width_mm: parseMm(productSpecMatch[1], 'width'),
      height_mm: parseMm(height, 'height'),
      depth_mm: parseMm(depth, 'depth'),
      door_open_90_depth_mm: null
    };
  }

  const diagramMatch = source.match(/\bW\s*(\d+(?:\.\d+)?)\s*mm\s+H\s*(\d+(?:\.\d+)?)\s*mm\s+D\s*(\d+(?:\.\d+)?)\s*mm/i)
    || source.match(/(\d+(?:\.\d+)?)\s*mm\s*W\s+H\s+D\s+(\d+(?:\.\d+)?)\s*mm\s+(\d+(?:\.\d+)?)\s*mm/i);
  if (diagramMatch) {
    return {
      width_mm: parseMm(diagramMatch[1], 'width'),
      height_mm: parseMm(diagramMatch[2], 'height'),
      depth_mm: parseMm(diagramMatch[3], 'depth'),
      door_open_90_depth_mm: null
    };
  }

  throw new Error(`Artusi ${category || 'product'} parser could not find explicit W/H/D dimensions.`);
}

function extractDishwasherClearance(text) {
  const flat = compactWhitespace(text);
  const hasWallCabinetPositioning = /Positioning The Appliance[\s\S]{0,1600}?back should rest against the wall[\s\S]{0,600}?sides,\s*along the adjacent cabinets or walls/i.test(flat);
  const hasSameHeightCabinetFit = /height of the dishwasher,\s*\d+\s*mm,[\s\S]{0,500}?fitted between existing cabinets of the same height/i.test(flat);
  if (hasWallCabinetPositioning && hasSameHeightCabinetFit) {
    return {
      top_mm: 0,
      left_mm: 0,
      right_mm: 0,
      rear_mm: 0
    };
  }
  throw new Error('Artusi dishwasher explicit wall/cabinet positioning basis not found.');
}

function extractArtusiClearance(text, category) {
  if (category === 'DISHWASHER') return extractDishwasherClearance(text);
  if (category === 'FRIDGE') {
    throw new Error('Artusi fridge explicit ventilation clearance is not text-readable.');
  }
  if (category === 'DRYER' || category === 'WASHING_MACHINE') {
    throw new Error(`Artusi ${category} explicit installation clearance is not text-readable.`);
  }
  throw new Error(`Artusi parser does not support clearance extraction for ${category}.`);
}

function assertDimensionsMatchCatalog(dimensions, product = {}, { toleranceMm = 20 } = {}) {
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
    throw new Error(`Artusi parser rejected dimensions due to catalog cross-check mismatch: ${details}`);
  }
}

function parseArtusiText(text, context = {}) {
  const source = normalizeWhitespace(text);
  const target = context.target || {};
  const sku = getTargetSku(target);
  const category = normalizeCategory(target.category || target.cat || target.product?.cat);
  const sourceUrl = context.sourceUrl;

  assertSkuInText(source, sku, sourceUrl);
  assertCategoryCompatible(category, source);

  const dimensions = extractArtusiDimensions(source, category);
  assertDimensionsMatchCatalog(dimensions, target.product);
  const clearance = extractArtusiClearance(source, category);

  return {
    data: {
      brand: target.brand || target.product?.brand || 'Artusi',
      sku,
      category,
      dimensions,
      clearance_requirements: clearance,
      flags: {
        requires_plumbing: category === 'DISHWASHER' || category === 'WASHING_MACHINE',
        ventilation_required: category === 'DRYER' || category === 'FRIDGE',
        reversible_door: null
      },
      metadata: {
        source_pdf_url: sourceUrl,
        extraction_date: context.extractionDate || new Date().toISOString(),
        confidence_score: 0.9,
        source_type: 'artusi-official'
      }
    },
    warnings: []
  };
}

exports.extractArtusiClearance = extractArtusiClearance;
exports.extractArtusiDimensions = extractArtusiDimensions;
exports.normalizeSku = normalizeSku;
exports.parseArtusiText = parseArtusiText;
