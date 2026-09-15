import { createHash } from 'node:crypto';

import {
  CANONICAL_EVIDENCE_JSON_VERSION,
  canonicalEvidenceJson,
} from '../../shared/canonical-evidence-json.mjs';
import { validateEngineeringContext } from './engineering-context.mjs';
import { validateEvidenceAnchors } from './evidence-anchors.mjs';
import {
  CANONICAL_PRODUCT_ID_PATTERN,
  isExactResearchModelName,
} from './product-family-graph.mjs';
import {
  normalizeV3FieldValue,
  requireV3Semantics,
} from './semantics.mjs';

export const EVIDENCE_CLAIM_V3_SCHEMA_VERSION = 3;

const SHA256 = /^[a-f0-9]{64}$/u;
const PRODUCT_RELATIONSHIP_ASSERTION_ID_PATTERN = /^fa_product_relationship_[a-f0-9]{64}$/u;

export class EvidenceClaimV3ValidationError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'EvidenceClaimV3ValidationError';
    this.code = 'INVALID_EVIDENCE_CLAIM_V3';
  }
}

export class EvidenceClaimV3CandidateGapError extends EvidenceClaimV3ValidationError {
  constructor(message) {
    super(message);
    this.name = 'EvidenceClaimV3CandidateGapError';
    this.code = 'UNKNOWN_VALUE_CANDIDATE_GAP';
  }
}

function invalid(message) {
  throw new EvidenceClaimV3ValidationError(message);
}

function candidateGap(message) {
  throw new EvidenceClaimV3CandidateGapError(message);
}

