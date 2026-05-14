const { extractText } = require('../2-extract-text');

const CATEGORY_MAP = {
  fridge: 'FRIDGE',
  refrigerator: 'FRIDGE',
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

function firstNonBlank(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
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
  if (!match) throw new Error(`Unable to parse LG ${label} from "${value}"`);
  return Math.round(Number(match[1]));
}

function normalizeModelToken(value, { keepWildcard = false } = {}) {
  const allowed = keepWildcard ? /[^A-Z0-9*]+/g : /[^A-Z0-9]+/g;
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\/AU$/i, '')
    .replace(/\/SA$/i, '')
    .replace(allowed, '');
}

function wildcardPatternMatches(pattern, target) {
  const source = normalizeModelToken(pattern, { keepWildcard: true });
  const sku = normalizeModelToken(target);
  if (!source.includes('*') || !sku) return false;
  const concrete = source.split('*').filter(Boolean);
  const concreteLength = concrete.join('').length;
  if (!concrete.length || concreteLength < 4 || concrete[0].length < 3) return false;

  let cursor = 0;
  for (const part of concrete) {
    const foundAt = sku.indexOf(part, cursor);
    if (foundAt < cursor) return false;
    if (cursor === 0 && foundAt !== 0) return false;
    cursor = foundAt + part.length;
  }
  return true;
}

function lgModelMatchesSku(modelToken, sku) {
  const source = normalizeModelToken(modelToken, { keepWildcard: true });
  const target = normalizeModelToken(sku);
  if (!source || !target) return false;
  if (source === target) return true;
  if (wildcardPatternMatches(source, target)) return true;
  return Boolean(
    !source.includes('*')
    && source.length >= 6
    && /^[A-Z]{2,}\d/.test(source)
    && target.startsWith(source)
    && target.length - source.length <= 5
  );
}

function extractModelTokens(text) {
  return [...String(text || '').toUpperCase().matchAll(/[A-Z]{2,}[A-Z0-9*\/-]*\d[A-Z0-9*\/-]*/g)]
    .map((match) => normalizeModelToken(match[0], { keepWildcard: true }))
    .filter((token) => token.length >= 5);
}

function assertModelSupportedByDocument(text, sku, verifiedAlias = '') {
  if (verifiedAlias && lgModelMatchesSku(verifiedAlias, sku)) return;
  const tokens = extractModelTokens(text);
  if (tokens.some((token) => lgModelMatchesSku(token, sku))) return;
  throw new Error(`LG parser could not verify SKU ${sku} against document model tokens.`);
}

function inferCategoryFromText(text) {
  const head = String(text || '').slice(0, 5000);
  const signals = [
    ['DISHWASHER', /\bDishwasher\b/i],
    ['DRYER', /\bHeat\s+Pump\s+Dryer\b|\bDryer\b/i],
    ['WASHING_MACHINE', /\bWashTower\b|\bWashing\s+Machine\b|\bFront\s+Load(?:er)?\b|\bWasher\b/i],
    ['FRIDGE', /\bRefrigerator\b|\bFridge\b|\bFreezer\b/i]
  ].map(([category, pattern]) => {
    const match = head.match(pattern);
    return match ? { category, index: match.index } : null;
  }).filter(Boolean);
  signals.sort((a, b) => a.index - b.index);
  return signals[0]?.category || '';
}

function categoriesCompatible(targetCategory, inferredCategory) {
  return !targetCategory || !inferredCategory || targetCategory === inferredCategory;
}

