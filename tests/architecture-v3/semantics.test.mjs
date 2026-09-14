import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { upgradeLegacyDimensionClaim } from '../../src/domain/dimension-evidence-claim.mjs';
import {
  compileV3Semantics,
  normalizeV3FieldValue,
  requireV3Semantics,
} from '../../src/domain/architecture-v3/semantics.mjs';
import {
  resolveEvaluationContext,
  validateEngineeringContext,
} from '../../src/domain/architecture-v3/engineering-context.mjs';

const [fieldDictionary, installationMatrix] = await Promise.all([
  readFile('data/architecture-v2/policies/product-data-field-rights-dictionary.json', 'utf8').then(JSON.parse),
  readFile('data/architecture-v2/generated/installation-evidence-applicability-matrix.json', 'utf8').then(JSON.parse),
]);
const overlay = await readFile('data/architecture-v3/policies/semantics-overlay.json', 'utf8').then(JSON.parse);

test('legacy V2 dimension values remain canonical mm despite a sourceUnit label', () => {
  const claim = upgradeLegacyDimensionClaim({
    field: 'closedEnvelope.widthMm',
    value: 1001,
    unit: 'cm',
    sourceUnit: 'cm',
    label: 'Width',
    page: null,
    fragmentSha256: null,
    bbox: null,
  });

  assert.deepEqual(claim.value, { kind: 'fixed', mm: 1001 });
});

test('compiler preserves package source metadata while using the V2 delivery claim scope', () => {
  const semantics = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });
  const deliveryWidth = semantics.semanticPolicy.fields['delivery.widthMm'];

  assert.deepEqual(
    deliveryWidth.sourceFieldPaths,
    ['deliveryEnvelope.widthMm', 'packagedEnvelope.widthMm'],
  );
  assert.equal(deliveryWidth.measurementScope, 'delivery_package');
  assert.equal(deliveryWidth.sourceDefinitions[0].scope, 'package');
});

test('compiler preserves the installation owner kg unit without a second field dictionary', () => {
  const semantics = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });

  assert.equal(semantics.semanticPolicy.fields['deliveryEnvelope.weightKg'].canonicalUnit, 'kg');
});

test('V3 normalization converts declared decimal metres before integer-mm precision validation', () => {
  const semantics = compileV3Semantics({
    fieldDictionary,
    installationMatrix,
    overlay,
  });

  assert.deepEqual(
    normalizeV3FieldValue({
      rawValue: 1.001,
      unit: 'm',
      fieldPath: 'closedEnvelope.widthMm',
      inclusions: { door: null, handle: null },
      applicability: 'required',
      semantics,
    }),
    {
      kind: 'fixed',
      fieldPath: 'closedEnvelope.widthMm',
      value: 1001,
      unit: 'mm',
      inclusions: { door: 'unknown', handle: 'unknown' },
      applicability: 'required',
    },
  );
});

test('V3 normalization rejects coercible, non-finite, negative and sub-millimetre raw dimensions', () => {
  const semantics = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });
  const input = {
    unit: 'm',
    fieldPath: 'closedEnvelope.widthMm',
    inclusions: {},
    applicability: 'required',
    semantics,
  };

  for (const rawValue of [null, false, '1.001', Number.NaN, Infinity]) {
    assert.throws(
      () => normalizeV3FieldValue({ ...input, rawValue }),
      /finite JavaScript number/i,
    );
  }
  assert.throws(() => normalizeV3FieldValue({ ...input, rawValue: -1 }), /negative/i);
  assert.throws(() => normalizeV3FieldValue({ ...input, rawValue: 1.0001 }), /whole canonical millimetre/i);
  assert.throws(() => normalizeV3FieldValue({ ...input, rawValue: 0, unit: 'mm' }), /below/i);
  assert.deepEqual(
    normalizeV3FieldValue({
      ...input,
      rawValue: 0,
      unit: 'mm',
      fieldPath: 'installationClearance.rearMm',
    }),
    {
      kind: 'fixed',
      fieldPath: 'installation.rearMm',
      value: 0,
      unit: 'mm',
      inclusions: {},
      applicability: 'required',
    },
  );
});

