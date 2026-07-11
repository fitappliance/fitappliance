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

function stripHingeSuffix(value) {
  return normalizeSku(value).replace(/[LR]$/, '');
}

function parseMm(value, label) {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Unable to parse Electrolux ${label} from "${value}"`);
  return Math.round(Number(match[1]));
}

function electroluxModelMatchesSku(modelToken, sku) {
  const model = normalizeSku(modelToken);
  const target = normalizeSku(sku);
  if (!model || !target || model.length < 5 || target.length < 5) return false;
  if (model === target) return true;
  return stripHingeSuffix(model) === stripHingeSuffix(target);
}

function getTargetSku(options = {}) {
  const target = options.target || {};
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function getTargetCategory(options = {}) {
  const target = options.target || {};
  return normalizeCategory(target.category || target.cat || target.product?.cat);
}

function extractModelTokens(text) {
  return [...String(text || '').toUpperCase().matchAll(/\b(?:E|K|W)[A-Z]{1,4}\d[A-Z0-9]*(?:-[LR])?\b/g)]
    .map((match) => match[0]);
}

function assertElectroluxDocument(text, sku) {
  const tokens = extractModelTokens(text);
  if (tokens.some((token) => electroluxModelMatchesSku(token, sku))) return;
  throw new Error(`Electrolux parser could not verify SKU ${sku} against document model tokens.`);
}

function hasExactOfficialFactsheetBinding({ sourceUrl, sku, verifiedAlias, brand }) {
  if (normalizeSku(verifiedAlias) !== normalizeSku(sku)) return false;
  try {
    const url = new URL(sourceUrl);
    const sourceBrand = String(url.searchParams.get('brand') || '').trim().toLowerCase();
    const targetBrand = String(brand || '').trim().toLowerCase();
    return url.protocol === 'https:'
      && url.hostname === 'resource.electrolux.com.au'
      && url.pathname.toLowerCase() === '/factsheet/requestpdf'
      && normalizeSku(url.searchParams.get('modelNumber')) === normalizeSku(sku)
      && sourceBrand === targetBrand
      && ['electrolux', 'kelvinator', 'westinghouse'].includes(targetBrand);
  } catch {
    return false;
  }
}

function extractFactsheetLabelMm(text, label) {
  const match = normalizeWhitespace(text).match(new RegExp(`\\bTotal\\s+${label}\\s*\\(mm\\)\\s+(\\d+(?:\\.\\d+)?)\\b`, 'i'));
  if (!match) throw new Error(`Electrolux factsheet requires an explicit Total ${label} (mm) value.`);
  return parseMm(match[1], `total ${label}`);
}

function extractElectroluxFactsheetDimensions(text) {
  return {
    height_mm: extractFactsheetLabelMm(text, 'height'),
    width_mm: extractFactsheetLabelMm(text, 'width'),
    depth_mm: extractFactsheetLabelMm(text, 'depth'),
    door_open_90_depth_mm: null
  };
}

function findMatchingNumericRow(text, sku, minimumNumbers) {
  const lines = normalizeWhitespace(text).split('\n').map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const tokens = extractModelTokens(line);
    if (!tokens.some((token) => electroluxModelMatchesSku(token, sku))) continue;
    const lineNumbers = [...line.matchAll(/\b\d+(?:\.\d+)?\b/g)].map((match) => Number(match[0]));
    if (lineNumbers.length >= minimumNumbers) return { line, numbers: lineNumbers };

    const joinedLine = `${line} ${lines[index + 1] || ''}`.trim();
    const joinedNumbers = [...joinedLine.matchAll(/\b\d+(?:\.\d+)?\b/g)].map((match) => Number(match[0]));
    if (joinedNumbers.length >= minimumNumbers) return { line: joinedLine, numbers: joinedNumbers };
  }
  return null;
}

function extractElectroluxDimensions(text, sku, category) {
  if (category !== 'FRIDGE') {
    throw new Error(`Electrolux ${category || 'unknown'} parser requires explicit airspace and dimension rows.`);
  }
  const source = normalizeWhitespace(text);
  const dimensionsIndex = source.search(/\bDimensions\s+Product\s+Height\b/i);
  if (dimensionsIndex < 0) {
    throw new Error('Electrolux parser requires an explicit Dimensions table.');
  }
  const afterDimensions = source.slice(dimensionsIndex);
  const airspaceOffset = afterDimensions.search(/\bAirspace\s+Side\b/i);
  const dimensionsWindow = airspaceOffset > 0
    ? afterDimensions.slice(0, airspaceOffset)
    : afterDimensions.slice(0, 2500);
  const row = findMatchingNumericRow(dimensionsWindow, sku, 4);
  if (!row) {
    throw new Error(`Electrolux parser could not find a dimensions row for ${sku}.`);
  }
  const [height, width, depth, doorOpen] = row.numbers;
  return {
    height_mm: parseMm(height, 'height'),
    width_mm: parseMm(width, 'width'),
    depth_mm: parseMm(depth, 'depth'),
    door_open_90_depth_mm: parseMm(doorOpen, 'door open depth')
  };
}

function extractElectroluxClearance(text, sku) {
  const source = normalizeWhitespace(text);
  const airspaceIndex = source.search(/\bAirspace\s+Side\b/i);
  if (airspaceIndex < 0) {
    throw new Error('Electrolux parser requires an explicit Airspace clearance table.');
  }
  const airspaceWindow = source.slice(airspaceIndex, airspaceIndex + 2600);
  const row = findMatchingNumericRow(airspaceWindow, sku, 3);
  if (!row) {
    throw new Error(`Electrolux parser could not find an Airspace clearance row for ${sku}.`);
  }

  if (row.numbers.length >= 4) {
    const [sideA, sideB, top, rear] = row.numbers;
    const saferSide = Math.max(parseMm(sideA, 'side clearance'), parseMm(sideB, 'side clearance'));
    return {
      top_mm: parseMm(top, 'top clearance'),
      left_mm: saferSide,
      right_mm: saferSide,
      rear_mm: parseMm(rear, 'rear clearance')
    };
  }

  const [side, top, rear] = row.numbers;
  return {
    top_mm: parseMm(top, 'top clearance'),
    left_mm: parseMm(side, 'side clearance'),
    right_mm: parseMm(side, 'side clearance'),
    rear_mm: parseMm(rear, 'rear clearance')
  };
}

function inferRequiresPlumbing(text) {
  return /water\s+dispenser|ice\s+maker|plumbed|dishwasher|washing\s+machine/i.test(text);
}

function parseElectroluxText(text, options = {}) {
  const sku = getTargetSku(options);
  const category = getTargetCategory(options);
  const sourceUrl = options.sourceUrl || options.target?.source_url;
  if (!sku) throw new Error('Electrolux parser requires a SKU/model target.');
  if (!sourceUrl) throw new Error('Electrolux parser requires sourceUrl metadata.');
  if (!category) throw new Error('Electrolux parser requires category metadata.');

  const brand = options.target?.brand || options.target?.product?.brand || 'Electrolux';
  const factsheetBound = hasExactOfficialFactsheetBinding({
    sourceUrl,
    sku,
    verifiedAlias: options.verifiedAlias,
    brand
  });
  if (!factsheetBound) assertElectroluxDocument(text, sku);
  const dimensions = factsheetBound
    ? extractElectroluxFactsheetDimensions(text)
    : extractElectroluxDimensions(text, sku, category);
  const clearance = factsheetBound
    ? { top_mm: 0, left_mm: 0, right_mm: 0, rear_mm: 0 }
    : extractElectroluxClearance(text, sku);
  const extractionDate = options.extractionDate || new Date().toISOString();

  return {
    data: {
      brand,
      sku,
      category,
      dimensions,
      clearance_requirements: clearance,
      flags: {
        requires_plumbing: inferRequiresPlumbing(text),
        ventilation_required: category === 'FRIDGE',
        reversible_door: /\b(reversible|left|right)\s+door/i.test(text) ? true : null
      },
      metadata: {
        source_pdf_url: sourceUrl,
        extraction_date: extractionDate,
        confidence_score: 0.9,
        ...(factsheetBound ? { verified_alias: options.verifiedAlias } : {})
      }
    },
    warnings: factsheetBound
      ? ['Official factsheet verifies product dimensions only; installation clearance is not verified.']
      : []
  };
}

async function parseElectroluxPdf(pdfPath, options = {}) {
  const { text } = await extractText(pdfPath);
  return parseElectroluxText(text, options);
}

exports.electroluxModelMatchesSku = electroluxModelMatchesSku;
exports.extractElectroluxClearance = extractElectroluxClearance;
exports.extractElectroluxDimensions = extractElectroluxDimensions;
exports.extractElectroluxFactsheetDimensions = extractElectroluxFactsheetDimensions;
exports.hasExactOfficialFactsheetBinding = hasExactOfficialFactsheetBinding;
exports.normalizeSku = normalizeSku;
exports.parseElectroluxPdf = parseElectroluxPdf;
exports.parseElectroluxText = parseElectroluxText;