function findSpecInstallationWindow(text) {
  const source = normalizeWhitespace(text);
  const anchors = [...source.matchAll(/\b(?:Dimensions and Clearances|Parts and Specifications|Specifications|Dimension\(mm\)|INSTALLATION|Installation Location Requirements)\b/gi)];
  if (!anchors.length) return source;

  const candidates = anchors.map((match) => {
    const start = Math.max(0, match.index - 900);
    const window = source.slice(start, Math.min(source.length, start + 16000));
    const flat = compactWhitespace(window);
    let score = 0;
    if (/Dimension\(mm\)|Dimension\s*\(Width\s*X\s*Height\s*X\s*Depth\)|Size\s*\(mm\)/i.test(flat)) score += 5;
    if (/\bW\s+\d+.*?\bD\s+\d+.*?\bH\s+\d+/i.test(flat)) score += 4;
    if (/Type\s*1\s*Type\s*2|Width\s*X\s*Height\s*X\s*Depth/i.test(flat)) score += 4;
    if (/clearance|clearances|between\s+the\s+top|behind\s+the\s+appliance|adjacent\s+cabinet/i.test(flat)) score += 3;
    if (/\bModel\b/i.test(flat)) score += 1;
    return { score, start, window };
  });

  candidates.sort((a, b) => b.score - a.score || a.start - b.start);
  return candidates[0].window;
}

