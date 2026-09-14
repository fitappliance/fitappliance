import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { claimV2GeometryValue } from '../../src/domain/dimension-evidence-claim.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';
import { compileV3Semantics } from '../../src/domain/architecture-v3/semantics.mjs';
import {
  adaptLegacyGeometryCandidate,
  adaptLegacyInstallationCandidate,
  LegacySemanticsAdapterValidationError,
} from '../../src/domain/architecture-v3/legacy-semantics-adapter.mjs';

const [fieldDictionary, installationMatrix, overlay] = await Promise.all([
  readFile('data/architecture-v2/policies/product-data-field-rights-dictionary.json', 'utf8').then(JSON.parse),
  readFile('data/architecture-v2/generated/installation-evidence-applicability-matrix.json', 'utf8').then(JSON.parse),
  readFile('data/architecture-v3/policies/semantics-overlay.json', 'utf8').then(JSON.parse),
]);
const semantics = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });

const legacyDimensionClaim = {
  field: 'closedEnvelope.widthMm',
  value: { kind: 'fixed', mm: 598 },
  sourceLabel: 'Overall dimensions: D x W x H (cm)',
  sourceAxisOrder: ['depth', 'width', 'height'],
  sourceUnit: 'cm',
  measurementScope: 'product_closed_external',
  includesDoor: null,
  includesHandle: null,
  page: null,
  fragmentSha256: null,
  bbox: null,
};

function deepFreezeJson(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreezeJson(child);
    Object.freeze(value);
  }
  return value;
}

test('keeps canonical V2 millimetres intact when a cm source label lacks V3 facets', () => {
  const result = adaptLegacyGeometryCandidate({
    legacyObject: {
      kind: 'dimension_claim_v2',
      record: legacyDimensionClaim,
      origin: {
        containerSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        jsonPointer: '/entries/0/sources/0/claims/1',
      },
      owner: null,
    },
    semantics,
  });

  assert.equal(result.candidate.kind, 'legacy_geometry_candidate');
  assert.equal(result.candidate.disposition, 'candidate_only');
  assert.equal(result.candidate.assertion.rawValue.mm, 598);
  assert.equal(result.candidate.assertion.normalizedValue, null);
  assert.deepEqual(result.candidate.assertion.sourceRepresentation.axisOrder, ['depth', 'width', 'height']);
  assert.equal(result.candidate.assertion.sourceRepresentation.sourceUnit, 'cm');
  assert.deepEqual(result.candidate.legacy.record, legacyDimensionClaim);
  assert.deepEqual(result.losses, []);
  assert.deepEqual(
    result.unresolved.filter(({ reason }) => reason === 'APPLICABILITY_UNSPECIFIED'
      || reason === 'ENGINEERING_CONTEXT_UNSPECIFIED'
      || reason === 'INCLUSION_UNKNOWN'),
    [
      {
        path: '/record/applicability',
        reason: 'APPLICABILITY_UNSPECIFIED',
        requiredWitnessKind: 'applicability_assertion',
      },
      {
        path: '/record/context',
        reason: 'ENGINEERING_CONTEXT_UNSPECIFIED',
        requiredWitnessKind: 'engineering_context_assertion',
      },
      {
        path: '/record/includesDoor',
        reason: 'INCLUSION_UNKNOWN',
        requiredWitnessKind: 'inclusion_assertion',
      },
      {
        path: '/record/includesHandle',
        reason: 'INCLUSION_UNKNOWN',
        requiredWitnessKind: 'inclusion_assertion',
      },
    ],
  );
});

const bundleMetadataClaim = {
  field: 'closedEnvelope.widthMm',
  value: { kind: 'fixed', mm: 701 },
  sourceLabel: 'Width (mm)',
  sourceAxisOrder: ['width'],
  sourceUnit: 'mm',
  measurementScope: 'product_closed_external',
  includesDoor: null,
  includesHandle: null,
  page: null,
  fragmentSha256: null,
  bbox: null,
};
const bundleMetadataBinding = {
  schemaVersion: 3,
  claimSemanticsVersion: 2,
  policyVersion: '2026-07-13.1',
  manufacturerPolicyVersion: '2026-07-12.1',
  verifiedAt: '2026-07-14T17:39:59.856Z',
  bindingSha256: '01c65d9da822453778a3ce85edececd058dd81ca70f22dc258ce3677debee42e',
};
const bundleMetadataSource = {
  contentSha256: '6b28ee2a4a8948655499dc4a871efc9dde59a6890c991dc521255f02a7126fb5',
  identity: { brand: 'LG', model: 'WTG1432VH', outcome: 'exact' },
  claims: [bundleMetadataClaim],
  verificationReceipt: bundleMetadataBinding,
};
const bundleMetadataCase = {
  canonicalProductId: 'fa_prod_152a2a88bc4886aaf8a7270f',
  brand: 'LG',
  model: 'WTG1432VH',
  category: 'washing_machine',
  lifecycleState: 'CURRENT_RETAIL',
  sources: [bundleMetadataSource],
};