test('V3 normalization keeps only declared ranges and range meanings', () => {
  const semantics = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });
  const input = {
    unit: 'm',
    fieldPath: 'adjustableRange.heightMm',
    inclusions: {},
    applicability: 'required',
    semantics,
  };

  assert.deepEqual(
    normalizeV3FieldValue({
      ...input,
      rawValue: { kind: 'range', minimum: 0.85, maximum: 0.9, rangeMeaning: 'adjustment' },
    }),
    {
      kind: 'range',
      fieldPath: 'adjustableRange.heightMm',
      minimum: 850,
      maximum: 900,
      unit: 'mm',
      rangeMeaning: 'adjustment',
      inclusions: {},
      applicability: 'required',
    },
  );
  assert.throws(
    () => normalizeV3FieldValue({
      ...input,
      rawValue: { kind: 'range', minimum: 0.85, maximum: 0.9, rangeMeaning: 'discrete' },
    }),
    /rangeMeaning/i,
  );
  assert.throws(
    () => normalizeV3FieldValue({
      ...input,
      rawValue: { kind: 'range', minimum: 0.9, maximum: 0.85, rangeMeaning: 'adjustment' },
    }),
    /minimum exceeds maximum/i,
  );
  assert.throws(
    () => normalizeV3FieldValue({
      ...input,
      rawValue: {
        kind: 'range', minimum: 0.85, maximum: 0.9, rangeMeaning: 'adjustment', configuration: 'removed',
      },
    }),
    /unknown key/i,
  );
});

test('V3 normalization keeps missing inclusions unknown and requires a door for door-open depth', () => {
  const semantics = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });
  const base = {
    rawValue: 600,
    unit: 'mm',
    fieldPath: 'closedEnvelope.depthMm',
    inclusions: { door: null },
    applicability: 'required',
    semantics,
  };
  assert.deepEqual(normalizeV3FieldValue(base).inclusions, { door: 'unknown', handle: 'unknown' });
  assert.throws(
    () => normalizeV3FieldValue({
      ...base,
      rawValue: 1100,
      fieldPath: 'operationEnvelope.doorOpenDepthMm',
      inclusions: {},
    }),
    /include door/i,
  );
  assert.deepEqual(
    normalizeV3FieldValue({
      ...base,
      rawValue: 1100,
      fieldPath: 'operationEnvelope.doorOpenDepthMm',
      inclusions: { door: true },
    }).inclusions,
    { door: 'included' },
  );
});

test('unknown and not-applicable door-open evidence validates inclusions without asserting a door', () => {
  const semantics = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });
  const base = {
    rawValue: null,
    unit: null,
    fieldPath: 'operationEnvelope.doorOpenDepthMm',
    semantics,
  };

  assert.equal(
    normalizeV3FieldValue({ ...base, inclusions: { door: 'unknown' }, applicability: 'unknown' }),
    null,
  );
  assert.deepEqual(
    normalizeV3FieldValue({ ...base, inclusions: {}, applicability: 'not_applicable' }),
    {
      kind: 'not_applicable',
      fieldPath: 'operation.doorOpenDepthMm',
      value: null,
      unit: null,
      inclusions: { door: 'unknown' },
      applicability: 'not_applicable',
    },
  );
  assert.throws(
    () => normalizeV3FieldValue({ ...base, inclusions: { door: 'maybe' }, applicability: 'unknown' }),
    /inclusion/i,
  );
});

test('compiler restores all V2 dimension fields with their V2 axes, scopes and range union', () => {
  const semantics = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });
  const fields = semantics.semanticPolicy.fields;
  const v2DimensionFields = [
    'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    'installation.leftMm', 'installation.rightMm', 'installation.topMm', 'installation.rearMm', 'installation.frontMm',
    'operation.doorOpenDepthMm', 'operation.hingeSideSpaceMm', 'operation.lidOpenHeightMm',
    'service.plumbingRearMm', 'service.rearServicesMm', 'service.rearVentilationMm',
    'delivery.widthMm', 'delivery.heightMm', 'delivery.depthMm',
  ];

  assert.deepEqual(
    v2DimensionFields.filter((fieldPath) => !fields[fieldPath]),
    [],
  );
  for (const fieldPath of v2DimensionFields) assert.ok(fields[fieldPath].allowedValueKinds.includes('range'));
  assert.equal(fields['closedEnvelope.widthMm'].axis, 'width');
  assert.equal(fields['closedEnvelope.widthMm'].measurementScope, 'product_closed_external');
  assert.equal(fields['closedEnvelope.widthMm'].sourceDefinitions[0].scope, 'product_closed');
  assert.equal(fields['service.rearVentilationMm'].axis, 'rear');
  assert.equal(fields['service.rearVentilationMm'].measurementScope, 'service_space');
  assert.deepEqual(
    normalizeV3FieldValue({
      rawValue: { kind: 'range', minimum: 0.5, maximum: 0.6, rangeMeaning: 'uncertainty' },
      unit: 'm',
      fieldPath: 'closedEnvelope.widthMm',
      inclusions: {},
      applicability: 'required',
      semantics,
    }),
    {
      kind: 'range',
      fieldPath: 'closedEnvelope.widthMm',
      minimum: 500,
      maximum: 600,
      unit: 'mm',
      rangeMeaning: 'uncertainty',
      inclusions: { door: 'unknown', handle: 'unknown' },
      applicability: 'required',
    },
  );
});

