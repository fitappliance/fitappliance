import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateFitV4FieldMap } from '../../src/domain/fit-v4-contract.mjs';
import {
  adaptV3Receipt,
  appendFitV4ReceiptBundle,
  assertFitV4ReceiptUsable,
  createFitV4Receipt,
  createFitV4ReceiptBundle,
  replayFitV4Receipt,
  restoreV3ReceiptBytes,
  validateFitV4NormalizedValue,
  validateFitV4Receipt,
  validateFitV4ReceiptLifecycleTransitions,
} from '../../src/domain/installation-evidence-receipt-v4.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const semanticHash = (value) => sha256(JSON.stringify(canonical(value)));
const SOURCE_BYTES = Buffer.from('%PDF-X100-binary%');
const CONTENT_BYTES = Buffer.from('MODEL X100\nClosed width 600 mm\n');
const FRAGMENT_BYTES = Buffer.from('Closed width 600 mm');
const IDENTITY_BYTES = Buffer.from('MODEL X100');
const RIGHTS_EVIDENCE_BYTES = Buffer.from('Example provider rights grant 2026-08-01');
const RIGHTS_EVIDENCE_SHA256 = sha256(RIGHTS_EVIDENCE_BYTES);
const FIELD_MAP = validateFitV4FieldMap(JSON.parse(await readFile(
  new URL('../../data/architecture-v2/policies/fit-v4-field-map.json', import.meta.url), 'utf8',
)));
const TRACKED_V3_BUNDLE = JSON.parse(await readFile(
  new URL('../../data/architecture-v2/reviews/automated/installation-evidence-receipts.json', import.meta.url), 'utf8',
));
const TRACKED_V3 = TRACKED_V3_BUNDLE.receipts.find((receipt) => receipt.field === 'closedEnvelope.widthMm');

function identity(model = 'X100', canonicalProductId = 'product-x100') {
  const binding = {
    schemaVersion: 1,
    bindingId: `exact-${canonicalProductId}`,
    canonicalProductId, category: 'refrigerator', brand: 'Example', model, market: 'AU',
    outcome: 'exact',
    fragmentSha256: sha256(IDENTITY_BYTES),
  };
  return {
    canonicalProductId, category: 'refrigerator', brand: 'Example', model,
    market: 'AU', identityMapSha256: '1'.repeat(64), applicableModels: [model],
    exactBinding: { ...binding, bindingSha256: semanticHash(binding) },
  };
}

function rights(overrides = {}) {
  return {
    decisions: ['cache_source', 'cache_normalized_fields', 'retain_audit_copy'].map((actionId) => ({
      providerId: 'example-manufacturer', sourceId: 'x100-install-guide-rev-a',
      fieldId: 'closedEnvelope.widthMm', actionId, decision: 'granted', conditions: [],
      evidenceSha256: RIGHTS_EVIDENCE_SHA256,
    })),
    ...overrides,
  };
}

function receiptInput(overrides = {}) {
  return {
    identity: identity(),
    fieldId: 'envelope.closed.width',
    applicability: { state: 'required', predicate: null },
    original: { value: 600, unit: 'mm' },
    normalized: { value: 600, unit: 'mm', relation: 'MIN_REQUIRED', endpoints: { boundary: 'closed' } },
    source: {
      providerId: 'example-manufacturer', sourceId: 'x100-install-guide-rev-a',
      url: 'https://example.invalid/x100-install.pdf', bytesSha256: sha256(SOURCE_BYTES),
      contentSha256: sha256(CONTENT_BYTES), fragmentSha256: sha256(FRAGMENT_BYTES),
      fragmentText: FRAGMENT_BYTES.toString(),
      locator: { kind: 'pdf_bbox', page: 2, bbox: [10, 20, 30, 40] },
      authority: { sourceType: 'manufacturer_installation_guide', organization: 'Example' },
      jurisdiction: 'AU', language: 'en-AU', documentRevision: 'REV-A',
      observedAt: '2026-08-01T00:00:00.000Z', retrievedAt: '2026-08-02T00:00:00.000Z',
    },
    versions: { parser: 'mineru-v2', policy: 'fit-policy-v4.0.0', fieldMap: FIELD_MAP.version },
    rights: rights(),
    lifecycle: { status: 'active', transition: 'assertion', targetReceiptId: null, reason: null, changedAt: null },
    ...overrides,
  };
}