test('adapts current bundle metadata only after its compact binding resolves to the selected owner claim', () => {
  const result = adaptLegacyGeometryCandidate({
    legacyObject: {
      kind: 'manufacturer_verification_binding',
      record: bundleMetadataBinding,
      origin: {
        containerSha256: 'd947f8bcf15173ceb23fbba98a62459140f8ed9b93bf15c7d5fc5314f6785550',
        jsonPointer: '/entries/0/sources/0/verificationReceipt',
      },
      owner: { case: bundleMetadataCase, source: bundleMetadataSource, claimIndex: 0 },
    },
    semantics,
  });

  assert.equal(result.candidate.kind, 'legacy_geometry_candidate');
  assert.equal(result.candidate.assertion.rawValue.mm, 701);
  assert.equal(result.candidate.assertion.normalizedValue, null);
  assert.deepEqual(result.candidate.legacy.record, bundleMetadataBinding);
  assert.deepEqual(result.candidate.legacy.owner, {
    case: bundleMetadataCase,
    source: bundleMetadataSource,
    claimIndex: 0,
  });
  assert.deepEqual(result.unresolved.filter(({ reason }) => reason.startsWith('OWNER_')), []);
  assert.equal(Object.hasOwn(result.candidate, 'admitted'), false);
  assert.equal(Object.hasOwn(result.candidate, 'accepted'), false);
  assert.equal(Object.hasOwn(result.candidate, 'receiptType'), false);
  assert.equal(Object.hasOwn(result.candidate, 'verified'), false);
});

test('leaves a compact manufacturer binding unresolved when its owner or selected claim is absent', () => {
  const result = adaptLegacyGeometryCandidate({
    legacyObject: {
      kind: 'manufacturer_verification_binding',
      record: bundleMetadataBinding,
      origin: { containerSha256: null, jsonPointer: '' },
      owner: null,
    },
    semantics,
  });

  assert.equal(result.candidate.assertion.rawValue, null);
  assert.deepEqual(
    result.unresolved.filter(({ reason }) => reason.startsWith('OWNER_') || reason.startsWith('ORIGIN_')),
    [
      {
        path: '/origin/containerSha256',
        reason: 'ORIGIN_CONTAINER_HASH_UNRESOLVED',
        requiredWitnessKind: 'container_sha256',
      },
      {
        path: '/owner/source',
        reason: 'OWNER_SOURCE_UNRESOLVED',
        requiredWitnessKind: 'legacy_source_record',
      },
      {
        path: '/owner/claimIndex',
        reason: 'OWNER_CLAIM_SELECTION_UNRESOLVED',
        requiredWitnessKind: 'source_claim_selection',
      },
    ],
  );
});

test('copies legacy transport output without aliasing or freezing mutable caller input', () => {
  const legacyObject = {
    kind: 'dimension_claim_v2',
    record: structuredClone(legacyDimensionClaim),
    origin: {
      containerSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      jsonPointer: '',
    },
    owner: null,
  };
  const before = structuredClone(legacyObject);

  const result = adaptLegacyGeometryCandidate({ legacyObject, semantics });

  assert.deepEqual(legacyObject, before);
  assert.equal(Object.isFrozen(legacyObject), false);
  assert.equal(Object.isFrozen(legacyObject.record), false);
  assert.notStrictEqual(result.candidate.legacy.record, legacyObject.record);
  assert.notStrictEqual(result.candidate.legacy.origin, legacyObject.origin);
  result.candidate.legacy.record.value.mm = 999;
  assert.equal(legacyObject.record.value.mm, 598);
});

test('keeps frozen legacy callers deterministic and preserves historical helper outputs', () => {
  const legacyObject = deepFreezeJson({
    kind: 'dimension_claim_v2',
    record: structuredClone(legacyDimensionClaim),
    origin: {
      containerSha256: 'bcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbc',
      jsonPointer: '/claims/0',
    },
    owner: null,
  });

  const first = adaptLegacyGeometryCandidate({ legacyObject, semantics });
  const second = adaptLegacyGeometryCandidate({ legacyObject, semantics });

  assert.equal(claimV2GeometryValue(legacyObject.record), 598);
  assert.equal(
    canonicalJsonSha256({ a: 1 }),
    '015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862',
  );
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(legacyObject.record.value), true);
  assert.notStrictEqual(first.candidate.legacy.record, legacyObject.record);
  first.candidate.legacy.record.value.mm = 999;
  assert.equal(legacyObject.record.value.mm, 598);
});

