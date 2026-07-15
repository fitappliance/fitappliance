const FIELD_RULES = Object.freeze({
  'closedEnvelope.widthMm': { label: /(?:\b(?:total|overall|external|product)?\s*width\b|^\s*(?:total|overall|external|product)?\s*wide(?:\s*\([^)]*\))?\s*$)/i, kind: 'dimension', axis: 'width', reject: /cabinet|cut[ -]?out|cavity|\bpack(?:ed|ing|ag(?:e|ed|ing))?\b|(?:doors?\s*open(?:ed)?|open(?:ed)?\s*doors?)/i },
  'closedEnvelope.heightMm': { label: /(?:\b(?:total|overall|external|product)?\s*height\b|^\s*(?:total|overall|external|product)?\s*high(?:\s*\([^)]*\))?\s*$)/i, kind: 'dimension', axis: 'height', reject: /cabinet|cut[ -]?out|cavity|\bpack(?:ed|ing|ag(?:e|ed|ing))?\b|lid\s*open|(?:excluding|without)\s+(?:the\s+)?(?:removable\s+)?(?:worktop|top)\b/i },
  'closedEnvelope.depthMm': { label: /(?:\b(?:total|overall|external|product)?\s*depth\b|^\s*(?:total|overall|external|product)?\s*deep(?:\s*\([^)]*\))?\s*$)/i, kind: 'dimension', axis: 'depth', reject: /cabinet|cut[ -]?out|cavity|\bpack(?:ed|ing|ag(?:e|ed|ing))?\b|(?:including|with)\s+(?:the\s+)?(?:(?:doors?\s*(?:and|&)\s*)?handles?|doors?\s+handles?)|without\s+(?:the\s+)?(?:doors?|handles?)|(?:doors?\s*open(?:ed)?|open(?:ed)?\s*doors?)/i },
  'installation.leftMm': { label: /(?:left.{0,30}(?:clearance|space|gap)|(?:clearance|space|gap).{0,30}left|(?:clearance|space|gap).{0,30}(?:each|both)\s+sides?|(?:each|both)\s+sides?.{0,30}(?:clearance|space|gap))/i, kind: 'clearance' },
  'installation.rightMm': { label: /(?:right.{0,30}(?:clearance|space|gap)|(?:clearance|space|gap).{0,30}right|(?:clearance|space|gap).{0,30}(?:each|both)\s+sides?|(?:each|both)\s+sides?.{0,30}(?:clearance|space|gap))/i, kind: 'clearance' },
  'installation.topMm': { label: /(?:(?:air\s*space\s*above|top|overhead).{0,30}(?:clearance|space|gap|cabinet)|(?:clearance|space|gap).{0,30}(?:on\s+)?(?:top|above|overhead)|air\s*space\s*above\s*cabinet)/i, kind: 'clearance' },
  'installation.rearMm': { label: /(?:rear|behind|back).{0,30}(?:clearance|space|gap|ventilation)|(?:clearance|space|gap).{0,30}(?:rear|behind|back)/i, kind: 'clearance' },
  'installation.frontMm': { label: /front.{0,30}(?:clearance|space|gap)|(?:clearance|space|gap).{0,30}front/i, kind: 'clearance' },
  'operation.doorOpenDepthMm': { label: /(?:depth.{0,40}(?:doors?\s*open(?:ed)?|open(?:ed)?\s*doors?)|(?:doors?\s*open(?:ed)?|open(?:ed)?\s*doors?).{0,40}depth)/i, kind: 'operation' },
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

export function containsExactModelDocumentUrl(value, model) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(value).pathname);
  } catch {
    return false;
  }
  if (containsExactModel(pathname, model)) return true;
  const filename = pathname.split('/').pop() ?? '';
  const stem = filename.replace(/\.[A-Z0-9]{1,8}$/i, '');
  const withoutDocumentSuffix = stem.replace(
    /[-_. ]+(?:UG|UM|IM|USER[-_. ]?(?:GUIDE|MANUAL)|INSTALLATION[-_. ]?(?:GUIDE|MANUAL)|SPEC(?:IFICATION)?(?:[-_. ]?SHEET)?)(?:[-_. ]+V?\d+(?:\.\d+)*)*$/i,
    '',
  );
  return withoutDocumentSuffix !== stem && containsExactModel(withoutDocumentSuffix, model);
}

function quotedNumbers(value) {
  const withoutAngles = value.replace(/\b(?:90|180)\s*(?:degrees?|deg|°)\b/gi, ' ');
  return (withoutAngles.match(/(?<![\d.])\d+(?:\.\d+)?(?![\d.])/g) ?? []).map(Number);
}

