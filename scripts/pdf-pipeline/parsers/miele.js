const { extractText } = require('../2-extract-text');

const CATEGORY_MAP = {
  fridge: 'FRIDGE',
  refrigerator: 'FRIDGE',
  dishwasher: 'DISHWASHER',
  dryer: 'DRYER',
  washing_machine: 'WASHING_MACHINE',
  washer: 'WASHING_MACHINE',
  washtower_combo: 'WASHTOWER_COMBO'
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

function hasWildcard(value) {
  return /X{2,}|\*{2,}/i.test(String(value || ''));
}

function mieleIdentityAliases(value) {
  const source = String(value || '').trim();
  const aliases = new Set([normalizeSku(source)]);
  if (/\bedt\s*\/\s*(?:bs|cs)\b/i.test(source)) {
    aliases.add(normalizeSku(source.replace(/\bedt\s*\/\s*(bs|cs)\b/ig, '$1')));
  }
  return [...aliases].filter(Boolean);
}

function mieleModelMatchesSku(evidenceModel, targetSku) {
  if (hasWildcard(evidenceModel) || hasWildcard(targetSku)) return false;
  const evidenceAliases = mieleIdentityAliases(evidenceModel);
  const targetAliases = mieleIdentityAliases(targetSku);
  if (!evidenceAliases.length || !targetAliases.length) return false;
  return targetAliases.some((target) => (
    target.length >= 4
    && /\d/.test(target)
    && evidenceAliases.some((evidence) => (
      evidence === target || (target.length >= 5 && evidence.startsWith(target))
    ))
  ));
}

function parseMmFromLabel(source, label, { required = true } = {}) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s+(\\d+(?:\\.\\d+)?)`, 'i'));
  if (!match) {
    if (required) throw new Error(`Miele parser requires ${label}.`);
    return null;
  }
  return Math.round(Number(match[1]));
}

function parseMmFromLabels(source, labels, { required = true, errorLabel = labels[0] } = {}) {
  for (const label of labels) {
    const value = parseMmFromLabel(source, label, { required: false });
    if (Number.isFinite(value)) return value;
  }
  if (required) throw new Error(`Miele parser requires ${errorLabel}.`);
  return null;
}

function parseDoorOpenDepth(source) {
  const cm = source.match(/Depth\s+with\s+door\s+open\s+in\s+cm\s+(\d+(?:\.\d+)?)/i);
  if (cm) return Math.round(Number(cm[1]) * 10);
  const mm = source.match(/Depth\s+with\s+door\s+open\s+in\s+mm\s+(\d+(?:\.\d+)?)/i);
  if (mm) return Math.round(Number(mm[1]));
  return null;
}

function extractMieleModelAliases(text, sourceUrl = '') {
  const aliases = new Set();

  const addAlias = (raw) => {
    for (const alias of mieleIdentityAliases(raw)) {
      if (
        alias.length >= 4
        && alias.length <= 24
        && /\d/.test(alias)
        && !hasWildcard(alias)
        && !/^MI\d+/i.test(alias)
        && !/(PRODUCT|TECHNICAL|ENERGY|POWER|WATER)/i.test(alias)
      ) {
        aliases.add(alias);
      }
    }
  };

  const source = String(text || '').replace(/\r/g, '');
  for (const line of source.split('\n')) {
    for (const match of line.matchAll(/\b([A-Z]{1,5}[ \t]*\d{3,5}(?:[ \t]*[A-Z][A-Z0-9]{0,4}){0,3}[ \t]+edt[ \t]*\/[ \t]*(?:bs|cs))\b/gi)) {
      addAlias(match[1]);
    }
    for (const match of line.matchAll(/\b(?:Miele[ \t]+)?([A-Z]{1,5}[ \t]*\d{3,5}(?:[ \t]*[A-Z][A-Z0-9]{0,4}){0,3})\b/gi)) {
      addAlias(match[1]);
    }
  }

  for (const match of String(sourceUrl || '').matchAll(/[A-Z]{1,5}\d{3,5}[A-Z0-9]{0,16}/gi)) {
    addAlias(match[0]);
  }

  return [...aliases];
}

function assertMieleDocument(text, targetSku, sourceUrl = '') {
  const aliases = extractMieleModelAliases(text, sourceUrl);
  const verified = aliases.find((alias) => mieleModelMatchesSku(alias, targetSku));
  if (!verified) {
    throw new Error(`Miele parser could not verify SKU ${targetSku} against document model aliases.`);
  }
  return verified;
}

function getTargetSku(options = {}) {
  const target = options.target || {};
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function getTargetCategory(options = {}) {
  const target = options.target || {};
  return normalizeCategory(target.category || target.cat || target.product?.cat);
}

function extractNicheAndApplianceDimensions(text) {
  const source = normalizeWhitespace(text);
  const niche = {
    width: parseMmFromLabels(source, [
      'Niche width minimal in mm',
      'Niche width in mm min.',
      'Niche width in mm min',
      'Niche width in mm'
    ], { required: false }),
    height: parseMmFromLabels(source, [
      'Niche height minimal in mm',
      'Niche height in mm min.',
      'Niche height in mm min',
      'Niche height in mm'
    ], { required: false }),
    depth: parseMmFromLabels(source, [
      'Niche depth in mm',
      'Niche depth minimal in mm',
      'Niche depth in mm min.',
      'Niche depth in mm min'
    ], { required: false })
  };
  if (!Number.isFinite(niche.width) || !Number.isFinite(niche.height) || !Number.isFinite(niche.depth)) {
    throw new Error('Miele parser requires explicit niche dimensions.');
  }

  const dimensions = {
    width_mm: parseMmFromLabel(source, 'Appliance width in mm'),
    height_mm: parseMmFromLabel(source, 'Appliance height in mm'),
    depth_mm: parseMmFromLabel(source, 'Appliance depth in mm'),
    door_open_90_depth_mm: parseDoorOpenDepth(source)
  };

  const widthDelta = niche.width - dimensions.width_mm;
  const heightDelta = niche.height - dimensions.height_mm;
  const depthDelta = niche.depth - dimensions.depth_mm;
  if (widthDelta < 0 || heightDelta < 0 || depthDelta < 0) {
    throw new Error('Miele niche dimensions are smaller than appliance dimensions.');
  }

  return {
    dimensions,
    clearance: {
      top_mm: heightDelta,
      left_mm: Math.floor(widthDelta / 2),
      right_mm: Math.ceil(widthDelta / 2),
      rear_mm: depthDelta
    }
  };
}

function parseMieleText(text, options = {}) {
  const sku = getTargetSku(options);
  const category = getTargetCategory(options);
  const sourceUrl = options.sourceUrl || options.target?.source_url;
  if (!sku) throw new Error('Miele parser requires a SKU/model target.');
  if (!sourceUrl) throw new Error('Miele parser requires sourceUrl metadata.');
  if (!category) throw new Error('Miele parser requires category metadata.');

  const verifiedAlias = options.verifiedAlias || assertMieleDocument(text, sku, sourceUrl);
  const { dimensions, clearance } = extractNicheAndApplianceDimensions(text);
  const extractionDate = options.extractionDate || new Date().toISOString();

  return {
    data: {
      brand: options.target?.brand || options.target?.product?.brand || 'Miele',
      sku,
      category,
      dimensions,
      clearance_requirements: clearance,
      flags: {
        requires_plumbing: category === 'DISHWASHER' || category === 'WASHING_MACHINE',
        ventilation_required: Object.values(clearance).some((value) => value > 0),
        reversible_door: null
      },
      metadata: {
        source_pdf_url: sourceUrl,
        extraction_date: extractionDate,
        confidence_score: 0.9,
        verified_alias: verifiedAlias
      }
    },
    warnings: []
  };
}

async function parseMielePdf(pdfPath, options = {}) {
  const { text } = await extractText(pdfPath);
  return parseMieleText(text, options);
}

exports.extractMieleModelAliases = extractMieleModelAliases;
exports.mieleModelMatchesSku = mieleModelMatchesSku;
exports.normalizeSku = normalizeSku;
exports.parseMielePdf = parseMielePdf;
exports.parseMieleText = parseMieleText;
