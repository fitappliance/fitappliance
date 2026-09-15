import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  createEvidenceClaimV3,
  EvidenceClaimV3ValidationError,
  validateEvidenceClaimV3,
} from '../../src/domain/architecture-v3/evidence-claim-v3.mjs';
import {
  ARTIFACT_RECORD_SCHEMA_VERSION,
  FRAGMENT_IDENTITY_DOMAIN,
  FRAGMENT_SCHEMA_VERSION,
  createArtifactRecord,
  createFragment,
} from '../../src/domain/architecture-v3/artifact-lineage.mjs';
import { CANONICAL_EVIDENCE_JSON_VERSION, canonicalEvidenceJson } from '../../src/shared/canonical-evidence-json.mjs';
import { compileV3Semantics } from '../../src/domain/architecture-v3/semantics.mjs';
import { createProductRelationshipAssertion } from '../../src/domain/architecture-v3/product-relationship-assertion.mjs';

const SUBJECT_ID = `fa_prod_${'1'.repeat(24)}`;
const RELATED_ID = `fa_prod_${'2'.repeat(24)}`;
const ROOT_SHA256 = 'a'.repeat(64);
const EXTRACTION_PROFILE_SHA256 = 'b'.repeat(64);

const [fieldDictionary, installationMatrix, overlay] = await Promise.all([
  readFile('data/architecture-v2/policies/product-data-field-rights-dictionary.json', 'utf8').then(JSON.parse),
  readFile('data/architecture-v2/generated/installation-evidence-applicability-matrix.json', 'utf8').then(JSON.parse),
  readFile('data/architecture-v3/policies/semantics-overlay.json', 'utf8').then(JSON.parse),
]);
const compiledSemantics = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertClaimError(operation, pattern) {
  assert.throws(
    operation,
    (error) => error instanceof EvidenceClaimV3ValidationError && pattern.test(error.message),
  );
}

function fixtureFragment(content = { kind: 'fixture', text: 'Overall width: 600 mm' }) {
  const locator = { kind: 'json_pointer', pointer: '/claims/0' };
  const fragmentSha256 = sha256(canonicalEvidenceJson({
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    schemaVersion: FRAGMENT_SCHEMA_VERSION,
    fragmentIdentityDomain: FRAGMENT_IDENTITY_DOMAIN,
    content,
    parentArtifactSha256: ROOT_SHA256,
    locator,
  }));
  return createFragment({ fragmentSha256, content, parentArtifactSha256: ROOT_SHA256, locator });
}

function evidenceFixture({
  includeRangeAnchors = false,
  includeOrderedAnchors = false,
  includeStatementAnchor = false,
} = {}) {
  const artifact = createArtifactRecord({
    sha256: ROOT_SHA256,
    parentSha256: null,
    mediaType: 'application/pdf',
    toolRevision: null,
    optionsSha256: null,
  });
  const fragment = fixtureFragment();
  return {
    artifactRecords: [artifact],
    fragments: [fragment],
    evidence: {
      sourceArtifactSha256: ROOT_SHA256,
      anchors: [
        { anchorId: 'value', role: 'value', fragmentSha256: fragment.fragmentSha256 },
        { anchorId: 'unit', role: 'unit', fragmentSha256: fragment.fragmentSha256 },
        { anchorId: 'label', role: 'legend', fragmentSha256: fragment.fragmentSha256 },
        { anchorId: 'subject', role: 'subject', fragmentSha256: fragment.fragmentSha256 },
        ...(includeRangeAnchors ? [
          { anchorId: 'minimum', role: 'value', fragmentSha256: fragment.fragmentSha256 },
          { anchorId: 'maximum', role: 'value', fragmentSha256: fragment.fragmentSha256 },
          { anchorId: 'rangeMeaning', role: 'condition', fragmentSha256: fragment.fragmentSha256 },
        ] : []),
        ...(includeOrderedAnchors ? [
          { anchorId: 'heightLabel', role: 'axis', fragmentSha256: fragment.fragmentSha256 },
          { anchorId: 'widthLabel', role: 'axis', fragmentSha256: fragment.fragmentSha256 },
          { anchorId: 'depthLabel', role: 'axis', fragmentSha256: fragment.fragmentSha256 },
          { anchorId: 'heightValue', role: 'value', fragmentSha256: fragment.fragmentSha256 },
          { anchorId: 'widthValue', role: 'value', fragmentSha256: fragment.fragmentSha256 },
          { anchorId: 'depthValue', role: 'value', fragmentSha256: fragment.fragmentSha256 },
        ] : []),
        ...(includeStatementAnchor ? [
          { anchorId: 'statement', role: 'value', fragmentSha256: fragment.fragmentSha256 },
        ] : []),
      ],
      relations: [],
    },
  };
}

