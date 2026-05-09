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

function parseMmValue(label, rawValue, warnings) {
  const value = String(rawValue || '').trim();
  const range = value.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (range) {
    warnings.push(`${label} is a range (${value}mm); using lower bound ${range[1]}mm for fit calculations.`);
    return Math.round(Number(range[1]));
  }

  const single = value.match(/^(\d+(?:\.\d+)?)$/);
  if (!single) {
    throw new Error(`Unable to parse ${label} dimension from "${value}"`);
  }
  return Math.round(Number(single[1]));
}

function extractQrgSku(text) {
  return String(text || '').match(/QUICK\s+REFERENCE\s+GUIDE\s*>\s*([A-Z0-9-]+)/i)?.[1] || '';
}

function inferCategoryFromText(text) {
  const head = String(text || '').slice(0, 2500);
  const signals = [
    ['DISHWASHER', /\bDishwasher\b/i],
    ['WASHING_MACHINE', /\bFront\s+Loader\s+Washer\b|\bWashing\s+Machine\b|\bWasher\b/i],
    ['DRYER', /\b(?:Heat\s+Pump\s+|Condenser\s+|Vented\s+)?Dryer\b/i],
    ['FRIDGE', /\bRefrigerator\b|\bFridge\b|\bFreezer\b/i]
  ].map(([category, pattern]) => {
    const match = head.match(pattern);
    return match ? { category, index: match.index } : null;
  }).filter(Boolean);

  signals.sort((a, b) => a.index - b.index);
  return signals[0]?.category || '';
}

function extractDimensions(text, warnings, targetSku = '') {
  const match = String(text || '').match(
    /DIMENSIONS\s+Height\s+(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)\s*mm\s+Width\s+(\d+(?:\.\d+)?)\s*mm\s+Depth\s+(\d+(?:\.\d+)?)\s*mm/i
  );
  if (match) {
    return {
      height_mm: parseMmValue('Height', match[1].replace(/\s+/g, ''), warnings),
      width_mm: parseMmValue('Width', match[2], warnings),
      depth_mm: parseMmValue('Depth', match[3], warnings),
      door_open_90_depth_mm: null
    };
  }

  return extractDimensionsFromInstallationTable(text, warnings, targetSku);
}

function modelKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function targetModelVariants(value) {
  const raw = String(value || '').trim().split(/\s+/)[0].toUpperCase();
  const key = modelKey(raw);
  const variants = new Set([key]);
  if (/^\w+\d+$/.test(key)) variants.add(key.replace(/\d+$/, ''));
  return variants;
}

function expandHeaderCell(cell) {
  const text = String(cell || '').trim().toUpperCase();
  if (!text) return [];
  if (!text.includes('/')) return [modelKey(text)];
  const [base, ...suffixes] = text.split('/');
  const prefix = base.slice(0, -1);
  return [base, ...suffixes.map((suffix) => `${prefix}${suffix}`)].map(modelKey);
}

function parseModelHeader(line, targetSku) {
  const cells = String(line || '').match(/[A-Z]{1,4}\d{3,5}[A-Z0-9]*(?:\/[A-Z0-9]+)*/g) || [];
  const targetVariants = targetModelVariants(targetSku);
  const columns = cells.map((cell) => expandHeaderCell(cell));
  const index = columns.findIndex((variants) => variants.some((variant) => targetVariants.has(variant)));
  return { cells, index };
}

function rowValues(line) {
  return (String(line || '').match(/\d+(?:\.\d+)?/g) || []).map((value) => Math.round(Number(value)));
}

function numberNearLabel(lines, pattern) {
  const index = lines.findIndex((candidate) => pattern.test(candidate));
  if (index < 0) return null;
  const sameLineValues = rowValues(lines[index]);
  if (sameLineValues.length > 0) return sameLineValues.at(-1);

  const text = lines.slice(index + 1, index + 3).join(' ');
  const values = rowValues(text);
  return values[0] ?? null;
}

function valueFromRow(lines, pattern, index) {
  const line = lines.find((candidate) => pattern.test(candidate));
  if (!line) return null;
  const values = rowValues(line);
  return values[index] ?? null;
}

