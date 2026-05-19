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
  const match = flat.match(/\b(?:Outer\s+)?Dimension[s]?(?:\s*\(\s*W\s*x\s*D\s*x\s*H\s*\))?\s+(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*mm\b/i);
  if (!match) return null;
  return {
    width_mm: parseMm(match[1], 'width'),
    depth_mm: parseMm(match[2], 'depth'),
    height_mm: parseMm(match[3], 'height')
  };
}

function dimensionsFromSpaceRequirementsTable(text) {
  const flat = compactWhitespace(text);
  const match = flat.match(/\b(?:Space\s+Requirements|Dimensions\s+and\s+Clearances)[\s\S]{0,1200}?\b(?:Width\s+Overall,?\s+Height\s+Depth[\s\S]{0,260}?)?A\s+B\s+C(?:\s+C1)?\s+D\s+E\s+(\d+(?:\.\d+)?)\s*(?:mm)?\s+(\d+(?:\.\d+)?)\s*(?:mm)?\s+(\d+(?:\.\d+)?)\s*(?:mm)?/i);
  if (!match) return null;
  return {
    width_mm: parseMm(match[1], 'width'),
    height_mm: parseMm(match[2], 'height'),
    depth_mm: parseMm(match[3], 'depth')
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

function extractFridgeDimensions(text) {
  const inline = dimensionsFromInlineSpec(text);
  if (inline) return inline;
  const spaceTable = dimensionsFromSpaceRequirementsTable(text);
  if (spaceTable) return spaceTable;
  throw new Error('Kogan fridge dimensions not found.');
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

function parseCmToMm(value, label) {
  return parseMm(value, label) * 10;
}

function extractFridgeClearance(text) {
  const flat = compactWhitespace(text);
  if (/no\s+more\s+than\s+\d+(?:\.\d+)?\s*cm\s+(?:of\s+space\s+)?at\s+the\s+rear/i.test(flat)) {
    throw new Error('Kogan fridge text has ambiguous maximum rear clearance wording.');
  }

  const allSides = flat.match(/Keep\s+at\s+least\s+(\d+(?:\.\d+)?)\s*cm\s+of\s+free\s+space\s+on\s+both\s+sides\s+and\s+at\s+the\s+top\s+and\s+allow\s+for\s+at\s+least\s+(\d+(?:\.\d+)?)\s*cm\s+of\s+space\s+at\s+the\s+rear/i);
  if (allSides) {
    const sideTop = parseCmToMm(allSides[1], 'side/top clearance');
    return {
      top_mm: sideTop,
      left_mm: sideTop,
      right_mm: sideTop,
      rear_mm: parseCmToMm(allSides[2], 'rear clearance')
    };
  }

  const frenchDoor = flat.match(/Both\s+sides\s+of\s+the\s+(?:unit|refrigerator)\s+(?:must\s+be\s+allowed\s+a\s+free\s+distance|should\s+be\s+placed\s+against\s+the\s+wall\s+with\s+a\s+free\s+distance)\s+of\s+more\s+than\s+(\d+(?:\.\d+)?)\s*mm[\s\S]{0,180}?(?:back\s+must\s+be\s+at\s+least|back\s+against\s+the\s+wall\s+distance\s+of\s+at\s+least)\s+(\d+(?:\.\d+)?)\s*mm/i);
  if (frenchDoor) {
    const topDiagram = flat.match(/>\s*(\d+(?:\.\d+)?)\s*mm\s+Required\s+Space/i);
    if (!topDiagram) {
      throw new Error('Kogan fridge French door top clearance diagram not found.');
    }
    const side = parseMm(frenchDoor[1], 'side clearance');
    return {
      top_mm: parseMm(topDiagram[1], 'top clearance'),
      left_mm: side,
      right_mm: side,
      rear_mm: parseMm(frenchDoor[2], 'rear clearance')
    };
  }

  throw new Error('Kogan fridge explicit top/side/rear clearance not found.');
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

function parseKoganFridge(text, context) {
  const dimensions = extractFridgeDimensions(text);
  assertDimensionsMatchCatalog(dimensions, context.target?.product);
  const clearance = extractFridgeClearance(text);

  return {
    brand: 'Kogan',
    sku: getTargetSku(context.target),
    category: 'FRIDGE',
    dimensions: {
      height_mm: dimensions.height_mm,
      width_mm: dimensions.width_mm,
      depth_mm: dimensions.depth_mm,
      door_open_90_depth_mm: null
    },
    clearance_requirements: clearance,
    flags: {
      requires_plumbing: false,
      ventilation_required: true,
      reversible_door: null
    },
    metadata: {
      source_pdf_url: context.sourceUrl,
      extraction_date: context.extractionDate || new Date().toISOString(),
      confidence_score: 0.9,
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
  if (targetCategory === 'FRIDGE') {
    return { data: parseKoganFridge(source, context) };
  }

  throw new Error(`Kogan parser does not yet have a fail-closed extractor for ${targetCategory}.`);
}

exports.extractFridgeClearance = extractFridgeClearance;
exports.extractFridgeDimensions = extractFridgeDimensions;
exports.extractWashingMachineClearance = extractWashingMachineClearance;
exports.extractWashingMachineDimensions = extractWashingMachineDimensions;
exports.normalizeSku = normalizeSku;
exports.parseKoganText = parseKoganText;