function exactProductWitness() {
  return {
    canonicalProductId: SUBJECT_ID,
    market: 'AU',
    configurationKey: 'underbench_worktop_removed',
    conditions: [
      { parameter: 'installationMode', operator: 'eq', value: 'underbench' },
      { parameter: 'worktop', operator: 'eq', value: 'removed' },
    ],
    applicability: 'conditional',
    membership: 'exact_product_market',
  };
}

function fixedClaimInput() {
  const { artifactRecords, fragments, evidence } = evidenceFixture();
  return {
    subject: { canonicalProductId: SUBJECT_ID, market: 'AU' },
    field: 'closedEnvelope.widthMm',
    value: { kind: 'fixed', value: 600, unit: 'mm' },
    semantics: {
      axis: 'width',
      measurementScope: 'product_closed_external',
      inclusions: { door: 'unknown', handle: 'unknown' },
      applicability: 'required',
    },
    context: {
      configurationKey: 'underbench_worktop_removed',
      conditions: [
        { parameter: 'installationMode', operator: 'eq', value: 'underbench' },
        { parameter: 'worktop', operator: 'eq', value: 'removed' },
      ],
      referenceDatum: 'envelope_extent',
      operatingState: { kind: 'closed', angleDegrees: null },
    },
    sourceRepresentation: {
      kind: 'named_scalar',
      label: 'Overall width',
      labelAnchorId: 'label',
      value: 600,
      valueAnchorId: 'value',
      sourceUnit: 'mm',
      unitAnchorId: 'unit',
    },
    evidence,
    applicabilityProof: {
      kind: 'EXACT_MODEL',
      namedModels: [{ canonicalProductId: SUBJECT_ID, model: 'DW60UT4I2' }],
      relationshipAssertionIds: [],
    },
    semanticPolicySha256: compiledSemantics.semanticPolicySha256,
    extractionProfileSha256: EXTRACTION_PROFILE_SHA256,
    derivedFromClaimId: null,
    validationInputs: {
      semantics: compiledSemantics,
      witnessedConditions: [exactProductWitness()],
      artifactRecords,
      fragments,
    },
  };
}

function namedRangeClaimInput() {
  const { artifactRecords, fragments, evidence } = evidenceFixture({ includeRangeAnchors: true });
  return {
    subject: { canonicalProductId: SUBJECT_ID, market: 'AU' },
    field: 'adjustableRange.heightMm',
    value: {
      kind: 'range',
      minimumCanonical: 850,
      maximumCanonical: 900,
      unit: 'mm',
      rangeMeaning: 'adjustment',
    },
    semantics: {
      axis: 'height',
      measurementScope: 'product_adjusted',
      inclusions: {},
      applicability: 'required',
    },
    context: {
      configurationKey: 'underbench_worktop_removed',
      conditions: [
        { parameter: 'installationMode', operator: 'eq', value: 'underbench' },
        { parameter: 'worktop', operator: 'eq', value: 'removed' },
      ],
      referenceDatum: 'envelope_extent',
      operatingState: { kind: 'closed', angleDegrees: null },
    },
    sourceRepresentation: {
      kind: 'named_range',
      label: 'Adjustable height',
      labelAnchorId: 'label',
      minimum: 850,
      minimumAnchorId: 'minimum',
      maximum: 900,
      maximumAnchorId: 'maximum',
      sourceUnit: 'mm',
      unitAnchorId: 'unit',
      rangeMeaning: 'adjustment',
      rangeMeaningAnchorId: 'rangeMeaning',
    },
    evidence,
    applicabilityProof: {
      kind: 'EXACT_MODEL',
      namedModels: [{ canonicalProductId: SUBJECT_ID, model: 'DW60UT4I2' }],
      relationshipAssertionIds: [],
    },
    semanticPolicySha256: compiledSemantics.semanticPolicySha256,
    extractionProfileSha256: EXTRACTION_PROFILE_SHA256,
    derivedFromClaimId: null,
    validationInputs: {
      semantics: compiledSemantics,
      witnessedConditions: [exactProductWitness()],
      artifactRecords,
      fragments,
    },
  };
}