test('installation owner values keep their own nonnegative finite mm contract', () => {
  const semantics = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });

  assert.deepEqual(
    normalizeV3FieldValue({
      rawValue: 10000.5,
      unit: 'mm',
      fieldPath: 'waterConnection.hoseReachMm',
      inclusions: {},
      applicability: 'required',
      semantics,
    }),
    {
      kind: 'fixed',
      fieldPath: 'waterConnection.hoseReachMm',
      value: 10000.5,
      unit: 'mm',
      inclusions: {},
      applicability: 'required',
    },
  );
});

test('non-mm identity conversion preserves tiny finite declared decimals', () => {
  const semantics = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });

  assert.equal(
    normalizeV3FieldValue({
      rawValue: Number.MIN_VALUE,
      unit: 'A',
      fieldPath: 'powerConnection.currentA',
      inclusions: {},
      applicability: 'required',
      semantics,
    }).value,
    Number.MIN_VALUE,
  );
});

test('compiler rejects an overlay conversion across physical dimensions', () => {
  const crossDimensionOverlay = structuredClone(overlay);
  crossDimensionOverlay.unitConversions.mm.L = { numerator: 1, denominator: 1 };

  assert.throws(
    () => compileV3Semantics({ fieldDictionary, installationMatrix, overlay: crossDimensionOverlay }),
    /unit conversion|dimension/i,
  );
});

test('V3 values keep boolean, unknown, not-applicable and policy-hash branches closed', () => {
  const semantics = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });

  assert.deepEqual(
    normalizeV3FieldValue({
      rawValue: true,
      unit: null,
      fieldPath: 'waterConnection.required',
      applicability: 'optional',
      semantics,
    }),
    {
      kind: 'boolean',
      fieldPath: 'waterConnection.required',
      value: true,
      unit: null,
      inclusions: {},
      applicability: 'optional',
    },
  );
  assert.equal(
    normalizeV3FieldValue({
      rawValue: null,
      unit: null,
      fieldPath: 'waterConnection.required',
      applicability: 'unknown',
      semantics,
    }),
    null,
  );
  assert.throws(
    () => normalizeV3FieldValue({
      rawValue: 1,
      unit: 'mm',
      fieldPath: 'operationEnvelope.depthMm',
      applicability: 'required',
      semantics,
    }),
    /review-only/i,
  );
  const tampered = structuredClone(semantics);
  tampered.semanticPolicy.policyVersion = 'tampered';
  assert.throws(
    () => normalizeV3FieldValue({
      rawValue: true,
      unit: null,
      fieldPath: 'waterConnection.required',
      applicability: 'optional',
      semantics: tampered,
    }),
    /SHA-256/i,
  );
});

test('compiled semantic policy requires schema v1 and maps non-canonical policy input to invalid', () => {
  const semantics = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });
  const missingVersion = structuredClone(semantics);
  delete missingVersion.semanticPolicy.schemaVersion;
  assert.throws(() => requireV3Semantics(missingVersion), /schemaVersion/i);
  const unsupportedVersion = structuredClone(semantics);
  unsupportedVersion.semanticPolicy.schemaVersion = 2;
  assert.throws(() => requireV3Semantics(unsupportedVersion), /schemaVersion/i);

  const nonCanonicalPolicy = structuredClone(semantics);
  nonCanonicalPolicy.semanticPolicy.context.referenceDatums = [];
  nonCanonicalPolicy.semanticPolicy.context.referenceDatums.length = 1;
  assert.throws(() => requireV3Semantics(nonCanonicalPolicy), /semantic policy|canonical/i);
  assert.equal(
    resolveEvaluationContext({
      candidateContext: underbenchContext(),
      requestedContext: underbenchContext(),
      product: { canonicalProductId: 'fa_prod_example', market: 'AU' },
      witnessedConditions: [exactProductWitness()],
      semantics: nonCanonicalPolicy,
    }),
    'invalid',
  );
});

function underbenchContext(overrides = {}) {
  return {
    configurationKey: 'underbench_worktop_removed',
    conditions: [
      { parameter: 'installationMode', operator: 'eq', value: 'underbench' },
      { parameter: 'worktop', operator: 'eq', value: 'removed' },
    ],
    referenceDatum: 'envelope_extent',
    operatingState: { kind: 'closed', angleDegrees: null },
    ...overrides,
  };
}

