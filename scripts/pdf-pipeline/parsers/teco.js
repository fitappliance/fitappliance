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

function parseNumber(value, label) {
  const match = String(value || '').match(/\d+(?:\.\d+)?/);
  if (!match) throw new Error(`Unable to parse TECO ${label} from "${value}"`);
  return Math.round(Number(match[0]));
}

function getTargetSku(options = {}) {
  const target = options.target || {};
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function getTargetCategory(options = {}) {
  const target = options.target || {};
  return normalizeCategory(target.category || target.cat || target.product?.cat);
}

function assertTecoDocument(text, sku) {
  const target = normalizeSku(sku);
  if (!target || target.length < 3) throw new Error('TECO parser requires a SKU/model target.');
  const normalizedText = normalizeSku(text);
  if (normalizedText.includes(target)) return;
  throw new Error(`TECO parser could not verify SKU ${sku} against document text.`);
}

function extractSpecBlock(text) {
  const source = normalizeWhitespace(text);
  const indexes = [...source.matchAll(/\bSPECIFICATIONS\b/gi)].map((match) => match.index);
  if (indexes.length === 0) throw new Error('TECO parser requires an explicit Specifications section.');
  const candidates = indexes.map((index) => source.slice(index, index + 3200));
  return candidates.find((block) => (
    /\bWidth\s+\d+(?:\.\d+)?\b/i.test(block)
    && /\bDepth\s+\d+(?:\.\d+)?\b/i.test(block)
    && /\bHeight\s+\d+(?:\.\d+)?\b/i.test(block)
  )) || candidates[candidates.length - 1];
}

function extractFridgeDimensions(text) {
  const block = extractSpecBlock(text);
  const width = block.match(/\bWidth\s+(\d+(?:\.\d+)?)\b/i)?.[1];
  const depth = block.match(/\bDepth\s+(\d+(?:\.\d+)?)\b/i)?.[1];
  const height = block.match(/\bHeight\s+(\d+(?:\.\d+)?)\b/i)?.[1];
  if (!width || !depth || !height) {
    throw new Error('TECO fridge parser requires Width, Depth, and Height in Specifications.');
  }
  return {
    height_mm: parseNumber(height, 'height'),
    width_mm: parseNumber(width, 'width'),
    depth_mm: parseNumber(depth, 'depth'),
    door_open_90_depth_mm: null
  };
}

function extractFridgeClearance(text) {
  const source = normalizeWhitespace(text);
  const sideMatch = source.match(/minimum\s+of\s+(\d+(?:\.\d+)?)\s*mm\s+between\s+each\s+side\s+of\s+the\s+appliance\s+and\s+the\s+wall/i);
  const topMatch = source.match(/top\s+of\s+the\s+appliance\s+should\s+have\s+a\s+minimum\s+of\s+(\d+(?:\.\d+)?)\s*mm\s+clearance/i);
  if (!sideMatch || !topMatch || !/proper\s+air\s+circulation/i.test(source)) {
    throw new Error('TECO fridge parser requires explicit wall-side and top air-circulation clearances.');
  }
  const side = parseNumber(sideMatch[1], 'side/rear clearance');
  return {
    top_mm: parseNumber(topMatch[1], 'top clearance'),
    left_mm: side,
    right_mm: side,
    rear_mm: side
  };
}

function parseTecoText(text, options = {}) {
  const sku = getTargetSku(options);
  const category = getTargetCategory(options);
  const sourceUrl = options.sourceUrl || options.target?.source_url;
  if (!sku) throw new Error('TECO parser requires a SKU/model target.');
  if (!sourceUrl) throw new Error('TECO parser requires sourceUrl metadata.');
  if (!category) throw new Error('TECO parser requires category metadata.');

  assertTecoDocument(text, sku);
  if (category !== 'FRIDGE') {
    throw new Error(`TECO ${category} parser requires explicit full clearance data before ingest.`);
  }

  const dimensions = extractFridgeDimensions(text);
  const clearance = extractFridgeClearance(text);
  const extractionDate = options.extractionDate || new Date().toISOString();

  return {
    data: {
      brand: options.target?.brand || options.target?.product?.brand || 'TECO',
      sku,
      category,
      dimensions,
      clearance_requirements: clearance,
      flags: {
        requires_plumbing: /water\s+dispenser|ice\s+maker|plumbed/i.test(text),
        ventilation_required: true,
        reversible_door: /\brevers(?:e|ing|ible)\s+the\s+door\b/i.test(text) ? true : null
      },
      metadata: {
        source_pdf_url: sourceUrl,
        extraction_date: extractionDate,
        confidence_score: 0.88
      }
    },
    warnings: []
  };
}

async function parseTecoPdf(pdfPath, options = {}) {
  const { text } = await extractText(pdfPath);
  return parseTecoText(text, options);
}

exports.extractFridgeClearance = extractFridgeClearance;
exports.extractFridgeDimensions = extractFridgeDimensions;
exports.normalizeSku = normalizeSku;
exports.parseTecoPdf = parseTecoPdf;
exports.parseTecoText = parseTecoText;