function orderedDimensionsClaimInput() {
  const { artifactRecords, fragments, evidence } = evidenceFixture({ includeOrderedAnchors: true });
  return {
    ...fixedClaimInput(),
    sourceRepresentation: {
      kind: 'ordered_dimensions',
      labels: ['H', 'W', 'D'],
      labelAnchorIds: ['heightLabel', 'widthLabel', 'depthLabel'],
      values: [850, 600, 600],
      valueAnchorIds: ['heightValue', 'widthValue', 'depthValue'],
      axisOrder: ['height', 'width', 'depth'],
      sourceUnit: 'mm',
      unitAnchorId: 'unit',
    },
    evidence,
    validationInputs: {
      semantics: compiledSemantics,
      witnessedConditions: [exactProductWitness()],
      artifactRecords,
      fragments,
    },
  };
}

function booleanClaimInput() {
  const { artifactRecords, fragments, evidence } = evidenceFixture({ includeStatementAnchor: true });
  return {
    ...fixedClaimInput(),
    field: 'waterConnection.required',
    value: { kind: 'boolean', value: true, unit: null },
    semantics: {
      axis: null,
      measurementScope: 'installation_requirement',
      inclusions: {},
      applicability: 'optional',
    },
    sourceRepresentation: {
      kind: 'boolean_statement',
      statement: 'Water connection required',
      statementAnchorId: 'statement',
      value: true,
    },
    evidence,
    validationInputs: {
      semantics: compiledSemantics,
      witnessedConditions: [exactProductWitness()],
      artifactRecords,
      fragments,
    },
  };
}

test('creates one immutable canonical fixed Claim V3 and replays its stored identity', () => {
  const input = fixedClaimInput();
  const claim = createEvidenceClaimV3(input);
  const identityPayload = {
    schemaVersion: 3,
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    subject: { canonicalProductId: SUBJECT_ID, market: 'AU' },
    field: 'closedEnvelope.widthMm',
    value: { kind: 'fixed', value: 600, unit: 'mm' },
    semantics: {
      axis: 'width',
      measurementScope: 'product_closed_external',
      inclusions: { door: 'unknown', handle: 'unknown' },
      applicability: 'required',
    },
    context: input.context,
    sourceRepresentation: input.sourceRepresentation,
    evidence: {
      sourceArtifactSha256: ROOT_SHA256,
      anchors: [
        { anchorId: 'label', role: 'legend', fragmentSha256: input.evidence.anchors[0].fragmentSha256 },
        { anchorId: 'subject', role: 'subject', fragmentSha256: input.evidence.anchors[0].fragmentSha256 },
        { anchorId: 'unit', role: 'unit', fragmentSha256: input.evidence.anchors[0].fragmentSha256 },
        { anchorId: 'value', role: 'value', fragmentSha256: input.evidence.anchors[0].fragmentSha256 },
      ],
      relations: [],
    },
    applicabilityProof: input.applicabilityProof,
    semanticPolicySha256: compiledSemantics.semanticPolicySha256,
    extractionProfileSha256: EXTRACTION_PROFILE_SHA256,
    derivedFromClaimId: null,
  };
  const expected = { ...identityPayload, claimId: sha256(canonicalEvidenceJson(identityPayload)) };

  assert.deepEqual(claim, expected);
  assert.ok(Object.isFrozen(claim));
  assert.ok(Object.isFrozen(claim.evidence.anchors));
  assert.throws(() => { claim.subject.market = 'NZ'; }, TypeError);
  assert.deepEqual(validateEvidenceClaimV3({ claim, validationInputs: input.validationInputs }), expected);
  const reorderedEvidence = structuredClone(input);
  reorderedEvidence.evidence.anchors.reverse();
  assert.equal(createEvidenceClaimV3(reorderedEvidence).claimId, claim.claimId);
});