function legacyDrawerColumnIndex(targetSku) {
  const key = modelKey(targetSku);
  if (/^RF522W/.test(key)) return 0;
  if (/^RF522A/.test(key)) return 1;
  if (/^RF610|^RF540/.test(key)) return 2;
  return -1;
}

function legacyFridgeDrawerSection(text, targetSku) {
  const index = legacyDrawerColumnIndex(targetSku);
  if (index < 0) return null;
  const sectionMatch = String(text || '').match(
    /Product\s+dimensions\s*\(mm\)\s+RF522W\s+RF522A\s+RF610\/\s*RF540A[\s\S]{0,3500}?Minimum\s+clearances[\s\S]{0,1800}?(?=\n\s*\d+\s+|\n\s*[A-Z][A-Z\s]+$|$)/i
  );
  if (!sectionMatch) return null;
  return { index, text: sectionMatch[0].replace(/\s+/g, ' ') };
}

function legacyRowValue(sectionText, labelPattern, index) {
  const match = sectionText.match(new RegExp(`${labelPattern}[\\s\\S]{0,180}?((?:n\\/a|–|-|\\d+(?:\\.\\d+)?)(?:\\s+(?:n\\/a|–|-|\\d+(?:\\.\\d+)?)){2})`, 'i'));
  if (!match) return null;
  const values = match[1].trim().split(/\s+/);
  const value = values[index];
  return /^\d/.test(value || '') ? Math.round(Number(value)) : null;
}

function extractLegacyFridgeDrawerDimensions(text, warnings, targetSku) {
  const section = legacyFridgeDrawerSection(text, targetSku);
  if (!section) return null;
  const height = legacyRowValue(section.text, 'A\\s+overall\\s+height\\s+of\\s+product', section.index);
  const width = legacyRowValue(section.text, 'B\\s+overall\\s+width\\s+of\\s+product', section.index);
  const depth = legacyRowValue(section.text, 'C\\s+overall\\s+depth\\s+of\\s+product', section.index);
  if (!height || !width || !depth) return null;
  warnings.push('Parsed dimensions from Fisher & Paykel legacy fridge drawer installation table.');
  return {
    height_mm: height,
    width_mm: width,
    depth_mm: depth,
    door_open_90_depth_mm: null
  };
}

function extractLegacyFridgeDrawerClearance(text, warnings, targetSku) {
  const section = legacyFridgeDrawerSection(text, targetSku);
  if (!section) return null;
  const side = legacyRowValue(section.text, 'M\\s+side\\s+clearance', section.index);
  const rear = legacyRowValue(section.text, 'P\\s+rear\\s+clearance', section.index);
  const top = legacyRowValue(section.text, 'R\\s+top\\s+clearance', section.index)
    ?? legacyRowValue(section.text, 'Q\\s+vent\\s+.*?cupboard', section.index);
  if (side == null && rear == null && top == null) return null;
  warnings.push('Parsed clearances from Fisher & Paykel legacy fridge drawer installation table.');
  return {
    top_mm: top ?? 0,
    left_mm: side ?? 0,
    right_mm: side ?? 0,
    rear_mm: rear ?? 0
  };
}

function extractInstallationTable(text, tableLabel, targetSku) {
  const lines = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const start = lines.findIndex((line) => new RegExp(`^${tableLabel}$`, 'i').test(line));
  if (start < 0) return null;
  const window = lines.slice(start, start + 40);
  const headerLine = window.find((line) => /[A-Z]{1,4}\d{3,5}[A-Z0-9]*(?:\/[A-Z0-9]+)*/.test(line));
  const header = parseModelHeader(headerLine, targetSku);
  if (header.index < 0) return null;
  return { lines: window, index: header.index };
}

