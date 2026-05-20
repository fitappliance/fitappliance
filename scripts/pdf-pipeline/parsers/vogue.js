const CATEGORY_MAP = {
  washing_machine: 'WASHING_MACHINE',
  'washing-machine': 'WASHING_MACHINE',
  washer: 'WASHING_MACHINE'
};

function normalizeCategory(category) {
  const key = String(category || '').trim().toLowerCase();
  return CATEGORY_MAP[key] || String(category || '').trim().toUpperCase();
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

function assertVogueDocument(text, sku, sourceUrl = '') {
  const target = normalizeSku(sku);
  if (!target || target.length < 3) throw new Error('VOGUE parser requires a SKU/model target.');
  const normalizedText = normalizeSku(text);
  if (!normalizedText.includes(target)) {
    throw new Error(`VOGUE parser could not verify SKU ${sku} against document text.`);
  }
  if (!/\bVOGUE\b/i.test(text) && !/trade-depot/i.test(sourceUrl)) {
    throw new Error('VOGUE parser requires VOGUE brand evidence.');
  }
}

function parseDimensionTuple(tuple) {
  const match = String(tuple || '').match(/(\d{3,4})\s*[x×*]\s*(\d{3,4})\s*[x×*]\s*(\d{3,4})/i);
  if (!match) return null;
  return {
    width_mm: Number(match[1]),
    depth_mm: Number(match[2]),
    height_mm: Number(match[3]),
    door_open_90_depth_mm: null
  };
}

function extractVogueDimensions(text, sku = '') {
  const normalized = normalizeWhitespace(text);
  const target = normalizeSku(sku);
  if (!target) throw new Error('VOGUE parser requires target SKU for dimensions.');

  const skuRowPattern = new RegExp(
    `${target}\\b[\\s\\S]{0,180}?((?:\\d{3,4}\\s*[x×*]\\s*\\d{3,4}\\s*[x×*]\\s*\\d{3,4})(?:[\\s\\S]{0,120}?\\d{3,4}\\s*[x×*]\\s*\\d{3,4}\\s*[x×*]\\s*\\d{3,4})?)`,
    'i'
  );
  const row = normalized.match(skuRowPattern);
  if (!row) {
    throw new Error('VOGUE parser requires explicit W/D/H dimensions on the target SKU row.');
  }

  const tuples = [...row[1].matchAll(/\d{3,4}\s*[x×*]\s*\d{3,4}\s*[x×*]\s*\d{3,4}/gi)].map((match) => match[0]);
  if (!tuples.length) {
    throw new Error('VOGUE parser requires explicit W/D/H dimensions on the target SKU row.');
  }

  const rowContext = normalized.slice(
    Math.max(0, normalized.indexOf(row[0]) - 220),
    normalized.indexOf(row[0]) + row[0].length + 220
  );
  const useIncludingDrainHose = /including\s+drain\s+hose|lncluding\s+drain\s+hose/i.test(rowContext)
    && tuples.length > 1;
  return parseDimensionTuple(useIncludingDrainHose ? tuples[1] : tuples[0]);
}

function extractVogueClearance(text) {
  const compact = normalizeWhitespace(text).replace(/\n/g, ' ');
  if (!/(installation area|sufficient ventilation)/i.test(compact)) {
    throw new Error('VOGUE parser requires explicit installation ventilation context.');
  }
  const match = compact.match(/\bW\s*>\s*(\d+(?:\.\d+)?)\s*mm\b[\s\S]{0,80}?\bL\s*>\s*(\d+(?:\.\d+)?)\s*mm\b/i);
  if (!match) {
    throw new Error('VOGUE parser requires explicit side and rear clearance.');
  }
  const side = Math.round(Number(match[1]));
  const rear = Math.round(Number(match[2]));
  return {
    top_mm: 0,
    left_mm: side,
    right_mm: side,
    rear_mm: rear
  };
}

function parseVogueText(text, options = {}) {
  const sku = getTargetSku(options);
  const category = getTargetCategory(options);
  const sourceUrl = options.sourceUrl || '';
  const normalized = normalizeWhitespace(text);

  if (category !== 'WASHING_MACHINE') {
    throw new Error('VOGUE parser currently only supports explicit washing-machine manuals.');
  }
  assertVogueDocument(normalized, sku, sourceUrl);

  return {
    data: {
      brand: 'VOGUE',
      sku,
      category,
      dimensions: extractVogueDimensions(normalized, sku),
      clearance_requirements: extractVogueClearance(normalized),
      flags: {
        requires_plumbing: true,
        ventilation_required: true,
        reversible_door: null
      },
      metadata: {
        source_pdf_url: sourceUrl,
        extraction_date: options.extractionDate || new Date().toISOString(),
        confidence_score: 0.88,
        source_type: 'retailer_manual'
      }
    }
  };
}

exports.extractVogueClearance = extractVogueClearance;
exports.extractVogueDimensions = extractVogueDimensions;
exports.parseVogueText = parseVogueText;