test('preserves an anchored named range and rejects unordered or missing range meaning', () => {
  const input = namedRangeClaimInput();
  const claim = createEvidenceClaimV3(input);

  assert.deepEqual(claim.value, {
    kind: 'range',
    minimumCanonical: 850,
    maximumCanonical: 900,
    unit: 'mm',
    rangeMeaning: 'adjustment',
  });
  assert.deepEqual(claim.sourceRepresentation, input.sourceRepresentation);
  assert.throws(
    () => createEvidenceClaimV3({
      ...input,
      sourceRepresentation: { ...input.sourceRepresentation, minimum: 901 },
    }),
    /minimum exceeds maximum|range/i,
  );
  const missingMeaning = structuredClone(input);
  delete missingMeaning.sourceRepresentation.rangeMeaning;
  assert.throws(() => createEvidenceClaimV3(missingMeaning), /rangeMeaning|missing key/i);
  const missingClaimMeaning = structuredClone(input);
  delete missingClaimMeaning.value.rangeMeaning;
  assert.throws(() => createEvidenceClaimV3(missingClaimMeaning), /rangeMeaning|missing key/i);
});

test('preserves ordered dimension tuples and prohibits fake named axes', () => {
  const input = orderedDimensionsClaimInput();
  const claim = createEvidenceClaimV3(input);

  assert.deepEqual(claim.value, { kind: 'fixed', value: 600, unit: 'mm' });
  assert.deepEqual(claim.sourceRepresentation.axisOrder, ['height', 'width', 'depth']);
  assert.deepEqual(claim.sourceRepresentation.values, [850, 600, 600]);
  const reordered = structuredClone(input);
  reordered.sourceRepresentation.labels = ['W', 'H', 'D'];
  reordered.sourceRepresentation.labelAnchorIds = ['widthLabel', 'heightLabel', 'depthLabel'];
  reordered.sourceRepresentation.values = [600, 850, 600];
  reordered.sourceRepresentation.valueAnchorIds = ['widthValue', 'heightValue', 'depthValue'];
  reordered.sourceRepresentation.axisOrder = ['width', 'height', 'depth'];
  assert.notEqual(createEvidenceClaimV3(reordered).claimId, claim.claimId);
  assert.throws(
    () => createEvidenceClaimV3({
      ...input,
      sourceRepresentation: {
        ...input.sourceRepresentation,
        axisOrder: ['height', 'height', 'depth'],
      },
    }),
    /axisOrder.*duplicate|axis/i,
  );
  assert.throws(
    () => createEvidenceClaimV3({
      ...fixedClaimInput(),
      sourceRepresentation: {
        ...fixedClaimInput().sourceRepresentation,
        axisOrder: ['width'],
      },
    }),
    /unknown key|axisOrder/i,
  );
});

test('keeps boolean, not-applicable and unknown source outcomes distinct', () => {
  const booleanInput = booleanClaimInput();
  const booleanClaim = createEvidenceClaimV3(booleanInput);
  assert.deepEqual(booleanClaim.value, { kind: 'boolean', value: true, unit: null });
  assert.deepEqual(booleanClaim.sourceRepresentation, booleanInput.sourceRepresentation);

  const notApplicableInput = structuredClone(booleanInput);
  notApplicableInput.value = { kind: 'not_applicable', value: null, unit: null };
  notApplicableInput.semantics.applicability = 'not_applicable';
  notApplicableInput.sourceRepresentation = {
    kind: 'not_applicable_statement',
    statement: 'Water connection not applicable',
    statementAnchorId: 'statement',
  };
  const notApplicableClaim = createEvidenceClaimV3(notApplicableInput);
  assert.deepEqual(notApplicableClaim.value, { kind: 'not_applicable', value: null, unit: null });

  const mixedValue = structuredClone(booleanInput);
  mixedValue.value.rangeMeaning = 'adjustment';
  assert.throws(() => createEvidenceClaimV3(mixedValue), /unknown key|value/i);

  const unknown = structuredClone(booleanInput);
  unknown.value = null;
  unknown.semantics.applicability = 'unknown';
  assert.throws(
    () => createEvidenceClaimV3(unknown),
    (error) => error?.code === 'UNKNOWN_VALUE_CANDIDATE_GAP',
  );
});

