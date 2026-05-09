require('dotenv').config({ quiet: true });

const {
  ALLOWED_CATEGORIES,
  ALLOWED_CONFIDENCE,
  DIMENSION_RANGES_MM,
  CLEARANCE_RANGE_MM,
  OPTIONAL_RANGES
} = require('./lib/schema');
const {
  ApplianceDimensionSchema,
  normalizeApplianceDimensionCandidate,
  validateApplianceDimension
} = require('./lib/appliance-dimension-schema');

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function rangeLabel([min, max]) {
  return `${min}-${max}`;
}

function assertInRange(errors, label, value, range, required = true) {
  if (value == null) {
    if (required) errors.push(`${label} is required`);
    return;
  }
  if (!isNumber(value)) {
    errors.push(`${label} must be a number`);
    return;
  }
  const [min, max] = range;
  if (value < min || value > max) {
    errors.push(`${label} ${value} is outside plausible range ${rangeLabel(range)}`);
  }
}

function validateExtracted(data) {
  const errors = [];
  const brand = String(data?.brand || '').trim();
  const model = String(data?.model || '').trim();

  if (!brand) errors.push('brand is required');
  if (!model) errors.push('model is required');
  if (!ALLOWED_CATEGORIES.has(data?.category)) {
    errors.push(`category must be one of ${Array.from(ALLOWED_CATEGORIES).join(', ')}`);
  }

  const ranges = DIMENSION_RANGES_MM[data?.category];
  if (ranges) {
    assertInRange(errors, 'width', data?.dimensions_mm?.width, ranges.width);
    assertInRange(errors, 'height', data?.dimensions_mm?.height, ranges.height);
    assertInRange(errors, 'depth', data?.dimensions_mm?.depth, ranges.depth);
  }

  for (const key of ['side', 'top', 'rear']) {
    assertInRange(errors, `${key} clearance`, data?.clearance_mm?.[key], CLEARANCE_RANGE_MM);
  }
  assertInRange(errors, 'front clearance', data?.clearance_mm?.front, CLEARANCE_RANGE_MM, false);

  for (const [key, range] of Object.entries(OPTIONAL_RANGES)) {
    assertInRange(errors, key, data?.[key], range, false);
  }

  if (!ALLOWED_CONFIDENCE.has(data?.confidence)) {
    errors.push('confidence must be high, medium, or low');
  }

  if (typeof data?.source_quote !== 'string' || data.source_quote.trim().length < 8) {
    errors.push('source_quote must include a short supporting quote');
  }

  return { valid: errors.length === 0, errors };
}

exports.validateExtracted = validateExtracted;
exports.ApplianceDimensionSchema = ApplianceDimensionSchema;
exports.normalizeApplianceDimensionCandidate = normalizeApplianceDimensionCandidate;
exports.validateApplianceDimension = validateApplianceDimension;
