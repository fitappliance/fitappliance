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

function parseMm(value, label) {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Unable to parse Hisense ${label} from "${value}"`);
  return Math.round(Number(match[1]));
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
  const concreteLength = source.replace(/\*/g, '').length;
  if (concreteLength < 5) return false;
  const escaped = source
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`).test(target);
}

function hisenseModelMatchesSku(modelToken, sku) {
  const model = normalizeModelToken(modelToken, { keepWildcard: true });
  const target = normalizeModelToken(sku, { keepWildcard: true });
  if (!model || !target) return false;
  if (normalizeModelToken(model) === normalizeModelToken(target)) return true;
  if (model.includes('*')) return wildcardMatches(model, target);
  if (target.includes('*')) return wildcardMatches(target, model);
  return false;
}

function extractModelTokens(text) {
  const source = normalizeWhitespace(text);
  const tokens = [];
  const modelPatterns = [
    /\bModel\s+Number\s+([A-Z0-9*.-]{4,})/gi,
    /\bManufacturer\s+Model\s+([A-Z0-9*.-]{4,})/gi,
    /^\s*Model\s*\n\s*([A-Z0-9*.-]{4,})\b/gim
  ];
  for (const pattern of modelPatterns) {
    for (const match of source.matchAll(pattern)) {
      tokens.push(normalizeModelToken(match[1], { keepWildcard: true }));
    }
  }
  return [...new Set(tokens.filter((token) => token.length >= 4))];
}

function assertModelSupportedByDocument(text, sku, verifiedAlias = '') {
  const tokens = extractModelTokens(text);
  if (verifiedAlias && tokens.some((token) => hisenseModelMatchesSku(token, verifiedAlias))) return;
  if (tokens.some((token) => hisenseModelMatchesSku(token, sku))) return;

  const normalizedText = normalizeModelToken(text);
  if (normalizeModelToken(sku).length >= 6 && normalizedText.includes(normalizeModelToken(sku))) return;
  throw new Error(`Hisense parser could not verify SKU ${sku} against document model tokens.`);
}

function extractCombinedDimensions(text) {
  const source = compactWhitespace(text);
  const patterns = [
    /Dimensions\s*\(Net\)\s*\(W\s*X\s*H\s*X\s*D\)\s*(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)/i,
    /Net\s+dimensions\s*\(\s*W\s*x\s*H\s*x\s*D\s*\)\s*(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)/i,
    /Dimensions\s*\(\s*W\s*X\s*H\s*X\s*D\s*\)\s*(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)/i
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) {
      return {
        width_mm: parseMm(match[1], 'width'),
        height_mm: parseMm(match[2], 'height'),
        depth_mm: parseMm(match[3], 'depth'),
        door_open_90_depth_mm: null
      };
    }
  }
  return null;
}

function extractRowDimensions(text) {
  const source = compactWhitespace(text);
  const windowMatch = source.match(/Dimensions\b(.{0,900})/i);
  const window = windowMatch ? windowMatch[1] : source;
  const match = window.match(/\bWidth\s*mm\s*(\d+(?:\.\d+)?).*?\bDepth\s*mm\s*(\d+(?:\.\d+)?).*?\bHeight\s*mm\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  return {
    width_mm: parseMm(match[1], 'width'),
    depth_mm: parseMm(match[2], 'depth'),
    height_mm: parseMm(match[3], 'height'),
    door_open_90_depth_mm: null
  };
}

function extractDoorOpenDepth(text) {
  const source = compactWhitespace(text);
  const match = source.match(/\b(?:Door\s+open(?:ing)?|Open\s+door)\s+(?:depth|width)?\s*(?:mm)?\s*(\d+(?:\.\d+)?)/i);
  return match ? parseMm(match[1], 'door open depth') : null;
}

function extractDimensions(text) {
  const dimensions = extractCombinedDimensions(text) || extractRowDimensions(text);
  if (!dimensions) {
    throw new Error('Hisense parser could not find explicit net W/H/D dimensions.');
  }
  const doorOpen = extractDoorOpenDepth(text);
  return {
    ...dimensions,
    door_open_90_depth_mm: doorOpen || dimensions.door_open_90_depth_mm
  };
}

function extractClearance(text) {
  const source = compactWhitespace(text);
  const match = source.match(/Cabinet\s+clearance\s*\[?\s*Sides\s*\/\s*Back\s*\/\s*Top\s*\]?\s*(?:mm)?\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/i);
  if (!match) {
    throw new Error('Hisense parser could not find explicit cabinet clearance values.');
  }
  const side = parseMm(match[1], 'side clearance');
  return {
    left_mm: side,
    right_mm: side,
    rear_mm: parseMm(match[2], 'rear clearance'),
    top_mm: parseMm(match[3], 'top clearance')
  };
}

function extractBoolean(text, label) {
  const source = compactWhitespace(text);
  const pattern = new RegExp(`${label}\\s+(Yes|No)\\b`, 'i');
  const match = source.match(pattern);
  if (!match) return null;
  return /^yes$/i.test(match[1]);
}

function inferRequiresPlumbing(text, category) {
  if (category === 'DISHWASHER' || category === 'WASHING_MACHINE') return true;
  const water = extractBoolean(text, 'Water\\s+Dispenser');
  const ice = extractBoolean(text, 'Ice\\s+(?:Maker|Dispenser)');
  if (water != null || ice != null) return Boolean(water || ice);
  return /\bplumbed\b|\bwater\s+connection\b/i.test(text);
}

function parseHisenseText(text, options = {}) {
  const normalized = normalizeWhitespace(text);
  const target = options.target || {};
  const category = normalizeCategory(target.category || target.product?.cat);
  const sku = String(target.sku || target.model || target.product?.model || '').trim();
  if (!sku) throw new Error('Hisense parser requires target SKU.');

  assertModelSupportedByDocument(normalized, sku, options.verifiedAlias);
  const dimensions = extractDimensions(normalized);
  const clearance = extractClearance(normalized);
  const sourceUrl = options.sourceUrl || options.source_pdf_url;
  if (!sourceUrl) throw new Error('Hisense parser requires sourceUrl.');

  return {
    data: {
      brand: 'Hisense',
      sku,
      category,
      dimensions,
      clearance_requirements: clearance,
      flags: {
        requires_plumbing: inferRequiresPlumbing(normalized, category),
        ventilation_required: true,
        reversible_door: extractBoolean(normalized, 'Reversible\\s+Door')
      },
      metadata: {
        source_pdf_url: sourceUrl,
        extraction_date: options.extractionDate || new Date().toISOString(),
        confidence_score: 0.92,
        ...(options.verifiedAlias ? { verified_alias: options.verifiedAlias } : {})
      }
    }
  };
}

async function parseHisensePdf(pdfPath, options = {}) {
  const { text } = await extractText(pdfPath);
  return parseHisenseText(text, options);
}

exports.hisenseModelMatchesSku = hisenseModelMatchesSku;
exports.parseHisensePdf = parseHisensePdf;
exports.parseHisenseText = parseHisenseText;