test('sorts finite relation proof sets without treating them as source approval', () => {
  const input = fixedClaimInput();
  input.applicabilityProof = {
    kind: 'FINITE_OFFICIAL_RELATION',
    namedModels: [
      { canonicalProductId: RELATED_ID, model: 'DD60DAX9' },
      { canonicalProductId: SUBJECT_ID, model: 'DW60UT4I2' },
    ],
    relationshipAssertionIds: [
      `fa_product_relationship_${'d'.repeat(64)}`,
      `fa_product_relationship_${'c'.repeat(64)}`,
    ],
  };
  const claim = createEvidenceClaimV3(input);
  const reordered = structuredClone(input);
  reordered.applicabilityProof.namedModels.reverse();
  reordered.applicabilityProof.relationshipAssertionIds.reverse();
  const replay = createEvidenceClaimV3(reordered);

  assert.equal(replay.claimId, claim.claimId);
  assert.deepEqual(claim.applicabilityProof.namedModels.map(({ canonicalProductId }) => canonicalProductId), [
    SUBJECT_ID,
    RELATED_ID,
  ]);
  assert.deepEqual(claim.applicabilityProof.relationshipAssertionIds, [
    `fa_product_relationship_${'c'.repeat(64)}`,
    `fa_product_relationship_${'d'.repeat(64)}`,
  ]);
  const duplicate = structuredClone(input);
  duplicate.applicabilityProof.relationshipAssertionIds[1] = duplicate.applicabilityProof.relationshipAssertionIds[0];
  assert.throws(() => createEvidenceClaimV3(duplicate), /duplicate/i);
});

function finiteRelationClaimInput() {
  const input = fixedClaimInput();
  input.applicabilityProof.kind = 'FINITE_OFFICIAL_RELATION';
  input.applicabilityProof.namedModels.push({ canonicalProductId: RELATED_ID, model: 'DD60DAX9' });
  input.applicabilityProof.relationshipAssertionIds = [`fa_product_relationship_${'c'.repeat(64)}`];
  return input;
}

test('finite Claim accepts an existing producer assertion ID without granting derivation eligibility', () => {
  const input = finiteRelationClaimInput();
  const assertion = createProductRelationshipAssertion({
    relation: { kind: 'VARIANT_OF', target: { id: RELATED_ID, kind: 'canonical_product' } },
    market: 'AU',
    namedModels: input.applicabilityProof.namedModels,
    sharedFields: [input.field],
    contexts: [input.context],
    evidence: { status: 'unverified_candidate', references: [] },
    semantics: compiledSemantics,
  });
  input.applicabilityProof.relationshipAssertionIds = [assertion.assertionId];

  const claim = createEvidenceClaimV3(input);
  assert.deepEqual(claim.applicabilityProof.relationshipAssertionIds, [assertion.assertionId]);
  assert.equal(assertion.derivationEligible, false);
  assert.equal(claim.derivedFromClaimId, null);
  assert.deepEqual(validateEvidenceClaimV3({ claim, validationInputs: input.validationInputs }), claim);
});