test('normalizes an explicit installation numeric assertion without admitting its evidence', () => {
  const installationRequirement = {
    field: 'powerConnection.currentA',
    value: 10,
    unit: 'A',
    applicability: 'required',
    evidence: null,
    evidenceClass: 'unknown',
  };

  const result = adaptLegacyInstallationCandidate({
    legacyObject: {
      kind: 'installation_requirement_v2',
      record: installationRequirement,
      origin: {
        containerSha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        jsonPointer: '/requirements/powerConnection.currentA',
      },
      owner: null,
    },
    semantics,
  });

  assert.equal(result.candidate.kind, 'legacy_installation_candidate');
  assert.equal(result.candidate.disposition, 'candidate_only');
  assert.equal(result.candidate.assertion.status, 'normalized');
  assert.equal(result.candidate.assertion.rawValue, 10);
  assert.deepEqual(result.candidate.assertion.normalizedValue, {
    kind: 'fixed',
    fieldPath: 'powerConnection.currentA',
    value: 10,
    unit: 'A',
    inclusions: {},
    applicability: 'required',
  });
  assert.deepEqual(result.candidate.legacy.record, installationRequirement);
  assert.deepEqual(
    result.unresolved.filter(({ reason }) => reason === 'ENGINEERING_CONTEXT_UNSPECIFIED'),
    [{
      path: '/record/context',
      reason: 'ENGINEERING_CONTEXT_UNSPECIFIED',
      requiredWitnessKind: 'engineering_context_assertion',
    }],
  );
  assert.equal(Object.hasOwn(result.candidate, 'admitted'), false);
  assert.equal(Object.hasOwn(result.candidate, 'accepted'), false);
  assert.equal(Object.hasOwn(result.candidate, 'receipt'), false);
});

test('keeps coercible and unknown installation assertions partial instead of coercing them to values', () => {
  const adapt = (record) => adaptLegacyInstallationCandidate({
    legacyObject: {
      kind: 'installation_requirement_v2',
      record,
      origin: {
        containerSha256: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        jsonPointer: '/requirements/example',
      },
      owner: null,
    },
    semantics,
  });
  const coercible = adapt({
    field: 'powerConnection.currentA',
    value: '10',
    unit: 'A',
    applicability: 'required',
    evidence: null,
    evidenceClass: 'unknown',
  });
  const unknown = adapt({
    field: 'powerConnection.required',
    value: null,
    unit: null,
    applicability: 'unknown',
    evidence: null,
    evidenceClass: 'unknown',
  });

  assert.equal(coercible.candidate.assertion.status, 'partial');
  assert.equal(coercible.candidate.assertion.rawValue, '10');
  assert.equal(coercible.candidate.assertion.normalizedValue, null);
  assert.deepEqual(
    coercible.unresolved.filter(({ reason }) => reason === 'VALUE_NOT_NORMALIZABLE'),
    [{
      path: '/record/value',
      reason: 'VALUE_NOT_NORMALIZABLE',
      requiredWitnessKind: 'valid_semantic_value',
    }],
  );
  assert.equal(unknown.candidate.assertion.status, 'partial');
  assert.equal(unknown.candidate.assertion.rawValue, null);
  assert.equal(unknown.candidate.assertion.normalizedValue, null);
  assert.notEqual(unknown.candidate.assertion.rawValue, 0);
  assert.deepEqual(
    unknown.unresolved.filter(({ reason }) => reason === 'APPLICABILITY_UNKNOWN'),
    [{
      path: '/record/applicability',
      reason: 'APPLICABILITY_UNKNOWN',
      requiredWitnessKind: 'applicability_assertion',
    }],
  );
});

test('normalizes explicit boolean and not-applicable installation branches while retaining legacy receipt identity', () => {
  const adapt = (kind, record) => adaptLegacyInstallationCandidate({
    legacyObject: {
      kind,
      record,
      origin: {
        containerSha256: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        jsonPointer: '/receipts/0',
      },
      owner: null,
    },
    semantics,
  });
  const boolean = adapt('installation_requirement_v2', {
    field: 'powerConnection.required',
    value: false,
    unit: null,
    applicability: 'required',
    evidence: null,
    evidenceClass: 'unknown',
  });
  const legacyReceipt = {
    schemaVersion: 1,
    canonicalProductId: 'fa_prod_62a2b566297e5b6bb2e13304',
    category: 'dishwasher',
    brand: 'Fisher & Paykel',
    model: 'DW60UT4I2',
    formFactor: null,
    field: 'waterConnection.required',
    applicability: 'not_applicable',
    value: null,
    unit: null,
    evidence: { metadataOnly: true },
    receiptId: 'inst_receipt_1dac4f32af8aa2aa83a2b244',
    semanticReceiptSha256: '1dac4f32af8aa2aa83a2b2444d63467a35cb03bec2e9d47e89b8711105d6bbd7',
  };
  const notApplicable = adapt('installation_field_receipt_v1', legacyReceipt);

  assert.deepEqual(boolean.candidate.assertion.normalizedValue, {
    kind: 'boolean',
    fieldPath: 'powerConnection.required',
    value: false,
    unit: null,
    inclusions: {},
    applicability: 'required',
  });
  assert.deepEqual(notApplicable.candidate.assertion.normalizedValue, {
    kind: 'not_applicable',
    fieldPath: 'waterConnection.required',
    value: null,
    unit: null,
    inclusions: {},
    applicability: 'not_applicable',
  });
  assert.equal(notApplicable.candidate.legacy.record.receiptId, legacyReceipt.receiptId);
  assert.equal(Object.hasOwn(notApplicable.candidate, 'receiptId'), false);
  assert.equal(Object.hasOwn(notApplicable.candidate, 'receiptType'), false);
});

