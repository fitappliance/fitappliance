const EVIDENCE_STATUSES = new Set(['pending', 'approved', 'rejected']);
const IDENTITY_MATCHES = new Set(['exact', 'alias', 'mismatch', 'unknown']);
const SOURCE_TYPES = new Set(['manufacturer', 'retailer', 'regulator', 'unknown']);

const DIMENSION_FIELDS = new Set([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
]);

const CLEARANCE_FIELDS = new Set([
  'installation.leftMm',
  'installation.rightMm',
  'installation.topMm',
  'installation.rearMm',
  'installation.frontMm',
]);

function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
  return value;
}

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value, field) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new TypeError(`${field} must be a string or null`);
  }
  return value.trim();
}

function requireEnum(value, field, allowed) {
  const normalized = requireString(value, field);
  if (!allowed.has(normalized)) {
    throw new RangeError(`unsupported ${field}: ${normalized}`);
  }
  return normalized;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freezeDeep(child);
    }
  }
  return value;
}

function normalizeIdentity(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function aliasApprovalReasons(record, aliasRegistry) {
  if (record.aliasApproved !== true) return ['identity_not_approved'];
  if (!aliasRegistry || !Array.isArray(aliasRegistry.aliases)) return ['alias_registry_approval_required'];
  const alias = aliasRegistry.aliases.find((candidate) => candidate.id === record.aliasDecisionId);
  if (!alias || alias.status !== 'approved') return ['alias_decision_not_approved'];
  const reasons = [];
  if (!alias.approved_fields.includes(record.field)) reasons.push('alias_field_not_approved');
  if (normalizeIdentity(alias.brand) !== normalizeIdentity(record.manufacturerBrand)) reasons.push('alias_brand_mismatch');
  if (normalizeIdentity(alias.target_model) !== normalizeIdentity(record.targetModel)) reasons.push('alias_target_model_mismatch');
  if (normalizeIdentity(alias.source_model) !== normalizeIdentity(record.sourceModel)) reasons.push('alias_source_model_mismatch');
  return reasons;
}

export function canApproveEvidence(input, { aliasRegistry = null } = {}) {
  const record = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const reasons = [];

  if (typeof record.id !== 'string' || !record.id.trim()) {
    reasons.push('invalid_evidence_id');
  }
  if (typeof record.productId !== 'string' || !record.productId.trim()) {
    reasons.push('invalid_product_id');
  }
  if (typeof record.field !== 'string' || !record.field.trim()) {
    reasons.push('invalid_field');
  }
  const valueIsFinite = typeof record.value === 'number' && Number.isFinite(record.value);
  const valueIsValid = valueIsFinite && (
    record.field?.startsWith('installation.') ? record.value >= 0 : record.value > 0
  );
  if (!valueIsValid) {
    reasons.push('invalid_value');
  }
  if (record.unit !== 'mm') {
    reasons.push('invalid_unit');
  }
  if (typeof record.sourceDocumentId !== 'string' || !record.sourceDocumentId.trim()) {
    reasons.push('missing_source_document_id');
  }
  if (!/^[0-9a-f]{64}$/.test(record.documentSha256 ?? '')) {
    reasons.push('invalid_document_sha256');
  }
  if (!Number.isInteger(record.page) || record.page < 1) {
    reasons.push('invalid_page');
  }
  if (typeof record.quote !== 'string' || !record.quote.trim()) {
    reasons.push('missing_quote');
  }
  if (typeof record.parserVersion !== 'string' || !record.parserVersion.trim()) {
    reasons.push('missing_parser_version');
  }
  if (record.identityMatch === 'alias') {
    reasons.push(...aliasApprovalReasons(record, aliasRegistry));
  } else if (record.identityMatch !== 'exact') {
    reasons.push('identity_not_approved');
  }
  if (record.documentAuthorType !== 'manufacturer') {
    reasons.push('document_not_manufacturer_authored');
  }
  if (record.transportHostType === 'retailer') {
    reasons.push('retailer_host_not_approvable');
  } else if (record.transportHostType !== 'manufacturer') {
    reasons.push('transport_host_not_approved');
  }

  return freezeDeep({ approved: reasons.length === 0, reasons });
}

export function createFieldEvidence(input, { aliasRegistry = null } = {}) {
  const evidence = requireObject(input, 'field evidence');
  if (typeof evidence.value !== 'number' || !Number.isFinite(evidence.value)) {
    throw new TypeError('evidence value must be a finite number');
  }
  if (evidence.value < 0) {
    throw new RangeError('evidence value must be non-negative');
  }
  if (evidence.unit !== 'mm') {
    throw new RangeError('evidence unit must be mm');
  }
  if (evidence.page !== null && !Number.isInteger(evidence.page)) {
    throw new TypeError('evidence page must be an integer or null');
  }
  if (typeof evidence.aliasApproved !== 'boolean') {
    throw new TypeError('aliasApproved must be a boolean');
  }

  const record = {
    id: requireString(evidence.id, 'evidence id'),
    productId: requireString(evidence.productId, 'product id'),
    field: requireString(evidence.field, 'evidence field'),
    value: evidence.value,
    unit: evidence.unit,
    sourceDocumentId: requireString(evidence.sourceDocumentId, 'source document id'),
    documentSha256: optionalString(evidence.documentSha256, 'document SHA-256'),
    page: evidence.page,
    quote: optionalString(evidence.quote, 'evidence quote'),
    parserVersion: optionalString(evidence.parserVersion, 'parser version'),
    identityMatch: requireEnum(evidence.identityMatch, 'identity match', IDENTITY_MATCHES),
    aliasApproved: evidence.aliasApproved,
    documentAuthorType: requireEnum(
      evidence.documentAuthorType,
      'document author type',
      SOURCE_TYPES,
    ),
    transportHostType: requireEnum(
      evidence.transportHostType,
      'transport host type',
      SOURCE_TYPES,
    ),
    status: requireEnum(evidence.status, 'evidence status', EVIDENCE_STATUSES),
    ...(evidence.identityMatch === 'alias' ? {
      aliasDecisionId: requireString(evidence.aliasDecisionId, 'alias decision id'),
      manufacturerBrand: requireString(evidence.manufacturerBrand, 'manufacturer brand'),
      targetModel: requireString(evidence.targetModel, 'alias target model'),
      sourceModel: requireString(evidence.sourceModel, 'alias source model'),
    } : {}),
  };

  const approval = canApproveEvidence(record, { aliasRegistry });
  if (record.status === 'approved' && !approval.approved) {
    throw new RangeError(`approved evidence failed gate: ${approval.reasons.join(', ')}`);
  }
  return freezeDeep(record);
}

export function evidenceLevel(records, { aliasRegistry = null } = {}) {
  if (!Array.isArray(records)) {
    throw new TypeError('evidence records must be an array');
  }

  const approvedFields = new Set(records
    .filter((record) => record?.status === 'approved' && canApproveEvidence(record, { aliasRegistry }).approved)
    .map((record) => record.field));
  const hasDimensions = [...DIMENSION_FIELDS].every((field) => approvedFields.has(field));
  if (!hasDimensions) {
    return 'none';
  }
  const hasClearances = [...CLEARANCE_FIELDS].every((field) => approvedFields.has(field));
  return hasClearances ? 'verified' : 'dimensions';
}
