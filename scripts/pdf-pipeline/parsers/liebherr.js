const CATEGORY_MAP = {
  fridge: 'FRIDGE',
  refrigerator: 'FRIDGE',
  freezer: 'FRIDGE'
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

function baseLiebherrSku(value) {
  return normalizeSku(value).replace(/(?:LHH|RHH|LH|RH)$/i, '');
}

function normalizeCategory(category) {
  const key = String(category || '').trim().toLowerCase();
  return CATEGORY_MAP[key] || category;
}

function getTargetSku(target = {}) {
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function parseCmToMm(value, label) {
  const raw = String(value || '').replace(',', '.');
  const match = raw.match(/(?:min\.\s*)?(\d+(?:\.\d+)?)/i);
  if (!match) throw new Error(`Unable to parse Liebherr ${label}`);
  return Math.round(Number.parseFloat(match[1]) * 10);
}

function parseMm(value, label) {
  const raw = String(value || '').replace(',', '.');
  const match = raw.match(/(?:min\.\s*)?(\d+(?:\.\d+)?)/i);
  if (!match) throw new Error(`Unable to parse Liebherr ${label}`);
  return Math.round(Number.parseFloat(match[1]));
}

function targetSkuCandidates(target = {}) {
  const sku = getTargetSku(target);
  const normalized = normalizeSku(sku);
  const base = baseLiebherrSku(normalized);
  return [...new Set([normalized, base].filter((candidate) => candidate.length >= 5))];
}

function assertSkuInText(text, target = {}) {
  const normalizedText = normalizeSku(text);
  const candidates = targetSkuCandidates(target);
  if (candidates.some((candidate) => normalizedText.includes(candidate))) return;
  throw new Error(`Liebherr parser could not verify SKU ${getTargetSku(target)} against document text.`);
}

function assertCategoryCompatible(targetCategory) {
  if (targetCategory === 'FRIDGE') return;
  throw new Error(`Liebherr parser does not support ${targetCategory || 'unknown'} yet.`);
}

function numberTokenPattern() {
  return '(?:min\\.\\s*)?\\d+(?:[.,]\\d+)?(?:\\s*-\\s*\\d+(?:[.,]\\d+)?)?';
}

function firstCmTripleAfter(flat, headingPattern, { maxChars = 900 } = {}) {
  const heading = flat.search(headingPattern);
  if (heading < 0) return null;
  const window = flat.slice(heading, heading + maxChars);
  const token = numberTokenPattern();
  const triple = window.match(new RegExp(`(${token})\\s*\\/\\s*(${token})\\s*\\/\\s*(${token})`, 'i'));
  if (!triple) return null;
  return {
    height_mm: parseCmToMm(triple[1], 'height'),
    width_mm: parseCmToMm(triple[2], 'width'),
    depth_mm: parseCmToMm(triple[3], 'depth')
  };
}

function installationDimensionsFromSpecLines(text) {
  const lines = normalizeWhitespace(text).split('\n').map((line) => line.trim()).filter(Boolean);
  const index = lines.findIndex((line) => /Intallation Dimensions|Installation Dimensions/i.test(line));
  if (index < 0) return null;
  const window = lines.slice(index, index + 40);
  const heightLabel = window.findIndex((line) => /^Height$/i.test(line));
  const widthLabel = window.findIndex((line) => /^Width$/i.test(line));
  const depthLabel = window.findIndex((line) => /^Depth$/i.test(line));
  if (heightLabel < 0 || widthLabel < 0 || depthLabel < 0) return null;

  const valueLines = window.slice(Math.max(heightLabel, widthLabel, depthLabel) + 1)
    .filter((line) => /\b(?:min\.\s*)?\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?\s*cm\b/i.test(line));
  if (valueLines.length < 3) return null;

  return {
    height_mm: parseCmToMm(valueLines[0], 'installation height'),
    width_mm: parseCmToMm(valueLines[1], 'installation width'),
    depth_mm: parseCmToMm(valueLines[2], 'installation depth'),
    source: 'installation_dimensions'
  };
}

function mmDimensionsFromTechnicalInfo(text) {
  const lines = normalizeWhitespace(text).split('\n').map((line) => line.trim()).filter(Boolean);
  const heightIndex = lines.findIndex((line) => /^Height\s*\(mm\)$/i.test(line));
  const widthIndex = lines.findIndex((line) => /^Width\s*\(mm\)$/i.test(line));
  const depthIndex = lines.findIndex((line) => /^Depth\s*\(mm\)$/i.test(line));
  if (heightIndex < 0 || widthIndex < 0 || depthIndex < 0) return null;
  const height = lines[heightIndex + 1];
  const width = lines[widthIndex + 1];
  const depth = lines[depthIndex + 1];
  if (!height || !width || !depth) return null;
  return {
    height_mm: parseMm(height, 'height'),
    width_mm: parseMm(width, 'width'),
    depth_mm: parseMm(depth, 'depth'),
    source: 'technical_information_mm'
  };
}

function extractLiebherrDimensions(text) {
  const flat = compactWhitespace(text);
  const productDimensions = firstCmTripleAfter(flat, /Product dimensions\s*\(H\s*\/\s*W\s*\/\s*D\)\s*cm/i);
  if (productDimensions) return { ...productDimensions, source: 'product_dimensions_cm' };

  const exteriorDimensions = firstCmTripleAfter(flat, /Exterior dimensions in cm\s*\(\s*h\s*\/\s*w\s*\/\s*d\s*\)/i);
  if (exteriorDimensions) return { ...exteriorDimensions, source: 'exterior_dimensions_cm' };

  const installationDimensions = installationDimensionsFromSpecLines(text);
  if (installationDimensions) return installationDimensions;

  const mmDimensions = mmDimensionsFromTechnicalInfo(text);
  if (mmDimensions) return mmDimensions;

  throw new Error('Liebherr parser could not find explicit W/H/D dimensions.');
}

function extractVentilationClearance(text, dimensionsSource) {
  const flat = compactWhitespace(text);

  const backDepth = flat.match(/ventilation\s+(?:shaft|duct)[\s\S]{0,240}?(?:depth|back)[\s\S]{0,180}?(?:min\.?\s*(\d+(?:[.,]\d+)?)\s*mm|at least\s*(\d+(?:[.,]\d+)?)\s*mm)/i);
  if (backDepth) {
    return {
      top_mm: 0,
      left_mm: 0,
      right_mm: 0,
      rear_mm: parseMm(backDepth[1] || backDepth[2], 'rear ventilation depth'),
      source: 'rear_ventilation_depth'
    };
  }

  const depthOfVent = flat.match(/depth\s+of\s+(?:the\s+)?ventilation\s+(?:shaft|duct)[\s\S]{0,180}?(?:min\.?\s*(\d+(?:[.,]\d+)?)\s*mm|at least\s*(\d+(?:[.,]\d+)?)\s*mm)/i);
  if (depthOfVent) {
    return {
      top_mm: 0,
      left_mm: 0,
      right_mm: 0,
      rear_mm: parseMm(depthOfVent[1] || depthOfVent[2], 'rear ventilation depth'),
      source: 'rear_ventilation_depth'
    };
  }

  const freestandingTop = flat.match(/Cavity clearance for freestanding units please allow min\.\s*(\d+(?:[.,]\d+)?)\s*mm above/i);
  if (freestandingTop) {
    return {
      top_mm: parseMm(freestandingTop[1], 'freestanding top clearance'),
      left_mm: 0,
      right_mm: 0,
      rear_mm: 0,
      source: 'freestanding_top_clearance'
    };
  }

  if (
    dimensionsSource === 'installation_dimensions'
    && /correct ventilation requirements are achieved/i.test(flat)
    && /Arrows denote airflow from ventilation entry to exit point/i.test(flat)
  ) {
    return {
      top_mm: 0,
      left_mm: 0,
      right_mm: 0,
      rear_mm: 0,
      source: 'integrated_installation_ventilation'
    };
  }

  throw new Error('Liebherr parser could not find explicit ventilation/clearance requirements.');
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
    throw new Error(`Liebherr parser rejected dimensions due to catalog cross-check mismatch: ${details}`);
  }
}

function parseLiebherrText(text, context = {}) {
  const source = normalizeWhitespace(text);
  const target = context.target || {};
  const sku = getTargetSku(target);
  const targetCategory = normalizeCategory(target.category || target.cat || target.product?.cat);
  if (!sku) throw new Error('Liebherr parser requires a SKU/model target.');
  if (!context.sourceUrl) throw new Error('Liebherr parser requires sourceUrl metadata.');
  assertCategoryCompatible(targetCategory);
  assertSkuInText(source, target);

  const dimensions = extractLiebherrDimensions(source);
  assertDimensionsMatchCatalog(dimensions, target.product);
  const clearance = extractVentilationClearance(source, dimensions.source);

  return {
    data: {
      brand: target.brand || target.product?.brand || 'Liebherr',
      sku,
      category: 'FRIDGE',
      dimensions: {
        height_mm: dimensions.height_mm,
        width_mm: dimensions.width_mm,
        depth_mm: dimensions.depth_mm,
        door_open_90_depth_mm: null
      },
      clearance_requirements: {
        top_mm: clearance.top_mm,
        left_mm: clearance.left_mm,
        right_mm: clearance.right_mm,
        rear_mm: clearance.rear_mm
      },
      flags: {
        requires_plumbing: /IceMaker|water connection|fixed water connection|water tank/i.test(source),
        ventilation_required: true,
        reversible_door: /reversible|left|right/i.test(source) ? true : null
      },
      metadata: {
        source_pdf_url: context.sourceUrl,
        extraction_date: context.extractionDate || new Date().toISOString(),
        confidence_score: dimensions.source === 'installation_dimensions' ? 0.86 : 0.9,
        source_type: `liebherr-${dimensions.source}+${clearance.source}`
      }
    }
  };
}

exports.extractLiebherrDimensions = extractLiebherrDimensions;
exports.extractVentilationClearance = extractVentilationClearance;
exports.normalizeSku = normalizeSku;
exports.parseLiebherrText = parseLiebherrText;