for (const [label, id] of [
  ['opaque', 'not-a-product-relationship-id'],
  ['uppercase digest', `fa_product_relationship_${'A'.repeat(64)}`],
  ['short digest', `fa_product_relationship_${'a'.repeat(63)}`],
  ['long digest', `fa_product_relationship_${'a'.repeat(65)}`],
  ['non-hex digest', `fa_product_relationship_${'g'.repeat(64)}`],
  ['wrong type prefix', `fa_product_relation_${'a'.repeat(64)}`],
]) {
  for (const boundary of ['factory', 'stored']) {
    test(`finite Claim ${boundary} rejects ${label} relationship assertion IDs`, () => {
      const input = finiteRelationClaimInput();
      const claim = structuredClone(createEvidenceClaimV3(input));
      input.applicabilityProof.relationshipAssertionIds = [id];
      claim.applicabilityProof.relationshipAssertionIds = [id];
      const { claimId: _claimId, ...identityPayload } = claim;
      claim.claimId = sha256(canonicalEvidenceJson(identityPayload));

      assertClaimError(
        () => boundary === 'factory'
          ? createEvidenceClaimV3(input)
          : validateEvidenceClaimV3({ claim, validationInputs: input.validationInputs }),
        /relationship assertion ID|relationshipAssertionIds/i,
      );
    });
  }
}

test('changes Claim identity for every persisted evidence-relevant dimension', () => {
  const baseInput = fixedClaimInput();
  const base = createEvidenceClaimV3(baseInput);
  const changed = [];

  const subject = structuredClone(baseInput);
  const changedSubjectId = `fa_prod_${'3'.repeat(24)}`;
  subject.subject.canonicalProductId = changedSubjectId;
  subject.applicabilityProof.namedModels[0].canonicalProductId = changedSubjectId;
  subject.validationInputs.witnessedConditions[0].canonicalProductId = changedSubjectId;
  changed.push(createEvidenceClaimV3(subject));

  const semantics = structuredClone(baseInput);
  semantics.semantics.inclusions.door = 'included';
  changed.push(createEvidenceClaimV3(semantics));

  const context = structuredClone(baseInput);
  context.context.referenceDatum = 'finished_floor';
  changed.push(createEvidenceClaimV3(context));

  const representation = structuredClone(baseInput);
  representation.sourceRepresentation.label = 'Width including trim';
  changed.push(createEvidenceClaimV3(representation));

  const evidence = structuredClone(baseInput);
  evidence.evidence.anchors.push({
    anchorId: 'supplementalLabel',
    role: 'legend',
    fragmentSha256: evidence.evidence.anchors[0].fragmentSha256,
  });
  changed.push(createEvidenceClaimV3(evidence));

  const policy = structuredClone(baseInput);
  policy.validationInputs.semantics.semanticPolicy.policyVersion = 'fit-v3-test-policy-2';
  policy.validationInputs.semantics.semanticPolicySha256 = sha256(
    canonicalEvidenceJson(policy.validationInputs.semantics.semanticPolicy),
  );
  policy.semanticPolicySha256 = policy.validationInputs.semantics.semanticPolicySha256;
  changed.push(createEvidenceClaimV3(policy));

  const profile = structuredClone(baseInput);
  profile.extractionProfileSha256 = 'c'.repeat(64);
  changed.push(createEvidenceClaimV3(profile));

  const derived = structuredClone(baseInput);
  derived.derivedFromClaimId = 'd'.repeat(64);
  changed.push(createEvidenceClaimV3(derived));

  for (const claim of changed) assert.notEqual(claim.claimId, base.claimId);

  const mismatchedValue = structuredClone(baseInput);
  mismatchedValue.value.value = 601;
  assertClaimError(() => createEvidenceClaimV3(mismatchedValue), /value.*sourceRepresentation/i);
});

test('rejects unresolvable evidence links, duplicate IDs and unsupported representations', () => {
  const unresolvedAnchor = structuredClone(fixedClaimInput());
  unresolvedAnchor.sourceRepresentation.labelAnchorId = 'missing';
  assertClaimError(() => createEvidenceClaimV3(unresolvedAnchor), /does not resolve/i);

  const unresolvedRelation = structuredClone(fixedClaimInput());
  unresolvedRelation.evidence.relations = [{
    kind: 'same_table_row',
    fromAnchorId: 'subject',
    toAnchorId: 'missing',
    witnessAnchorIds: ['unit'],
  }];
  assertClaimError(() => createEvidenceClaimV3(unresolvedRelation), /endpoint anchor does not resolve/i);

  const duplicateAnchor = structuredClone(fixedClaimInput());
  duplicateAnchor.evidence.anchors.push({ ...duplicateAnchor.evidence.anchors[0] });
  assertClaimError(() => createEvidenceClaimV3(duplicateAnchor), /duplicate anchorId/i);

  const invalidRepresentation = structuredClone(fixedClaimInput());
  invalidRepresentation.sourceRepresentation.kind = 'free_text';
  assertClaimError(() => createEvidenceClaimV3(invalidRepresentation), /kind is unsupported/i);
});

