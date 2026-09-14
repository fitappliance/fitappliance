import { createHash } from 'node:crypto';

import {
  CANONICAL_EVIDENCE_JSON_VERSION,
  CanonicalEvidenceJsonError,
  canonicalEvidenceJson,
} from '../../shared/canonical-evidence-json.mjs';
import { INSTALLATION_KNOWLEDGE_FIELDS } from '../installation-knowledge-v3.mjs';

const APPLICABILITY = new Set(['required', 'optional', 'not_applicable', 'unknown']);
const RANGE_MEANINGS = new Set(['adjustment', 'uncertainty', 'allowed_interval']);
const SHA256 = /^[a-f0-9]{64}$/;
const EXPECTED_UNIT_CONVERSIONS = Object.freeze({
  mm: Object.freeze({ mm: [1, 1], cm: [10, 1], m: [1000, 1] }),
  mm2: Object.freeze({ mm2: [1, 1] }),
  m3: Object.freeze({ m3: [1, 1] }),
  kPa: Object.freeze({ kPa: [1, 1] }),
  V: Object.freeze({ V: [1, 1] }),
  A: Object.freeze({ A: [1, 1] }),
  kg: Object.freeze({ kg: [1, 1] }),
  L: Object.freeze({ L: [1, 1] }),
});
const LEGACY_DIMENSION_FIELDS = Object.freeze({
  'closedEnvelope.widthMm': ['width', 'product_closed_external'],
  'closedEnvelope.heightMm': ['height', 'product_closed_external'],
  'closedEnvelope.depthMm': ['depth', 'product_closed_external'],
  'installation.leftMm': ['left', 'installation_clearance'],
  'installation.rightMm': ['right', 'installation_clearance'],
  'installation.topMm': ['top', 'installation_clearance'],
  'installation.rearMm': ['rear', 'installation_clearance'],
  'installation.frontMm': ['front', 'installation_clearance'],
  'operation.doorOpenDepthMm': ['depth', 'door_open_envelope'],
  'operation.hingeSideSpaceMm': ['hinge_side', 'door_open_envelope'],
  'operation.lidOpenHeightMm': ['height', 'door_open_envelope'],
  'service.plumbingRearMm': ['rear', 'service_space'],
  'service.rearServicesMm': ['rear', 'service_space'],
  'service.rearVentilationMm': ['rear', 'service_space'],
  'delivery.widthMm': ['width', 'delivery_package'],
  'delivery.heightMm': ['height', 'delivery_package'],
  'delivery.depthMm': ['depth', 'delivery_package'],
});

export class V3SemanticsValidationError extends TypeError {
  constructor(code, message) {
    super(message);
    this.name = 'V3SemanticsValidationError';
    this.code = code;
  }
}

function invalid(code, message) {
  throw new V3SemanticsValidationError(code, message);
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    invalid('INVALID_OBJECT', `${label} must be a plain object`);
  }
  return value;
}

