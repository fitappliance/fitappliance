import {
  CanonicalEvidenceJsonError,
  canonicalEvidenceJson,
} from '../../shared/canonical-evidence-json.mjs';
import {
  normalizeV3FieldValue,
  requireV3Semantics,
  V3SemanticsValidationError,
} from './semantics.mjs';
import {
  validateEngineeringContext,
  V3EngineeringContextValidationError,
} from './engineering-context.mjs';

export class LegacySemanticsAdapterValidationError extends TypeError {
  constructor(code, message) {
    super(message);
    this.name = 'LegacySemanticsAdapterValidationError';
    this.code = code;
  }
}

const ENVELOPE_KEYS = ['kind', 'record', 'origin', 'owner'];
const ORIGIN_KEYS = ['containerSha256', 'jsonPointer'];
const OWNER_KEYS = ['case', 'source', 'claimIndex'];
const SHA256 = /^[a-f0-9]{64}$/;
const GEOMETRY_KINDS = new Set(['dimension_claim_v2', 'manufacturer_verification_binding']);
const INSTALLATION_KINDS = new Set(['installation_requirement_v2', 'installation_field_receipt_v1']);
const DIMENSION_RECORD_KEYS = new Set([
  'field', 'value', 'sourceLabel', 'sourceAxisOrder', 'sourceUnit', 'measurementScope',
  'includesDoor', 'includesHandle', 'page', 'fragmentSha256', 'bbox', 'applicability',
  'rangeMeaning', 'context', 'schemaVersion', 'claimId', 'id',
]);
const INSTALLATION_RECORD_KEYS = new Set([
  'schemaVersion', 'canonicalProductId', 'category', 'brand', 'model', 'formFactor',
  'field', 'value', 'unit', 'applicability', 'rangeMeaning', 'context', 'evidence',
  'evidenceClass', 'receiptId', 'semanticReceiptSha256', 'requirementId', 'id',
]);

function invalidEnvelope(code, message) {
  throw new LegacySemanticsAdapterValidationError(code, message);
}

function plainObject(value, label, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    invalidEnvelope(code, `${label} must be a JSON object`);
  }
  return value;
}

function exactKeys(value, label, keys, code) {
  plainObject(value, label, code);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) invalidEnvelope('UNKNOWN_ENVELOPE_KEY', `${label} has forbidden key ${key}`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) invalidEnvelope('MISSING_ENVELOPE_KEY', `${label} missing ${key}`);
  }
}

function validJsonPointer(value) {
  if (value === '') return true;
  if (typeof value !== 'string' || !value.startsWith('/')) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '~' && value[index + 1] !== '0' && value[index + 1] !== '1') return false;
  }
  return true;
}

function validateLegacyEnvelope(legacyObject) {
  try {
    canonicalEvidenceJson(legacyObject);
  } catch (error) {
    if (error instanceof CanonicalEvidenceJsonError) {
      invalidEnvelope('UNSAFE_JSON', error.message);
    }
    throw error;
  }
  exactKeys(legacyObject, 'legacy envelope', ENVELOPE_KEYS, 'INVALID_ENVELOPE');
  if (typeof legacyObject.kind !== 'string' || legacyObject.kind === '') {
    invalidEnvelope('INVALID_ENVELOPE_KIND', 'legacy envelope kind must be text');
  }
  plainObject(legacyObject.record, 'legacy record', 'INVALID_RECORD');

  exactKeys(legacyObject.origin, 'legacy origin', ORIGIN_KEYS, 'INVALID_ORIGIN');
  if (legacyObject.origin.containerSha256 !== null
    && (typeof legacyObject.origin.containerSha256 !== 'string' || !SHA256.test(legacyObject.origin.containerSha256))) {
    invalidEnvelope('INVALID_ORIGIN_HASH', 'legacy origin containerSha256 must be a raw SHA-256 or null');
  }
  if (legacyObject.origin.jsonPointer !== null && !validJsonPointer(legacyObject.origin.jsonPointer)) {
    invalidEnvelope('INVALID_ORIGIN_POINTER', 'legacy origin jsonPointer must be null or a strict JSON Pointer');
  }

  if (legacyObject.owner === null) return;
  exactKeys(legacyObject.owner, 'legacy owner', OWNER_KEYS, 'INVALID_OWNER');
  if (legacyObject.owner.case !== null) plainObject(legacyObject.owner.case, 'legacy owner case', 'INVALID_OWNER_CASE');
  if (legacyObject.owner.source !== null) plainObject(legacyObject.owner.source, 'legacy owner source', 'INVALID_OWNER_SOURCE');
  if (legacyObject.owner.claimIndex !== null
    && (!Number.isInteger(legacyObject.owner.claimIndex) || legacyObject.owner.claimIndex < 0)) {
    invalidEnvelope('INVALID_OWNER_CLAIM_INDEX', 'legacy owner claimIndex must be a nonnegative integer or null');
  }
}