test('V4 receipt round-trip and replay validate receipt, bundle and immutable source bindings first', () => {
  const first = createFitV4Receipt(receiptInput(), { fieldMap: FIELD_MAP });
  const bundle = createFitV4ReceiptBundle([first], { fieldMap: FIELD_MAP });
  assert.deepEqual(createFitV4Receipt(receiptInput(), { fieldMap: FIELD_MAP }), first);
  assert.deepEqual(validateFitV4Receipt(JSON.parse(JSON.stringify(first)), { fieldMap: FIELD_MAP }), first);
  const context = {
    fieldMap: FIELD_MAP, bundle, sourceBytes: SOURCE_BYTES, contentBytes: CONTENT_BYTES,
    fragmentBytes: FRAGMENT_BYTES, identityFragmentBytes: IDENTITY_BYTES,
    rightsEvidenceBytes: { [RIGHTS_EVIDENCE_SHA256]: RIGHTS_EVIDENCE_BYTES },
  };
  assert.deepEqual(replayFitV4Receipt(first, context), replayFitV4Receipt(first, context));
  assert.equal(replayFitV4Receipt(first, context).status, 'PASS');

  const tampered = { ...first, normalized: { ...first.normalized, value: 601 } };
  assert.throws(() => replayFitV4Receipt(tampered, context), /receipt.*binding|hash/i);
  assert.throws(() => replayFitV4Receipt(first, { ...context, bundle: { ...bundle, bundleSha256: 'f'.repeat(64) } }), /bundle.*hash/i);
  assert.throws(() => replayFitV4Receipt(first, { ...context, rightsEvidenceBytes: {} }), /rights evidence/i);
  assert.throws(() => replayFitV4Receipt(first, {
    ...context, rightsEvidenceBytes: { [RIGHTS_EVIDENCE_SHA256]: Buffer.from('different') },
  }), /rights evidence/i);
});

test('rights decisions exactly bind provider, source, dictionary field, action and immutable evidence', () => {
  const base = receiptInput();
  const mutateDecision = (index, change) => ({
    decisions: base.rights.decisions.map((decision, current) => current === index ? { ...decision, ...change } : decision),
  });
  for (const invalid of [
    { decisions: base.rights.decisions.slice(1) },
    { decisions: [...base.rights.decisions, base.rights.decisions[0]] },
    { decisions: [...base.rights.decisions, { ...base.rights.decisions[0], actionId: 'public_display' }] },
    mutateDecision(0, { providerId: 'other-provider' }),
    mutateDecision(0, { sourceId: 'other-source' }),
    mutateDecision(0, { fieldId: 'closedEnvelope.heightMm' }),
    mutateDecision(0, { actionId: 'not_a_dictionary_action' }),
    mutateDecision(0, { decision: 'unknown' }),
    mutateDecision(0, { decision: 'granted', conditions: ['not allowed'] }),
    mutateDecision(0, { decision: 'granted_with_conditions', conditions: [] }),
  ]) {
    assert.throws(() => createFitV4Receipt(receiptInput({ rights: invalid }), { fieldMap: FIELD_MAP }), /rights|decision|action|condition|evidence/i);
  }
  assert.doesNotThrow(() => createFitV4Receipt(receiptInput({
    rights: mutateDecision(0, { decision: 'granted_with_conditions', conditions: ['retain internally'] }),
  }), { fieldMap: FIELD_MAP }));
  for (const [key, value] of [['providerId', '../provider'], ['sourceId', 'constructor']]) {
    assert.throws(() => createFitV4Receipt(receiptInput({
      source: { ...base.source, [key]: value },
    }), { fieldMap: FIELD_MAP }), /provider|source|safe ID/i);
  }
});