function strictJsonClone(value, label) {
  try {
    return JSON.parse(canonicalEvidenceJson(value));
  } catch (error) {
    invalid(`${label} must be strict JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    invalid(`${label} must be a plain object`);
  }
  return value;
}

function exactObject(value, label, keys) {
  plainObject(value, label);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) invalid(`${label} has unknown key: ${key}`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) invalid(`${label} is missing key: ${key}`);
  }
  return value;
}

function stableText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') invalid(`${label} must be a non-empty string`);
  if (value !== value.trim()) invalid(`${label} must not have leading or trailing whitespace`);
  return value;
}

function sha256(value, label) {
  const digest = stableText(value, label);
  if (!SHA256.test(digest)) invalid(`${label} must be a lowercase SHA-256 digest`);
  return digest;
}

function stableCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function canonicalSha256(value) {
  return createHash('sha256').update(canonicalEvidenceJson(value), 'utf8').digest('hex');
}

function sameCanonicalJson(left, right) {
  return canonicalEvidenceJson(left) === canonicalEvidenceJson(right);
}

function withValidation(label, operation) {
  try {
    return operation();
  } catch (error) {
    if (error instanceof EvidenceClaimV3ValidationError) throw error;
    invalid(`${label} is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizedSubject(value) {
  exactObject(value, 'subject', ['canonicalProductId', 'market']);
  const canonicalProductId = stableText(value.canonicalProductId, 'subject canonicalProductId');
  if (!CANONICAL_PRODUCT_ID_PATTERN.test(canonicalProductId)) {
    invalid('subject canonicalProductId must use an exact canonical product ID');
  }
  const market = stableText(value.market, 'subject market');
  if (!/^[A-Z]{2,3}$/u.test(market)) invalid('subject market must be a 2-3 letter uppercase market code');
  return { canonicalProductId, market };
}

function normalizedValidationInputs(value) {
  exactObject(value, 'validationInputs', [
    'semantics', 'witnessedConditions', 'artifactRecords', 'fragments',
  ]);
  const semanticPolicy = withValidation('validationInputs semantics', () => requireV3Semantics(value.semantics));
  if (!Array.isArray(value.witnessedConditions)) invalid('validationInputs witnessedConditions must be an array');
  if (!Array.isArray(value.artifactRecords)) invalid('validationInputs artifactRecords must be an array');
  if (!Array.isArray(value.fragments)) invalid('validationInputs fragments must be an array');
  return {
    semantics: value.semantics,
    semanticPolicy,
    witnessedConditions: value.witnessedConditions,
    artifactRecords: value.artifactRecords,
    fragments: value.fragments,
  };
}

function normalizedClaimSemantics(value) {
  exactObject(value, 'semantics', ['axis', 'measurementScope', 'inclusions', 'applicability']);
  if (value.axis !== null && typeof value.axis !== 'string') invalid('semantics axis must be a string or null');
  return {
    axis: value.axis,
    measurementScope: stableText(value.measurementScope, 'semantics measurementScope'),
    inclusions: value.inclusions,
    applicability: stableText(value.applicability, 'semantics applicability'),
  };
}

function normalizedEvidence(value, validationInputs) {
  exactObject(value, 'evidence', ['sourceArtifactSha256', 'anchors', 'relations']);
  const proof = withValidation('evidence', () => validateEvidenceAnchors({
    sourceArtifactSha256: value.sourceArtifactSha256,
    anchors: value.anchors,
    relations: value.relations,
    artifactRecords: validationInputs.artifactRecords,
    fragments: validationInputs.fragments,
  }));
  const anchorById = new Map(proof.anchors.map((anchor) => [anchor.anchorId, anchor]));
  if (!proof.anchors.some((anchor) => anchor.role === 'subject')) {
    invalid('evidence must contain an anchored subject');
  }
  return {
    evidence: {
      sourceArtifactSha256: proof.sourceArtifactSha256,
      anchors: proof.anchors,
      relations: proof.relations,
    },
    anchorById,
  };
}

function requiredAnchor(anchorById, rawAnchorId, label, roles) {
  const anchorId = stableText(rawAnchorId, label);
  const anchor = anchorById.get(anchorId);
  if (!anchor) invalid(`${label} does not resolve to evidence.anchors`);
  if (!roles.includes(anchor.role)) {
    invalid(`${label} must resolve to an anchor with role ${roles.join(' or ')}`);
  }
  return anchorId;
}

function normalizedNamedScalarSource(value, anchorById) {
  exactObject(value, 'sourceRepresentation', [
    'kind', 'label', 'labelAnchorId', 'value', 'valueAnchorId', 'sourceUnit', 'unitAnchorId',
  ]);
  if (value.kind !== 'named_scalar') invalid('sourceRepresentation kind is unsupported');
  if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
    invalid('named_scalar value must be a finite JavaScript number');
  }
  return {
    kind: 'named_scalar',
    label: stableText(value.label, 'named_scalar label'),
    labelAnchorId: requiredAnchor(anchorById, value.labelAnchorId, 'named_scalar labelAnchorId', ['legend']),
    value: value.value,
    valueAnchorId: requiredAnchor(anchorById, value.valueAnchorId, 'named_scalar valueAnchorId', ['value']),
    sourceUnit: stableText(value.sourceUnit, 'named_scalar sourceUnit'),
    unitAnchorId: requiredAnchor(anchorById, value.unitAnchorId, 'named_scalar unitAnchorId', ['unit']),
  };
}

function normalizedNamedRangeSource(value, anchorById) {
  exactObject(value, 'sourceRepresentation', [
    'kind', 'label', 'labelAnchorId', 'minimum', 'minimumAnchorId', 'maximum', 'maximumAnchorId',
    'sourceUnit', 'unitAnchorId', 'rangeMeaning', 'rangeMeaningAnchorId',
  ]);
  if (value.kind !== 'named_range') invalid('sourceRepresentation kind is unsupported');
  if (typeof value.minimum !== 'number' || !Number.isFinite(value.minimum)
    || typeof value.maximum !== 'number' || !Number.isFinite(value.maximum)) {
    invalid('named_range endpoints must be finite JavaScript numbers');
  }
  return {
    kind: 'named_range',
    label: stableText(value.label, 'named_range label'),
    labelAnchorId: requiredAnchor(anchorById, value.labelAnchorId, 'named_range labelAnchorId', ['legend']),
    minimum: value.minimum,
    minimumAnchorId: requiredAnchor(anchorById, value.minimumAnchorId, 'named_range minimumAnchorId', ['value']),
    maximum: value.maximum,
    maximumAnchorId: requiredAnchor(anchorById, value.maximumAnchorId, 'named_range maximumAnchorId', ['value']),
    sourceUnit: stableText(value.sourceUnit, 'named_range sourceUnit'),
    unitAnchorId: requiredAnchor(anchorById, value.unitAnchorId, 'named_range unitAnchorId', ['unit']),
    rangeMeaning: stableText(value.rangeMeaning, 'named_range rangeMeaning'),
    rangeMeaningAnchorId: requiredAnchor(
      anchorById,
      value.rangeMeaningAnchorId,
      'named_range rangeMeaningAnchorId',
      ['condition', 'legend'],
    ),
  };
}

function normalizedOrderedDimensionsSource(value, anchorById) {
  exactObject(value, 'sourceRepresentation', [
    'kind', 'labels', 'labelAnchorIds', 'values', 'valueAnchorIds', 'axisOrder', 'sourceUnit',
    'unitAnchorId',
  ]);
  if (value.kind !== 'ordered_dimensions') invalid('sourceRepresentation kind is unsupported');
  const orderedKeys = ['labels', 'labelAnchorIds', 'values', 'valueAnchorIds', 'axisOrder'];
  for (const key of orderedKeys) {
    if (!Array.isArray(value[key]) || value[key].length === 0) {
      invalid(`ordered_dimensions ${key} must be a non-empty array`);
    }
  }
  const length = value.axisOrder.length;
  if (!orderedKeys.every((key) => value[key].length === length)) {
    invalid('ordered_dimensions labels, values, anchors and axisOrder must have equal lengths');
  }
  const seenAxes = new Set();
  const axisOrder = value.axisOrder.map((axis, index) => {
    const normalized = stableText(axis, `ordered_dimensions axisOrder[${index}]`);
    if (seenAxes.has(normalized)) invalid(`ordered_dimensions axisOrder has a duplicate axis: ${normalized}`);
    seenAxes.add(normalized);
    return normalized;
  });
  const values = value.values.map((rawValue, index) => {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
      invalid(`ordered_dimensions values[${index}] must be a finite JavaScript number`);
    }
    return rawValue;
  });
  return {
    kind: 'ordered_dimensions',
    labels: value.labels.map((label, index) => stableText(label, `ordered_dimensions labels[${index}]`)),
    labelAnchorIds: value.labelAnchorIds.map((anchorId, index) => requiredAnchor(
      anchorById,
      anchorId,
      `ordered_dimensions labelAnchorIds[${index}]`,
      ['axis'],
    )),
    values,
    valueAnchorIds: value.valueAnchorIds.map((anchorId, index) => requiredAnchor(
      anchorById,
      anchorId,
      `ordered_dimensions valueAnchorIds[${index}]`,
      ['value'],
    )),
    axisOrder,
    sourceUnit: stableText(value.sourceUnit, 'ordered_dimensions sourceUnit'),
    unitAnchorId: requiredAnchor(anchorById, value.unitAnchorId, 'ordered_dimensions unitAnchorId', ['unit']),
  };
}

function normalizedBooleanStatementSource(value, anchorById) {
  exactObject(value, 'sourceRepresentation', ['kind', 'statement', 'statementAnchorId', 'value']);
  if (value.kind !== 'boolean_statement') invalid('sourceRepresentation kind is unsupported');
  if (typeof value.value !== 'boolean') invalid('boolean_statement value must be a boolean');
  return {
    kind: 'boolean_statement',
    statement: stableText(value.statement, 'boolean_statement statement'),
    statementAnchorId: requiredAnchor(
      anchorById,
      value.statementAnchorId,
      'boolean_statement statementAnchorId',
      ['value'],
    ),
    value: value.value,
  };
}

function normalizedNotApplicableStatementSource(value, anchorById) {
  exactObject(value, 'sourceRepresentation', ['kind', 'statement', 'statementAnchorId']);
  if (value.kind !== 'not_applicable_statement') invalid('sourceRepresentation kind is unsupported');
  return {
    kind: 'not_applicable_statement',
    statement: stableText(value.statement, 'not_applicable_statement statement'),
    statementAnchorId: requiredAnchor(
      anchorById,
      value.statementAnchorId,
      'not_applicable_statement statementAnchorId',
      ['value'],
    ),
  };
}

function normalizedSourceRepresentation(value, anchorById) {
  plainObject(value, 'sourceRepresentation');
  if (value.kind === 'named_scalar') return normalizedNamedScalarSource(value, anchorById);
  if (value.kind === 'named_range') return normalizedNamedRangeSource(value, anchorById);
  if (value.kind === 'ordered_dimensions') return normalizedOrderedDimensionsSource(value, anchorById);
  if (value.kind === 'boolean_statement') return normalizedBooleanStatementSource(value, anchorById);
  if (value.kind === 'not_applicable_statement') {
    return normalizedNotApplicableStatementSource(value, anchorById);
  }
  invalid('sourceRepresentation kind is unsupported');
}

function rawValueForSourceRepresentation(sourceRepresentation, semanticField) {
  if (sourceRepresentation.kind === 'named_scalar') return sourceRepresentation.value;
  if (sourceRepresentation.kind === 'named_range') {
    return {
      kind: 'range',
      minimum: sourceRepresentation.minimum,
      maximum: sourceRepresentation.maximum,
      rangeMeaning: sourceRepresentation.rangeMeaning,
    };
  }
  if (sourceRepresentation.kind === 'boolean_statement') return sourceRepresentation.value;
  if (sourceRepresentation.kind === 'not_applicable_statement') return null;
  if (semanticField.axis === null) {
    invalid('ordered_dimensions cannot represent a field without a semantic axis');
  }
  const axisIndex = sourceRepresentation.axisOrder.indexOf(semanticField.axis);
  if (axisIndex === -1) {
    invalid(`ordered_dimensions axisOrder must include the field axis: ${semanticField.axis}`);
  }
  return sourceRepresentation.values[axisIndex];
}

function expectedValueKindForSourceRepresentation(sourceRepresentation) {
  if (sourceRepresentation.kind === 'named_range') return 'range';
  if (sourceRepresentation.kind === 'boolean_statement') return 'boolean';
  if (sourceRepresentation.kind === 'not_applicable_statement') return 'not_applicable';
  return 'fixed';
}

function normalizedNamedModels(value) {
  if (!Array.isArray(value) || value.length === 0) {
    invalid('applicabilityProof namedModels must be a non-empty array');
  }
  const seen = new Set();
  const namedModels = value.map((rawModel, index) => {
    exactObject(rawModel, `applicabilityProof namedModels[${index}]`, ['canonicalProductId', 'model']);
    const canonicalProductId = stableText(
      rawModel.canonicalProductId,
      `applicabilityProof namedModels[${index}] canonicalProductId`,
    );
    if (!CANONICAL_PRODUCT_ID_PATTERN.test(canonicalProductId)) {
      invalid(`applicabilityProof namedModels[${index}] must use an exact canonical product ID`);
    }
    if (seen.has(canonicalProductId)) {
      invalid(`applicabilityProof namedModels has duplicate canonical product ID: ${canonicalProductId}`);
    }
    seen.add(canonicalProductId);
    const model = stableText(rawModel.model, `applicabilityProof namedModels[${index}] model`);
    if (!isExactResearchModelName(model)) {
      invalid('applicabilityProof model must be one exact model name');
    }
    return { canonicalProductId, model };
  });
  return namedModels.sort((left, right) => stableCompare(left.canonicalProductId, right.canonicalProductId));
}

function sortedUniqueTextIds(value, label) {
  if (!Array.isArray(value)) invalid(`${label} must be an array`);
  const seen = new Set();
  const ids = value.map((rawId, index) => {
    const id = stableText(rawId, `${label}[${index}]`);
    if (seen.has(id)) invalid(`${label} has a duplicate ID: ${id}`);
    seen.add(id);
    return id;
  });
  return ids.sort(stableCompare);
}

function normalizedApplicabilityProof(value, subject) {
  exactObject(value, 'applicabilityProof', ['kind', 'namedModels', 'relationshipAssertionIds']);
  const namedModels = normalizedNamedModels(value.namedModels);
  const relationshipAssertionIds = sortedUniqueTextIds(
    value.relationshipAssertionIds,
    'applicabilityProof relationshipAssertionIds',
  );
  if (!namedModels.some((model) => model.canonicalProductId === subject.canonicalProductId)) {
    invalid('applicabilityProof namedModels must include the Claim subject');
  }
  if (value.kind === 'EXACT_MODEL') {
    if (namedModels.length !== 1) invalid('EXACT_MODEL applicabilityProof must name exactly one model');
    if (relationshipAssertionIds.length !== 0) {
      invalid('EXACT_MODEL applicabilityProof must not include relationship assertion IDs');
    }
    return { kind: 'EXACT_MODEL', namedModels, relationshipAssertionIds };
  }
  if (value.kind === 'FINITE_OFFICIAL_RELATION') {
    if (relationshipAssertionIds.length === 0) {
      invalid('FINITE_OFFICIAL_RELATION applicabilityProof requires relationship assertion IDs');
    }
    if (!relationshipAssertionIds.every((id) => PRODUCT_RELATIONSHIP_ASSERTION_ID_PATTERN.test(id))) {
      invalid('relationship assertion IDs must use fa_product_relationship_ followed by 64 lowercase hex digits');
    }
    return { kind: 'FINITE_OFFICIAL_RELATION', namedModels, relationshipAssertionIds };
  }
  invalid('applicabilityProof kind is unsupported');
}

function normalizedClaimValue(value) {
  plainObject(value, 'value');
  if (value.kind === 'fixed') {
    exactObject(value, 'value', ['kind', 'value', 'unit']);
    return { kind: 'fixed', value: value.value, unit: value.unit };
  }
  if (value.kind === 'range') {
    exactObject(value, 'value', [
      'kind', 'minimumCanonical', 'maximumCanonical', 'unit', 'rangeMeaning',
    ]);
    return {
      kind: 'range',
      minimumCanonical: value.minimumCanonical,
      maximumCanonical: value.maximumCanonical,
      unit: value.unit,
      rangeMeaning: value.rangeMeaning,
    };
  }
  if (value.kind === 'boolean') {
    exactObject(value, 'value', ['kind', 'value', 'unit']);
    return { kind: 'boolean', value: value.value, unit: value.unit };
  }
  if (value.kind === 'not_applicable') {
    exactObject(value, 'value', ['kind', 'value', 'unit']);
    return { kind: 'not_applicable', value: value.value, unit: value.unit };
  }
  invalid('value kind is unsupported');
}

function canonicalClaimValue(normalizedValue) {
  if (normalizedValue.kind === 'fixed') {
    return { kind: 'fixed', value: normalizedValue.value, unit: normalizedValue.unit };
  }
  if (normalizedValue.kind === 'range') {
    return {
      kind: 'range',
      minimumCanonical: normalizedValue.minimum,
      maximumCanonical: normalizedValue.maximum,
      unit: normalizedValue.unit,
      rangeMeaning: normalizedValue.rangeMeaning,
    };
  }
  if (normalizedValue.kind === 'boolean') {
    return { kind: 'boolean', value: normalizedValue.value, unit: null };
  }
  if (normalizedValue.kind === 'not_applicable') {
    return { kind: 'not_applicable', value: null, unit: null };
  }
  invalid('normalized field value kind is unsupported');
}

function normalizedClaim(rawInput) {
  exactObject(rawInput, 'Claim V3 input', [
    'subject', 'field', 'value', 'semantics', 'context', 'sourceRepresentation', 'evidence',
    'applicabilityProof', 'semanticPolicySha256', 'extractionProfileSha256', 'derivedFromClaimId',
    'validationInputs',
  ]);
  const validationInputs = normalizedValidationInputs(rawInput.validationInputs);
  const subject = normalizedSubject(rawInput.subject);
  const field = stableText(rawInput.field, 'field');
  const semanticField = validationInputs.semanticPolicy.fields[field];
  if (!semanticField) invalid('field must be an exact canonical field in the compiled semantic policy');
  const claimSemantics = normalizedClaimSemantics(rawInput.semantics);
  const semanticPolicySha256 = sha256(rawInput.semanticPolicySha256, 'semanticPolicySha256');
  if (semanticPolicySha256 !== rawInput.validationInputs.semantics.semanticPolicySha256) {
    invalid('semanticPolicySha256 must equal validationInputs semantics digest');
  }
  const extractionProfileSha256 = sha256(rawInput.extractionProfileSha256, 'extractionProfileSha256');
  if (claimSemantics.applicability === 'unknown') {
    candidateGap('unknown field material cannot form a Claim V3 value');
  }
  const derivedFromClaimId = rawInput.derivedFromClaimId === null
    ? null
    : sha256(rawInput.derivedFromClaimId, 'derivedFromClaimId');
  const context = withValidation('context', () => validateEngineeringContext({
    context: rawInput.context,
    semantics: validationInputs.semantics,
    witnessedConditions: validationInputs.witnessedConditions,
    product: subject,
  }));
  const { evidence, anchorById } = normalizedEvidence(rawInput.evidence, validationInputs);
  const sourceRepresentation = normalizedSourceRepresentation(rawInput.sourceRepresentation, anchorById);
  const rawValue = rawValueForSourceRepresentation(sourceRepresentation, semanticField);
  const sourceUnit = ['named_scalar', 'named_range', 'ordered_dimensions'].includes(sourceRepresentation.kind)
    ? sourceRepresentation.sourceUnit
    : null;
  const normalizedValue = withValidation('field/value semantics', () => normalizeV3FieldValue({
    rawValue,
    unit: sourceUnit,
    fieldPath: field,
    applicability: claimSemantics.applicability,
    inclusions: claimSemantics.inclusions,
    semantics: validationInputs.semantics,
  }));
  const expectedValueKind = expectedValueKindForSourceRepresentation(sourceRepresentation);
  if (!normalizedValue || normalizedValue.kind !== expectedValueKind) {
    invalid(`${sourceRepresentation.kind} sourceRepresentation must normalize to one ${expectedValueKind} Claim value`);
  }
  if (normalizedValue.fieldPath !== field) invalid('field must be the canonical semantic field path');
  const expectedSemantics = {
    axis: semanticField.axis,
    measurementScope: semanticField.measurementScope,
    inclusions: normalizedValue.inclusions,
    applicability: normalizedValue.applicability,
  };
  if (!sameCanonicalJson(claimSemantics, expectedSemantics)) {
    invalid('semantics must equal the compiled-policy projection for field and value');
  }
  const expectedValue = canonicalClaimValue(normalizedValue);
  if (!sameCanonicalJson(normalizedClaimValue(rawInput.value), expectedValue)) {
    invalid('value must equal the canonical value represented by sourceRepresentation');
  }
  const applicabilityProof = normalizedApplicabilityProof(rawInput.applicabilityProof, subject);
  const identityPayload = {
    schemaVersion: EVIDENCE_CLAIM_V3_SCHEMA_VERSION,
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    subject,
    field,
    value: expectedValue,
    semantics: expectedSemantics,
    context: JSON.parse(canonicalEvidenceJson(context)),
    sourceRepresentation,
    evidence,
    applicabilityProof,
    semanticPolicySha256,
    extractionProfileSha256,
    derivedFromClaimId,
  };
  const claimId = canonicalSha256(identityPayload);
  if (derivedFromClaimId === claimId) invalid('derivedFromClaimId must not equal claimId');
  return deepFreeze({ ...identityPayload, claimId });
}

export function createEvidenceClaimV3(rawInput) {
  const input = strictJsonClone(rawInput, 'Claim V3 input');
  return normalizedClaim(input);
}

export function validateEvidenceClaimV3(rawInput) {
  const input = strictJsonClone(rawInput, 'stored Claim V3 validation input');
  exactObject(input, 'stored Claim V3 validation input', ['claim', 'validationInputs']);
  exactObject(input.claim, 'stored Claim V3', [
    'schemaVersion', 'canonicalizationVersion', 'claimId', 'subject', 'field', 'value', 'semantics',
    'context', 'sourceRepresentation', 'evidence', 'applicabilityProof', 'semanticPolicySha256',
    'extractionProfileSha256', 'derivedFromClaimId',
  ]);
  if (input.claim.schemaVersion !== EVIDENCE_CLAIM_V3_SCHEMA_VERSION) {
    invalid('stored Claim V3 schemaVersion is unsupported');
  }
  if (input.claim.canonicalizationVersion !== CANONICAL_EVIDENCE_JSON_VERSION) {
    invalid('stored Claim V3 canonicalizationVersion is unsupported');
  }
  const suppliedClaimId = sha256(input.claim.claimId, 'stored Claim V3 claimId');
  const {
    schemaVersion: _schemaVersion,
    canonicalizationVersion: _canonicalizationVersion,
    claimId: _claimId,
    ...creationInput
  } = input.claim;
  const claim = normalizedClaim({ ...creationInput, validationInputs: input.validationInputs });
  if (claim.claimId !== suppliedClaimId) invalid('stored Claim V3 claimId does not match its identity payload');
  if (!sameCanonicalJson(input.claim, claim)) {
    invalid('stored Claim V3 is not in its canonical normalized representation');
  }
  return claim;
}
