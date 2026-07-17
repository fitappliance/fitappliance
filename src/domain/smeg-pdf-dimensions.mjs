export const SMEG_AU_TECHSPEC_PDF_DIMENSIONS_CAPABILITY =
  'smeg_au_techspec_pdf_dimensions_v1';

export const SMEG_AU_DISHWASHER_SUFFIX_RANGE_GRAMMAR =
  'smeg-au-dishwasher-size-wdh-suffix-range-v1';

export const SMEG_AU_DISHWASHER_SUFFIX_FIXED_GRAMMAR =
  'smeg-au-dishwasher-size-whd-suffix-fixed-v1';

function normalizedText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function extractSmegAuDishwasherSizeRows(value) {
  const source = normalizedText(value);
  const rangeMatch = /^Size\s+(\d+)\s*mm\s*W\s*[x×]\s*(\d+)\s*mm\s*D\s*[x×]\s*(\d+)\s*(?:mm\s*)?[-–—]\s*(\d+)\s*mm\s*H(?:\s+max)?\s*$/i.exec(source);
  if (!rangeMatch) return null;
  const [widthMm, depthMm, minimumHeightMm, maximumHeightMm] = rangeMatch.slice(1).map(Number);
  if ([widthMm, depthMm, minimumHeightMm, maximumHeightMm].some((number) => (
    !Number.isInteger(number) || number <= 0
  )) || minimumHeightMm > maximumHeightMm) return null;

  const axisOrder = ['width', 'depth', 'height'];
  const common = {
    axisOrder,
    grammarProfileId: SMEG_AU_DISHWASHER_SUFFIX_RANGE_GRAMMAR,
  };
  return [{
    ...common,
    label: 'Width',
    value: `${widthMm} mm`,
    quote: `Width ${widthMm} mm`,
  }, {
    ...common,
    label: 'Depth',
    value: `${depthMm} mm`,
    quote: `Depth ${depthMm} mm`,
  }, {
    ...common,
    label: 'Height',
    value: `${minimumHeightMm}-${maximumHeightMm} mm`,
    quote: `Height ${minimumHeightMm}-${maximumHeightMm} mm`,
    semanticBasis: 'explicit_label_range',
  }];
}

export function extractSmegAuDishwasherFixedTableSizeRows(value) {
  const source = normalizedText(value);
  const fixedMatch = /^Size\s+(\d+)\s*mm\s*W\s*[x×]\s*(\d+)\s*mm\s*H\s*[x×]\s*(\d+)\s*mm\s*D\s*$/i.exec(source);
  if (!fixedMatch) return null;
  const [widthMm, heightMm, depthMm] = fixedMatch.slice(1).map(Number);
  if ([widthMm, heightMm, depthMm].some((number) => (
    !Number.isInteger(number) || number <= 0
  ))) return null;

  const axisOrder = ['width', 'height', 'depth'];
  const common = {
    axisOrder,
    grammarProfileId: SMEG_AU_DISHWASHER_SUFFIX_FIXED_GRAMMAR,
  };
  return [{
    ...common,
    label: 'Width',
    value: `${widthMm} mm`,
    quote: `Width ${widthMm} mm`,
  }, {
    ...common,
    label: 'Height',
    value: `${heightMm} mm`,
    quote: `Height ${heightMm} mm`,
  }, {
    ...common,
    label: 'Depth',
    value: `${depthMm} mm`,
    quote: `Depth ${depthMm} mm`,
  }];
}