function extractDimensionsFromInstallationTable(text, warnings, targetSku = '') {
  const singleColumn = extractSingleColumnDimensions(text, warnings);
  if (singleColumn) return singleColumn;

  const legacyFridgeDrawer = extractLegacyFridgeDrawerDimensions(text, warnings, targetSku);
  if (legacyFridgeDrawer) return legacyFridgeDrawer;

  const table = extractInstallationTable(text, 'PRODUCT DIMENSIONS', targetSku);
  if (!table) {
    throw new Error('Fisher & Paykel QRG dimensions block not found.');
  }

  const height = valueFromRow(table.lines, /Overall\s+height/i, table.index);
  const width = valueFromRow(table.lines, /Overall\s+width/i, table.index);
  const depth = valueFromRow(table.lines, /Overall\s+depth/i, table.index);
  const doorOpen = valueFromRow(table.lines, /Depth\s+of\s+open\s+door/i, table.index);
  if (!height || !width || !depth) {
    throw new Error('Fisher & Paykel installation-guide product dimensions table was incomplete.');
  }

  warnings.push('Parsed dimensions from Fisher & Paykel installation-guide table rather than QRG summary block.');
  return {
    height_mm: height,
    width_mm: width,
    depth_mm: depth,
    door_open_90_depth_mm: doorOpen || null
  };
}

function extractSingleColumnDimensions(text, warnings) {
  const lines = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const start = lines.findIndex((line) => /PRODUCT\s+DIMENSIONS\s+MM/i.test(line));
  if (start < 0) return null;
  const window = lines.slice(start, start + 30);
  const height = numberNearLabel(window, /Overall\s+height/i);
  const width = numberNearLabel(window, /Overall\s+width/i);
  const depth = numberNearLabel(window, /Overall\s+depth/i);
  const doorOpen = numberNearLabel(window, /Depth\s+of\s+(?:door\s+open|open\s+door)/i);
  if (!height || !width || !depth) return null;
  warnings.push('Parsed dimensions from Fisher & Paykel single-column user-manual table.');
  return {
    height_mm: height,
    width_mm: width,
    depth_mm: depth,
    door_open_90_depth_mm: doorOpen || null
  };
}

function findClearance(text, pattern) {
  const match = String(text || '').match(pattern);
  return match ? Math.round(Number(match[1])) : null;
}

function extractClearance(text, category, warnings, targetSku = '') {
  const rear = findClearance(text, /Minimum\s+air\s+clearance\s*-\s*at\s+rear\s+(\d+(?:\.\d+)?)\s*mm/i);
  const side = findClearance(text, /Minimum\s+air\s+clearance\s*-\s*each\s+side\s+(\d+(?:\.\d+)?)\s*mm/i);
  const top = findClearance(text, /Minimum\s+air\s+clearance\s*-\s*on\s+top\s+(\d+(?:\.\d+)?)\s*mm/i);

  if (rear != null || side != null || top != null) {
    return {
      top_mm: top ?? 0,
      left_mm: side ?? 0,
      right_mm: side ?? 0,
      rear_mm: rear ?? 0
    };
  }

  const installationClearance = extractClearanceFromInstallationTable(text, warnings, targetSku);
  if (installationClearance) {
    return installationClearance;
  }

  if (category === 'FRIDGE') {
    throw new Error('Fisher & Paykel fridge QRG did not include minimum air clearance fields.');
  }

  warnings.push('No explicit clearance table found; non-fridge clearance requirements recorded as 0mm for schema compatibility.');
  return {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: 0
  };
}

function extractClearanceFromInstallationTable(text, warnings, targetSku = '') {
  const singleColumn = extractSingleColumnClearance(text, warnings);
  if (singleColumn) return singleColumn;

  const legacyFridgeDrawer = extractLegacyFridgeDrawerClearance(text, warnings, targetSku);
  if (legacyFridgeDrawer) return legacyFridgeDrawer;

  const table = extractInstallationTable(text, 'MIN. CLEARANCES', targetSku);
  if (!table) return null;
  const rear = valueFromRow(table.lines, /\bRear\b/i, table.index);
  const side = valueFromRow(table.lines, /\bSides/i, table.index);
  if (rear == null && side == null) return null;
  warnings.push('Parsed clearances from Fisher & Paykel installation-guide table.');
  return {
    top_mm: 0,
    left_mm: side ?? 0,
    right_mm: side ?? 0,
    rear_mm: rear ?? 0
  };
}

