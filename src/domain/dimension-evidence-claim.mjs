const CLAIM_KEYS = Object.freeze([
  'field', 'value', 'sourceLabel', 'sourceAxisOrder', 'sourceUnit',
  'measurementScope', 'includesDoor', 'includesHandle', 'page',
  'fragmentSha256', 'bbox',
]);

const FIELD_AXIS = Object.freeze({
  'closedEnvelope.widthMm': 'width',
  'closedEnvelope.heightMm': 'height',
  'closedEnvelope.depthMm': 'depth',
  'installation.leftMm': 'left',
  'installation.rightMm': 'right',
  'installation.topMm': 'top',
  'installation.rearMm': 'rear',
  'installation.frontMm': 'front',
  'operation.doorOpenDepthMm': 'depth',
  'operation.hingeSideSpaceMm': 'hinge_side',
  'operation.lidOpenHeightMm': 'height',
  'service.plumbingRearMm': 'rear',
  'service.rearServicesMm': 'rear',
  'service.rearVentilationMm': 'rear',
  'delivery.widthMm': 'width',
  'delivery.heightMm': 'height',
  'delivery.depthMm': 'depth',
});

const FIELD_SCOPE = Object.freeze({
  closedEnvelope: 'product_closed_external',
  installation: 'installation_clearance',
  operation: 'door_open_envelope',
  service: 'service_space',
  delivery: 'delivery_package',
});

const SCOPES = new Set([
  ...Object.values(FIELD_SCOPE),
  'product_body',
  'cavity_opening',
]);
const AXES = new Set([
  'width', 'height', 'depth', 'left', 'right', 'top', 'rear', 'front', 'hinge_side',
]);
const HASH = /^[a-f0-9]{64}$/;

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, label, keys) {
  plainObject(value, label);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) throw new TypeError(`${label} unknown key: ${key}`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`${label} missing key: ${key}`);
  }
}

function requiredText(value, label) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function flag(value, label) {
  if (![true, false, null].includes(value)) throw new TypeError(`${label} must be true, false or null`);
  return value;
}

function millimetres(value, label, { allowZero = false } = {}) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < (allowZero ? 0 : 1) || value > 10_000) {
    throw new RangeError(`${label} must be a supported integer millimetre value`);
  }
  return value;
}

function normalizedValue(value, field) {
  exactKeys(value, 'claim value', value?.kind === 'range'
    ? ['kind', 'minMm', 'maxMm']
    : ['kind', 'mm']);
  const allowZero = !field.startsWith('closedEnvelope.') && !field.startsWith('delivery.');
  if (value.kind === 'fixed') {
    millimetres(value.mm, 'claim fixed value', { allowZero });
    return value;
  }
  if (value.kind !== 'range') throw new TypeError('claim value kind must be fixed or range');
  millimetres(value.minMm, 'claim range minimum', { allowZero });
  millimetres(value.maxMm, 'claim range maximum', { allowZero });
  if (value.minMm > value.maxMm) throw new RangeError('claim range minimum exceeds maximum');
  return value;
}

function normalizedProvenance(claim) {
  const absent = claim.page === null && claim.fragmentSha256 === null && claim.bbox === null;
  if (absent) return;
  if (!Number.isInteger(claim.page) || claim.page < 1) throw new TypeError('claim page invalid');
  if (!HASH.test(String(claim.fragmentSha256 ?? ''))) throw new TypeError('claim fragment SHA-256 invalid');
  if (!Array.isArray(claim.bbox) || claim.bbox.length !== 4
    || claim.bbox.some((coordinate) => !Number.isFinite(coordinate) || coordinate < 0 || coordinate > 1000)
    || claim.bbox[0] >= claim.bbox[2] || claim.bbox[1] >= claim.bbox[3]) {
    throw new TypeError('claim bbox invalid');
  }
}

function scopeForField(field) {
  return FIELD_SCOPE[field.split('.')[0]];
}