test('stored Claim V3 rejects version bypasses, ID drift and migration metadata', () => {
  const input = fixedClaimInput();
  const claim = createEvidenceClaimV3(input);

  const missingVersion = structuredClone(claim);
  delete missingVersion.canonicalizationVersion;
  assertClaimError(
    () => validateEvidenceClaimV3({ claim: missingVersion, validationInputs: input.validationInputs }),
    /missing key/i,
  );

  const unknownVersion = structuredClone(claim);
  unknownVersion.canonicalizationVersion = 'fit-evidence-json-v4-1';
  assertClaimError(
    () => validateEvidenceClaimV3({ claim: unknownVersion, validationInputs: input.validationInputs }),
    /canonicalizationVersion is unsupported/i,
  );

  const mismatchedId = structuredClone(claim);
  mismatchedId.claimId = 'e'.repeat(64);
  assertClaimError(
    () => validateEvidenceClaimV3({ claim: mismatchedId, validationInputs: input.validationInputs }),
    /claimId does not match/i,
  );

  const migrationBypass = structuredClone(claim);
  migrationBypass.migrationMetadata = { codec: 'legacy' };
  assertClaimError(
    () => validateEvidenceClaimV3({ claim: migrationBypass, validationInputs: input.validationInputs }),
    /unknown key/i,
  );
});

test('rejects strict-JSON hazards before getters can run', () => {
  let getterReads = 0;
  const accessor = fixedClaimInput();
  Object.defineProperty(accessor, 'field', {
    enumerable: true,
    get() {
      getterReads += 1;
      throw new Error('must not execute');
    },
  });
  const symbol = fixedClaimInput();
  symbol[Symbol('unsafe')] = true;
  const nonFinite = fixedClaimInput();
  nonFinite.sourceRepresentation.value = Number.NaN;

  for (const input of [accessor, symbol, nonFinite]) {
    assertClaimError(() => createEvidenceClaimV3(input), /strict JSON|non-finite/i);
  }
  assert.equal(getterReads, 0);
});

test('factory rejects top-level bypass keys while its output remains a closed envelope', () => {
  const input = fixedClaimInput();
  input.migrationMetadata = { codec: 'legacy' };
  assertClaimError(() => createEvidenceClaimV3(input), /unknown key/i);

  const claim = createEvidenceClaimV3(fixedClaimInput());
  assert.deepEqual(Object.keys(claim).sort(), [
    'applicabilityProof',
    'canonicalizationVersion',
    'claimId',
    'context',
    'derivedFromClaimId',
    'evidence',
    'extractionProfileSha256',
    'field',
    'schemaVersion',
    'semanticPolicySha256',
    'semantics',
    'sourceRepresentation',
    'subject',
    'value',
  ]);
});

