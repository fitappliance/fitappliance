const { extractText } = require('../2-extract-text');

const CATEGORY_MAP = {
  fridge: 'FRIDGE',
  refrigerator: 'FRIDGE',
  freezer: 'FRIDGE'
};

const SAFE_SUFFIXES = [
  'PHLH',
  'PHRH',
  'THLH',
  'THRH',
  'PL',
  'TL',
  'PH',
  'TH',
  'LH',
  'RH',
  'P',
  'T',
  'L'
];

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

function normalizeCategory(category) {
  const key = String(category || '').trim().toLowerCase();
  return CATEGORY_MAP[key] || category;
}

function stripSafeSubZeroSuffixes(value) {
  let current = normalizeSku(value);
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of SAFE_SUFFIXES) {
      if (current.length > suffix.length + 6 && current.endsWith(suffix)) {
        current = current.slice(0, -suffix.length);
        changed = true;
        break;
      }
    }
  }
  return current;
}

function subZeroModelMatchesSku(modelToken, sku) {
  const model = normalizeSku(modelToken);
  const target = normalizeSku(sku);
  if (!model || !target || model.length < 7 || target.length < 7) return false;
  if (model === target) return true;
  return stripSafeSubZeroSuffixes(model) === stripSafeSubZeroSuffixes(target);
}

function targetSku(options = {}) {
  const target = options.target || {};
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function targetCategory(options = {}) {
  const target = options.target || {};
  return normalizeCategory(target.category || target.cat || target.product?.cat);
}

function sourceUrl(options = {}) {
  return String(options.sourceUrl || options.target?.source_url || '').trim();
}

function extractDocumentModels(text) {
  const source = normalizeWhitespace(text);
  const models = new Set();
  for (const line of source.split('\n')) {
    const modelMatch = line.match(/\bModel\s+([A-Z0-9][A-Z0-9/\-. ]{4,40})\b/i);
    if (modelMatch) models.add(modelMatch[1].trim());

    const spacedHeader = line.match(/\b(I\s*C\s*B\s*[A-Z0-9\s/\-.]{6,50})\b/i);
    if (spacedHeader) models.add(spacedHeader[1].replace(/\s+/g, '').trim());
  }
  return [...models].filter((model) => normalizeSku(model).length >= 7);
}

function assertSubZeroDocument(text, sku) {
  const models = extractDocumentModels(text);
  if (models.some((model) => subZeroModelMatchesSku(model, sku))) return;
  throw new Error(`Sub-Zero parser could not verify SKU ${sku} against document models: ${models.join(', ') || 'none'}`);
}

function parseDimensions(text) {
  const source = normalizeWhitespace(text);
  const match = source.match(/\bDimensions\s+(\d+(?:\.\d+)?)\s*mmW\s*x\s*(\d+(?:\.\d+)?)\s*mmH\s*x\s*(\d+(?:\.\d+)?)\s*mmD\b/i);
  if (!match) {
    throw new Error('Sub-Zero parser requires explicit Dimensions W x H x D in millimetres.');
  }
  return {
    width_mm: Math.round(Number(match[1])),
    height_mm: Math.round(Number(match[2])),
    depth_mm: Math.round(Number(match[3])),
    door_open_90_depth_mm: null
  };
}

function hasBuiltInInstallationOpening(text) {
  const source = normalizeWhitespace(text);
  const hasInstallationType = /\b(?:STANDARD|FLUSH\s+INSET)\s+INSTALLATION\b/i.test(source);
  const hasOpening = /\bOPENING\s+HEIGHT\b/i.test(source)
    && /\bOPENING\s+WIDTH\b/i.test(source)
    && /\bOPENING\s+DEPTH\b/i.test(source);
  return hasInstallationType && hasOpening;
}

function parseBuiltInClearance(text) {
  if (!hasBuiltInInstallationOpening(text)) {
    throw new Error('Sub-Zero parser requires explicit Standard or Flush installation opening evidence.');
  }

  return {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: 0
  };
}

function inferRequiresPlumbing(text) {
  return /Plumbing\s+Supply|water\s+filter|ice\s+maker/i.test(String(text || ''));
}

function parseSubZeroText(text, options = {}) {
  const sku = targetSku(options);
  const category = targetCategory(options);
  const url = sourceUrl(options);
  if (!sku) throw new Error('Sub-Zero parser requires a SKU/model target.');
  if (!url) throw new Error('Sub-Zero parser requires sourceUrl metadata.');
  if (category !== 'FRIDGE') {
    throw new Error(`Sub-Zero parser does not support ${category || 'unknown'} yet.`);
  }

  assertSubZeroDocument(text, sku);
  const dimensions = parseDimensions(text);
  const clearance = parseBuiltInClearance(text);
  const extractionDate = options.extractionDate || new Date().toISOString();

  return {
    data: {
      brand: options.target?.brand || options.target?.product?.brand || 'Sub-Zero',
      sku,
      category,
      dimensions,
      clearance_requirements: clearance,
      flags: {
        requires_plumbing: inferRequiresPlumbing(text),
        ventilation_required: true,
        reversible_door: null
      },
      metadata: {
        source_pdf_url: url,
        extraction_date: extractionDate,
        confidence_score: 0.9,
        source_type: 'sub-zero-built-in-qrg-standard-installation'
      }
    },
    warnings: [
      'Sub-Zero built-in QRG uses manufacturer installation opening diagrams; no additional ventilation clearance is added beyond the specified built-in installation envelope.'
    ]
  };
}

async function parseSubZeroPdf(pdfPath, options = {}) {
  const { text } = await extractText(pdfPath);
  return parseSubZeroText(text, options);
}

exports.extractDocumentModels = extractDocumentModels;
exports.parseSubZeroPdf = parseSubZeroPdf;
exports.parseSubZeroText = parseSubZeroText;
exports.stripSafeSubZeroSuffixes = stripSafeSubZeroSuffixes;
exports.subZeroModelMatchesSku = subZeroModelMatchesSku;