test('retains legacy range endpoints when range meaning is absent instead of inventing adjustment', () => {
  const rangeClaim = {
    ...legacyDimensionClaim,
    field: 'closedEnvelope.heightMm',
    value: { kind: 'range', minMm: 850, maxMm: 895 },
    sourceLabel: 'Adjustable height',
    sourceAxisOrder: ['height'],
    sourceUnit: 'mm',
  };
  const result = adaptLegacyGeometryCandidate({
    legacyObject: {
      kind: 'dimension_claim_v2',
      record: rangeClaim,
      origin: {
        containerSha256: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        jsonPointer: '/claims/height',
      },
      owner: null,
    },
    semantics,
  });

  assert.deepEqual(result.candidate.assertion.rawValue, { kind: 'range', minMm: 850, maxMm: 895 });
  assert.equal(result.candidate.assertion.normalizedValue, null);
  assert.deepEqual(
    result.unresolved.filter(({ reason }) => reason === 'RANGE_MEANING_UNSPECIFIED'),
    [{
      path: '/record/rangeMeaning',
      reason: 'RANGE_MEANING_UNSPECIFIED',
      requiredWitnessKind: 'range_meaning_assertion',
    }],
  );
});

test('retains installation range endpoints when range meaning is absent instead of inventing adjustment', () => {
  const result = adaptLegacyInstallationCandidate({
    legacyObject: {
      kind: 'installation_requirement_v2',
      record: {
        field: 'closedEnvelope.heightMm',
        value: { minimumMm: 850, maximumMm: 895 },
        unit: 'mm',
        applicability: 'required',
        evidence: null,
        evidenceClass: 'unknown',
      },
      origin: {
        containerSha256: '1212121212121212121212121212121212121212121212121212121212121212',
        jsonPointer: '/requirements/height',
      },
      owner: null,
    },
    semantics,
  });

  assert.deepEqual(result.candidate.assertion.rawValue, { minimumMm: 850, maximumMm: 895 });
  assert.equal(result.candidate.assertion.normalizedValue, null);
  assert.deepEqual(
    result.unresolved.filter(({ reason }) => reason === 'RANGE_MEANING_UNSPECIFIED'),
    [{
      path: '/record/rangeMeaning',
      reason: 'RANGE_MEANING_UNSPECIFIED',
      requiredWitnessKind: 'range_meaning_assertion',
    }],
  );
  assert.equal(
    result.unresolved.some(({ reason }) => reason === 'VALUE_NOT_NORMALIZABLE'),
    false,
  );
});

test('does not convert canonical legacy mm range endpoints through a conflicting declared unit', () => {
  const adapt = (unit) => adaptLegacyInstallationCandidate({
    legacyObject: {
      kind: 'installation_requirement_v2',
      record: {
        field: 'closedEnvelope.heightMm',
        value: { minimumMm: 850, maximumMm: 895 },
        unit,
        rangeMeaning: 'adjustment',
        applicability: 'required',
        context: {
          configurationKey: 'unconditional',
          conditions: [],
          referenceDatum: 'envelope_extent',
          operatingState: { kind: 'closed', angleDegrees: null },
        },
        evidence: null,
        evidenceClass: 'unknown',
      },
      origin: {
        containerSha256: '1313131313131313131313131313131313131313131313131313131313131313',
        jsonPointer: '/requirements/height',
      },
      owner: null,
    },
    semantics,
  });
  const conflicting = adapt('cm');
  const canonical = adapt('mm');

  assert.equal(conflicting.candidate.assertion.status, 'partial');
  assert.deepEqual(conflicting.candidate.assertion.rawValue, { minimumMm: 850, maximumMm: 895 });
  assert.equal(conflicting.candidate.assertion.normalizedValue, null);
  assert.equal(conflicting.candidate.legacy.record.unit, 'cm');
  assert.deepEqual(conflicting.unresolved, [{
    path: '/record/unit',
    reason: 'RANGE_UNIT_CONFLICT',
    requiredWitnessKind: 'canonical_range_unit_assertion',
  }]);
  assert.deepEqual(canonical.candidate.assertion.normalizedValue, {
    kind: 'range',
    fieldPath: 'closedEnvelope.heightMm',
    minimum: 850,
    maximum: 895,
    unit: 'mm',
    rangeMeaning: 'adjustment',
    inclusions: { door: 'unknown', handle: 'unknown' },
    applicability: 'required',
  });
});

