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

function assertBekoDocument(text, sku, sourceUrl = '', verifiedAlias = '') {
  const target = normalizeSku(sku);
  const alias = normalizeSku(verifiedAlias);
  if (!target || target.length < 3) throw new Error('Beko parser requires a SKU/model target.');
  const normalizedText = normalizeSku(text);
  const normalizedUrl = normalizeSku(sourceUrl);
  const candidates = [target, alias].filter(Boolean);
  if (candidates.some((candidate) => normalizedText.includes(candidate) || normalizedUrl.includes(candidate))) return;
  throw new Error(`Beko parser could not verify SKU ${sku} against document text or official source URL.`);
}

function parseNumericValue(value, label) {
  const match = String(value || '').match(/\d+(?:\.\d+)?/);
  if (!match) throw new Error(`Unable to parse Beko ${label} from "${value}"`);
  return Number(match[0]);
}

function toMillimetres(value, unit = '') {
  const numeric = Number(value);
  const normalizedUnit = String(unit || '').toLowerCase();
  if (normalizedUnit.includes('cm')) return Math.round(numeric * 10);
  if (numeric > 0 && numeric < 100) return Math.round(numeric * 10);
  return Math.round(numeric);
}

function valueAfterLabel(lines, labelPattern) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const sameLine = line.match(new RegExp(`${labelPattern.source}\\s*(?:\\[Input\\]|\\([^)]*\\))?\\s*[:\\-]?\\s*(\\d+(?:\\.\\d+)?)\\s*(cm|mm)?`, 'i'));
    if (sameLine) {
      return {
        value: parseNumericValue(sameLine[1], sameLine[0]),
        unit: sameLine[2] || line.match(/\((cm|mm)\)/i)?.[1] || ''
      };
    }

    if (!labelPattern.test(line)) continue;
    const unitFromLabel = line.match(/\((cm|mm)\)/i)?.[1] || '';
    for (let lookahead = 1; lookahead <= 4 && index + lookahead < lines.length; lookahead += 1) {
      const candidate = lines[index + lookahead];
      const valueMatch = candidate.match(/(\d+(?:\.\d+)?)\s*(cm|mm)?/i);
      if (valueMatch) {
        return {
          value: parseNumericValue(valueMatch[1], labelPattern.source),
          unit: valueMatch[2] || unitFromLabel
        };
      }
    }
  }
  return null;
}

function extractDimensions(text) {
  const normalized = normalizeWhitespace(text);
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);

  const height = valueAfterLabel(lines, /^Height\b/i);
  const width = valueAfterLabel(lines, /^Width\b/i);
  const depth = valueAfterLabel(lines, /^Depth\b/i);

  if (!height || !width || !depth) {
    throw new Error('Beko parser requires explicit Height, Width and Depth rows.');
  }

  return {
    height_mm: toMillimetres(height.value, height.unit),
    width_mm: toMillimetres(width.value, width.unit),
    depth_mm: toMillimetres(depth.value, depth.unit),
    door_open_90_depth_mm: null
  };
}

function inferZeroClearance(text) {
  const source = normalizeWhitespace(text);
  if (/installation\s+type\s*(?:\[Input\])?\s*freestanding/i.test(source)) return true;
  if (/\bfreestanding\b/i.test(source)) return true;
  if (/\bbuilt[-\s]?in\s*(?:\[Input\])?\s*(?:no|none|-)/i.test(source)) return true;
  if (/\bBeko\b/i.test(source) && /Dimensions\s*&\s*Weight/i.test(source)) return true;
  return false;
}

function parseBekoText(text, options = {}) {
  const sku = getTargetSku(options);
  const category = getTargetCategory(options);
  const sourceUrl = options.sourceUrl || '';
  const verifiedAlias = options.verifiedAlias || '';
  const normalized = normalizeWhitespace(text);

  if (!/\bBeko\b/i.test(normalized) && !/beko/i.test(sourceUrl)) {
    throw new Error('Beko parser requires Beko brand evidence.');
  }
  assertBekoDocument(normalized, sku, sourceUrl, verifiedAlias);

  const dimensions = extractDimensions(normalized);
  if (!inferZeroClearance(normalized)) {
    throw new Error('Beko parser requires explicit freestanding/built-in context before accepting zero clearance.');
  }

  return {
    data: {
      brand: 'Beko',
      sku,
      category,
      dimensions,
      clearance_requirements: {
        top_mm: 0,
        left_mm: 0,
        right_mm: 0,
        rear_mm: 0
      },
      flags: {
        requires_plumbing: category === 'DISHWASHER' || category === 'WASHING_MACHINE',
        ventilation_required: true,
        reversible_door: null
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
exports.parseBekoText = parseBekoText;
