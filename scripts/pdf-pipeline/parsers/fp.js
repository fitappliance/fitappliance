const { extractText } = require('../2-extract-text');
const legacy = require('./fisher-paykel');

const CATEGORY_MAP = {
  fridge: 'FRIDGE',
  refrigerator: 'FRIDGE',
  dishwasher: 'DISHWASHER',
  oven: 'OVEN',
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

function roundMm(value) {
  return Math.round(Number(value));
}

function findMm(text, pattern) {
  const match = String(text || '').match(pattern);
  return match ? roundMm(match[1]) : null;
}

function dimensionBlock(section) {
  const text = String(section || '');
  const height = findMm(text, /(?:Overall\s+)?height(?:\s+of\s+(?:product|appliance|fridge|oven|chassis))?\s+(\d+(?:\.\d+)?)/i);
  const width = findMm(text, /(?:Overall\s+)?width(?:\s+of\s+(?:product|appliance|fridge|oven|chassis))?\s+(\d+(?:\.\d+)?)/i);
  const depth = findMm(text, /(?:Overall\s+)?depth(?:\s+of\s+(?:product|appliance|fridge|oven|chassis))?(?:\s*\([^)]*\))?\s+(\d+(?:\.\d+)?)/i);

  if (!height || !width || !depth) return null;
  return {
    height_mm: height,
    width_mm: width,
    depth_mm: depth,
    door_open_90_depth_mm: null
  };
}

function sectionBetween(text, startPattern, endPattern) {
  const source = String(text || '');
  const start = source.search(startPattern);
  if (start < 0) return '';
  const afterStart = source.slice(start);
  const end = afterStart.slice(1).search(endPattern);
  return end < 0 ? afterStart : afterStart.slice(0, end + 1);
}

function extractFpFitOptions(text) {
  const source = String(text || '');
  if (!/\bflush\s+fit\b/i.test(source) || !/\bproud\s+fit\b/i.test(source)) return null;

  const flushSection = sectionBetween(source, /\bflush\s+fit\b/i, /\bproud\s+fit\b/i);
  const proudSection = sectionBetween(source, /\bproud\s+fit\b/i, /\b(?:minimum\s+air|clearance|ventilation|features|specifications)\b/i);
  const flushDimensions = dimensionBlock(flushSection);
  const proudDimensions = dimensionBlock(proudSection);
  if (!flushDimensions && !proudDimensions) return null;

  return {
    selected: flushDimensions ? 'flush_fit' : 'proud_fit',
    flush_fit: flushDimensions ? { dimensions: flushDimensions } : null,
    proud_fit: proudDimensions ? { dimensions: proudDimensions } : null
  };
}

function extractExplicitClearance(text) {
  const source = String(text || '');
  const rear = findMm(source, /Minimum\s+air\s+clearance\s*-\s*at\s+rear\s+(\d+(?:\.\d+)?)\s*mm/i)
    ?? findMm(source, /\brear\s+clearance\s+(\d+(?:\.\d+)?)\s*mm/i);
  const side = findMm(source, /Minimum\s+air\s+clearance\s*-\s*each\s+side\s+(\d+(?:\.\d+)?)\s*mm/i)
    ?? findMm(source, /\bside\s+clearance\s+(\d+(?:\.\d+)?)\s*mm/i);
  const top = findMm(source, /Minimum\s+air\s+clearance\s*-\s*on\s+top\s+(\d+(?:\.\d+)?)\s*mm/i)
    ?? findMm(source, /\btop\s+clearance\s+(\d+(?:\.\d+)?)\s*mm/i);

  if (rear == null && side == null && top == null) return null;
  return {
    top_mm: top ?? 0,
    left_mm: side ?? 0,
    right_mm: side ?? 0,
    rear_mm: rear ?? 0
  };
}

function inferRequiresPlumbing(text, category) {
  if (category === 'DISHWASHER' || category === 'WASHING_MACHINE') return true;
  if (category === 'FRIDGE') return /ice\s+maker|water\s+filter|water\s+connection|plumbed/i.test(String(text || ''));
  return false;
}

function inferVentilationRequired(category) {
  return category === 'FRIDGE' || category === 'OVEN' || category === 'DRYER';
}

function parseFpFlushProudText(text, options = {}) {
  const fitOptions = extractFpFitOptions(text);
  if (!fitOptions) return null;

  const selected = fitOptions[fitOptions.selected];
  const clearance = extractExplicitClearance(text);
  if (!clearance) {
    throw new Error('Fisher & Paykel Flush/Proud fit document did not include explicit ventilation clearance.');
  }

  const target = options.target || {};
  const category = normalizeCategory(firstNonBlank(target.category, target.cat, target.product?.cat, 'fridge'));
  const brand = firstNonBlank(target.brand, target.product?.brand, 'Fisher & Paykel');
  const sku = firstNonBlank(target.sku, target.model, target.product?.model, target.product?.sku);
  const sourceUrl = firstNonBlank(options.sourceUrl, target.source_url);
  const extractionDate = firstNonBlank(options.extractionDate, new Date().toISOString());

  if (!sku) throw new Error('Fisher & Paykel parser requires a SKU/model target.');
  if (!sourceUrl) throw new Error('Fisher & Paykel parser requires sourceUrl metadata.');

  return {
    data: {
      brand,
      sku,
      category,
      dimensions: selected.dimensions,
      clearance_requirements: clearance,
      flags: {
        requires_plumbing: inferRequiresPlumbing(text, category),
        ventilation_required: true,
        reversible_door: null
      },
      metadata: {
        source_pdf_url: sourceUrl,
        extraction_date: extractionDate,
        confidence_score: 0.9
      }
    },
    fitOptions,
    warnings: ['Selected Fisher & Paykel Flush Fit dimensions over Proud Fit as safe default.']
  };
}