function unresolved(path, reason, requiredWitnessKind) {
  return { path, reason, requiredWitnessKind };
}

function pointerPart(value) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

function recordLosses(record, knownKeys, basePath) {
  return Object.keys(record)
    .filter((key) => !knownKeys.has(key))
    .sort()
    .map((key) => ({
      path: `${basePath}/${pointerPart(key)}`,
      reason: 'UNMAPPED_LEGACY_KEY',
      retained: true,
    }));
}

function mappedFieldPath(record, policy) {
  if (typeof record?.field !== 'string') return null;
  const fieldPath = policy.aliases[record.field] ?? record.field;
  return policy.fields[fieldPath] ? fieldPath : null;
}

function cloneJson(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneJson);
  const copy = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
  for (const key of Object.keys(value)) {
    Object.defineProperty(copy, key, {
      value: cloneJson(value[key]), enumerable: true, writable: true, configurable: true,
    });
  }
  return copy;
}

function sameJson(left, right) {
  return canonicalEvidenceJson(left) === canonicalEvidenceJson(right);
}

function originGaps(origin) {
  const gaps = [];
  if (origin?.containerSha256 === null) {
    gaps.push(unresolved('/origin/containerSha256', 'ORIGIN_CONTAINER_HASH_UNRESOLVED', 'container_sha256'));
  }
  if (origin?.jsonPointer === null) {
    gaps.push(unresolved('/origin/jsonPointer', 'ORIGIN_JSON_POINTER_UNRESOLVED', 'json_pointer'));
  }
  return gaps;
}

function contextGaps(record, basePath, semantics) {
  if (!Object.hasOwn(record, 'context') || record.context === null) {
    return [unresolved(`${basePath}/context`, 'ENGINEERING_CONTEXT_UNSPECIFIED', 'engineering_context_assertion')];
  }
  const context = record.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return [unresolved(`${basePath}/context`, 'ENGINEERING_CONTEXT_UNUSABLE', 'engineering_context_assertion')];
  }
  const gaps = [];
  if (!explicitText(context.configurationKey) || context.configurationKey === 'unknown') {
    gaps.push(unresolved(
      `${basePath}/context/configurationKey`,
      'CONTEXT_CONFIGURATION_KEY_UNSPECIFIED',
      'engineering_context_configuration',
    ));
  }
  if (!explicitText(context.referenceDatum) || context.referenceDatum === 'unknown') {
    gaps.push(unresolved(
      `${basePath}/context/referenceDatum`,
      'CONTEXT_REFERENCE_DATUM_UNSPECIFIED',
      'engineering_context_reference_datum',
    ));
  }
  if (!context.operatingState || typeof context.operatingState !== 'object'
    || Array.isArray(context.operatingState) || !explicitText(context.operatingState.kind)
    || context.operatingState.kind === 'unknown') {
    gaps.push(unresolved(
      `${basePath}/context/operatingState`,
      'CONTEXT_OPERATING_STATE_UNSPECIFIED',
      'engineering_context_operating_state',
    ));
  }
  if (gaps.length > 0) return gaps;
  try {
    validateEngineeringContext({
      context,
      semantics,
      witnessedConditions: [],
    });
  } catch (error) {
    if (error instanceof V3EngineeringContextValidationError) {
      gaps.push(unresolved(
        `${basePath}/context`,
        `CONTEXT_${error.code}_INVALID`,
        'engineering_context_assertion',
      ));
      return gaps;
    }
    throw error;
  }
  return gaps;
}