test('blocks unassociated manufacturer owner claims from becoming mapped values', () => {
  const sourceWithWrongBinding = structuredClone(bundleMetadataSource);
  sourceWithWrongBinding.verificationReceipt.bindingSha256 = '2222222222222222222222222222222222222222222222222222222222222222';
  const sourceWithWrongIdentity = structuredClone(bundleMetadataSource);
  sourceWithWrongIdentity.identity.model = 'OTHER-MODEL';
  const sameHashButDifferentSource = {
    ...structuredClone(bundleMetadataSource),
    sourceRole: 'different-observation',
  };
  const cases = [
    {
      source: sourceWithWrongBinding,
      case: { ...structuredClone(bundleMetadataCase), sources: [sourceWithWrongBinding] },
      reason: 'OWNER_RECEIPT_ASSOCIATION_MISMATCH',
    },
    {
      source: sourceWithWrongIdentity,
      case: { ...structuredClone(bundleMetadataCase), sources: [sourceWithWrongIdentity] },
      reason: 'OWNER_IDENTITY_MISMATCH',
    },
    {
      source: sameHashButDifferentSource,
      case: structuredClone(bundleMetadataCase),
      reason: 'OWNER_SOURCE_CASE_MEMBERSHIP_MISMATCH',
    },
  ];

  for (const ownerCase of cases) {
    const result = adaptLegacyGeometryCandidate({
      legacyObject: {
        kind: 'manufacturer_verification_binding',
        record: bundleMetadataBinding,
        origin: {
          containerSha256: 'd947f8bcf15173ceb23fbba98a62459140f8ed9b93bf15c7d5fc5314f6785550',
          jsonPointer: '/entries/0/sources/0/verificationReceipt',
        },
        owner: { case: ownerCase.case, source: ownerCase.source, claimIndex: 0 },
      },
      semantics,
    });

    assert.equal(result.candidate.assertion.rawValue, null);
    assert.equal(
      result.unresolved.some(({ reason }) => reason === ownerCase.reason),
      true,
    );
  }
});

test('retains a direct V2 claim when a supplied owner selection carries a contradictory value', () => {
  const ownerSource = {
    contentSha256: '3333333333333333333333333333333333333333333333333333333333333333',
    identity: { brand: 'Example', model: 'EX598', outcome: 'exact' },
    claims: [{ ...legacyDimensionClaim, value: { kind: 'fixed', mm: 599 } }],
  };
  const result = adaptLegacyGeometryCandidate({
    legacyObject: {
      kind: 'dimension_claim_v2',
      record: legacyDimensionClaim,
      origin: {
        containerSha256: '4444444444444444444444444444444444444444444444444444444444444444',
        jsonPointer: '/sources/0/claims/0',
      },
      owner: {
        case: {
          canonicalProductId: 'fa_prod_example',
          brand: 'Example',
          model: 'EX598',
          category: 'dishwasher',
          lifecycleState: 'CURRENT_RETAIL',
          sources: [ownerSource],
        },
        source: ownerSource,
        claimIndex: 0,
      },
    },
    semantics,
  });

  assert.equal(result.candidate.assertion.rawValue.mm, 598);
  assert.deepEqual(
    result.unresolved.filter(({ reason }) => reason === 'OWNER_CLAIM_MISMATCH'),
    [{
      path: '/owner/source/claims/0',
      reason: 'OWNER_CLAIM_MISMATCH',
      requiredWitnessKind: 'matching_legacy_claim',
    }],
  );
});

test('uses typed validation errors for malformed envelopes and unsafe JSON without coercing pointer or index values', () => {
  const validLegacyObject = {
    kind: 'dimension_claim_v2',
    record: legacyDimensionClaim,
    origin: {
      containerSha256: '5555555555555555555555555555555555555555555555555555555555555555',
      jsonPointer: '/claims/0',
    },
    owner: null,
  };
  const expectValidation = (legacyObject, code) => assert.throws(
    () => adaptLegacyGeometryCandidate({ legacyObject, semantics }),
    (error) => error instanceof LegacySemanticsAdapterValidationError && error.code === code,
  );

  expectValidation({ ...validLegacyObject, unsupportedEnvelopeKey: true }, 'UNKNOWN_ENVELOPE_KEY');
  expectValidation({
    ...validLegacyObject,
    origin: { ...validLegacyObject.origin, jsonPointer: '/claims/~2' },
  }, 'INVALID_ORIGIN_POINTER');
  expectValidation({
    ...validLegacyObject,
    origin: { ...validLegacyObject.origin, jsonPointer: false },
  }, 'INVALID_ORIGIN_POINTER');
  expectValidation({
    ...validLegacyObject,
    owner: { case: null, source: null, claimIndex: false },
  }, 'INVALID_OWNER_CLAIM_INDEX');

  let getterRan = false;
  const unsafeRecord = { ...legacyDimensionClaim };
  Object.defineProperty(unsafeRecord, 'unsafe', {
    enumerable: true,
    get() {
      getterRan = true;
      return 'must not run';
    },
  });
  expectValidation({ ...validLegacyObject, record: unsafeRecord }, 'UNSAFE_JSON');
  assert.equal(getterRan, false);

  const nullPointer = adaptLegacyGeometryCandidate({
    legacyObject: {
      ...validLegacyObject,
      origin: { ...validLegacyObject.origin, jsonPointer: null },
    },
    semantics,
  });
  assert.deepEqual(
    nullPointer.unresolved.filter(({ reason }) => reason === 'ORIGIN_JSON_POINTER_UNRESOLVED'),
    [{
      path: '/origin/jsonPointer',
      reason: 'ORIGIN_JSON_POINTER_UNRESOLVED',
      requiredWitnessKind: 'json_pointer',
    }],
  );
});