function parseFpOvenDataSheet(text, options = {}) {
  const source = String(text || '');
  const target = options.target || {};
  const requestedCategory = normalizeCategory(firstNonBlank(target.category, target.cat, target.product?.cat));
  if (requestedCategory !== 'OVEN' && !/\b600mm\s+Oven\b|\bBuilt[-\s]?In\s+Oven\b|\bOverall\s+height\s+of\s+oven\b/i.test(source)) {
    return null;
  }

  const height = findMm(source, /\bF\s+Height\s+of\s+chassis\s+(\d+(?:\.\d+)?)/i)
    ?? findMm(source, /Height\s+of\s+chassis\s+(\d+(?:\.\d+)?)/i);
  const width = findMm(source, /\bG\s+Width\s+of\s+chassis\s+(\d+(?:\.\d+)?)/i)
    ?? findMm(source, /Width\s+of\s+chassis\s+(\d+(?:\.\d+)?)/i);
  const depth = findMm(source, /\bE\s+Depth\s+of\s+chassis\s+(\d+(?:\.\d+)?)/i)
    ?? findMm(source, /Depth\s+of\s+chassis\s+(\d+(?:\.\d+)?)/i);
  const doorOpen = findMm(source, /\bq\s+Depth\s+of\s+door\s+\(open\)[^\n]*\s+(\d+(?:\.\d+)?)/i)
    ?? findMm(source, /Depth\s+of\s+door\s+\(open\)[^\n]*\s+(\d+(?:\.\d+)?)/i);

  const cavityHeight = findMm(source, /Minimum\s+inside\s+height\s+of\s+cavity:?\s+(\d+(?:\.\d+)?)/i);
  const cavityWidth = findMm(source, /Minimum\s+inside\s+width\s+of\s+cavity\s+(\d+(?:\.\d+)?)/i);
  const cavityDepth = findMm(source, /Minimum\s+inside\s+depth\s+of\s+cavity\s+(\d+(?:\.\d+)?)/i);

  if (!height || !width || !depth) return null;
  if (!cavityHeight || !cavityWidth || !cavityDepth) {
    throw new Error('Fisher & Paykel oven data sheet did not include explicit cavity clearance dimensions.');
  }

  const top = cavityHeight - height;
  const sideTotal = cavityWidth - width;
  const rear = cavityDepth - depth;
  if (top < 0 || sideTotal < 0 || rear < 0) {
    throw new Error('Fisher & Paykel oven cavity dimensions are smaller than chassis dimensions.');
  }

  const brand = firstNonBlank(target.brand, target.product?.brand, 'Fisher & Paykel');
  const sku = firstNonBlank(target.sku, target.model, target.product?.model, target.product?.sku);
  const sourceUrl = firstNonBlank(options.sourceUrl, target.source_url);
  const extractionDate = firstNonBlank(options.extractionDate, new Date().toISOString());
  if (!sku) throw new Error('Fisher & Paykel parser requires a SKU/model target.');
  if (!sourceUrl) throw new Error('Fisher & Paykel parser requires sourceUrl metadata.');

  return {
    data: {
      brand,
      sku,
      category: 'OVEN',
      dimensions: {
        height_mm: height,
        width_mm: width,
        depth_mm: depth,
        door_open_90_depth_mm: doorOpen || null
      },
      clearance_requirements: {
        top_mm: Math.round(top),
        left_mm: Math.round(sideTotal / 2),
        right_mm: Math.round(sideTotal / 2),
        rear_mm: Math.round(rear)
      },
      flags: {
        requires_plumbing: false,
        ventilation_required: true,
        reversible_door: null
      },
      metadata: {
        source_pdf_url: sourceUrl,
        extraction_date: extractionDate,
        confidence_score: 0.9
      }
    },
    warnings: ['Parsed Fisher & Paykel built-in oven chassis dimensions and cavity-derived clearances.']
  };
}

function parseFpText(text, options = {}) {
  const flushProud = parseFpFlushProudText(text, options);
  if (flushProud) return flushProud;

  const oven = parseFpOvenDataSheet(text, options);
  if (oven) return oven;

  return legacy.parseFisherPaykelText(text, options);
}

async function parseFpPdf(pdfPath, options = {}) {
  const { text } = await extractText(pdfPath);
  return parseFpText(text, options);
}

exports.extractFpFitOptions = extractFpFitOptions;
exports.parseFpText = parseFpText;
exports.parseFpPdf = parseFpPdf;
exports.parseFisherPaykelText = parseFpText;
exports.parseFisherPaykelPdf = parseFpPdf;