function measurementScopeGaps(record, policy, basePath) {
  const fieldPath = mappedFieldPath(record, policy);
  if (fieldPath === null) return [];
  if (!explicitText(record.measurementScope)) {
    return [unresolved(
      `${basePath}/measurementScope`,
      'MEASUREMENT_SCOPE_UNSPECIFIED',
      'measurement_scope_assertion',
    )];
  }
  if (record.measurementScope !== policy.fields[fieldPath].measurementScope) {
    return [unresolved(
      `${basePath}/measurementScope`,
      'MEASUREMENT_SCOPE_MISMATCH',
      'compatible_measurement_scope_transform',
    )];
  }
  return [];
}

function geometryGaps(record, basePath, policy, semantics) {
  const gaps = [];
  if (!Object.hasOwn(record, 'applicability') || record.applicability === null) {
    gaps.push(unresolved(`${basePath}/applicability`, 'APPLICABILITY_UNSPECIFIED', 'applicability_assertion'));
  } else if (record.applicability === 'unknown') {
    gaps.push(unresolved(`${basePath}/applicability`, 'APPLICABILITY_UNKNOWN', 'applicability_assertion'));
  }
  gaps.push(...contextGaps(record, basePath, semantics));
  gaps.push(...measurementScopeGaps(record, policy, basePath));
  if (!explicitText(record.sourceUnit)) {
    gaps.push(unresolved(`${basePath}/sourceUnit`, 'SOURCE_UNIT_UNSPECIFIED', 'source_unit_assertion'));
  } else if (!['mm', 'cm'].includes(record.sourceUnit)) {
    gaps.push(unresolved(`${basePath}/sourceUnit`, 'SOURCE_UNIT_UNSUPPORTED', 'source_unit_assertion'));
  }
  if (!Array.isArray(record.sourceAxisOrder) || record.sourceAxisOrder.length === 0) {
    gaps.push(unresolved(`${basePath}/sourceAxisOrder`, 'SOURCE_AXIS_ORDER_UNSPECIFIED', 'axis_order_assertion'));
  }
  if (record.value?.kind === 'range'
    && (!Object.hasOwn(record, 'rangeMeaning') || record.rangeMeaning === null)) {
    gaps.push(unresolved(`${basePath}/rangeMeaning`, 'RANGE_MEANING_UNSPECIFIED', 'range_meaning_assertion'));
  }
  const fieldPath = mappedFieldPath(record, policy);
  const inclusionComponents = fieldPath === null ? [] : policy.fields[fieldPath].inclusionComponents;
  if (inclusionComponents.includes('door')
    && (!Object.hasOwn(record, 'includesDoor') || record.includesDoor === null)) {
    gaps.push(unresolved(`${basePath}/includesDoor`, 'INCLUSION_UNKNOWN', 'inclusion_assertion'));
  }
  if (inclusionComponents.includes('handle')
    && (!Object.hasOwn(record, 'includesHandle') || record.includesHandle === null)) {
    gaps.push(unresolved(`${basePath}/includesHandle`, 'INCLUSION_UNKNOWN', 'inclusion_assertion'));
  }
  return gaps;
}

function geometryInclusions(record, policy) {
  const fieldPath = mappedFieldPath(record, policy);
  if (fieldPath === null) return {};
  const inclusions = {};
  if (policy.fields[fieldPath].inclusionComponents.includes('door')) inclusions.door = record.includesDoor;
  if (policy.fields[fieldPath].inclusionComponents.includes('handle')) inclusions.handle = record.includesHandle;
  return inclusions;
}

function geometryRawValue(record, gaps, basePath) {
  if (!record.value || typeof record.value !== 'object' || Array.isArray(record.value)) {
    gaps.push(unresolved(`${basePath}/value`, 'VALUE_NOT_NORMALIZABLE', 'valid_semantic_value'));
    return null;
  }
  if (record.value.kind === 'fixed') {
    if (record.value.mm === null) {
      gaps.push(unresolved(`${basePath}/value/mm`, 'VALUE_NOT_NORMALIZABLE', 'valid_semantic_value'));
      return null;
    }
    return record.value.mm;
  }
  if (record.value.kind === 'range') {
    if (!Object.hasOwn(record, 'rangeMeaning') || record.rangeMeaning === null) return null;
    return {
      kind: 'range',
      minimum: record.value.minMm,
      maximum: record.value.maxMm,
      rangeMeaning: record.rangeMeaning,
    };
  }
  gaps.push(unresolved(`${basePath}/value`, 'VALUE_NOT_NORMALIZABLE', 'valid_semantic_value'));
  return null;
}