function exactProductWitness(overrides = {}) {
  return {
    canonicalProductId: 'fa_prod_example',
    market: 'AU',
    configurationKey: 'underbench_worktop_removed',
    conditions: [
      { parameter: 'installationMode', operator: 'eq', value: 'underbench' },
      { parameter: 'worktop', operator: 'eq', value: 'removed' },
    ],
    applicability: 'conditional',
    membership: 'exact_product_market',
    ...overrides,
  };
}

test('engineering contexts keep a null configuration unspecified and reject invalid finite predicates', () => {
  const semantics = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });

  assert.deepEqual(
    validateEngineeringContext({
      context: {
        configurationKey: null,
        conditions: [],
        referenceDatum: 'unknown',
        operatingState: { kind: 'unknown', angleDegrees: null },
      },
      semantics,
      witnessedConditions: [],
    }),
    {
      configurationKey: null,
      conditions: [],
      referenceDatum: 'unknown',
      operatingState: { kind: 'unknown', angleDegrees: null },
    },
  );
  assert.throws(
    () => validateEngineeringContext({
      context: underbenchContext({
        conditions: [{ parameter: 'installationMode', operator: 'eq', value: 'integrated' }],
      }),
      semantics,
      witnessedConditions: [],
    }),
    /configuration key|conditions/i,
  );
  assert.throws(
    () => validateEngineeringContext({
      context: underbenchContext({
        configurationKey: null,
        conditions: [
          { parameter: 'installationMode', operator: 'eq', value: 'underbench' },
          { parameter: 'installationMode', operator: 'eq', value: 'integrated' },
        ],
      }),
      semantics,
      witnessedConditions: [],
    }),
    /contradictory/i,
  );
  assert.throws(
    () => validateEngineeringContext({
      context: underbenchContext({
        operatingState: { kind: 'closed', angleDegrees: 0 },
      }),
      semantics,
      witnessedConditions: [],
    }),
    /angle/i,
  );
  assert.throws(
    () => validateEngineeringContext({
      context: underbenchContext({
        configurationKey: null,
        conditions: [{ parameter: 'installationMode', operator: 'neq', value: 'underbench' }],
      }),
      semantics,
      witnessedConditions: [],
    }),
    /eq only/i,
  );
  assert.throws(
    () => validateEngineeringContext({
      context: underbenchContext({
        operatingState: { kind: 'door_open', angleDegrees: null },
      }),
      semantics,
      witnessedConditions: [],
    }),
    /angle/i,
  );
  assert.throws(
    () => validateEngineeringContext({
      context: underbenchContext({
        operatingState: { state: 'closed', angleDegrees: null },
      }),
      semantics,
      witnessedConditions: [],
    }),
    /unknown key|missing key/i,
  );
  assert.throws(
    () => validateEngineeringContext({
      context: underbenchContext({
        conditions: [
          { parameter: 'installationMode', operator: 'eq', value: 'underbench' },
          { parameter: 'worktop', operator: 'eq', value: 'removed' },
          { parameter: 'openingState', operator: 'eq', value: 'door_open' },
        ],
      }),
      semantics,
      witnessedConditions: [],
    }),
    /openingState|operating state/i,
  );
  assert.throws(
    () => validateEngineeringContext({
      context: underbenchContext({ configurationKey: 'unconditional' }),
      semantics,
      witnessedConditions: [],
    }),
    /unconditional|conditions/i,
  );
  assert.throws(
    () => validateEngineeringContext({
      context: {
        configurationKey: 'unconditional',
        conditions: [],
        referenceDatum: 'envelope_extent',
        operatingState: { kind: 'closed', angleDegrees: null },
      },
      semantics,
      witnessedConditions: [exactProductWitness({
        configurationKey: 'unconditional',
        conditions: [{ parameter: 'installationMode', operator: 'eq', value: 'underbench' }],
        applicability: 'unconditional',
      })],
    }),
    /unconditional|conditions/i,
  );
});

