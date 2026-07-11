const FIELD_RULES = Object.freeze({
  'closedEnvelope.widthMm': { label: /\b(?:total|overall|product|cabinet)?\s*width\b/i, kind: 'dimension', axis: 'width' },
  'closedEnvelope.heightMm': { label: /\b(?:total|overall|product|cabinet)?\s*height\b/i, kind: 'dimension', axis: 'height' },
  'closedEnvelope.depthMm': { label: /\b(?:total|overall|product|cabinet)?\s*depth\b/i, kind: 'dimension', axis: 'depth', reject: /door\s*open|with\s*(?:the\s*)?door/i },
  'installation.leftMm': { label: /(?:left.{0,30}(?:clearance|space|gap)|(?:clearance|space|gap).{0,30}left)/i, kind: 'clearance' },
  'installation.rightMm': { label: /(?:right.{0,30}(?:clearance|space|gap)|(?:clearance|space|gap).{0,30}right)/i, kind: 'clearance' },
  'installation.topMm': { label: /(?:air\s*space\s*above|top|overhead).{0,30}(?:clearance|space|gap|cabinet)|air\s*space\s*above\s*cabinet/i, kind: 'clearance' },
  'installation.rearMm': { label: /(?:rear|behind|back).{0,30}(?:clearance|space|gap|ventilation)|(?:clearance|space|gap).{0,30}(?:rear|behind|back)/i, kind: 'clearance' },
  'installation.frontMm': { label: /front.{0,30}(?:clearance|space|gap)|(?:clearance|space|gap).{0,30}front/i, kind: 'clearance' },
  'operation.doorOpenDepthMm': { label: /(?:depth.{0,30}door\s*open|door\s*open.{0,30}depth)/i, kind: 'operation' },
  'operation.hingeSideSpaceMm': { label: /hinge.{0,30}(?:clearance|space|gap)/i, kind: 'operation' },
  'operation.lidOpenHeightMm': { label: /(?:lid\s*open.{0,30}height|height.{0,30}lid\s*open)/i, kind: 'operation' },
  'service.plumbingRearMm': { label: /(?:plumbing|water).{0,30}(?:rear|behind|back).{0,30}(?:clearance|space|gap)/i, kind: 'service' },
  'service.rearServicesMm': { label: /rear.{0,30}(?:service|socket|connection).{0,30}(?:clearance|space|gap)/i, kind: 'service' },
  'service.rearVentilationMm': { label: /rear.{0,30}ventilation.{0,30}(?:clearance|space|gap)|ventilation.{0,30}(?:rear|behind|back)/i, kind: 'service' },
  'flags.requiresPlumbing': { label: /(?:plumbed\s*water|water\s*(?:supply|connection)|plumbing)/i, kind: 'boolean' },
});

const CATEGORY_RANGES = Object.freeze({
  fridge: Object.freeze({ width: [300, 1800], height: [400, 2500], depth: [300, 1400] }),
  freezer: Object.freeze({ width: [300, 1800], height: [400, 2500], depth: [300, 1400] }),
  dishwasher: Object.freeze({ width: [300, 1000], height: [400, 1200], depth: [300, 1000] }),
  washing_machine: Object.freeze({ width: [300, 1200], height: [500, 1600], depth: [300, 1300] }),
  dryer: Object.freeze({ width: [300, 1200], height: [500, 1600], depth: [300, 1300] }),
  washtower_combo: Object.freeze({ width: [300, 1400], height: [800, 2800], depth: [300, 1500] }),
});

function requiredText(value, label) {
  const result = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function containsExactModel(text, model) {
  const parts = requiredText(model, 'model').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  if (!parts.length) return false;
  const body = parts.map(escapeRegExp).join('[-_/.\\s]*');
  return new RegExp(`(^|[^A-Z0-9])${body}(?![A-Z0-9]|[-_/][A-Z0-9])`, 'i').test(String(text ?? ''));
}

function quotedNumbers(value) {
  const withoutAngles = value.replace(/\b(?:90|180)\s*(?:degrees?|deg|°)\b/gi, ' ');
  return (withoutAngles.match(/\b\d+(?:\.\d+)?\b/g) ?? []).map(Number);
}

function validateBoolean(claim, combined) {
  const negative = /\b(?:no|not\s+required|does\s+not\s+require|without)\b/i.test(combined);
  const positive = /\b(?:yes|required|requires|plumbed)\b/i.test(combined) && !negative;
  if ((claim.value === true && !positive) || (claim.value === false && !negative)) {
    throw new TypeError(`boolean quote does not prove ${claim.field}`);
  }
}

function validateRange(claim, context, rule) {
  if (rule.kind === 'dimension') {
    const ranges = CATEGORY_RANGES[context.category];
    if (!ranges) throw new TypeError(`unsupported category range ${context.category}`);
    const [minimum, maximum] = ranges[rule.axis];
    if (claim.value < minimum || claim.value > maximum) {
      throw new RangeError(`${claim.field} outside ${context.category} range`);
    }
    return;
  }
  const maximum = rule.kind === 'clearance' || rule.kind === 'service' ? 1000 : 3000;
  if (claim.value < 0 || claim.value > maximum) throw new RangeError(`${claim.field} outside supported range`);
}

export function validateClaimSemantics(claim, context) {
  const field = requiredText(claim?.field, 'claim field');
  const rule = FIELD_RULES[field];
  if (!rule) throw new TypeError(`unsupported semantic field ${field}`);
  const label = requiredText(claim?.label, 'claim label');
  const quote = requiredText(claim?.quote, 'claim quote');
  const combined = `${label} ${quote}`;
  if (!rule.label.test(combined) || (rule.reject && rule.reject.test(combined))) {
    throw new TypeError(`field label does not prove ${field}`);
  }
  if (rule.kind === 'boolean') {
    if (claim.unit !== 'boolean' || typeof claim.value !== 'boolean') throw new TypeError(`boolean claim required for ${field}`);
    validateBoolean(claim, combined);
    return true;
  }
  if (claim.unit !== 'mm' || !Number.isInteger(claim.value)) throw new TypeError(`integer millimetre claim required for ${field}`);
  if (!/(?:\bmm\b|millimet(?:re|er)s?)/i.test(combined)) throw new TypeError(`millimetre unit missing for ${field}`);
  if (!quotedNumbers(quote).some((value) => value === claim.value)) {
    throw new TypeError(`quoted value does not match ${field}`);
  }
  validateRange(claim, context, rule);
  return true;
}

export function validateClaimsSemantics(claims, context) {
  if (!Array.isArray(claims) || !claims.length) throw new TypeError('claims required');
  const values = new Map();
  for (const claim of claims) {
    validateClaimSemantics(claim, context);
    if (values.has(claim.field)) throw new TypeError(`duplicate field claim ${claim.field}`);
    values.set(claim.field, claim.value);
  }
  const closedDepth = values.get('closedEnvelope.depthMm');
  const openDepth = values.get('operation.doorOpenDepthMm');
  if (Number.isInteger(closedDepth) && Number.isInteger(openDepth) && openDepth < closedDepth) {
    throw new RangeError('door-open depth cannot be below closed depth');
  }
  return true;
}

export const evidenceFieldRules = FIELD_RULES;