for (const [label, change] of [
  ['missing witness', (input) => { input.validationInputs.witnessedConditions = []; }],
  ['wrong subject', (input) => { input.validationInputs.witnessedConditions[0].canonicalProductId = RELATED_ID; }],
  ['wrong market', (input) => { input.validationInputs.witnessedConditions[0].market = 'NZ'; }],
  ['wrong key', (input) => {
    input.validationInputs.witnessedConditions[0].configurationKey = 'integrated';
    input.validationInputs.witnessedConditions[0].conditions = [
      { parameter: 'installationMode', operator: 'eq', value: 'integrated' },
    ];
  }],
  ['missing extra predicate', (input) => {
    input.context.conditions.push({ parameter: 'adjacentWall', operator: 'eq', value: 'left' });
  }],
  ['wrong predicate value', (input) => {
    input.context.conditions.push({ parameter: 'adjacentWall', operator: 'eq', value: 'left' });
    input.validationInputs.witnessedConditions[0].conditions.push({ parameter: 'adjacentWall', operator: 'eq', value: 'right' });
  }],
  ['extra witness predicate', (input) => {
    input.validationInputs.witnessedConditions[0].conditions.push({ parameter: 'adjacentWall', operator: 'eq', value: 'left' });
  }],
  ['unwitnessed unconditional', (input) => {
    input.context.configurationKey = 'unconditional';
    input.context.conditions = [];
    input.validationInputs.witnessedConditions = [];
  }],
  ['unwitnessed named key with unknown datum and state', (input) => {
    input.context.referenceDatum = 'unknown';
    input.context.operatingState = { kind: 'unknown', angleDegrees: null };
    input.validationInputs.witnessedConditions = [];
  }],
]) {
  for (const boundary of ['factory', 'stored']) {
    test(`Claim ${boundary} rejects ${label} for its named configuration`, () => {
      const input = fixedClaimInput();
      change(input);
      const witnessedInput = structuredClone(input);
      witnessedInput.validationInputs.witnessedConditions = [{
        ...exactProductWitness(),
        configurationKey: input.context.configurationKey,
        conditions: input.context.conditions,
        applicability: input.context.configurationKey === 'unconditional' ? 'unconditional' : 'conditional',
      }];
      const claim = createEvidenceClaimV3(witnessedInput);

      assertClaimError(
        () => boundary === 'factory'
          ? createEvidenceClaimV3(input)
          : validateEvidenceClaimV3({ claim, validationInputs: input.validationInputs }),
        /context.*witness/i,
      );
    });
  }
}

test('Claim uses a complete normalized exact witness even among unrelated valid witnesses', () => {
  const input = fixedClaimInput();
  const wall = { parameter: 'adjacentWall', operator: 'eq', value: 'left' };
  input.context.conditions.push(wall);
  input.validationInputs.witnessedConditions[0].conditions = [...input.context.conditions].reverse();
  const exactClaim = createEvidenceClaimV3(input);
  input.validationInputs.witnessedConditions.unshift(
    { ...exactProductWitness(), canonicalProductId: RELATED_ID },
    { ...exactProductWitness(), market: 'NZ' },
  );
  const claim = createEvidenceClaimV3(input);

  assert.equal(claim.claimId, exactClaim.claimId);
  assert.deepEqual(claim.context.conditions, [
    wall,
    { parameter: 'installationMode', operator: 'eq', value: 'underbench' },
    { parameter: 'worktop', operator: 'eq', value: 'removed' },
  ]);
  assert.deepEqual(validateEvidenceClaimV3({ claim, validationInputs: input.validationInputs }), claim);
});

for (const [label, context] of [
  ['unknown datum', { referenceDatum: 'unknown' }],
  ['unknown operating state', { operatingState: { kind: 'unknown', angleDegrees: null } }],
  ['unknown datum and state', { referenceDatum: 'unknown', operatingState: { kind: 'unknown', angleDegrees: null } }],
  ['null configuration with predicates', { configurationKey: null }],
  ['fully unspecified context', {
    configurationKey: null, conditions: [], referenceDatum: 'unknown',
    operatingState: { kind: 'unknown', angleDegrees: null },
  }],
  ['witnessed unconditional', { configurationKey: 'unconditional', conditions: [] }],
]) {
  test(`Claim factory and stored validation preserve ${label}`, () => {
    const input = fixedClaimInput();
    Object.assign(input.context, context);
    if (input.context.configurationKey === null) input.validationInputs.witnessedConditions = [];
    if (input.context.configurationKey === 'unconditional') {
      input.validationInputs.witnessedConditions = [{
        ...exactProductWitness(), configurationKey: 'unconditional', conditions: [], applicability: 'unconditional',
      }];
    }
    const claim = createEvidenceClaimV3(input);

    assert.deepEqual(claim.context, input.context);
    assert.deepEqual(validateEvidenceClaimV3({ claim, validationInputs: input.validationInputs }), claim);
  });
}