function extractDimensionBlocks(text) {
  const source = compactWhitespace(text);
  return [...source.matchAll(/\bW\s+(\d+(?:\.\d+)?)\s+D\s+(\d+(?:\.\d+)?)\s+D["”']?\s+(\d+(?:\.\d+)?)\s+H\s+(\d+(?:\.\d+)?)(?:\s+D['’]\s+(\d+(?:\.\d+)?))?/gi)]
    .map((match) => ({
      width: match[1],
      depth: match[2],
      doorOpen: match[3],
      height: match[4],
      alternateDepth: match[5] || null
    }));
}

function extractLgFridgeDimensions(text, sku) {
  const window = findSpecInstallationWindow(text);
  const source = compactWhitespace(window);
  const table = source.match(/\bSize\s*\(mm\)\s*-?\s*Type\s+1\s+Type\s+2\s+A\s+(\d+)\s+(\d+)\s+B\s+(\d+)\s+(\d+)\s+C\s+(\d+)\s+(\d+)\s+D\s+(\d+)\s+(\d+)\s+E\s+(\d+)\s+(\d+)\s+F\s+(\d+)\s+(\d+)\s+G\s+(\d+)\s+(\d+)\s+H\s+(\d+)\s+(\d+)/i);
  if (!table) {
    throw new Error('LG fridge parser could not find the Type 1 / Type 2 dimensions table.');
  }

  const normalizedSku = normalizeModelToken(sku);
  const columnOffset = /910/.test(normalizedSku) ? 0 : 1;
  const pick = (rowIndex) => parseMm(table[1 + (rowIndex * 2) + columnOffset], `fridge table row ${rowIndex}`);
  return {
    width_mm: pick(0),
    height_mm: pick(1),
    depth_mm: pick(2),
    door_open_90_depth_mm: pick(7)
  };
}

function findDimensionGroupIndex(window, sku) {
  const lines = normalizeWhitespace(window)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const dimensionIndex = lines.findIndex((line) => /Dimension\(mm\)/i.test(line));
  if (dimensionIndex >= 0) {
    const modelRows = lines
      .slice(dimensionIndex + 1, dimensionIndex + 8)
      .filter((line) => extractModelTokens(line).some((token) => /^[A-Z]/.test(token)));
    if (modelRows.length > 1) {
      const matched = modelRows.findIndex((line) => extractModelTokens(line).some((token) => lgModelMatchesSku(token, sku)));
      if (matched >= 0) return matched;
    }
  }
  return 0;
}

function extractLgWasherLikeDimensions(text, sku, category) {
  const window = findSpecInstallationWindow(text);
  const blocks = extractDimensionBlocks(window);
  if (!blocks.length) {
    throw new Error(`LG ${category.toLowerCase()} parser could not find a W/H/D dimensions block.`);
  }

  const matchedGroupIndex = findDimensionGroupIndex(window, sku);
  const block = blocks[Math.max(0, Math.min(blocks.length - 1, matchedGroupIndex))];
  return {
    width_mm: parseMm(block.width, `${category} width`),
    height_mm: parseMm(block.height, `${category} height`),
    depth_mm: parseMm(block.depth, `${category} depth`),
    door_open_90_depth_mm: parseMm(block.doorOpen, `${category} door open depth`)
  };
}

function extractLgDishwasherDimensions(text) {
  const window = findSpecInstallationWindow(text);
  const source = compactWhitespace(window);
  const match = source.match(/\bDimension\s*\(Width\s*X\s*Height\s*X\s*Depth\)\s+(\d+(?:\.\d+)?)\s*mm\s*X\s*(\d+(?:\.\d+)?)\s*mm\s*X\s*(\d+(?:\.\d+)?)\s*mm/i);
  if (!match) {
    throw new Error('LG dishwasher parser could not find Width X Height X Depth dimensions.');
  }
  return {
    width_mm: parseMm(match[1], 'dishwasher width'),
    height_mm: parseMm(match[2], 'dishwasher height'),
    depth_mm: parseMm(match[3], 'dishwasher depth'),
    door_open_90_depth_mm: null
  };
}

function extractLgDimensions(text, category, sku) {
  if (category === 'FRIDGE') return extractLgFridgeDimensions(text, sku);
  if (category === 'WASHING_MACHINE') return extractLgWasherLikeDimensions(text, sku, category);
  if (category === 'DRYER') return extractLgWasherLikeDimensions(text, sku, category);
  if (category === 'DISHWASHER') return extractLgDishwasherDimensions(text);
  throw new Error(`Unsupported LG category: ${category}`);
}

function extractLgFridgeClearance(text) {
  const source = compactWhitespace(text);
  const rear = source.match(/Allow\s+over\s+(\d+(?:\.\d+)?)\s*mm\s+of\s+clearance\s+between\s+the\s+back\s+of\s+the\s+appliance\s+and\s+the\s+wall/i)?.[1];
  if (!rear) {
    throw new Error('LG fridge parser requires an explicit rear clearance statement.');
  }
  return {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: parseMm(rear, 'fridge rear clearance')
  };
}

function extractLgWasherLikeClearance(text, category) {
  const source = compactWhitespace(text);
  const sideRear = source.match(/(?:minimum\s+)?clearances\s+of\s+at\s+least\s+(\d+(?:\.\d+)?)\s*mm\s+at\s+the\s+sides\s+and\s+(\d+(?:\.\d+)?)\s*mm\s+behind\s+the\s+appliance/i);
  const top = source.match(/(?:clearance\s+of\s+approximately|Keep\s+at\s+least)\s+(\d+(?:\.\d+)?)\s*mm\s+(?:is\s+left\s+)?between\s+the\s+top\s+of\s+the\s+appliance/i)?.[1];

  if (category === 'WASHING_MACHINE') {
    if (!sideRear) {
      throw new Error('LG washing machine parser requires explicit side and rear clearance figures.');
    }
    return {
      top_mm: top ? parseMm(top, 'washing machine top clearance') : 0,
      left_mm: parseMm(sideRear[1], 'washing machine side clearance'),
      right_mm: parseMm(sideRear[1], 'washing machine side clearance'),
      rear_mm: parseMm(sideRear[2], 'washing machine rear clearance')
    };
  }

  if (category === 'DRYER') {
    if (!top) {
      throw new Error('LG dryer parser requires explicit top clearance wording.');
    }
    return {
      top_mm: parseMm(top, 'dryer top clearance'),
      left_mm: 0,
      right_mm: 0,
      rear_mm: 0
    };
  }

  throw new Error(`Unsupported LG clearance category: ${category}`);
}

function extractLgDishwasherClearance(text) {
  const side = compactWhitespace(text).match(/allow\s+minimum\s+clearance\s+of\s+at\s+least\s+(\d+(?:\.\d+)?)\s*mm\s+between\s+the\s+appliance\s+and\s+an\s+adjacent\s+cabinet\s+or\s+wall/i)?.[1];
  if (!side) {
    throw new Error('LG dishwasher parser requires explicit cabinet/wall clearance wording.');
  }
  return {
    top_mm: 0,
    left_mm: parseMm(side, 'dishwasher side clearance'),
    right_mm: parseMm(side, 'dishwasher side clearance'),
    rear_mm: 0
  };
}

function extractLgClearance(text, category) {
  if (category === 'FRIDGE') return extractLgFridgeClearance(text);
  if (category === 'WASHING_MACHINE' || category === 'DRYER') return extractLgWasherLikeClearance(text, category);
  if (category === 'DISHWASHER') return extractLgDishwasherClearance(text);
  throw new Error(`Unsupported LG category: ${category}`);
}

function inferRequiresPlumbing(text, category) {
  if (category === 'DISHWASHER' || category === 'WASHING_MACHINE') return true;
  if (category === 'FRIDGE') return /plumbed|water\s+line|water\s+supply|water\s+filter|icemaker/i.test(text);
  if (category === 'DRYER') return /drain\s+hose|condens(?:ing|ate)|water\s+collection\s+tank/i.test(text);
  return false;
}

function inferVentilationRequired(text, category) {
  if (category === 'FRIDGE') return true;
  if (category === 'DRYER') return false;
  return false;
}

function inferReversibleDoor(text) {
  if (/Door\s+reversal|reversible\s+door/i.test(text)) return true;
  return null;
}

function confidenceFor(category) {
  if (category === 'FRIDGE') return 0.9;
  return 0.88;
}

function parseLgText(text, options = {}) {
  const target = options.target || {};
  const targetCategory = normalizeCategory(firstNonBlank(target.category, target.cat, target.product?.cat));
  const inferredCategory = inferCategoryFromText(text);
  if (!categoriesCompatible(targetCategory, inferredCategory)) {
    throw new Error(`LG category mismatch: target ${targetCategory} but document text indicates ${inferredCategory}.`);
  }
  const category = normalizeCategory(firstNonBlank(targetCategory, inferredCategory));
  if (!category || !Object.values(CATEGORY_MAP).includes(category)) {
    throw new Error(`Unsupported LG category: ${category || 'missing'}`);
  }

  const sku = firstNonBlank(target.sku, target.model, target.product?.model, target.product?.sku);
  const brand = firstNonBlank(target.brand, target.product?.brand, 'LG');
  const sourceUrl = firstNonBlank(options.sourceUrl, target.source_url);
  const extractionDate = firstNonBlank(options.extractionDate, new Date().toISOString());
  const verifiedAlias = firstNonBlank(options.verifiedAlias, target.verified_alias);
  if (!sku) throw new Error('LG parser requires a SKU/model target.');
  if (!sourceUrl) throw new Error('LG parser requires sourceUrl metadata.');

  const boundedText = findSpecInstallationWindow(text);
  assertModelSupportedByDocument(boundedText, sku, verifiedAlias);
  const dimensions = extractLgDimensions(boundedText, category, sku);
  const clearance = extractLgClearance(boundedText, category);

  return {
    data: {
      brand,
      sku,
      category,
      dimensions,
      clearance_requirements: clearance,
      flags: {
        requires_plumbing: inferRequiresPlumbing(text, category),
        ventilation_required: inferVentilationRequired(text, category),
        reversible_door: inferReversibleDoor(text)
      },
      metadata: {
        source_pdf_url: sourceUrl,
        extraction_date: extractionDate,
        confidence_score: confidenceFor(category),
        ...(verifiedAlias ? { verified_alias: verifiedAlias } : {})
      }
    },
    warnings: []
  };
}

async function parseLgPdf(pdfPath, options = {}) {
  const { text } = await extractText(pdfPath);
  return parseLgText(text, options);
}

exports.extractLgClearance = extractLgClearance;
exports.extractLgDimensions = extractLgDimensions;
exports.lgModelMatchesSku = lgModelMatchesSku;
exports.parseLgPdf = parseLgPdf;
exports.parseLgText = parseLgText;