function normalizeGeometryValue(record, semantics, policy, gaps, basePath) {
  if (mappedFieldPath(record, policy) === null || record.applicability === 'unknown') return null;
  const rawValue = geometryRawValue(record, gaps, basePath);
  if (rawValue === null) return null;
  try {
    return normalizeV3FieldValue({
      rawValue,
      unit: 'mm',
      fieldPath: record.field,
      applicability: record.applicability,
      inclusions: geometryInclusions(record, policy),
      semantics,
    });
  } catch (error) {
    if (error instanceof V3SemanticsValidationError) {
      gaps.push(unresolved(`${basePath}/value`, 'VALUE_NOT_NORMALIZABLE', 'valid_semantic_value'));
      return null;
    }
    throw error;
  }
}

function sourceRepresentation(record) {
  return {
    label: record?.sourceLabel ?? null,
    axisOrder: record?.sourceAxisOrder ?? null,
    sourceUnit: record?.sourceUnit ?? null,
    measurementScope: record?.measurementScope ?? null,
    inclusions: {
      door: record?.includesDoor ?? null,
      handle: record?.includesHandle ?? null,
    },
  };
}

function explicitText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function resolveOwnerSelection(owner, { required = false } = {}) {
  const gaps = [];
  if (owner === null && !required) return { source: null, selectedClaim: null, associationValid: true, gaps };
  if (!owner || !owner.source) {
    gaps.push(unresolved('/owner/source', 'OWNER_SOURCE_UNRESOLVED', 'legacy_source_record'));
    gaps.push(unresolved('/owner/claimIndex', 'OWNER_CLAIM_SELECTION_UNRESOLVED', 'source_claim_selection'));
    return { source: null, selectedClaim: null, associationValid: false, gaps };
  }

  const source = owner.source;
  let associationValid = true;
  let selectedClaim = null;
  if (!Number.isInteger(owner.claimIndex) || owner.claimIndex < 0
    || !Array.isArray(source.claims) || owner.claimIndex >= source.claims.length
    || !source.claims[owner.claimIndex] || typeof source.claims[owner.claimIndex] !== 'object'
    || Array.isArray(source.claims[owner.claimIndex])) {
    gaps.push(unresolved('/owner/claimIndex', 'OWNER_CLAIM_SELECTION_UNRESOLVED', 'source_claim_selection'));
  } else {
    selectedClaim = source.claims[owner.claimIndex];
  }

  if (owner.case !== null) {
    const sources = Array.isArray(owner.case?.sources) ? owner.case.sources : [];
    if (!sources.some((candidate) => sameJson(candidate, source))) {
      associationValid = false;
      gaps.push(unresolved('/owner/case/sources', 'OWNER_SOURCE_CASE_MEMBERSHIP_MISMATCH', 'case_source_membership'));
    }
    const identity = source.identity;
    if (!identity || identity.outcome !== 'exact'
      || !explicitText(identity.brand) || !explicitText(identity.model)
      || !explicitText(owner.case?.brand) || !explicitText(owner.case?.model)
      || identity.brand !== owner.case.brand || identity.model !== owner.case.model) {
      associationValid = false;
      gaps.push(unresolved('/owner/case', 'OWNER_IDENTITY_MISMATCH', 'exact_product_identity_assertion'));
    }
  }
  return { source, selectedClaim, associationValid, gaps };
}