test('receipt-bound arbitrary data must be canonical plain JSON and receipt schema is exact', () => {
  const invalid = [
    (input) => { input.applicability.predicate = { value: undefined }; },
    (input) => { input.applicability.predicate = () => true; },
    (input) => { input.identity.extra = Symbol('identity'); },
    (input) => { input.original.extra = 1n; },
    (input) => { input.source.locator.extra = new Date(); },
    (input) => { input.versions.extra = Number.POSITIVE_INFINITY; },
    (input) => { const values = []; values[1] = 'hole'; input.applicability.predicate = values; },
  ];
  for (const mutate of invalid) {
    const input = receiptInput();
    mutate(input);
    assert.throws(() => createFitV4Receipt(input, { fieldMap: FIELD_MAP }), /canonical JSON|plain|finite|array hole/i);
  }
  const receipt = createFitV4Receipt(receiptInput(), { fieldMap: FIELD_MAP });
  assert.throws(() => validateFitV4Receipt({ ...receipt, extra: true }, { fieldMap: FIELD_MAP }), /key set|schema/i);
  const missing = { ...receipt };
  delete missing.lifecycle;
  assert.throws(() => validateFitV4Receipt(missing, { fieldMap: FIELD_MAP }), /key set|schema/i);
});

test('normalized values fail closed for every declared value family and endpoint/unit semantics', () => {
  const invalid = [
    ['envelope.closed.width', { value: Number.NaN, unit: 'mm', relation: 'MIN_REQUIRED', endpoints: { boundary: 'closed' } }],
    ['envelope.closed.width', { value: Number.POSITIVE_INFINITY, unit: 'mm', relation: 'MIN_REQUIRED', endpoints: { boundary: 'closed' } }],
    ['water.connection.type', { value: 3, unit: null, relation: 'EXACT_MATCH', endpoints: null }],
    ['water.isolation.accessRequired', { value: 'true', unit: null, relation: 'REQUIRES_TRUE', endpoints: null }],
    ['dryer.duct.maximumElbows', { value: 1.5, unit: null, relation: 'MAX_ALLOWED', endpoints: { boundary: 'closed' } }],
    ['power.socket.permittedZone', { value: { min: [0, 0, 0], max: [1, Infinity, 1] }, unit: 'mm', relation: 'REQUIRED_CONTAINS', endpoints: null }],
    ['power.socket.permittedZone', { value: { min: [2, 0, 0], max: [1, 1, 1] }, unit: 'mm', relation: 'REQUIRED_CONTAINS', endpoints: null }],
    ['drain.route.permittedZone', { value: { min: [0, 0, 0], max: [1, 1] }, unit: 'mm', relation: 'REQUIRED_CONTAINS', endpoints: null }],
    ['drain.route.permittedZone', { value: { min: [0, 0, 0], max: [1, NaN, 1] }, unit: 'mm', relation: 'REQUIRED_CONTAINS', endpoints: null }],
    ['delivery.turningEnvelope', { value: { path: [[0, 0, 0]], envelope: {} }, unit: 'mm', relation: 'CONTAINS', endpoints: null }],
  ];
  for (const [fieldId, normalized] of invalid) {
    assert.throws(() => validateFitV4NormalizedValue(FIELD_MAP, fieldId, normalized, { state: 'required' }), /value|finite|integer|route|sweep|box|enum|boolean/i, fieldId);
  }
  assert.throws(() => validateFitV4NormalizedValue(FIELD_MAP, 'envelope.closed.width', {
    value: 600, unit: 'cm', relation: 'MIN_REQUIRED', endpoints: { boundary: 'closed' },
  }, { state: 'required' }), /unit/i);
  assert.throws(() => validateFitV4NormalizedValue(FIELD_MAP, 'installation.clearance.leftMin', {
    value: 10, unit: 'mm', relation: 'MIN_REQUIRED', endpoints: null,
  }, { state: 'required' }), /endpoint/i);
});

test('not-applicable evidence is explicit and does not coerce null into a numeric claim', () => {
  const fragment = Buffer.from('Closed width is not applicable');
  const input = receiptInput({
    applicability: { state: 'not_applicable', predicate: null },
    original: { value: null, unit: null },
    normalized: { value: null, unit: null, relation: null, endpoints: null },
    source: { ...receiptInput().source, fragmentSha256: sha256(fragment), fragmentText: fragment.toString() },
  });
  const receipt = createFitV4Receipt(input, { fieldMap: FIELD_MAP });
  assert.equal(receipt.normalized.value, null);
  assert.equal(receipt.applicability.state, 'not_applicable');
  const nonNegativeFragment = 'Closed width 0 mm';
  assert.throws(() => createFitV4Receipt({
    ...input, source: { ...input.source, fragmentText: nonNegativeFragment, fragmentSha256: sha256(nonNegativeFragment) },
  }, { fieldMap: FIELD_MAP }), /negative|not.applicable/i);
});