function exactKeys(value, label, required, optional = []) {
  plainObject(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) invalid('UNKNOWN_KEY', `${label} unknown key: ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) invalid('MISSING_KEY', `${label} missing key: ${key}`);
  }
  return value;
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') invalid('INVALID_TEXT', `${label} required`);
  return value;
}

function jsonClone(value) {
  return JSON.parse(canonicalEvidenceJson(value));
}

function canonicalSha256(value) {
  return createHash('sha256').update(canonicalEvidenceJson(value), 'utf8').digest('hex');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function unitForInstallationField(fieldPath, type) {
  if (type === 'boolean') return null;
  if (fieldPath.endsWith('Mm2')) return 'mm2';
  if (fieldPath.endsWith('M3')) return 'm3';
  if (fieldPath.endsWith('Kpa')) return 'kPa';
  if (fieldPath.endsWith('VoltageV')) return 'V';
  if (fieldPath.endsWith('CurrentA')) return 'A';
  if (fieldPath.endsWith('Kg')) return 'kg';
  if (fieldPath.endsWith('Mm')) return 'mm';
  invalid('UNKNOWN_UNIT', `installation field ${fieldPath} has no declared unit`);
}

function resolvedAlias(fieldPath, aliases) {
  const canonical = aliases[fieldPath] ?? fieldPath;
  if (aliases[canonical] && aliases[canonical] !== canonical) {
    invalid('ALIAS_CHAIN', `alias chains are not supported: ${fieldPath}`);
  }
  return canonical;
}

function boundsFor() {
  return { minimum: 0, maximum: null, integerCanonical: false };
}

function legacyDimensionBounds(fieldPath) {
  return {
    minimum: fieldPath.startsWith('closedEnvelope.') || fieldPath.startsWith('delivery.') ? 1 : 0,
    maximum: 10_000,
    integerCanonical: true,
  };
}

function inclusionPolicy(fieldPath) {
  if (fieldPath.startsWith('closedEnvelope.') || fieldPath.startsWith('productBody.')) {
    return { components: ['door', 'handle'], required: {} };
  }
  if (fieldPath === 'operation.doorOpenDepthMm') {
    return { components: ['door'], required: { door: 'included' } };
  }
  return { components: [], required: {} };
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function validateOverlay(overlay) {
  exactKeys(overlay, 'semantics overlay', [
    'schemaVersion', 'policyVersion', 'canonicalizationVersion', 'aliases',
    'reviewOnlyFieldPaths', 'requirementGroups', 'additionalFields', 'unitConversions',
    'legacyDimensionFields', 'allowedRangeMeanings', 'rangeMeaningOverrides', 'context',
  ]);
  if (overlay.schemaVersion !== 1) invalid('OVERLAY_VERSION', 'semantics overlay schemaVersion 1 required');
  requiredText(overlay.policyVersion, 'semantics overlay policyVersion');
  if (overlay.canonicalizationVersion !== CANONICAL_EVIDENCE_JSON_VERSION) {
    invalid('CANONICALIZATION_VERSION', 'semantics overlay canonicalizationVersion unsupported');
  }
  plainObject(overlay.aliases, 'semantics overlay aliases');
  for (const [source, target] of Object.entries(overlay.aliases)) {
    requiredText(source, 'semantics alias source');
    requiredText(target, 'semantics alias target');
  }
  if (!Array.isArray(overlay.reviewOnlyFieldPaths)
    || overlay.reviewOnlyFieldPaths.some((fieldPath) => typeof fieldPath !== 'string')) {
    invalid('REVIEW_ONLY_FIELDS', 'reviewOnlyFieldPaths must be strings');
  }
  plainObject(overlay.requirementGroups, 'semantics overlay requirementGroups');
  plainObject(overlay.additionalFields, 'semantics overlay additionalFields');
  validateUnitConversions(overlay.unitConversions);
  validateLegacyDimensionFields(overlay.legacyDimensionFields);
  if (!Array.isArray(overlay.allowedRangeMeanings)
    || overlay.allowedRangeMeanings.some((meaning) => !RANGE_MEANINGS.has(meaning))) {
    invalid('RANGE_MEANING', 'semantics overlay range meanings unsupported');
  }
  plainObject(overlay.rangeMeaningOverrides, 'semantics overlay rangeMeaningOverrides');
  plainObject(overlay.context, 'semantics overlay context');
  return overlay;
}

function validateUnitConversions(unitConversions) {
  exactKeys(
    unitConversions,
    'semantics overlay unitConversions',
    Object.keys(EXPECTED_UNIT_CONVERSIONS),
  );
  for (const [canonicalUnit, expectedSources] of Object.entries(EXPECTED_UNIT_CONVERSIONS)) {
    const declaredSources = unitConversions[canonicalUnit];
    exactKeys(
      declaredSources,
      `unit conversion sources for ${canonicalUnit}`,
      Object.keys(expectedSources),
    );
    for (const [sourceUnit, [numerator, denominator]] of Object.entries(expectedSources)) {
      const declared = declaredSources[sourceUnit];
      exactKeys(declared, `unit conversion ${sourceUnit}->${canonicalUnit}`, ['numerator', 'denominator']);
      if (declared.numerator !== numerator || declared.denominator !== denominator) {
        invalid('UNIT_CONVERSION', `unit conversion ${sourceUnit}->${canonicalUnit} is not permitted`);
      }
    }
  }
}

function validateLegacyDimensionFields(legacyDimensionFields) {
  if (!Array.isArray(legacyDimensionFields)
    || legacyDimensionFields.length !== Object.keys(LEGACY_DIMENSION_FIELDS).length) {
    invalid('LEGACY_DIMENSION_FIELDS', 'legacy dimension field contract is incomplete');
  }
  const seen = new Set();
  for (const definition of legacyDimensionFields) {
    exactKeys(definition, 'legacy dimension field', ['fieldPath', 'axis', 'measurementScope']);
    const fieldPath = requiredText(definition.fieldPath, 'legacy dimension field path');
    const axis = requiredText(definition.axis, `legacy dimension field ${fieldPath} axis`);
    const measurementScope = requiredText(
      definition.measurementScope,
      `legacy dimension field ${fieldPath} measurement scope`,
    );
    const expected = LEGACY_DIMENSION_FIELDS[fieldPath];
    if (!expected || seen.has(fieldPath)
      || expected[0] !== axis || expected[1] !== measurementScope) {
      invalid('LEGACY_DIMENSION_FIELDS', `legacy dimension field contract invalid: ${fieldPath}`);
    }
    seen.add(fieldPath);
  }
}

function addField(fields, candidate) {
  const existing = fields.get(candidate.fieldPath);
  if (!existing) {
    fields.set(candidate.fieldPath, candidate);
    return;
  }
  if (existing.valueType !== candidate.valueType || existing.canonicalUnit !== candidate.canonicalUnit
    || existing.measurementScope !== candidate.measurementScope) {
    invalid('FIELD_CONFLICT', `conflicting semantic definitions for ${candidate.fieldPath}`);
  }
  if (existing.axis !== null && candidate.axis !== null && existing.axis !== candidate.axis) {
    invalid('FIELD_CONFLICT', `conflicting semantic axis for ${candidate.fieldPath}`);
  }
  if (existing.axis === null) existing.axis = candidate.axis;
  existing.sourceFieldPaths = sortedUnique([...existing.sourceFieldPaths, ...candidate.sourceFieldPaths]);
  existing.allowedValueKinds = sortedUnique([...existing.allowedValueKinds, ...candidate.allowedValueKinds]);
  existing.allowedRangeMeanings = sortedUnique([
    ...existing.allowedRangeMeanings,
    ...candidate.allowedRangeMeanings,
  ]);
  existing.sourceDefinitions.push(...candidate.sourceDefinitions);
}

function numericFieldCandidate({ fieldPath, sourceFieldPath, canonicalUnit, measurementScope, fitRole, valueKinds, overlay, axis = null, sourceDefinition = null }) {
  const inclusion = inclusionPolicy(fieldPath);
  const allowedRangeMeanings = valueKinds.includes('range')
    ? (overlay.rangeMeaningOverrides[fieldPath] ?? overlay.allowedRangeMeanings)
    : [];
  if (!overlay.unitConversions[canonicalUnit]) {
    invalid('UNIT_POLICY', `missing unit conversion policy for ${fieldPath}`);
  }
  return {
    fieldPath,
    sourceFieldPaths: [sourceFieldPath],
    valueType: 'numeric',
    canonicalUnit,
    axis,
    measurementScope,
    fitRole,
    isFitLength: canonicalUnit === 'mm',
    allowedValueKinds: [...valueKinds],
    allowedRangeMeanings: [...allowedRangeMeanings],
    bounds: boundsFor(),
    sourceUnits: jsonClone(overlay.unitConversions[canonicalUnit]),
    inclusionComponents: inclusion.components,
    requiredInclusions: inclusion.required,
    sourceDefinitions: sourceDefinition === null ? [] : [jsonClone(sourceDefinition)],
  };
}

function booleanFieldCandidate({ fieldPath, sourceFieldPath, measurementScope, fitRole, sourceDefinition = null }) {
  const inclusion = inclusionPolicy(fieldPath);
  return {
    fieldPath,
    sourceFieldPaths: [sourceFieldPath],
    valueType: 'boolean',
    canonicalUnit: null,
    axis: null,
    measurementScope,
    fitRole,
    isFitLength: false,
    allowedValueKinds: ['boolean'],
    allowedRangeMeanings: [],
    bounds: null,
    sourceUnits: null,
    inclusionComponents: inclusion.components,
    requiredInclusions: inclusion.required,
    sourceDefinitions: sourceDefinition === null ? [] : [jsonClone(sourceDefinition)],
  };
}

function policyForAdditionalField(fieldPath, definition, overlay) {
  exactKeys(definition, `additional field ${fieldPath}`, [
    'valueType', 'canonicalUnit', 'measurementScope', 'fitRole', 'isFitLength', 'allowedValueKinds',
  ]);
  if (definition.valueType !== 'numeric' || typeof definition.canonicalUnit !== 'string'
    || !Array.isArray(definition.allowedValueKinds)) {
    invalid('ADDITIONAL_FIELD', `additional field ${fieldPath} invalid`);
  }
  const candidate = numericFieldCandidate({
    fieldPath,
    sourceFieldPath: fieldPath,
    canonicalUnit: definition.canonicalUnit,
    measurementScope: definition.measurementScope,
    fitRole: definition.fitRole,
    valueKinds: definition.allowedValueKinds,
    overlay,
  });
  candidate.isFitLength = definition.isFitLength;
  return candidate;
}

function applyLegacyDimensionFields(fields, legacyDimensionFields, overlay) {
  for (const legacyDefinition of legacyDimensionFields) {
    const { fieldPath, axis, measurementScope } = legacyDefinition;
    const existing = fields.get(fieldPath);
    if (existing) {
      if (existing.valueType !== 'numeric' || existing.canonicalUnit !== 'mm') {
        invalid('LEGACY_DIMENSION_FIELDS', `${fieldPath} must remain a numeric millimetre field`);
      }
      existing.axis = axis;
      existing.measurementScope = measurementScope;
      existing.allowedValueKinds = sortedUnique([...existing.allowedValueKinds, 'fixed', 'range']);
      existing.allowedRangeMeanings = sortedUnique([
        ...existing.allowedRangeMeanings,
        ...overlay.allowedRangeMeanings,
      ]);
      existing.bounds = legacyDimensionBounds(fieldPath);
      continue;
    }
    const field = numericFieldCandidate({
      fieldPath,
      sourceFieldPath: fieldPath,
      canonicalUnit: 'mm',
      axis,
      measurementScope,
      fitRole: 'conditional_service',
      valueKinds: ['fixed', 'range'],
      overlay,
    });
    field.bounds = legacyDimensionBounds(fieldPath);
    fields.set(fieldPath, field);
  }
}

function semanticPolicyFromInputs({ fieldDictionary, installationMatrix, overlay }) {
  plainObject(fieldDictionary, 'field dictionary');
  if (!Array.isArray(fieldDictionary.fields)) invalid('FIELD_DICTIONARY', 'field dictionary fields required');
  plainObject(installationMatrix, 'installation applicability matrix');
  validateOverlay(overlay);

  const dictionaryById = new Map();
  for (const definition of fieldDictionary.fields) {
    plainObject(definition, 'field dictionary definition');
    const id = requiredText(definition.id, 'field dictionary definition id');
    if (dictionaryById.has(id)) invalid('DUPLICATE_FIELD', `field dictionary duplicate: ${id}`);
    dictionaryById.set(id, definition);
  }

  const fields = new Map();
  const nonClaimFields = new Map();
  const reviewOnly = new Set(overlay.reviewOnlyFieldPaths);
  for (const definition of fieldDictionary.fields) {
    const fieldPath = resolvedAlias(definition.id, overlay.aliases);
    const numeric = ['scalar', 'range'].includes(definition.valueShape) && typeof definition.unit === 'string';
    if (reviewOnly.has(definition.id) || reviewOnly.has(fieldPath)) {
      nonClaimFields.set(definition.id, {
        disposition: 'review_only',
        canonicalFieldPath: fieldPath,
        sourceDefinition: jsonClone(definition),
      });
      continue;
    }
    if (!numeric) {
      nonClaimFields.set(definition.id, {
        disposition: 'metadata_only',
        canonicalFieldPath: fieldPath,
        sourceDefinition: jsonClone(definition),
      });
      continue;
    }
    addField(fields, numericFieldCandidate({
      fieldPath,
      sourceFieldPath: definition.id,
      canonicalUnit: definition.unit,
      axis: definition.axis ?? null,
      measurementScope: definition.scope,
      fitRole: definition.fitRole,
      valueKinds: definition.valueShape === 'range' ? ['range'] : ['fixed'],
      overlay,
      sourceDefinition: definition,
    }));
  }

  for (const [sourceFieldPath, type] of Object.entries(INSTALLATION_KNOWLEDGE_FIELDS)) {
    const fieldPath = resolvedAlias(sourceFieldPath, overlay.aliases);
    if (reviewOnly.has(sourceFieldPath) || reviewOnly.has(fieldPath)) continue;
    const dictionaryDefinition = dictionaryById.get(sourceFieldPath) ?? null;
    const existingField = fields.get(fieldPath) ?? null;
    const measurementScope = dictionaryDefinition?.scope ?? existingField?.measurementScope ?? 'installation_requirement';
    const fitRole = dictionaryDefinition?.fitRole ?? existingField?.fitRole ?? 'installation_requirement';
    if (type === 'boolean') {
      addField(fields, booleanFieldCandidate({
        fieldPath,
        sourceFieldPath,
        measurementScope,
        fitRole,
        sourceDefinition: dictionaryDefinition,
      }));
      continue;
    }
    addField(fields, numericFieldCandidate({
      fieldPath,
      sourceFieldPath,
      canonicalUnit: dictionaryDefinition?.unit ?? unitForInstallationField(sourceFieldPath, type),
      axis: dictionaryDefinition?.axis ?? existingField?.axis ?? null,
      measurementScope,
      fitRole,
      valueKinds: type === 'height' ? ['fixed', 'range'] : ['fixed'],
      overlay,
      sourceDefinition: dictionaryDefinition,
    }));
  }

  for (const [fieldPath, definition] of Object.entries(overlay.additionalFields)) {
    addField(fields, policyForAdditionalField(fieldPath, definition, overlay));
  }

  applyLegacyDimensionFields(fields, overlay.legacyDimensionFields, overlay);

  const fieldEntries = [...fields.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([fieldPath, definition]) => [fieldPath, {
      ...definition,
      sourceFieldPaths: sortedUnique(definition.sourceFieldPaths),
      allowedValueKinds: sortedUnique(definition.allowedValueKinds),
      allowedRangeMeanings: sortedUnique(definition.allowedRangeMeanings),
    }]);

  return {
    schemaVersion: 1,
    policyVersion: overlay.policyVersion,
    canonicalizationVersion: overlay.canonicalizationVersion,
    sourceContracts: {
      fieldDictionarySchemaVersion: fieldDictionary.schemaVersion,
      fieldDictionaryCanonicalJsonSha256: canonicalSha256(fieldDictionary),
      installationMatrixSchemaVersion: installationMatrix.schemaVersion,
      installationMatrixCanonicalJsonSha256: canonicalSha256(installationMatrix),
    },
    sourceMetadata: {
      canonicalUnitSystem: fieldDictionary.canonicalUnitSystem,
      unknownRule: fieldDictionary.unknownRule,
      evidence: jsonClone(fieldDictionary.evidence),
      rights: jsonClone(fieldDictionary.rights),
      fitDecisionPolicy: jsonClone(fieldDictionary.fitDecisionPolicy),
    },
    aliases: jsonClone(overlay.aliases),
    fields: Object.fromEntries(fieldEntries),
    nonClaimFields: Object.fromEntries([...nonClaimFields.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))),
    requirementGroups: jsonClone(overlay.requirementGroups),
    installationApplicability: jsonClone(installationMatrix),
    context: jsonClone(overlay.context),
  };
}

/**
 * Compiles the frozen V2 policies plus a narrow, versioned V3 overlay.
 */
export function compileV3Semantics({ fieldDictionary, installationMatrix, overlay }) {
  const semanticPolicy = deepFreeze(semanticPolicyFromInputs({ fieldDictionary, installationMatrix, overlay }));
  return deepFreeze({
    semanticPolicy,
    semanticPolicySha256: canonicalSha256(semanticPolicy),
  });
}

/**
 * Ensures a consumer receives an untampered policy using the supported codec.
 */
export function requireV3Semantics(semantics) {
  exactKeys(semantics, 'compiled V3 semantics', ['semanticPolicy', 'semanticPolicySha256']);
  plainObject(semantics.semanticPolicy, 'semantic policy');
  if (semantics.semanticPolicy.schemaVersion !== 1) {
    invalid('SEMANTIC_POLICY_VERSION', 'semantic policy schemaVersion 1 required');
  }
  if (semantics.semanticPolicy.canonicalizationVersion !== CANONICAL_EVIDENCE_JSON_VERSION) {
    invalid('CANONICALIZATION_VERSION', 'semantic policy canonicalizationVersion unsupported');
  }
  if (!SHA256.test(semantics.semanticPolicySha256 ?? '')) {
    invalid('SEMANTIC_POLICY_HASH', 'semantic policy SHA-256 invalid');
  }
  let actualPolicySha256;
  try {
    actualPolicySha256 = canonicalSha256(semantics.semanticPolicy);
  } catch (error) {
    if (error instanceof CanonicalEvidenceJsonError) {
      invalid('SEMANTIC_POLICY_HASH', 'semantic policy cannot be canonicalized');
    }
    throw error;
  }
  if (actualPolicySha256 !== semantics.semanticPolicySha256) {
    invalid('SEMANTIC_POLICY_HASH', 'semantic policy SHA-256 does not match policy');
  }
  return semantics.semanticPolicy;
}

function normalizeInclusions(rawInclusions, field) {
  if (rawInclusions !== undefined && rawInclusions !== null) plainObject(rawInclusions, 'field inclusions');
  const input = rawInclusions ?? {};
  const allowed = new Set(field.inclusionComponents);
  for (const component of Object.keys(input)) {
    if (!allowed.has(component)) invalid('INCLUSION_COMPONENT', `unsupported inclusion component: ${component}`);
  }
  const inclusions = {};
  for (const component of field.inclusionComponents) {
    const value = Object.hasOwn(input, component) ? input[component] : null;
    if (value === true || value === 'included') inclusions[component] = 'included';
    else if (value === false || value === 'excluded') inclusions[component] = 'excluded';
    else if (value === null || value === undefined || value === 'unknown') inclusions[component] = 'unknown';
    else invalid('INCLUSION_VALUE', `${component} inclusion must be included, excluded or unknown`);
  }
  return inclusions;
}

function assertRequiredInclusions(inclusions, field) {
  for (const [component, expected] of Object.entries(field.requiredInclusions)) {
    if (inclusions[component] !== expected) {
      invalid('REQUIRED_INCLUSION', `${field.fieldPath} must include ${component}`);
    }
  }
}

function assertApplicability(value) {
  if (!APPLICABILITY.has(value)) invalid('APPLICABILITY', 'field applicability unsupported');
  return value;
}

function decimalFraction(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid('FINITE_NUMBER', `${label} must be a finite JavaScript number`);
  }
  if (value < 0) invalid('NEGATIVE_VALUE', `${label} cannot be negative`);
  const match = /^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(value));
  if (!match) invalid('DECIMAL_VALUE', `${label} must be a declared decimal number`);
  const [, whole, fractional = '', exponentText = '0'] = match;
  const exponent = Number(exponentText) - fractional.length;
  let numerator = BigInt(`${whole}${fractional}` || '0');
  let denominator = 1n;
  if (exponent >= 0) numerator *= 10n ** BigInt(exponent);
  else denominator = 10n ** BigInt(-exponent);
  return { numerator, denominator };
}

function compareFractions(left, right) {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference === 0n ? 0 : (difference < 0n ? -1 : 1);
}

function decimalFractionToFiniteNumber(fraction, fieldPath) {
  let denominator = fraction.denominator;
  let decimalPlaces = 0;
  while (denominator > 1n && denominator % 10n === 0n) {
    denominator /= 10n;
    decimalPlaces += 1;
  }
  if (denominator !== 1n) {
    invalid('CANONICAL_NUMBER', `${fieldPath} canonical denominator is not decimal`);
  }
  const value = Number(`${fraction.numerator}e-${decimalPlaces}`);
  if (!Number.isFinite(value) || (fraction.numerator !== 0n && value === 0)) {
    invalid('CANONICAL_NUMBER', `${fieldPath} canonical value is not finite`);
  }
  return value;
}

function canonicalNumber(rawValue, unit, field, label) {
  const fraction = decimalFraction(rawValue, label);
  if (typeof unit !== 'string' || !Object.hasOwn(field.sourceUnits, unit)) {
    invalid('UNIT', `${field.fieldPath} does not support unit ${String(unit)}`);
  }
  const conversion = field.sourceUnits[unit];
  if (!Number.isInteger(conversion.numerator) || !Number.isInteger(conversion.denominator)
    || conversion.numerator <= 0 || conversion.denominator <= 0) {
    invalid('UNIT_POLICY', `${field.fieldPath} has invalid unit conversion policy`);
  }
  const canonical = {
    numerator: fraction.numerator * BigInt(conversion.numerator),
    denominator: fraction.denominator * BigInt(conversion.denominator),
  };
  const minimum = BigInt(field.bounds.minimum);
  if (canonical.numerator < minimum * canonical.denominator) {
    invalid('LOWER_BOUND', `${field.fieldPath} is below its supported bound`);
  }
  if (field.bounds.maximum !== null) {
    const maximum = BigInt(field.bounds.maximum);
    if (canonical.numerator > maximum * canonical.denominator) {
      invalid('UPPER_BOUND', `${field.fieldPath} exceeds its supported bound`);
    }
  }
  if (field.bounds.integerCanonical && canonical.numerator % canonical.denominator !== 0n) {
    invalid('PRECISION', `${field.fieldPath} must resolve to a whole canonical millimetre value`);
  }
  const value = field.bounds.integerCanonical
    ? decimalFractionToFiniteNumber({
      numerator: canonical.numerator / canonical.denominator,
      denominator: 1n,
    }, field.fieldPath)
    : decimalFractionToFiniteNumber(canonical, field.fieldPath);
  return { value, fraction: canonical };
}

function requireNullValue(rawValue, unit, applicability) {
  if (rawValue !== null || unit !== null) {
    invalid('NULL_VALUE', `${applicability} fields require null value and unit`);
  }
}

function numericRange(rawValue, unit, field) {
  exactKeys(rawValue, 'numeric range', ['kind', 'minimum', 'maximum', 'rangeMeaning']);
  if (rawValue.kind !== 'range') invalid('RANGE_KIND', 'numeric range kind must be range');
  if (!field.allowedValueKinds.includes('range')) {
    invalid('RANGE_NOT_ALLOWED', `${field.fieldPath} does not permit ranges`);
  }
  if (!field.allowedRangeMeanings.includes(rawValue.rangeMeaning)) {
    invalid('RANGE_MEANING', `${field.fieldPath} rangeMeaning unsupported`);
  }
  const minimum = canonicalNumber(rawValue.minimum, unit, field, 'range minimum');
  const maximum = canonicalNumber(rawValue.maximum, unit, field, 'range maximum');
  if (compareFractions(minimum.fraction, maximum.fraction) > 0) {
    invalid('RANGE_ORDER', `${field.fieldPath} range minimum exceeds maximum`);
  }
  return {
    kind: 'range',
    fieldPath: field.fieldPath,
    minimum: minimum.value,
    maximum: maximum.value,
    unit: field.canonicalUnit,
    rangeMeaning: rawValue.rangeMeaning,
  };
}

/**
 * Normalizes raw candidate values only; it does not create claims or approve evidence.
 */
export function normalizeV3FieldValue(input) {
  exactKeys(input, 'V3 field value input', [
    'rawValue', 'unit', 'fieldPath', 'applicability', 'semantics',
  ], ['inclusions']);
  const policy = requireV3Semantics(input.semantics);
  const requestedFieldPath = requiredText(input.fieldPath, 'fieldPath');
  const fieldPath = resolvedAlias(requestedFieldPath, policy.aliases);
  const field = policy.fields[fieldPath];
  if (!field) {
    const nonClaim = policy.nonClaimFields[requestedFieldPath] ?? policy.nonClaimFields[fieldPath];
    invalid('NON_CLAIM_FIELD', nonClaim?.disposition === 'review_only'
      ? `${requestedFieldPath} is review-only and cannot form a V3 value claim`
      : `${requestedFieldPath} is not a V3 value claim field`);
  }
  const applicability = assertApplicability(input.applicability);
  const inclusions = normalizeInclusions(input.inclusions, field);
  if (applicability === 'unknown') {
    requireNullValue(input.rawValue, input.unit, applicability);
    return null;
  }
  if (applicability === 'not_applicable') {
    requireNullValue(input.rawValue, input.unit, applicability);
    return {
      kind: 'not_applicable',
      fieldPath,
      value: null,
      unit: null,
      inclusions,
      applicability,
    };
  }
  if (field.valueType === 'boolean') {
    if (typeof input.rawValue !== 'boolean' || input.unit !== null) {
      invalid('BOOLEAN_VALUE', `${fieldPath} must be a boolean with null unit`);
    }
    assertRequiredInclusions(inclusions, field);
    return {
      kind: 'boolean',
      fieldPath,
      value: input.rawValue,
      unit: null,
      inclusions,
      applicability,
    };
  }
  if (typeof input.rawValue === 'number') {
    if (!field.allowedValueKinds.includes('fixed')) {
      invalid('FIXED_NOT_ALLOWED', `${fieldPath} does not permit fixed values`);
    }
    const normalized = canonicalNumber(input.rawValue, input.unit, field, 'raw value');
    assertRequiredInclusions(inclusions, field);
    return {
      kind: 'fixed',
      fieldPath,
      value: normalized.value,
      unit: field.canonicalUnit,
      inclusions,
      applicability,
    };
  }
  if (input.rawValue && typeof input.rawValue === 'object' && !Array.isArray(input.rawValue)) {
    const normalized = numericRange(input.rawValue, input.unit, field);
    assertRequiredInclusions(inclusions, field);
    return {
      ...normalized,
      inclusions,
      applicability,
    };
  }
  invalid('FINITE_NUMBER', `${fieldPath} raw value must be a finite JavaScript number or a closed range`);
}