export function validateDimensionEvidenceClaimV2(claim) {
  exactKeys(claim, 'claim semantics v2', CLAIM_KEYS);
  const field = requiredText(claim.field, 'claim field');
  const axis = FIELD_AXIS[field];
  if (!axis) throw new TypeError(`unsupported claim field ${field}`);
  normalizedValue(claim.value, field);
  requiredText(claim.sourceLabel, 'claim source label');
  if (!Array.isArray(claim.sourceAxisOrder) || claim.sourceAxisOrder.length < 1
    || claim.sourceAxisOrder.some((candidate) => !AXES.has(candidate))
    || new Set(claim.sourceAxisOrder).size !== claim.sourceAxisOrder.length
    || !claim.sourceAxisOrder.includes(axis)) {
    throw new TypeError(`claim source axis order does not prove ${axis} axis`);
  }
  if (!['mm', 'cm'].includes(claim.sourceUnit)) throw new TypeError('claim source unit must be mm or cm');
  if (!SCOPES.has(claim.measurementScope)) throw new TypeError('claim measurement scope invalid');
  const expectedScope = scopeForField(field);
  if (claim.measurementScope !== expectedScope) {
    throw new TypeError(`${field} scope must be ${expectedScope}`);
  }
  flag(claim.includesDoor, 'claim includesDoor');
  flag(claim.includesHandle, 'claim includesHandle');
  if (field === 'operation.doorOpenDepthMm' && claim.includesDoor !== true) {
    throw new TypeError('door-open depth must include the door');
  }
  normalizedProvenance(claim);
  return claim;
}

export function validateDimensionEvidenceClaimsV2(claims) {
  if (!Array.isArray(claims) || claims.length < 1) throw new TypeError('claim semantics v2 array required');
  const fields = new Set();
  for (const claim of claims) {
    validateDimensionEvidenceClaimV2(claim);
    if (fields.has(claim.field)) throw new TypeError(`duplicate claim field ${claim.field}`);
    fields.add(claim.field);
  }
  return claims;
}

function inferredScope(field, label) {
  const normalized = label.toLowerCase();
  if (field.startsWith('closedEnvelope.')) {
    if (/\b(?:pack(?:ed|age|aging)?|shipping|carton|box(?:ed)?|crate)\b/.test(normalized)) return 'delivery_package';
    if (/\b(?:cavity|cut[ -]?out|niche|opening)\b/.test(normalized)) return 'cavity_opening';
    if (/\b(?:cabinet|body)\b|without\s+(?:the\s+)?door|excluding\s+(?:the\s+)?door/.test(normalized)) return 'product_body';
  }
  return scopeForField(field);
}

function inferredFlag(label, noun) {
  const normalized = label.toLowerCase();
  if (noun === 'handle'
    && /(?:including|with)\s+(?:the\s+)?doors?\s*(?:and|&)\s*(?:the\s+)?handles?/.test(normalized)) {
    return true;
  }
  const qualifier = noun === 'handle' ? '(?:door\\s+)?' : '';
  if (new RegExp(`(?:including|with)\\s+(?:the\\s+)?${qualifier}${noun}s?`).test(normalized)) return true;
  if (new RegExp(`(?:excluding|without)\\s+(?:the\\s+)?${qualifier}${noun}s?`).test(normalized)) return false;
  return null;
}

export function upgradeLegacyDimensionClaim(claim) {
  const field = requiredText(claim?.field, 'legacy claim field');
  const axis = FIELD_AXIS[field];
  if (!axis) throw new TypeError(`unsupported legacy claim field ${field}`);
  const sourceLabel = requiredText(claim?.label, 'legacy claim label');
  const value = Number.isFinite(claim.value)
    ? { kind: 'fixed', mm: Number(claim.value) }
    : {
      kind: 'range',
      minMm: claim?.value?.minimumMm,
      maxMm: claim?.value?.maximumMm,
    };
  const upgraded = {
    field,
    value,
    sourceLabel,
    sourceAxisOrder: Array.isArray(claim.axisOrder) && claim.axisOrder.length
      ? [...claim.axisOrder]
      : [axis],
    sourceUnit: claim.sourceUnit ?? claim.unit,
    measurementScope: inferredScope(field, sourceLabel),
    includesDoor: field === 'operation.doorOpenDepthMm'
      ? true
      : inferredFlag(sourceLabel, 'door'),
    includesHandle: inferredFlag(sourceLabel, 'handle'),
    page: claim.page ?? null,
    fragmentSha256: claim.fragmentSha256 ?? null,
    bbox: claim.bbox ? [...claim.bbox] : null,
  };
  return validateDimensionEvidenceClaimV2(upgraded);
}

export function claimV2GeometryValue(claim) {
  validateDimensionEvidenceClaimV2(claim);
  if (claim.value.kind === 'fixed') return claim.value.mm;
  if (claim.field === 'closedEnvelope.heightMm') {
    return { minimumMm: claim.value.minMm, maximumMm: claim.value.maxMm };
  }
  return null;
}