test('identity, authority and rights fail closed without exact receipt-bound model evidence', () => {
  const badBinding = receiptInput();
  badBinding.identity.exactBinding.bindingSha256 = 'f'.repeat(64);
  assert.throws(() => createFitV4Receipt(badBinding, { fieldMap: FIELD_MAP }), /identity.*binding/i);
  assert.throws(() => createFitV4Receipt(receiptInput({
    identity: { ...identity(), applicableModels: ['X100', 'X101'] },
  }), { fieldMap: FIELD_MAP }), /exact model|cross-model/i);
  assert.throws(() => createFitV4Receipt(receiptInput({
    identity: { ...identity(), market: 'NZ' },
  }), { fieldMap: FIELD_MAP }), /AU|market|identity/i);
  for (const key of ['category', 'brand', 'model', 'market']) {
    const changed = identity();
    changed.exactBinding[key] = `${changed.exactBinding[key]}-drift`;
    const { bindingSha256: ignored, ...payload } = changed.exactBinding;
    changed.exactBinding.bindingSha256 = semanticHash(payload);
    assert.throws(() => createFitV4Receipt(receiptInput({ identity: changed }), { fieldMap: FIELD_MAP }), /identity.*binding/i);
  }
  for (const sourceType of ['retailer_page', 'public_regulator_guidance', 'licensed_standard']) {
    assert.throws(() => createFitV4Receipt(receiptInput({
      source: { ...receiptInput().source, authority: { sourceType, organization: 'Other' } },
    }), { fieldMap: FIELD_MAP }), /model authority|authority/i);
  }
});

test('UNMAPPED_BLOCKED fields cannot create receipts until the rights dictionary gains an exact entry', () => {
  for (const fieldId of [
    'envelope.body.width', 'delivery.package.weight', 'cabinet.support.minimumLoad',
    'dryer.duct.maximumLength', 'ventilation.roomVolume.minimum', 'water.connection.type',
    'water.route.permittedZone', 'power.socket.permittedZone', 'drain.route.permittedZone',
  ]) {
    assert.throws(() => createFitV4Receipt(receiptInput({
      fieldId,
      rights: { decisions: [] },
    }), { fieldMap: FIELD_MAP }), /UNMAPPED_BLOCKED|rights dictionary entry/i, fieldId);
  }
});