test('keeps unsupported contracts, fields, and opaque legacy keys as retained gaps without cross-kind escalation', () => {
  const crossKind = adaptLegacyInstallationCandidate({
    legacyObject: {
      kind: 'dimension_claim_v2',
      record: { ...legacyDimensionClaim, applicability: 'required' },
      origin: {
        containerSha256: '6666666666666666666666666666666666666666666666666666666666666666',
        jsonPointer: '/claims/0',
      },
      owner: null,
    },
    semantics,
  });
  const unsupportedContract = adaptLegacyGeometryCandidate({
    legacyObject: {
      kind: 'unclassified_legacy_v9',
      record: { schemaVersion: 9, legacyId: 'old-9', opaque: { preserve: true } },
      origin: {
        containerSha256: '7777777777777777777777777777777777777777777777777777777777777777',
        jsonPointer: '',
      },
      owner: null,
    },
    semantics,
  });
  const unsupportedField = adaptLegacyGeometryCandidate({
    legacyObject: {
      kind: 'dimension_claim_v2',
      record: {
        ...legacyDimensionClaim,
        field: 'legacy.unknownDimension',
        applicability: 'required',
        opaque: { sourceRow: 'kept' },
      },
      origin: {
        containerSha256: '8888888888888888888888888888888888888888888888888888888888888888',
        jsonPointer: '/claims/unknown',
      },
      owner: null,
    },
    semantics,
  });

  for (const result of [crossKind, unsupportedContract]) {
    assert.equal(result.candidate.kind, 'unsupported_legacy_candidate');
    assert.equal(result.candidate.assertion.normalizedValue, null);
    assert.equal(
      result.unresolved.some(({ reason }) => reason === 'UNSUPPORTED_CONTRACT'),
      true,
    );
  }
  assert.deepEqual(crossKind.candidate.legacy.record.value, { kind: 'fixed', mm: 598 });
  assert.deepEqual(unsupportedContract.candidate.legacy.record, {
    schemaVersion: 9,
    legacyId: 'old-9',
    opaque: { preserve: true },
  });
  assert.deepEqual(
    unsupportedContract.losses,
    [{
      path: '/record',
      reason: 'UNSUPPORTED_CONTRACT_RECORD_RETAINED',
      retained: true,
    }],
  );
  assert.equal(unsupportedField.candidate.kind, 'legacy_geometry_candidate');
  assert.equal(unsupportedField.candidate.assertion.normalizedValue, null);
  assert.deepEqual(unsupportedField.candidate.legacy.record.opaque, { sourceRow: 'kept' });
  assert.deepEqual(
    unsupportedField.unresolved.filter(({ reason }) => reason === 'UNSUPPORTED_FIELD'),
    [{
      path: '/record/field',
      reason: 'UNSUPPORTED_FIELD',
      requiredWitnessKind: 'semantic_field_mapping',
    }],
  );
  assert.deepEqual(
    unsupportedField.losses,
    [{
      path: '/record/opaque',
      reason: 'UNMAPPED_LEGACY_KEY',
      retained: true,
    }],
  );
});

test('anchors compact manufacturer gaps and losses at the selected owner claim rather than the compact receipt', () => {
  const selectedClaim = { ...bundleMetadataClaim, opaque: { retained: true } };
  const source = {
    ...structuredClone(bundleMetadataSource),
    claims: [{ ...bundleMetadataClaim, value: { kind: 'fixed', mm: 700 } }, selectedClaim],
  };
  const result = adaptLegacyGeometryCandidate({
    legacyObject: {
      kind: 'manufacturer_verification_binding',
      record: bundleMetadataBinding,
      origin: {
        containerSha256: 'd947f8bcf15173ceb23fbba98a62459140f8ed9b93bf15c7d5fc5314f6785550',
        jsonPointer: '/entries/0/sources/0/verificationReceipt',
      },
      owner: {
        case: { ...structuredClone(bundleMetadataCase), sources: [source] },
        source,
        claimIndex: 1,
      },
    },
    semantics,
  });

  assert.equal(result.candidate.assertion.rawValue.mm, 701);
  assert.deepEqual(
    result.unresolved.filter(({ reason }) => reason === 'APPLICABILITY_UNSPECIFIED'
      || reason === 'ENGINEERING_CONTEXT_UNSPECIFIED' || reason === 'INCLUSION_UNKNOWN'),
    [
      {
        path: '/owner/source/claims/1/applicability',
        reason: 'APPLICABILITY_UNSPECIFIED',
        requiredWitnessKind: 'applicability_assertion',
      },
      {
        path: '/owner/source/claims/1/context',
        reason: 'ENGINEERING_CONTEXT_UNSPECIFIED',
        requiredWitnessKind: 'engineering_context_assertion',
      },
      {
        path: '/owner/source/claims/1/includesDoor',
        reason: 'INCLUSION_UNKNOWN',
        requiredWitnessKind: 'inclusion_assertion',
      },
      {
        path: '/owner/source/claims/1/includesHandle',
        reason: 'INCLUSION_UNKNOWN',
        requiredWitnessKind: 'inclusion_assertion',
      },
    ],
  );
  assert.deepEqual(result.losses, [{
    path: '/owner/source/claims/1/opaque',
    reason: 'UNMAPPED_LEGACY_KEY',
    retained: true,
  }]);

  const sourceWithoutCompactBinding = structuredClone(source);
  delete sourceWithoutCompactBinding.verificationReceipt;
  const unresolved = adaptLegacyGeometryCandidate({
    legacyObject: {
      kind: 'manufacturer_verification_binding',
      record: bundleMetadataBinding,
      origin: {
        containerSha256: 'd947f8bcf15173ceb23fbba98a62459140f8ed9b93bf15c7d5fc5314f6785550',
        jsonPointer: '/entries/0/sources/0/verificationReceipt',
      },
      owner: {
        case: { ...structuredClone(bundleMetadataCase), sources: [sourceWithoutCompactBinding] },
        source: sourceWithoutCompactBinding,
        claimIndex: 1,
      },
    },
    semantics,
  });
  assert.equal(unresolved.candidate.assertion.rawValue, null);
  assert.equal(
    unresolved.unresolved.some(({ reason }) => reason === 'OWNER_RECEIPT_ASSOCIATION_UNRESOLVED'),
    true,
  );
});

