const CATEGORY_MAP = {
  washing_machine: 'WASHING_MACHINE',
  'washing-machine': 'WASHING_MACHINE',
  washer: 'WASHING_MACHINE',
  fridge: 'FRIDGE',
  refrigerator: 'FRIDGE',
  dishwasher: 'DISHWASHER',
  dryer: 'DRYER'
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
  if (!Number.isFinite(number)) throw new Error(`Unable to parse Kogan ${label}`);
  return Math.round(number);
}

function assertSkuInText(text, sku) {
  const normalizedText = normalizeSku(text);
  const normalizedSku = normalizeSku(sku);
  if (!normalizedSku || !normalizedText.includes(normalizedSku)) {
    throw new Error(`Kogan parser could not verify SKU ${sku} against document text.`);
  }
}

function assertCategoryCompatible(targetCategory, text) {
  if (targetCategory === 'WASHING_MACHINE' && /\bWashing Machine\b|\bFront Load\b|\bWasher\b/i.test(text)) return;
  if (targetCategory === 'FRIDGE' && /\bFridge\b|\bRefrigerator\b|\bFreezer\b/i.test(text)) return;
  if (targetCategory === 'DISHWASHER' && /\bDishwasher\b/i.test(text)) return;
  if (targetCategory === 'DRYER' && /\bDryer\b/i.test(text)) return;
  throw new Error(`Kogan parser could not verify category ${targetCategory} against document text.`);
}

function dimensionsFromInlineSpec(text) {
  const flat = compactWhitespace(text);
  const match = flat.match(/\b(?:Outer\s+)?Dimension[s]?\s+(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*mm\b/i);
  if (!match) return null;
  return {
    width_mm: parseMm(match[1], 'width'),
    depth_mm: parseMm(match[2], 'depth'),
    height_mm: parseMm(match[3], 'height')
  };
}

function dimensionsFromLetteredWasherTable(text) {
  const flat = compactWhitespace(text);
  const match = flat.match(/\bDimensions?\s+A\s+(\d+(?:\.\d+)?)\s*mm\s+B\s+(\d+(?:\.\d+)?)\s*mm\s+C\s+(\d+(?:\.\d+)?)\s*mm\b/i);
  if (!match) return null;
  return {
    width_mm: parseMm(match[1], 'width'),
    height_mm: parseMm(match[2], 'height'),
    depth_mm: parseMm(match[3], 'depth')
  };
}

function extractWashingMachineDimensions(text) {
  const inline = dimensionsFromInlineSpec(text);
  if (inline) return inline;
  const lettered = dimensionsFromLetteredWasherTable(text);
  if (lettered) return lettered;
  throw new Error('Kogan washing machine dimensions not found.');
}

function extractWashingMachineClearance(text) {
  const flat = compactWhitespace(text);
  const match = flat.match(/Ensure\s+there\s+is\s+(\d+(?:\.\d+)?)\s*mm\s+of\s+space\s+on\s+the\s+back\s+and\s+sides\s+of\s+the\s+washing\s+machine/i);
  if (!match) {
    throw new Error('Kogan washing machine explicit back/sides clearance not found.');
  }
  const sideAndRear = parseMm(match[1], 'clearance');
  return {
    top_mm: 0,
    left_mm: sideAndRear,
    right_mm: sideAndRear,
    rear_mm: sideAndRear
  };
}

function assertDimensionsMatchCatalog(dimensions, product = {}, { toleranceMm = 8 } = {}) {
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
    throw new Error(`Kogan parser rejected dimensions due to catalog cross-check mismatch: ${details}`);
  }
}

function parseKoganWashingMachine(text, context) {
  const dimensions = extractWashingMachineDimensions(text);
  assertDimensionsMatchCatalog(dimensions, context.target?.product);
  const clearance = extractWashingMachineClearance(text);

  return {
    brand: 'Kogan',
    sku: getTargetSku(context.target),
    category: 'WASHING_MACHINE',
    dimensions: {
      height_mm: dimensions.height_mm,
      width_mm: dimensions.width_mm,
      depth_mm: dimensions.depth_mm,
      door_open_90_depth_mm: null
    },
    clearance_requirements: clearance,
    flags: {
      requires_plumbing: true,
      ventilation_required: true,
      reversible_door: null
    },
    metadata: {
      source_pdf_url: context.sourceUrl,
      extraction_date: context.extractionDate || new Date().toISOString(),
      confidence_score: 0.91,
      source_type: 'kogan-official-user_manual'
    }
  };
}

function parseKoganText(text, context = {}) {
  const source = normalizeWhitespace(text);
  const target = context.target || {};
  const sku = getTargetSku(target);
  const targetCategory = normalizeCategory(target.category || target.cat || target.product?.cat);

  assertSkuInText(source, sku);
  assertCategoryCompatible(targetCategory, source);

  if (targetCategory === 'WASHING_MACHINE') {
    return { data: parseKoganWashingMachine(source, context) };
  }

  throw new Error(`Kogan parser does not yet have a fail-closed extractor for ${targetCategory}.`);
}

exports.extractWashingMachineClearance = extractWashingMachineClearance;
exports.extractWashingMachineDimensions = extractWashingMachineDimensions;
exports.normalizeSku = normalizeSku;
exports.parseKoganText = parseKoganText;