function resolveManufacturerOwner(record, owner) {
  const resolved = resolveOwnerSelection(owner, { required: true });
  if (!resolved.source) return { selectedClaim: null, claimPath: null, gaps: resolved.gaps };
  if (!Object.hasOwn(resolved.source, 'verificationReceipt')) {
    resolved.associationValid = false;
    resolved.gaps.push(unresolved(
      '/owner/source/verificationReceipt',
      'OWNER_RECEIPT_ASSOCIATION_UNRESOLVED',
      'matching_source_verification_receipt',
    ));
  } else if (!sameJson(resolved.source.verificationReceipt, record)) {
    resolved.associationValid = false;
    resolved.gaps.push(unresolved(
      '/owner/source/verificationReceipt',
      'OWNER_RECEIPT_ASSOCIATION_MISMATCH',
      'matching_source_verification_receipt',
    ));
  }
  return {
    selectedClaim: resolved.associationValid ? resolved.selectedClaim : null,
    claimPath: resolved.selectedClaim === null ? null : `/owner/source/claims/${owner.claimIndex}`,
    gaps: resolved.gaps,
  };
}

function suppliedOwnerGaps(record, owner) {
  const resolved = resolveOwnerSelection(owner);
  if (resolved.selectedClaim && !sameJson(resolved.selectedClaim, record)) {
    resolved.gaps.push(unresolved(
      `/owner/source/claims/${owner.claimIndex}`,
      'OWNER_CLAIM_MISMATCH',
      'matching_legacy_claim',
    ));
  }
  return resolved.gaps;
}

function geometryCandidate({ legacy, record, normalizedValue = null }) {
  return {
    kind: 'legacy_geometry_candidate',
    disposition: 'candidate_only',
    assertion: {
      status: normalizedValue === null ? 'partial' : 'normalized',
      fieldPath: record?.field ?? null,
      rawValue: record?.value ?? null,
      normalizedValue,
      sourceRepresentation: sourceRepresentation(record),
    },
    legacy,
  };
}

function unsupportedCandidate(legacy) {
  return {
    kind: 'unsupported_legacy_candidate',
    disposition: 'candidate_only',
    assertion: {
      status: 'unsupported',
      fieldPath: null,
      rawValue: legacy.record.value ?? null,
      normalizedValue: null,
      sourceRepresentation: null,
    },
    legacy,
  };
}

function unsupportedResult(legacy) {
  return {
    candidate: unsupportedCandidate(legacy),
    losses: [{
      path: '/record',
      reason: 'UNSUPPORTED_CONTRACT_RECORD_RETAINED',
      retained: true,
    }],
    unresolved: [
      ...originGaps(legacy.origin),
      unresolved('/kind', 'UNSUPPORTED_CONTRACT', 'contract_adapter'),
    ],
  };
}

function unsupportedFieldGap(record, policy, basePath) {
  return mappedFieldPath(record, policy) === null
    ? [unresolved(`${basePath}/field`, 'UNSUPPORTED_FIELD', 'semantic_field_mapping')]
    : [];
}

export function adaptLegacyGeometryCandidate({ legacyObject, semantics }) {
  const policy = requireV3Semantics(semantics);
  validateLegacyEnvelope(legacyObject);
  const legacy = cloneJson(legacyObject);
  if (!GEOMETRY_KINDS.has(legacy.kind)) return unsupportedResult(legacy);
  const gaps = originGaps(legacy.origin);

  if (legacy.kind === 'manufacturer_verification_binding') {
    const owner = resolveManufacturerOwner(legacy.record, legacy.owner);
    gaps.push(...owner.gaps);
    let normalizedValue = null;
    if (owner.selectedClaim) {
      const semanticGaps = geometryGaps(owner.selectedClaim, owner.claimPath, policy, semantics);
      const fieldGaps = unsupportedFieldGap(owner.selectedClaim, policy, owner.claimPath);
      gaps.push(...semanticGaps, ...fieldGaps);
      if (semanticGaps.length === 0 && fieldGaps.length === 0) {
        normalizedValue = normalizeGeometryValue(owner.selectedClaim, semantics, policy, gaps, owner.claimPath);
      }
    }
    return {
      candidate: geometryCandidate({ legacy, record: owner.selectedClaim, normalizedValue }),
      losses: owner.selectedClaim
        ? recordLosses(owner.selectedClaim, DIMENSION_RECORD_KEYS, owner.claimPath)
        : [],
      unresolved: gaps,
    };
  }

  const semanticGaps = geometryGaps(legacy.record, '/record', policy, semantics);
  const fieldGaps = unsupportedFieldGap(legacy.record, policy, '/record');
  gaps.push(...semanticGaps, ...fieldGaps);
  gaps.push(...suppliedOwnerGaps(legacy.record, legacy.owner));
  const normalizedValue = semanticGaps.length === 0 && fieldGaps.length === 0
    ? normalizeGeometryValue(legacy.record, semantics, policy, gaps, '/record')
    : null;
  return {
    candidate: geometryCandidate({ legacy, record: legacy.record, normalizedValue }),
    losses: recordLosses(legacy.record, DIMENSION_RECORD_KEYS, '/record'),
    unresolved: gaps,
  };
}

