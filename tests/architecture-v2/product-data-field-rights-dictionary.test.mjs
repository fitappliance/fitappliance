import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dictionaryPath = 'data/architecture-v2/policies/product-data-field-rights-dictionary.json';

const requiredFieldIds = Object.freeze([
  'identity.category',
  'identity.brand',
  'identity.model',
  'identity.market',
  'identity.variantSuffix',
  'identity.gtin',
  'lifecycle.marketStatus',
  'lifecycle.replacementModel',
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
  'packagedEnvelope.widthMm',
  'packagedEnvelope.heightMm',
  'packagedEnvelope.depthMm',
  'adjustableRange.widthMm',
  'adjustableRange.heightMm',
  'adjustableRange.depthMm',
  'installationClearance.leftMm',
  'installationClearance.rightMm',
  'installationClearance.topMm',
  'installationClearance.rearMm',
  'installationClearance.frontMm',
  'operationEnvelope.widthMm',
  'operationEnvelope.heightMm',
  'operationEnvelope.depthMm',
  'ventilation.openAreaMm2',
  'waterConnection.zone',
  'powerConnection.zone',
  'drainConnection.zone',
  'documents.productPageUrl',
  'documents.manualUrl',
  'documents.installationGuideUrl',
  'documents.qrgUrl',
  'documents.cadUrl',
  'documents.revisionDate',
  'documents.withdrawalState',
]);

const requiredRightIds = Object.freeze([
  'cache_source',
  'cache_normalized_fields',
  'public_display',
  'quote_excerpt',
  'link_documents',
  'attribution',
  'retain_audit_copy',
  'delete_or_withdraw',
]);

async function loadDictionary() {
  return JSON.parse(await readFile(dictionaryPath, 'utf8'));
}

test('product data dictionary covers every required identity, geometry, connection, and document field', async () => {
  const dictionary = await loadDictionary();
  const ids = dictionary.fields.map((field) => field.id);

  assert.equal(dictionary.schemaVersion, 1);
  assert.equal(new Set(ids).size, ids.length, 'field ids must be unique');
  for (const id of requiredFieldIds) assert.ok(ids.includes(id), `missing field ${id}`);
});

test('every geometry field declares axis, unit, value semantics, scope, Fit role, and unknown behavior', async () => {
  const dictionary = await loadDictionary();
  const geometry = dictionary.fields.filter((field) => field.kind === 'geometry');

  assert.ok(geometry.length >= 17);
  for (const field of geometry) {
    assert.ok(['width', 'height', 'depth', 'area'].includes(field.axis), `${field.id} has invalid axis`);
    assert.ok(['mm', 'mm2'].includes(field.unit), `${field.id} has invalid unit`);
    assert.ok(['scalar', 'range'].includes(field.valueShape), `${field.id} has invalid value shape`);
    assert.ok(field.scope, `${field.id} needs an explicit scope`);
    assert.ok(['hard_space', 'conditional_service', 'informational'].includes(field.fitRole), `${field.id} needs a Fit role`);
    assert.equal(field.unknownPolicy, 'preserve_unknown');
    assert.ok(Array.isArray(field.requiredEvidence) && field.requiredEvidence.length > 0);
  }
});

test('rights are field-level, source-bound, and blocked until explicitly confirmed', async () => {
  const dictionary = await loadDictionary();
  const rightIds = dictionary.rights.actions.map((right) => right.id);

  assert.equal(dictionary.rights.defaultDecision, 'unknown_blocked');
  assert.equal(new Set(rightIds).size, rightIds.length, 'right ids must be unique');
  for (const id of requiredRightIds) assert.ok(rightIds.includes(id), `missing right ${id}`);
  assert.deepEqual(dictionary.rights.decisionStates, [
    'unknown',
    'granted',
    'granted_with_conditions',
    'denied',
    'withdrawn',
    'expired',
  ]);
  assert.deepEqual(dictionary.rights.bindingKeys, ['providerId', 'sourceId', 'fieldId', 'actionId']);
});

test('evidence contract prevents family, suffix, scope, and axis ambiguity from becoming exact facts', async () => {
  const dictionary = await loadDictionary();

  assert.deepEqual(dictionary.evidence.requiredProvenance, [
    'sourceUrl',
    'contentSha256',
    'retrievedAt',
    'applicableModels',
    'identityOutcome',
    'scope',
    'originalValue',
    'originalUnit',
  ]);
  assert.equal(dictionary.evidence.familyManualPolicy, 'quarantine_until_exact_membership');
  assert.equal(dictionary.evidence.variantSuffixPolicy, 'exact_or_receipt_bound_alias_only');
  assert.equal(dictionary.evidence.axisPolicy, 'explicit_or_unambiguous_labeled_table_only');
  assert.equal(dictionary.evidence.scopePolicy, 'never_mix_product_package_cavity_or_operation');
});