function hasMillimetreUnit(value) {
  return /(?<![A-Za-z])(?:mm|millimet(?:re|er)s?)\b/i.test(String(value ?? ''));
}

export function claimFromEvidenceFragment(field, label, quote, context) {
  const rule = FIELD_RULES[field];
  if (!rule) throw new TypeError(`unsupported semantic field ${field}`);
  const normalizedLabel = requiredText(label, 'claim label');
  const normalizedQuote = requiredText(quote, 'claim quote');
  const remainder = normalizedQuote.replace(normalizedLabel, ' ');
  let claim;
  if (rule.kind === 'boolean') {
    const negative = /\b(?:no|not\s+required|does\s+not\s+require|without)\b/i.test(remainder);
    const positive = /\b(?:yes|required|requires|plumbed)\b/i.test(remainder) && !negative;
    if (!negative && !positive) throw new TypeError(`boolean value missing for ${field}`);
    claim = { field, value: !negative, unit: 'boolean', label: normalizedLabel, quote: normalizedQuote };
  } else {
    const values = [...new Set(quotedNumbers(remainder))];
    if (values.length !== 1 || !Number.isInteger(values[0])) throw new TypeError(`unambiguous millimetre value required for ${field}`);
    claim = { field, value: values[0], unit: 'mm', label: normalizedLabel, quote: normalizedQuote };
  }
  validateClaimSemantics(claim, context);
  return claim;
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
    const values = claim.value && typeof claim.value === 'object'
      ? [claim.value.minimumMm, claim.value.maximumMm]
      : [claim.value];
    if (values.some((value) => !Number.isInteger(value) || value < minimum || value > maximum)
      || (values.length === 2 && values[0] > values[1])) {
      throw new RangeError(`${claim.field} outside ${context.category} range`);
    }
    return;
  }
  const maximum = rule.kind === 'clearance' || rule.kind === 'service' ? 1000 : 3000;
  if (claim.value < 0 || claim.value > maximum) throw new RangeError(`${claim.field} outside supported range`);
}

const GROUPED_AXIS_LABELS = Object.freeze({
  width: '(?:w|width|wide)',
  height: '(?:h|height|high)',
  depth: '(?:d|depth|deep)',
  sides: '(?:side|sides)',
  left: 'left',
  right: 'right',
  rear: '(?:back|rear|behind)',
  top: '(?:top|above|overhead)',
  front: 'front',
});

const DIMENSION_AXIS_ALIASES = Object.freeze({
  w: 'width', width: 'width', wide: 'width',
  h: 'height', height: 'height', high: 'height',
  d: 'depth', depth: 'depth', deep: 'depth',
});