test('named configurations allow additional exact predicates without inventing their requested value', () => {
  const semantics = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });
  const candidateContext = underbenchContext({
    conditions: [
      { parameter: 'installationMode', operator: 'eq', value: 'underbench' },
      { parameter: 'worktop', operator: 'eq', value: 'removed' },
      { parameter: 'adjacentWall', operator: 'eq', value: 'left' },
    ],
  });
  const matchingWitness = exactProductWitness({ conditions: candidateContext.conditions });
  const base = {
    candidateContext,
    product: { canonicalProductId: 'fa_prod_example', market: 'AU' },
    witnessedConditions: [matchingWitness],
    semantics,
  };

  assert.equal(
    resolveEvaluationContext({ ...base, requestedContext: underbenchContext() }),
    'unknown',
  );
  assert.equal(
    resolveEvaluationContext({ ...base, requestedContext: candidateContext }),
    'applicable',
  );
  assert.equal(
    resolveEvaluationContext({
      ...base,
      requestedContext: underbenchContext({
        conditions: candidateContext.conditions,
        referenceDatum: 'finished_floor',
      }),
    }),
    'unknown',
  );
  const rightWallRequest = underbenchContext({
    conditions: [
      { parameter: 'installationMode', operator: 'eq', value: 'underbench' },
      { parameter: 'worktop', operator: 'eq', value: 'removed' },
      { parameter: 'adjacentWall', operator: 'eq', value: 'right' },
    ],
    referenceDatum: 'finished_floor',
  });
  assert.equal(
    resolveEvaluationContext({ ...base, requestedContext: rightWallRequest }),
    'inapplicable',
  );
  assert.equal(
    resolveEvaluationContext({
      ...base,
      requestedContext: rightWallRequest,
      witnessedConditions: [matchingWitness],
      product: { canonicalProductId: 'fa_prod_other', market: 'AU' },
    }),
    'unknown',
  );
  assert.equal(
    resolveEvaluationContext({
      ...base,
      requestedContext: rightWallRequest,
      witnessedConditions: [],
    }),
    'unknown',
  );
});

test('engineering evaluation requires an explicit product-market configuration witness', () => {
  const semantics = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });
  const base = {
    candidateContext: underbenchContext(),
    requestedContext: underbenchContext(),
    product: { canonicalProductId: 'fa_prod_example', market: 'AU' },
    semantics,
  };

  assert.equal(
    resolveEvaluationContext({ ...base, witnessedConditions: [exactProductWitness()] }),
    'applicable',
  );
  assert.equal(
    resolveEvaluationContext({
      ...base,
      witnessedConditions: [exactProductWitness({ canonicalProductId: 'fa_prod_other' })],
    }),
    'unknown',
  );
  assert.equal(
    resolveEvaluationContext({
      ...base,
      candidateContext: underbenchContext({ configurationKey: null }),
      witnessedConditions: [exactProductWitness()],
    }),
    'unknown',
  );
  assert.equal(
    resolveEvaluationContext({
      ...base,
      requestedContext: underbenchContext({
        configurationKey: 'integrated',
        conditions: [{ parameter: 'installationMode', operator: 'eq', value: 'integrated' }],
      }),
      witnessedConditions: [exactProductWitness()],
    }),
    'inapplicable',
  );
});

test('conditional and unconditional candidates need their own explicit witnesses', () => {
  const semantics = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });
  const unconditionalContext = {
    configurationKey: 'unconditional',
    conditions: [],
    referenceDatum: 'envelope_extent',
    operatingState: { kind: 'closed', angleDegrees: null },
  };
  const base = {
    candidateContext: unconditionalContext,
    requestedContext: underbenchContext(),
    product: { canonicalProductId: 'fa_prod_example', market: 'AU' },
    semantics,
  };

  assert.equal(resolveEvaluationContext({ ...base, witnessedConditions: [] }), 'unknown');
  assert.equal(
    resolveEvaluationContext({
      ...base,
      witnessedConditions: [{
        ...exactProductWitness(),
        configurationKey: 'unconditional',
        conditions: [],
        applicability: 'unconditional',
      }],
    }),
    'applicable',
  );
  assert.equal(
    resolveEvaluationContext({
      ...base,
      candidateContext: underbenchContext(),
      witnessedConditions: [exactProductWitness()],
    }),
    'applicable',
  );
  assert.equal(
    resolveEvaluationContext({
      ...base,
      witnessedConditions: [{
        ...exactProductWitness(),
        canonicalProductId: 'fa_prod_other',
        configurationKey: 'unconditional',
        conditions: [],
        applicability: 'unconditional',
      }],
    }),
    'unknown',
  );
  assert.equal(
    resolveEvaluationContext({
      ...base,
      witnessedConditions: [{
        ...exactProductWitness(),
        market: 'NZ',
        configurationKey: 'unconditional',
        conditions: [],
        applicability: 'unconditional',
      }],
    }),
    'unknown',
  );
  assert.equal(
    resolveEvaluationContext({
      ...base,
      witnessedConditions: [{
        ...exactProductWitness(),
        configurationKey: 'unconditional',
        conditions: [],
        applicability: 'conditional',
      }],
    }),
    'invalid',
  );
});