test('keeps partial EngineeringContext and non-external measurement scopes as explicit semantic gaps', () => {
  const adapt = (record) => adaptLegacyGeometryCandidate({
    legacyObject: {
      kind: 'dimension_claim_v2',
      record,
      origin: {
        containerSha256: '9999999999999999999999999999999999999999999999999999999999999999',
        jsonPointer: '/claims/0',
      },
      owner: null,
    },
    semantics,
  });
  const contextMissingFacets = adapt({
    ...legacyDimensionClaim,
    applicability: 'required',
    includesDoor: false,
    includesHandle: false,
    context: {},
  });
  const missingScope = adapt({
    ...legacyDimensionClaim,
    applicability: 'required',
    includesDoor: false,
    includesHandle: false,
    context: {},
    measurementScope: null,
  });
  const mismatchedScope = adapt({
    ...legacyDimensionClaim,
    applicability: 'required',
    includesDoor: false,
    includesHandle: false,
    context: {},
    measurementScope: 'product_body',
  });

  assert.equal(contextMissingFacets.candidate.assertion.normalizedValue, null);
  assert.deepEqual(
    contextMissingFacets.unresolved.filter(({ reason }) => reason.startsWith('CONTEXT_')),
    [
      {
        path: '/record/context/configurationKey',
        reason: 'CONTEXT_CONFIGURATION_KEY_UNSPECIFIED',
        requiredWitnessKind: 'engineering_context_configuration',
      },
      {
        path: '/record/context/referenceDatum',
        reason: 'CONTEXT_REFERENCE_DATUM_UNSPECIFIED',
        requiredWitnessKind: 'engineering_context_reference_datum',
      },
      {
        path: '/record/context/operatingState',
        reason: 'CONTEXT_OPERATING_STATE_UNSPECIFIED',
        requiredWitnessKind: 'engineering_context_operating_state',
      },
    ],
  );
  assert.deepEqual(
    missingScope.unresolved.filter(({ reason }) => reason.startsWith('MEASUREMENT_SCOPE_')),
    [{
      path: '/record/measurementScope',
      reason: 'MEASUREMENT_SCOPE_UNSPECIFIED',
      requiredWitnessKind: 'measurement_scope_assertion',
    }],
  );
  assert.deepEqual(
    mismatchedScope.unresolved.filter(({ reason }) => reason.startsWith('MEASUREMENT_SCOPE_')),
    [{
      path: '/record/measurementScope',
      reason: 'MEASUREMENT_SCOPE_MISMATCH',
      requiredWitnessKind: 'compatible_measurement_scope_transform',
    }],
  );
});

