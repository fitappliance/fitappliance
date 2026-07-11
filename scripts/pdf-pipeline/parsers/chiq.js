const { extractText } = require('../2-extract-text');

const CATEGORY_MAP = {
  fridge: 'FRIDGE',
  refrigerator: 'FRIDGE',
  freezer: 'FRIDGE',
  dishwasher: 'DISHWASHER',
  dryer: 'DRYER',
  washing_machine: 'WASHING_MACHINE',
  'washing-machine': 'WASHING_MACHINE',
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

function compactWhitespace(text) {
  return normalizeWhitespace(text).replace(/\s+/g, ' ').trim();
}

function normalizeModelToken(value, { keepWildcard = false } = {}) {
  const allowed = keepWildcard ? /[^A-Z0-9*]+/g : /[^A-Z0-9]+/g;
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(allowed, '');
}

function wildcardMatches(pattern, value) {
  const source = normalizeModelToken(pattern, { keepWildcard: true });
  const target = normalizeModelToken(value);
  if (!source || !target || !source.includes('*')) return false;
  if (source.replace(/\*/g, '').length < 5) return false;
  const regex = new RegExp(`^${source.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return regex.test(target);
}

function chiqModelMatchesSku(modelToken, sku) {
  const model = normalizeModelToken(modelToken, { keepWildcard: true });
  const target = normalizeModelToken(sku, { keepWildcard: true });
  if (!model || !target) return false;
  if (normalizeModelToken(model) === normalizeModelToken(target)) return true;
  if (model.includes('*')) return wildcardMatches(model, target);
  if (target.includes('*')) return wildcardMatches(target, model);
  return false;
}

function parseMm(value, label) {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Unable to parse CHIQ ${label} from "${value}"`);
  return Math.round(Number(match[1]));
}

function extractModelTokens(text) {
  const source = normalizeWhitespace(text);
  const tokens = new Set();
  for (const match of source.matchAll(/\b(?:CHiQ\s+Model|Model(?:\s+Number)?)\s*\n?\s*([A-Z0-9*.-]{4,})/gi)) {
    tokens.add(normalizeModelToken(match[1], { keepWildcard: true }));
  }
  for (const match of source.matchAll(/\b([A-Z]{2,}[A-Z0-9]*\d[A-Z0-9*.-]{2,})\b/g)) {
    const token = normalizeModelToken(match[1], { keepWildcard: true });
    if (token.length >= 4) tokens.add(token);
  }
  return [...tokens];
}

function assertModelSupportedByDocument(text, sku, verifiedAlias = '') {
  const tokens = extractModelTokens(text);
  if (verifiedAlias && tokens.some((token) => chiqModelMatchesSku(token, verifiedAlias))) return;
  if (tokens.some((token) => chiqModelMatchesSku(token, sku))) return;
  throw new Error(`CHIQ parser could not verify SKU ${sku} against document model tokens.`);
}

function extractDimensions(text) {
  const source = compactWhitespace(text);
  const productDimensions = source.match(/Product\s+Dimensions\s*\(\s*W\s*(?:x|X)?\s*H\s*(?:x|X)?\s*D\s*\)\s*mm\s*(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/i)
    || source.match(/Product\s+Dimensions\s*\(\s*W\s*x\s*H\s*x\s*D\s*\)\s*mm\s*(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/i);
  if (productDimensions) {
    return {
      width_mm: parseMm(productDimensions[1], 'width'),
      height_mm: parseMm(productDimensions[2], 'height'),
      depth_mm: parseMm(productDimensions[3], 'depth'),
      door_open_90_depth_mm: null
    };
  }

  const heroDimensions = source.match(/\bWIDTH\s*(\d+(?:\.\d+)?)\s*mm\b.*?\bHEIGHT\s*(\d+(?:\.\d+)?)\s*mm\b.*?\bDEPTH\s*(\d+(?:\.\d+)?)\s*mm\b/i);
  if (heroDimensions) {
    return {
      width_mm: parseMm(heroDimensions[1], 'width'),
      height_mm: parseMm(heroDimensions[2], 'height'),
      depth_mm: parseMm(heroDimensions[3], 'depth'),
      door_open_90_depth_mm: null
    };
  }

  throw new Error('CHIQ parser could not find explicit product W/H/D dimensions.');
}

function cmToMm(value) {
  return Math.round(Number(value) * 10);
}

function extractClearance(text) {
  const source = compactWhitespace(text);
  const windowMatch = source.match(/Ventilation\s+Requirements(.{0,220})/i);
  if (!windowMatch) {
    throw new Error('CHIQ parser could not find explicit ventilation requirements.');
  }
  const window = windowMatch[1];
  const sideMatch = window.match(/(\d+(?:\.\d+)?)\s*cm\s+Left\s*&\s*Right\s+sides/i)
    || window.match(/Left\s*&\s*Right\s+sides\s*(\d+(?:\.\d+)?)\s*cm/i);
  const backMatch = window.match(/(\d+(?:\.\d+)?)\s*cm\s+Back/i)
    || window.match(/Back\s*(\d+(?:\.\d+)?)\s*cm/i);
  if (!sideMatch || !backMatch) {
    throw new Error('CHIQ parser could not find explicit side/back ventilation values.');
  }
  const side = cmToMm(sideMatch[1]);
  return {
    top_mm: 0,
    left_mm: side,
    right_mm: side,
    rear_mm: cmToMm(backMatch[1])
  };
}

function inferRequiresPlumbing(text, category) {
  if (category === 'DISHWASHER' || category === 'WASHING_MACHINE') return true;
  return /\bwater\s+connection\b|\bplumbed\b/i.test(text);
}

function parseChiqText(text, options = {}) {
  const normalized = normalizeWhitespace(text);
  const target = options.target || {};
  const category = normalizeCategory(target.category || target.product?.cat);
  const sku = String(target.sku || target.model || target.product?.model || '').trim();
  if (!sku) throw new Error('CHIQ parser requires target SKU.');

  assertModelSupportedByDocument(normalized, sku, options.verifiedAlias);
  const dimensions = extractDimensions(normalized);
  const clearance = extractClearance(normalized);
  const sourceUrl = options.sourceUrl || options.source_pdf_url;
  if (!sourceUrl) throw new Error('CHIQ parser requires sourceUrl.');

  return {
    data: {
      brand: 'CHiQ',
      sku,
      category,
      dimensions,
      clearance_requirements: clearance,
      flags: {
        requires_plumbing: inferRequiresPlumbing(normalized, category),
        ventilation_required: true,
        reversible_door: null
      },
      metadata: {
        source_pdf_url: sourceUrl,
        extraction_date: options.extractionDate || new Date().toISOString(),
        confidence_score: 0.9,
        ...(options.verifiedAlias ? { verified_alias: options.verifiedAlias } : {})
      }
    }
  };
}

async function parseChiqPdf(pdfPath, options = {}) {
  const { text } = await extractText(pdfPath);
  return parseChiqText(text, options);
}

exports.chiqModelMatchesSku = chiqModelMatchesSku;
exports.parseChiqPdf = parseChiqPdf;
exports.parseChiqText = parseChiqText;