function installationCandidate({ legacy, record, normalizedValue }) {
  return {
    kind: 'legacy_installation_candidate',
    disposition: 'candidate_only',
    assertion: {
      status: normalizedValue === null ? 'partial' : 'normalized',
      fieldPath: normalizedValue?.fieldPath ?? record?.field ?? null,
      rawValue: record?.value ?? null,
      normalizedValue,
      sourceRepresentation: { unit: record?.unit ?? null },
    },
    legacy,
  };
}

function installationRawValue(record, gaps) {
  const value = record.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !Object.hasOwn(value, 'minimumMm') || !Object.hasOwn(value, 'maximumMm')) {
    return { value, normalizable: true };
  }
  let normalizable = true;
  if (!Object.hasOwn(record, 'rangeMeaning') || record.rangeMeaning === null) {
    gaps.push(unresolved('/record/rangeMeaning', 'RANGE_MEANING_UNSPECIFIED', 'range_meaning_assertion'));
    normalizable = false;
  }
  if (typeof record.unit === 'string' && record.unit !== 'mm') {
    gaps.push(unresolved('/record/unit', 'RANGE_UNIT_CONFLICT', 'canonical_range_unit_assertion'));
    normalizable = false;
  }
  if (!normalizable) return { value: null, normalizable: false };
  return {
    value: {
      kind: 'range',
      minimum: value.minimumMm,
      maximum: value.maximumMm,
      rangeMeaning: record.rangeMeaning,
    },
    normalizable: true,
  };
}

function normalizeInstallationValue(record, semantics, policy, gaps) {
  if (mappedFieldPath(record, policy) === null) {
    gaps.push(unresolved('/record/field', 'UNSUPPORTED_FIELD', 'semantic_field_mapping'));
    return null;
  }
  if (!Object.hasOwn(record, 'applicability') || record.applicability === null) {
    gaps.push(unresolved('/record/applicability', 'APPLICABILITY_UNSPECIFIED', 'applicability_assertion'));
    return null;
  }
  try {
    const raw = installationRawValue(record, gaps);
    if (!raw.normalizable) return null;
    const normalizedValue = normalizeV3FieldValue({
      rawValue: raw.value,
      unit: record.unit,
      fieldPath: record.field,
      applicability: record.applicability,
      semantics,
    });
    if (record.applicability === 'unknown') {
      gaps.push(unresolved('/record/applicability', 'APPLICABILITY_UNKNOWN', 'applicability_assertion'));
    }
    return normalizedValue;
  } catch (error) {
    if (error instanceof V3SemanticsValidationError) {
      gaps.push(unresolved('/record/value', 'VALUE_NOT_NORMALIZABLE', 'valid_semantic_value'));
      return null;
    }
    throw error;
  }
}

export function adaptLegacyInstallationCandidate({ legacyObject, semantics }) {
  const policy = requireV3Semantics(semantics);
  validateLegacyEnvelope(legacyObject);
  const legacy = cloneJson(legacyObject);
  if (!INSTALLATION_KINDS.has(legacy.kind)) return unsupportedResult(legacy);
  const record = legacy.record;
  const gaps = originGaps(legacy.origin);
  const normalizedValue = normalizeInstallationValue(record, semantics, policy, gaps);
  gaps.push(...contextGaps(record, '/record', semantics));
  return {
    candidate: installationCandidate({ legacy, record, normalizedValue }),
    losses: recordLosses(record, INSTALLATION_RECORD_KEYS, '/record'),
    unresolved: gaps,
  };
}
