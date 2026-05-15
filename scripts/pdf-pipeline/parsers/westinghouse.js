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

function normalizeSkuPattern(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9*]+/g, '');
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardSkuMatchesToken(rawSku, token) {
  const pattern = normalizeSkuPattern(rawSku);
  const normalizedToken = normalizeSku(token);
  if (!pattern.includes('*') || !normalizedToken || normalizedToken.length < 5) return false;
  const fixedLength = pattern.replace(/\*/g, '').length;
  if (fixedLength < 5) return false;
  const regex = new RegExp(`^${pattern.split('*').map(escapeRegex).join('[A-Z0-9]*')}$`);
  return regex.test(normalizedToken);
}

function parseMm(value, label) {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Unable to parse Westinghouse ${label} from "${value}"`);
  return Math.round(Number(match[1]));
}

function splitWestinghouseModelTokens(value) {
  const source = String(value || '').trim().toUpperCase();
  if (source.includes('/')) {
    const parts = source.split('/').map((part) => part.trim()).filter(Boolean);
    const first = normalizeSku(parts[0]);
    const firstParts = first.match(/^([A-Z]+\d+)([A-Z0-9]*)$/);
    if (firstParts && parts.length > 1) {
      const prefix = firstParts[1];
      const suffixes = [firstParts[2], ...parts.slice(1).map((part) => normalizeSku(part))]
        .filter((suffix) => suffix && suffix.length <= 4);
      return [...new Set(suffixes.map((suffix) => normalizeSku(`${prefix}${suffix}`)).filter(Boolean))];
    }
  }
  return [normalizeSku(source)].filter(Boolean);
}

function westinghouseModelMatchesSku(modelToken, sku) {
  const target = normalizeSku(sku);
  const targetPattern = normalizeSkuPattern(sku);
  if ((!target || target.length < 5) && !targetPattern.includes('*')) return false;
  return splitWestinghouseModelTokens(modelToken).some((token) => {
    if (!token || token.length < 5) return false;
    if (token === target) return true;
    if (wildcardSkuMatchesToken(targetPattern, token)) return true;
    const noHinge = token.replace(/[LRX]$/, '');
    if (wildcardSkuMatchesToken(targetPattern, noHinge)) return true;
    return noHinge.length >= 5 && noHinge === target;
  });
}

function getTargetSku(options = {}) {
  const target = options.target || {};
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function getTargetCategory(options = {}) {
  const target = options.target || {};
  return normalizeCategory(target.category || target.cat || target.product?.cat);
}

function assertWestinghouseDocument(text, sku) {
  const source = normalizeWhitespace(text);
  const tokens = [...source.matchAll(/\bW[A-Z]{1,4}\d[A-Z0-9]*(?:\s*\/\s*[A-Z0-9]{1,4})*(?:-[LRX])?\b/g)]
    .map((match) => match[0]);
  if (tokens.some((token) => westinghouseModelMatchesSku(token, sku))) return;
  throw new Error(`Westinghouse parser could not verify SKU ${sku} against document model tokens.`);
}

function findMatchingNumericRow(text, sku, expectedNumbers) {
  const lines = normalizeWhitespace(text).split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const tokens = [...line.matchAll(/\bW[A-Z]{1,4}\d[A-Z0-9]*(?:\s*\/\s*[A-Z0-9]{1,4})*(?:-[LRX])?\b/g)]
      .map((match) => match[0]);
    if (!tokens.some((token) => westinghouseModelMatchesSku(token, sku))) continue;
    const numbers = [...line.matchAll(/\b\d+(?:\.\d+)?\b/g)].map((match) => Number(match[0]));
    if (numbers.length >= expectedNumbers) {
      return { line, numbers };
    }
  }
  return null;
}

function extractWestinghouseDimensions(text, sku, category) {
  if (category !== 'FRIDGE') {
    throw new Error(`Westinghouse ${category || 'unknown'} parser requires explicit airspace and dimension rows.`);
  }

  const row = findMatchingNumericRow(text, sku, 4);
  if (!row) {
    throw new Error(`Westinghouse parser could not find a dimensions row for ${sku}.`);
  }
  const [height, width, depth, doorOpen] = row.numbers;
  return {
    height_mm: parseMm(height, 'height'),
    width_mm: parseMm(width, 'width'),
    depth_mm: parseMm(depth, 'depth'),
    door_open_90_depth_mm: parseMm(doorOpen, 'door open depth')
  };
}

function extractWestinghouseClearance(text, sku) {
  const normalized = normalizeWhitespace(text);
  const airspaceIndex = normalized.search(/\bAirspace\b/i);
  if (airspaceIndex < 0) {
    throw new Error('Westinghouse parser requires an explicit Airspace clearance table.');
  }
  const airspaceWindow = normalized.slice(airspaceIndex, airspaceIndex + 2500);
  const row = findMatchingNumericRow(airspaceWindow, sku, 3);
  if (!row) {
    throw new Error(`Westinghouse parser could not find an Airspace clearance row for ${sku}.`);
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

function parseWestinghouseText(text, options = {}) {
  const sku = getTargetSku(options);
  const category = getTargetCategory(options);
  const sourceUrl = options.sourceUrl || options.target?.source_url;
  if (!sku) throw new Error('Westinghouse parser requires a SKU/model target.');
  if (!sourceUrl) throw new Error('Westinghouse parser requires sourceUrl metadata.');
  if (!category) throw new Error('Westinghouse parser requires category metadata.');

  assertWestinghouseDocument(text, sku);
  const dimensions = extractWestinghouseDimensions(text, sku, category);
  const clearance = extractWestinghouseClearance(text, sku);
  const extractionDate = options.extractionDate || new Date().toISOString();

  return {
    data: {
      brand: options.target?.brand || options.target?.product?.brand || 'Westinghouse',
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
        confidence_score: 0.9
      }
    },
    warnings: []
  };
}

async function parseWestinghousePdf(pdfPath, options = {}) {
  const { text } = await extractText(pdfPath);
  return parseWestinghouseText(text, options);
}

exports.normalizeSku = normalizeSku;
exports.parseWestinghousePdf = parseWestinghousePdf;
exports.parseWestinghouseText = parseWestinghouseText;
exports.splitWestinghouseModelTokens = splitWestinghouseModelTokens;
exports.westinghouseModelMatchesSku = westinghouseModelMatchesSku;
