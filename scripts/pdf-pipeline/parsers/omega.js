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
  if (!Number.isFinite(number)) throw new Error(`Unable to parse Omega ${label}`);
  return Math.round(number);
}

function assertSkuInText(text, sku) {
  const normalizedText = normalizeSku(text);
  const normalizedSku = normalizeSku(sku);
  if (!normalizedSku || !normalizedText.includes(normalizedSku)) {
    throw new Error(`Omega parser could not verify SKU ${sku} against document text.`);
  }
}

function assertCategoryCompatible(category, text) {
  if (category === 'FRIDGE' && /\b(?:fridge|freezer|refrigeration|refrigerator)\b/i.test(text)) return;
  if (category === 'DISHWASHER' && /\bdishwashers?\b/i.test(text)) return;
  if (category === 'DRYER' && /\bdryer\b/i.test(text)) return;
  if (category === 'WASHING_MACHINE' && /\b(?:washing machine|washer)\b/i.test(text)) return;
  throw new Error(`Omega parser could not verify category ${category || 'unknown'} against document text.`);
}

function extractOmegaDimensions(text) {
  const flat = compactWhitespace(text);
  const patterns = [
    /Overall\s+Dimensions?\s*\(mm\)\s*:?\s*(\d+(?:\.\d+)?)\s*\(?h\)?\s*x\s*(\d+(?:\.\d+)?)\s*\(?w\)?\s*x\s*(\d+(?:\.\d+)?)\s*\(?d\)?/i,
    /Overall\s+dimensions?\s*\(mm\)\s*:?\s*(\d+(?:\.\d+)?)\s*h\s*x\s*(\d+(?:\.\d+)?)\s*w\s*x\s*(\d+(?:\.\d+)?)\s*d/i,
    /Product\s+Dimensions?\s*\(mm\)\s*:?\s*(\d+(?:\.\d+)?)\s*W\s*x?\s*(\d+(?:\.\d+)?)\s*D\s*x?\s*(\d+(?:\.\d+)?)\s*H/i
  ];

  for (const pattern of patterns) {
    const match = flat.match(pattern);
    if (!match) continue;
    if (/Product\s+Dimensions?/i.test(match[0])) {
      return {
        width_mm: parseMm(match[1], 'width'),
        depth_mm: parseMm(match[2], 'depth'),
        height_mm: parseMm(match[3], 'height')
      };
    }
    return {
      height_mm: parseMm(match[1], 'height'),
      width_mm: parseMm(match[2], 'width'),
      depth_mm: parseMm(match[3], 'depth')
    };
  }

  throw new Error('Omega parser could not find explicit W/H/D product dimensions.');
}

function hasPhysicalCutoutBasis(text) {
  const flat = compactWhitespace(text);
  return /Cut-?outs?\s+for\s+appliances?\s+should\s+only\s+be\s+by\s+physical\s+product\s+measurements/i.test(flat)
    || /Cutouts?\s+for\s+appliances?\s+should\s+only\s+be\s+by\s+physical\s+product\s+measurements/i.test(flat);
}

function extractDishwasherClearance(text) {
  const flat = compactWhitespace(text);
  const isDishwasherInstall = /(?:Dishwasher|Oven)\s+Type\s*:\s*(?:Freestanding|Fully\s+Integrated|Semi-integrated|Built-in)|Installation\s+type\s*:\s*Fully\s+integrated\s+built\s+in|Supplied\s+Without\s+a\s+Decorative\s+Door/i.test(flat);
  if (isDishwasherInstall && hasPhysicalCutoutBasis(flat)) {
    return {
      top_mm: 0,
      left_mm: 0,
      right_mm: 0,
      rear_mm: 0
    };
  }
  throw new Error('Omega dishwasher explicit physical-product cutout basis not found.');
}

function extractDryerClearance(text) {
  const flat = compactWhitespace(text);
  const isFreestandingDryer = /Installation\s+Style\s*:\s*(?:Freestanding|Freestanding\s+or\s+Wall\s+Mounted)|Installation\s+style\s*:\s*Freestanding/i.test(flat);
  if (isFreestandingDryer && hasPhysicalCutoutBasis(flat)) {
    return {
      top_mm: 0,
      left_mm: 0,
      right_mm: 0,
      rear_mm: 0
    };
  }
  throw new Error('Omega dryer explicit physical-product installation basis not found.');
}

function extractOmegaClearance(text, category) {
  if (category === 'DISHWASHER') return extractDishwasherClearance(text);
  if (category === 'DRYER') return extractDryerClearance(text);
  if (category === 'FRIDGE') {
    throw new Error('Omega fridge explicit cabinet clearance is not text-readable.');
  }
  throw new Error(`Omega parser does not yet have fail-closed clearance logic for ${category}.`);
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
    throw new Error(`Omega parser rejected dimensions due to catalog cross-check mismatch: ${details}`);
  }
}

function parseOmegaText(text, context = {}) {
  const source = normalizeWhitespace(text);
  const target = context.target || {};
  const sku = getTargetSku(target);
  const targetCategory = normalizeCategory(target.category || target.cat || target.product?.cat);

  assertSkuInText(source, sku);
  assertCategoryCompatible(targetCategory, source);

  const dimensions = extractOmegaDimensions(source);
  assertDimensionsMatchCatalog(dimensions, target.product);
  const clearance = extractOmegaClearance(source, targetCategory);

  return {
    data: {
      brand: 'Omega',
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
        ventilation_required: targetCategory === 'DRYER' || targetCategory === 'FRIDGE',
        reversible_door: null
      },
      metadata: {
        source_pdf_url: context.sourceUrl,
        extraction_date: context.extractionDate || new Date().toISOString(),
        confidence_score: 0.9,
        source_type: 'omega-official-spec_sheet'
      }
    }
  };
}

exports.extractOmegaClearance = extractOmegaClearance;
exports.extractOmegaDimensions = extractOmegaDimensions;
exports.normalizeSku = normalizeSku;
exports.parseOmegaText = parseOmegaText;
