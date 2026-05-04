const CM_SHORTHAND_THRESHOLD = 300;

function parseMeasurement(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Number.parseFloat(raw.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function normalizeDimensionValue(value) {
  const parsed = parseMeasurement(value);
  if (parsed === null) return { value: null, converted: false };
  if (parsed > 0 && parsed < CM_SHORTHAND_THRESHOLD) {
    return { value: Math.round(parsed * 10), converted: true };
  }
  return { value: Math.round(parsed), converted: false };
}

export function normalizeSearchDimensions(values = {}) {
  const width = normalizeDimensionValue(values.w);
  const height = normalizeDimensionValue(values.h);
  const depth = normalizeDimensionValue(values.d);
  const doorway = normalizeDimensionValue(values.door);
  const converted = width.converted || height.converted || depth.converted || doorway.converted;
  const normalizedValues = {
    w: width.value,
    h: height.value,
    d: depth.value,
    door: doorway.value
  };
  const parts = [];
  if (width.value !== null && height.value !== null && depth.value !== null) {
    parts.push(`${width.value}×${height.value}×${depth.value}mm`);
  }
  if (doorway.value !== null) {
    parts.push(`doorway ${doorway.value}mm`);
  }
  return {
    values: normalizedValues,
    converted,
    message: converted && parts.length > 0
      ? `Converted cm-style measurements to ${parts.join(' · ')}.`
      : ''
  };
}

