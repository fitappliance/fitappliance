import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canApproveEvidence,
  createFieldEvidence,
  evidenceLevel,
} from '../../src/domain/evidence.mjs';

const approvedFixture = {
  id: 'ev_width_001',
  productId: 'fa_00000001',
  field: 'closedEnvelope.widthMm',
  value: 790,
  unit: 'mm',
  sourceDocumentId: 'doc_fp_rf505_guide',
  documentSha256: 'a'.repeat(64),
  page: 5,
  quote: 'Overall width 790 mm',
  parserVersion: 'manual-v1',
  identityMatch: 'exact',
  aliasApproved: false,
  documentAuthorType: 'manufacturer',
  transportHostType: 'manufacturer',
  status: 'approved',
};

test('creates a deeply frozen approved field record without mutating input', () => {
  const input = structuredClone(approvedFixture);
  const evidence = createFieldEvidence(input);

  assert.deepEqual(input, approvedFixture);
  assert.notStrictEqual(evidence, input);
  assert.deepEqual(evidence, approvedFixture);
  assert.equal(Object.isFrozen(evidence), true);
});

test('approval gate returns every missing or invalid provenance reason', () => {
  const result = canApproveEvidence({
    ...approvedFixture,
    documentSha256: 'NOT-A-HASH',
    page: 0,
    quote: '   ',
    parserVersion: '',
    identityMatch: 'mismatch',
    documentAuthorType: 'retailer',
    transportHostType: 'retailer',
  });

  assert.equal(result.approved, false);
  assert.deepEqual(result.reasons, [
    'invalid_document_sha256',
    'invalid_page',
    'missing_quote',
    'missing_parser_version',
    'identity_not_approved',
    'document_not_manufacturer_authored',
    'retailer_host_not_approvable',
  ]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.reasons), true);
});

test('approval gate also validates the field fact rather than provenance alone', () => {
  const result = canApproveEvidence({
    ...approvedFixture,
    id: '',
    productId: null,
    field: 'closedEnvelope.widthMm',
    value: 0,
    unit: 'cm',
    sourceDocumentId: '',
  });

  assert.equal(result.approved, false);
  assert.ok(result.reasons.includes('invalid_evidence_id'));
  assert.ok(result.reasons.includes('invalid_product_id'));
  assert.ok(result.reasons.includes('invalid_value'));
  assert.ok(result.reasons.includes('invalid_unit'));
  assert.ok(result.reasons.includes('missing_source_document_id'));
});

test('accepts an alias identity only when the alias mapping was explicitly approved', () => {
  const unapproved = canApproveEvidence({
    ...approvedFixture,
    identityMatch: 'alias',
    aliasApproved: false,
  });
  const approved = canApproveEvidence({
    ...approvedFixture,
    identityMatch: 'alias',
    aliasApproved: true,
  });

  assert.equal(unapproved.approved, false);
  assert.ok(unapproved.reasons.includes('identity_not_approved'));
  assert.deepEqual(approved, { approved: true, reasons: [] });
});

test('keeps authorship separate from transport and rejects retailer-hosted candidates', () => {
  const result = canApproveEvidence({
    ...approvedFixture,
    documentAuthorType: 'manufacturer',
    transportHostType: 'retailer',
  });

  assert.equal(result.approved, false);
  assert.deepEqual(result.reasons, ['retailer_host_not_approvable']);
});

test('does not allow an invalid candidate to claim approved status', () => {
  assert.throws(
    () => createFieldEvidence({
      ...approvedFixture,
      documentSha256: null,
      status: 'approved',
    }),
    /approved evidence.*invalid_document_sha256/i,
  );

  const pending = createFieldEvidence({
    ...approvedFixture,
    documentSha256: null,
    status: 'pending',
  });
  assert.equal(pending.documentSha256, null);
  assert.equal(pending.status, 'pending');
});

test('classifies only fully approved dimension and clearance evidence', () => {
  const dimensions = [
    'closedEnvelope.widthMm',
    'closedEnvelope.heightMm',
    'closedEnvelope.depthMm',
  ].map((field, index) => createFieldEvidence({
    ...approvedFixture,
    id: `ev_dimension_${index}`,
    field,
  }));
  const clearances = [
    'installation.leftMm',
    'installation.rightMm',
    'installation.topMm',
    'installation.rearMm',
    'installation.frontMm',
  ].map((field, index) => createFieldEvidence({
    ...approvedFixture,
    id: `ev_clearance_${index}`,
    field,
    value: index,
  }));

  assert.equal(evidenceLevel([]), 'none');
  assert.equal(evidenceLevel(dimensions.slice(0, 2)), 'none');
  assert.equal(evidenceLevel(dimensions), 'dimensions');
  assert.equal(evidenceLevel([...dimensions, ...clearances]), 'verified');
  assert.equal(evidenceLevel([
    ...dimensions,
    { ...clearances[0], status: 'pending' },
    ...clearances.slice(1),
  ]), 'dimensions');
});

test('rejects string coercion and invalid evidence states', () => {
  assert.throws(() => createFieldEvidence({ ...approvedFixture, value: '790' }), /value/i);
  assert.throws(() => createFieldEvidence({ ...approvedFixture, value: 0 }), /invalid_value/i);
  assert.throws(() => createFieldEvidence({ ...approvedFixture, page: '5' }), /page/i);
  assert.throws(() => createFieldEvidence({ ...approvedFixture, status: 'verified' }), /status/i);
});