test('uses G1a closed-context policy validation without replaying product or source witnesses', () => {
  const adapt = (context) => adaptLegacyGeometryCandidate({
    legacyObject: {
      kind: 'dimension_claim_v2',
      record: {
        ...legacyDimensionClaim,
        applicability: 'required',
        includesDoor: false,
        includesHandle: false,
        context,
      },
      origin: {
        containerSha256: 'cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd',
        jsonPointer: '/claims/2',
      },
      owner: null,
    },
    semantics,
  });
  const unsupportedConfiguration = adapt({
    configurationKey: 'bogus',
    conditions: [],
    referenceDatum: 'envelope_extent',
    operatingState: { kind: 'closed', angleDegrees: null },
  });
  const forbiddenClosedAngle = adapt({
    configurationKey: 'unconditional',
    conditions: [],
    referenceDatum: 'envelope_extent',
    operatingState: { kind: 'closed', angleDegrees: 10 },
  });
  const contradictoryConditions = adapt({
    configurationKey: 'underbench_worktop_removed',
    conditions: [
      { parameter: 'installationMode', operator: 'eq', value: 'underbench' },
      { parameter: 'installationMode', operator: 'eq', value: 'integrated' },
      { parameter: 'worktop', operator: 'eq', value: 'removed' },
    ],
    referenceDatum: 'envelope_extent',
    operatingState: { kind: 'closed', angleDegrees: null },
  });

  for (const result of [unsupportedConfiguration, forbiddenClosedAngle, contradictoryConditions]) {
    assert.equal(result.candidate.assertion.normalizedValue, null);
  }
  assert.deepEqual(
    unsupportedConfiguration.unresolved.filter(({ reason }) => reason === 'CONTEXT_CONFIGURATION_KEY_INVALID'),
    [{
      path: '/record/context',
      reason: 'CONTEXT_CONFIGURATION_KEY_INVALID',
      requiredWitnessKind: 'engineering_context_assertion',
    }],
  );
  assert.deepEqual(
    forbiddenClosedAngle.unresolved.filter(({ reason }) => reason === 'CONTEXT_OPERATING_ANGLE_INVALID'),
    [{
      path: '/record/context',
      reason: 'CONTEXT_OPERATING_ANGLE_INVALID',
      requiredWitnessKind: 'engineering_context_assertion',
    }],
  );
  assert.deepEqual(
    contradictoryConditions.unresolved.filter(({ reason }) => reason === 'CONTEXT_CONTRADICTORY_CONDITIONS_INVALID'),
    [{
      path: '/record/context',
      reason: 'CONTEXT_CONTRADICTORY_CONDITIONS_INVALID',
      requiredWitnessKind: 'engineering_context_assertion',
    }],
  );
});

test('does not treat absent or empty case and source identity labels as a match', () => {
  const source = {
    ...structuredClone(bundleMetadataSource),
    identity: { brand: '', model: '', outcome: 'exact' },
  };
  const result = adaptLegacyGeometryCandidate({
    legacyObject: {
      kind: 'manufacturer_verification_binding',
      record: bundleMetadataBinding,
      origin: {
        containerSha256: 'd947f8bcf15173ceb23fbba98a62459140f8ed9b93bf15c7d5fc5314f6785550',
        jsonPointer: '/entries/0/sources/0/verificationReceipt',
      },
      owner: {
        case: { ...structuredClone(bundleMetadataCase), brand: '', model: '', sources: [source] },
        source,
        claimIndex: 0,
      },
    },
    semantics,
  });

  assert.equal(result.candidate.assertion.rawValue, null);
  assert.equal(
    result.unresolved.some(({ reason }) => reason === 'OWNER_IDENTITY_MISMATCH'),
    true,
  );
});

test('normalizes fully faceted V2 geometry as canonical millimetres without re-converting its cm source label', () => {
  const result = adaptLegacyGeometryCandidate({
    legacyObject: {
      kind: 'dimension_claim_v2',
      record: {
        ...legacyDimensionClaim,
        applicability: 'required',
        includesDoor: false,
        includesHandle: false,
        context: {
          configurationKey: 'unconditional',
          conditions: [],
          referenceDatum: 'envelope_extent',
          operatingState: { kind: 'closed', angleDegrees: null },
        },
      },
      origin: {
        containerSha256: 'abababababababababababababababababababababababababababababababab',
        jsonPointer: '/claims/1',
      },
      owner: null,
    },
    semantics,
  });

  assert.equal(result.candidate.assertion.status, 'normalized');
  assert.equal(result.candidate.assertion.rawValue.mm, 598);
  assert.equal(result.candidate.assertion.sourceRepresentation.sourceUnit, 'cm');
  assert.deepEqual(result.candidate.assertion.normalizedValue, {
    kind: 'fixed',
    fieldPath: 'closedEnvelope.widthMm',
    value: 598,
    unit: 'mm',
    inclusions: { door: 'excluded', handle: 'excluded' },
    applicability: 'required',
  });
  assert.deepEqual(result.unresolved, []);
});

test('keeps a null stored V2 fixed millimetre value partial with an explicit supplementation gap', () => {
  const result = adaptLegacyGeometryCandidate({
    legacyObject: {
      kind: 'dimension_claim_v2',
      record: {
        ...legacyDimensionClaim,
        value: { kind: 'fixed', mm: null },
        applicability: 'required',
        includesDoor: false,
        includesHandle: false,
        context: {
          configurationKey: 'unconditional',
          conditions: [],
          referenceDatum: 'envelope_extent',
          operatingState: { kind: 'closed', angleDegrees: null },
        },
      },
      origin: {
        containerSha256: 'dededededededededededededededededededededededededededededededede',
        jsonPointer: '/claims/3',
      },
      owner: null,
    },
    semantics,
  });

  assert.equal(result.candidate.assertion.status, 'partial');
  assert.equal(result.candidate.assertion.rawValue.mm, null);
  assert.equal(result.candidate.assertion.normalizedValue, null);
  assert.deepEqual(result.unresolved, [{
    path: '/record/value/mm',
    reason: 'VALUE_NOT_NORMALIZABLE',
    requiredWitnessKind: 'valid_semantic_value',
  }]);
});