test('supersession and withdrawal target one prior claim and reject forks, ambiguity and cycles', () => {
  const first = createFitV4Receipt(receiptInput(), { fieldMap: FIELD_MAP });
  const supersessionFragment = 'Closed width 600 mm revision B';
  const superseding = createFitV4Receipt(receiptInput({
    source: { ...receiptInput().source, documentRevision: 'REV-B', fragmentText: supersessionFragment, fragmentSha256: sha256(supersessionFragment), locator: { kind: 'pdf_bbox', page: 3, bbox: [1, 2, 3, 4] } },
    lifecycle: { status: 'active', transition: 'supersession', targetReceiptId: first.receiptId, reason: 'new revision', changedAt: '2026-08-03T00:00:00.000Z' },
  }), { fieldMap: FIELD_MAP });
  const superseded = appendFitV4ReceiptBundle(createFitV4ReceiptBundle([first], { fieldMap: FIELD_MAP }), [superseding], { fieldMap: FIELD_MAP });
  assert.throws(() => assertFitV4ReceiptUsable(first, { bundle: superseded, fieldMap: FIELD_MAP }), /superseded/i);
  assert.doesNotThrow(() => assertFitV4ReceiptUsable(superseding, { bundle: superseded, fieldMap: FIELD_MAP }));

  const withdrawalFragment = 'Manufacturer withdrew closed width claim';
  const withdrawal = createFitV4Receipt(receiptInput({
    source: { ...receiptInput().source, documentRevision: 'WITHDRAWAL-1', fragmentText: withdrawalFragment, fragmentSha256: sha256(withdrawalFragment), locator: { kind: 'html_selector', selector: '#withdrawal' } },
    lifecycle: { status: 'withdrawal', transition: 'withdrawal', targetReceiptId: first.receiptId, reason: 'manufacturer withdrew claim', changedAt: '2026-08-04T00:00:00.000Z' },
  }), { fieldMap: FIELD_MAP });
  const withdrawn = appendFitV4ReceiptBundle(createFitV4ReceiptBundle([first], { fieldMap: FIELD_MAP }), [withdrawal], { fieldMap: FIELD_MAP });
  assert.throws(() => assertFitV4ReceiptUsable(first, { bundle: withdrawn, fieldMap: FIELD_MAP }), /withdrawn/i);
  assert.throws(() => assertFitV4ReceiptUsable(withdrawal, { bundle: withdrawn, fieldMap: FIELD_MAP }), /withdrawal/i);

  assert.throws(() => createFitV4Receipt(receiptInput({
    lifecycle: { status: 'withdrawal', transition: 'withdrawal', targetReceiptId: null, reason: 'standalone', changedAt: '2026-08-04T00:00:00.000Z' },
  }), { fieldMap: FIELD_MAP }), /target/i);
  assert.throws(() => validateFitV4ReceiptLifecycleTransitions([
    { receiptId: 'a', claimKey: 'p\0f', transition: 'supersession', targetReceiptId: 'b' },
    { receiptId: 'b', claimKey: 'p\0f', transition: 'supersession', targetReceiptId: 'a' },
  ]), /cycle/i);
  assert.throws(() => validateFitV4ReceiptLifecycleTransitions([
    { receiptId: 'a', claimKey: 'p\0f', transition: 'assertion', targetReceiptId: null },
    { receiptId: 'b', claimKey: 'p\0f', transition: 'supersession', targetReceiptId: 'a' },
    { receiptId: 'c', claimKey: 'p\0f', transition: 'withdrawal', targetReceiptId: 'a' },
  ]), /fork|ambiguity/i);
  assert.throws(() => validateFitV4ReceiptLifecycleTransitions([
    { receiptId: 'a', claimKey: 'product-a\0field-a', transition: 'assertion', targetReceiptId: null },
    { receiptId: 'b', claimKey: 'product-b\0field-a', transition: 'withdrawal', targetReceiptId: 'a' },
  ]), /crosses product|identity/i);
});

test('V3 adapter validates a real tracked receipt and preserves ID, semantic hash and exact bytes', () => {
  const bytes = Buffer.from(`${JSON.stringify(TRACKED_V3, null, 2)}\n`);
  const adapter = adaptV3Receipt(bytes, {
    fieldMap: FIELD_MAP, relation: 'CONTAINS', coordinateFrameId: 'installed_appliance', scope: 'product_closed',
  });
  assert.equal(adapter.originalV3ReceiptId, TRACKED_V3.receiptId);
  assert.equal(adapter.originalV3SemanticReceiptSha256, TRACKED_V3.semanticReceiptSha256);
  assert.equal(adapter.originalV3ReceiptSha256, sha256(bytes));
  assert.deepEqual(restoreV3ReceiptBytes(adapter), bytes);
  assert.equal(adapter.v4FieldId, 'envelope.closed.width');
  const swapped = { ...adapter, originalV3ReceiptBytesBase64: Buffer.from(JSON.stringify(TRACKED_V3)).toString('base64') };
  swapped.originalV3ReceiptSha256 = sha256(Buffer.from(swapped.originalV3ReceiptBytesBase64, 'base64'));
  assert.throws(() => restoreV3ReceiptBytes(swapped), /adapter|semantic|schema|binding/i);
  const metadataDrift = { ...adapter, originalV3ReceiptId: 'inst_receipt_fabricated' };
  assert.throws(() => restoreV3ReceiptBytes(metadataDrift), /adapter|receipt ID|binding/i);

  const fabricated = Buffer.from(JSON.stringify({
    receiptId: TRACKED_V3.receiptId, field: TRACKED_V3.field, value: TRACKED_V3.value, unit: TRACKED_V3.unit,
  }));
  assert.throws(() => adaptV3Receipt(fabricated, {
    fieldMap: FIELD_MAP, relation: 'CONTAINS', coordinateFrameId: 'installed_appliance', scope: 'product_closed',
  }), /V3 receipt schema|installation field receipt/i);
});