function extractSingleColumnClearance(text, warnings) {
  const lines = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const start = lines.findIndex((line) => /MINIMUM\s+CLEARANCES\s+MM/i.test(line));
  if (start < 0) return null;
  const window = lines.slice(start, start + 25);
  const side = numberNearLabel(window, /Minimum\s+clearance\s+to\s+wall|adjacent\s+product/i);
  const rear = numberNearLabel(window, /Minimum\s+clearance\s+at\s+the\s+rear/i);
  if (side == null && rear == null) return null;
  warnings.push('Parsed clearances from Fisher & Paykel single-column user-manual table.');
  return {
    top_mm: 0,
    left_mm: side ?? 0,
    right_mm: side ?? 0,
    rear_mm: rear ?? 0
  };
}

function inferRequiresPlumbing(text, category) {
  if (category === 'DISHWASHER' || category === 'WASHING_MACHINE') return true;
  if (category === 'FRIDGE') {
    return /water\s+dispenser|ice\s+maker|water\s+filter|water\s+connection|plumbed/i.test(text);
  }
  if (category === 'DRYER') {
    return /Water\s+supply\s+(?:Cold|Hot\s*&\s*Cold)/i.test(text);
  }
  return false;
}

function inferVentilationRequired(text, category) {
  if (category === 'FRIDGE') return true;
  if (category === 'DRYER') {
    if (/No\s+external\s+venting/i.test(text)) return false;
    return /vent\s+out|vented|external\s+venting/i.test(text);
  }
  return false;
}

function inferReversibleDoor(text) {
  if (/Reversible\s+door\s+(?:•|true|yes)/i.test(text)) return true;
  return null;
}

function confidenceFor(warnings) {
  return warnings.length === 0 ? 0.94 : 0.85;
}

function parseFisherPaykelText(text, options = {}) {
  const target = options.target || {};
  const warnings = [];
  const targetCategory = normalizeCategory(firstNonBlank(target.category, target.cat, target.product?.cat));
  const inferredCategory = inferCategoryFromText(text);
  if (targetCategory && inferredCategory && targetCategory !== inferredCategory) {
    throw new Error(`Fisher & Paykel category mismatch: target ${targetCategory} but QRG text indicates ${inferredCategory}.`);
  }
  const category = firstNonBlank(targetCategory, inferredCategory);
  const sku = firstNonBlank(target.sku, target.model, target.product?.model, extractQrgSku(text));
  const brand = firstNonBlank(target.brand, target.product?.brand, 'Fisher & Paykel');
  const sourceUrl = firstNonBlank(options.sourceUrl, target.source_url);
  const extractionDate = firstNonBlank(options.extractionDate, new Date().toISOString());

  if (!sku) throw new Error('Fisher & Paykel parser requires a SKU/model target.');
  if (!category || !CATEGORY_MAP[String(category).toLowerCase()] && !Object.values(CATEGORY_MAP).includes(category)) {
    throw new Error(`Unsupported Fisher & Paykel category: ${category || 'missing'}`);
  }
  if (!sourceUrl) throw new Error('Fisher & Paykel parser requires sourceUrl metadata.');

  const normalizedCategory = normalizeCategory(category);
  const dimensions = extractDimensions(text, warnings, sku);
  const clearance = extractClearance(text, normalizedCategory, warnings, sku);

  return {
    data: {
      brand,
      sku,
      category: normalizedCategory,
      dimensions,
      clearance_requirements: clearance,
      flags: {
        requires_plumbing: inferRequiresPlumbing(text, normalizedCategory),
        ventilation_required: inferVentilationRequired(text, normalizedCategory),
        reversible_door: inferReversibleDoor(text)
      },
      metadata: {
        source_pdf_url: sourceUrl,
        extraction_date: extractionDate,
        confidence_score: confidenceFor(warnings)
      }
    },
    warnings
  };
}

async function parseFisherPaykelPdf(pdfPath, options = {}) {
  const { text } = await extractText(pdfPath);
  return parseFisherPaykelText(text, options);
}

exports.parseFisherPaykelText = parseFisherPaykelText;
exports.parseFisherPaykelPdf = parseFisherPaykelPdf;
exports.extractDimensions = extractDimensions;
exports.extractClearance = extractClearance;