function explicitDimensionSequence(label) {
  const compact = /(?:^|[^a-z0-9])([whd])\s*([x×/*])\s*([whd])\s*\2\s*([whd])(?:$|[^a-z0-9])/i
    .exec(String(label ?? ''));
  if (compact) {
    const sequence = [compact[1], compact[3], compact[4]]
      .map((token) => DIMENSION_AXIS_ALIASES[token.toLowerCase()]);
    if (new Set(sequence).size === 3) return sequence;
  }
  const tokens = Object.keys(DIMENSION_AXIS_ALIASES).sort((left, right) => right.length - left.length).join('|');
  const separator = '(?:\\s*(?:x|×|/|\\*|,|\\bby\\b)\\s*)';
  const match = new RegExp(`\\b(${tokens})\\b${separator}\\b(${tokens})\\b${separator}\\b(${tokens})\\b`, 'i')
    .exec(String(label ?? ''));
  if (!match) return null;
  const sequence = match.slice(1, 4).map((token) => DIMENSION_AXIS_ALIASES[token.toLowerCase()]);
  return new Set(sequence).size === 3 ? sequence : null;
}

export function claimsFromExplicitDimensionSequence(fragment, context, requestedFields, extras = {}) {
  if (!Array.isArray(requestedFields)) throw new TypeError('requested evidence fields required');
  const label = String(fragment?.label ?? '').replace(/\s+/g, ' ').trim();
  const valueText = String(fragment?.value ?? '').replace(/\s+/g, ' ').trim();
  if (!label || !valueText) return [];
  if (!/\b(?:dimension|dimensions|size)\b/i.test(label)
    || /\b(?:pack(?:ed|ag(?:e|ed|ing))?|shipping|carton|box(?:ed)?|crate)\b/i.test(label)) return [];
  const axisOrder = explicitDimensionSequence(label);
  if (!axisOrder) return [];
  const sourceValues = (valueText.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (sourceValues.length !== 3 || sourceValues.some((value) => !Number.isFinite(value))) return [];
  const units = [...`${label} ${valueText}`.matchAll(/(?<![A-Za-z])(mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?)\b/gi)]
    .map((match) => match[1].toLowerCase().startsWith('c') ? 'cm' : 'mm');
  if (!units.length || new Set(units).size !== 1) return [];
  const sourceUnit = units[0];
  const sourceValuesMm = sourceValues.map((value) => value * (sourceUnit === 'cm' ? 10 : 1));
  if (sourceValuesMm.some((value) => !Number.isInteger(value))) return [];
  const fieldsByAxis = {
    width: 'closedEnvelope.widthMm',
    height: 'closedEnvelope.heightMm',
    depth: 'closedEnvelope.depthMm',
  };
  const quote = requiredText(fragment?.quote ?? `${label} ${valueText}`, 'claim quote');
  const claims = axisOrder.flatMap((axis, index) => {
    const field = fieldsByAxis[axis];
    if (!requestedFields.includes(field)) return [];
    return [{
      field,
      value: sourceValuesMm[index],
      unit: 'mm',
      label,
      quote,
      semanticBasis: 'explicit_axis_sequence',
      axisOrder: [...axisOrder],
      sourceUnit,
      sourceValues: [...sourceValues],
      sourceValuesMm: [...sourceValuesMm],
      ...extras,
    }];
  });
  claims.forEach((claim) => validateClaimSemantics(claim, context));
  return claims;
}

function groupedFieldAxis(field, rule, axisOrder) {
  if (rule.kind === 'dimension') return rule.axis;
  const expected = {
    'installation.leftMm': ['left', 'sides'],
    'installation.rightMm': ['right', 'sides'],
    'installation.rearMm': ['rear'],
    'installation.topMm': ['top'],
    'installation.frontMm': ['front'],
  }[field] ?? [];
  return expected.find((axis) => axisOrder.includes(axis)) ?? null;
}

function assertGroupedClaim(claim, context, rule, combined) {
  const dimensionSequence = claim.semanticBasis === 'explicit_axis_sequence';
  const namedSequence = claim.semanticBasis === 'explicit_named_sequence';
  if (!dimensionSequence && !namedSequence) return false;
  if ((dimensionSequence && rule.kind !== 'dimension')
    || (namedSequence && rule.kind !== 'clearance')) {
    throw new TypeError(`grouped semantic basis does not prove ${claim.field}`);
  }
  const axisOrder = claim.axisOrder;
  const sourceValues = claim.sourceValues;
  const valuesMm = claim.sourceValuesMm;
  if (!Array.isArray(axisOrder) || axisOrder.length < 2
    || new Set(axisOrder).size !== axisOrder.length
    || axisOrder.some((axis) => !GROUPED_AXIS_LABELS[axis])
    || !Array.isArray(sourceValues) || !Array.isArray(valuesMm)
    || sourceValues.length !== axisOrder.length || valuesMm.length !== axisOrder.length
    || sourceValues.some((value) => !Number.isFinite(value))
    || valuesMm.some((value) => !Number.isInteger(value))) {
    throw new TypeError(`grouped source sequence invalid for ${claim.field}`);
  }
  const sourceUnit = claim.sourceUnit;
  if (!['mm', 'cm'].includes(sourceUnit)) throw new TypeError(`grouped source unit invalid for ${claim.field}`);
  const multiplier = sourceUnit === 'cm' ? 10 : 1;
  if (sourceValues.some((value, index) => value * multiplier !== valuesMm[index])) {
    throw new TypeError(`grouped source conversion invalid for ${claim.field}`);
  }
  const separator = '\\s*(?:x|×|/|\\*|,|\\bby\\b)\\s*';
  const sequencePattern = axisOrder.map((axis) => `\\b${GROUPED_AXIS_LABELS[axis]}\\b`).join(separator);
  const compactDimensionPattern = dimensionSequence
    ? new RegExp(`(?:^|[^a-z0-9])${axisOrder.map((axis) => axis[0]).join('\\s*[x×/*]\\s*')}(?:$|[^a-z0-9])`, 'i')
    : null;
  if (!(new RegExp(sequencePattern, 'i').test(claim.label)
      || compactDimensionPattern?.test(claim.label))
    || (dimensionSequence && !/\b(?:dimension|dimensions|size)\b/i.test(claim.label))
    || (namedSequence && !/\b(?:clearance|clearances|space|gap)\b/i.test(claim.label))) {
    throw new TypeError(`explicit grouped label does not prove ${claim.field}`);
  }
  const claimAxis = groupedFieldAxis(claim.field, rule, axisOrder);
  const valueIndex = axisOrder.indexOf(claimAxis);
  if (!claimAxis || valueIndex < 0 || valuesMm[valueIndex] !== claim.value) {
    throw new TypeError(`grouped axis value does not prove ${claim.field}`);
  }
  const unitPattern = sourceUnit === 'cm'
    ? /(?:^|[^a-z])(?:cm(?=[whd]\b|\b)|centimet(?:re|er)s?\b)/i
    : /(?:^|[^a-z])(?:mm(?=[whd]\b|\b)|millimet(?:re|er)s?\b)/i;
  if (!unitPattern.test(combined)
    || !sourceValues.every((value) => quotedNumbers(claim.quote).includes(value))) {
    throw new TypeError(`grouped quote does not prove ${claim.field}`);
  }
  validateRange(claim, context, rule);
  return true;
}

function assertLabelledRangeClaim(claim, context, rule, combined) {
  if (claim.semanticBasis !== 'explicit_label_range') return false;
  if (claim.field !== 'closedEnvelope.heightMm' || rule.kind !== 'dimension' || rule.axis !== 'height') {
    throw new TypeError(`range semantic basis does not prove ${claim.field}`);
  }
  const range = claim.value;
  if (!range || typeof range !== 'object' || Array.isArray(range)
    || !Number.isInteger(range.minimumMm) || !Number.isInteger(range.maximumMm)
    || range.minimumMm > range.maximumMm) {
    throw new TypeError('valid adjustable height range required');
  }
  if (!rule.label.test(claim.label) || (rule.reject && rule.reject.test(claim.label))) {
    throw new TypeError('explicit height label required for range');
  }
  if (!Array.isArray(claim.sourceValues) || claim.sourceValues.length !== 2
    || !Array.isArray(claim.sourceValuesMm) || claim.sourceValuesMm.length !== 2
    || !['mm', 'cm'].includes(claim.sourceUnit)) {
    throw new TypeError('range source sequence invalid');
  }
  const multiplier = claim.sourceUnit === 'cm' ? 10 : 1;
  if (claim.sourceValues.some((value, index) => value * multiplier !== claim.sourceValuesMm[index])
    || claim.sourceValuesMm[0] !== range.minimumMm || claim.sourceValuesMm[1] !== range.maximumMm
    || !/(?:-|–|—|\bto\b)/i.test(claim.quote)) {
    throw new TypeError('range quote does not prove adjustable height');
  }
  const unitPattern = claim.sourceUnit === 'cm'
    ? /(?<![A-Za-z])(?:cm|centimet(?:re|er)s?)\b/i
    : /(?<![A-Za-z])(?:mm|millimet(?:re|er)s?)\b/i;
  if (!unitPattern.test(combined)
    || !claim.sourceValues.every((value) => quotedNumbers(claim.quote).includes(value))) {
    throw new TypeError('range quote or unit invalid');
  }
  validateRange(claim, context, rule);
  return true;
}

export function validateClaimSemantics(claim, context) {
  const field = requiredText(claim?.field, 'claim field');
  const rule = FIELD_RULES[field];
  if (!rule) throw new TypeError(`unsupported semantic field ${field}`);
  const label = requiredText(claim?.label, 'claim label');
  const quote = requiredText(claim?.quote, 'claim quote');
  const combined = `${label} ${quote}`;
  if (assertLabelledRangeClaim(claim, context, rule, combined)) return true;
  if (assertGroupedClaim(claim, context, rule, combined)) return true;
  if (!rule.label.test(label) || (rule.reject && rule.reject.test(label))) {
    throw new TypeError(`field label does not prove ${field}`);
  }
  if (rule.kind === 'boolean') {
    if (claim.unit !== 'boolean' || typeof claim.value !== 'boolean') throw new TypeError(`boolean claim required for ${field}`);
    validateBoolean(claim, combined);
    return true;
  }
  if (claim.unit !== 'mm' || !Number.isInteger(claim.value)) throw new TypeError(`integer millimetre claim required for ${field}`);
  if (!hasMillimetreUnit(combined)) throw new TypeError(`millimetre unit missing for ${field}`);
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
