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

function getTargetSku(options = {}) {
  const target = options.target || {};
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function getTargetCategory(options = {}) {
  const target = options.target || {};
  return normalizeCategory(target.category || target.cat || target.product?.cat);
}

function assertInaltoDocument(text, sku, sourceUrl = '', verifiedAlias = '') {
  const target = normalizeSku(sku);
  const alias = normalizeSku(verifiedAlias);
  if (!target || target.length < 3) throw new Error('Inalto parser requires a SKU/model target.');
  const normalizedText = normalizeSku(text);
  const normalizedUrl = normalizeSku(sourceUrl);
  const candidates = [target, alias].filter(Boolean);
  if (candidates.some((candidate) => normalizedText.includes(candidate) || normalizedUrl.includes(candidate))) return;
  throw new Error(`Inalto parser could not verify SKU ${sku} against document text or official source URL.`);
}

function toMillimetres(value, unit = '') {
  const numeric = Number(value);
  const normalizedUnit = String(unit || '').toLowerCase();
  if (normalizedUnit.includes('cm')) return Math.round(numeric * 10);
  if (numeric > 0 && numeric < 100) return Math.round(numeric * 10);
  return Math.round(numeric);
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function dimensionsFromProductMatch(match) {
  return {
    width_mm: toMillimetres(match[1], match[2]),
    depth_mm: toMillimetres(match[3], match[4]),
    height_mm: toMillimetres(match[5], match[6]),
    door_open_90_depth_mm: null
  };
}

function extractDimensions(text, sku = '') {
  const normalized = normalizeWhitespace(text);
  const compact = normalized.replace(/\n/g, ' ');
  const targetSku = normalizeSku(sku);
  if (targetSku) {
    const targetPattern = new RegExp(
      `Model\\s*:?\\s*${escapeRegExp(targetSku)}\\b[\\s\\S]{0,900}?Product\\s+Dimensions:\\s*W:\\s*(\\d+(?:\\.\\d+)?)\\s*(mm|cm)?\\s*,\\s*D:\\s*(\\d+(?:\\.\\d+)?)\\s*(mm|cm)?\\s*,\\s*H:\\s*(\\d+(?:\\.\\d+)?)\\s*(mm|cm)?`,
      'i'
    );
    const targetProductDimensions = compact.match(targetPattern);
    if (targetProductDimensions) return dimensionsFromProductMatch(targetProductDimensions);
  }

  const patterns = [
    /Product\s+Dimensions:\s*W:\s*(\d+(?:\.\d+)?)\s*(mm|cm)?\s*,\s*D:\s*(\d+(?:\.\d+)?)\s*(mm|cm)?\s*,\s*H:\s*(\d+(?:\.\d+)?)\s*(mm|cm)?/i,
    /overall\s+size\s+of\s+(\d+(?:\.\d+)?)\s*(mm|cm)?\s+high,\s*(\d+(?:\.\d+)?)\s*(mm|cm)?\s+wide\s+and\s+(\d+(?:\.\d+)?)\s*(mm|cm)?\s+deep/i,
    /\bW(?:idth)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mm|cm)[^\n]{0,80}\bD(?:epth)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mm|cm)[^\n]{0,80}\bH(?:eight)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mm|cm)/i
  ];

  const productDimensions = compact.match(patterns[0]);
  if (productDimensions) return dimensionsFromProductMatch(productDimensions);

  const overallSize = compact.match(patterns[1]);
  if (overallSize) {
    return {
      height_mm: toMillimetres(overallSize[1], overallSize[2]),
      width_mm: toMillimetres(overallSize[3], overallSize[4]),
      depth_mm: toMillimetres(overallSize[5], overallSize[6]),
      door_open_90_depth_mm: null
    };
  }

  const inline = compact.match(patterns[2]);
  if (inline) {
    return {
      width_mm: toMillimetres(inline[1], inline[2]),
      depth_mm: toMillimetres(inline[3], inline[4]),
      height_mm: toMillimetres(inline[5], inline[6]),
      door_open_90_depth_mm: null
    };
  }

  throw new Error('Inalto parser requires explicit W/D/H product dimensions.');
}

function extractFridgeClearance(text) {
  const compact = normalizeWhitespace(text).replace(/\n/g, ' ');
  const match = compact.match(/Allow\s+at\s+least\s+(\d+(?:\.\d+)?)\s*(cm|mm)\s+clear\s+space\s+at\s+the\s+back,\s*(\d+(?:\.\d+)?)\s*(cm|mm)\s+at\s+the\s+sides\s+of\s+the\s+unit\s+and\s+(\d+(?:\.\d+)?)\s*(cm|mm)\s+between\s+the\s+top/i);
  if (!match) return null;
  return {
    rear_mm: toMillimetres(match[1], match[2]),
    left_mm: toMillimetres(match[3], match[4]),
    right_mm: toMillimetres(match[3], match[4]),
    top_mm: toMillimetres(match[5], match[6])
  };
}

function extractLaundryZeroClearance(text) {
  const source = normalizeWhitespace(text);
  if (!/\bfreestanding\b/i.test(source)) return null;
  if (!/(washing machine|washer dryer|vented dryer|heat pump dryer|clothes dryer)/i.test(source)) return null;
  if (!/(ventilat|air circulation|air flow|sufficient air)/i.test(source)) return null;
  return {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: 0
  };
}

function extractClearance(text, category) {
  if (category === 'FRIDGE') {
    const fridgeClearance = extractFridgeClearance(text);
    if (fridgeClearance) return fridgeClearance;
  }
  if (category === 'WASHING_MACHINE' || category === 'DRYER') {
    const laundryClearance = extractLaundryZeroClearance(text);
    if (laundryClearance) return laundryClearance;
  }
  throw new Error('Inalto parser requires explicit installation clearance or freestanding ventilation context.');
}

function parseInaltoText(text, options = {}) {
  const sku = getTargetSku(options);
  const category = getTargetCategory(options);
  const sourceUrl = options.sourceUrl || '';
  const verifiedAlias = options.verifiedAlias || '';
  const normalized = normalizeWhitespace(text);

  if (!/\bInAlto\b/i.test(normalized) && !/inalto\.house/i.test(sourceUrl)) {
    throw new Error('Inalto parser requires InAlto brand evidence.');
  }
  assertInaltoDocument(normalized, sku, sourceUrl, verifiedAlias);

  return {
    data: {
      brand: 'Inalto',
      sku,
      category,
      dimensions: extractDimensions(normalized, sku),
      clearance_requirements: extractClearance(normalized, category),
      flags: {
        requires_plumbing: category === 'DISHWASHER' || category === 'WASHING_MACHINE',
        ventilation_required: true,
        reversible_door: /\breversible door\b/i.test(normalized) ? true : null
      },
      metadata: {
        source_pdf_url: sourceUrl,
        extraction_date: options.extractionDate || new Date().toISOString(),
        confidence_score: 0.9
      }
    }
  };
}

exports.extractDimensions = extractDimensions;
exports.extractClearance = extractClearance;
exports.parseInaltoText = parseInaltoText;
