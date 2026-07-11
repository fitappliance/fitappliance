import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewBundle, reviewField } from '../../src/domain/evidence-review.mjs';

const product = {
  id: 'ao-1', canonicalProductId: 'fa_prod_1', cat: 'fridge', brand: 'LG', model: 'ABC1',
  w: 600, h: 1700, d: 650,
};
const sourceDocument = {
  id: 'doc-1', sourceUrl: 'https://lg.com/manual.pdf', finalUrl: 'https://lg.com/manual.pdf',
  authorType: 'manufacturer', transportHostType: 'manufacturer', contentType: 'application/pdf',
  retrievedAt: '2026-07-11T00:00:00.000Z', sha256: 'a'.repeat(64), pageCount: 4,
  parserVersion: 'pdftotext-25.06', identityOutcome: 'exact',
  productLinks: [{ legacyRuntimeId: 'ao-1', canonicalProductId: 'fa_prod_1' }],
  fields: [{ field: 'closedEnvelope.widthMm', value: 600, unit: 'mm', page: 2, quote: 'Width 600 mm' }],
};

test('creates a pending immutable review bundle without promoting candidate fields', () => {
  const bundle = createReviewBundle({ product, sourceDocument, rawExtraction: { metadata: { model: 'ABC1' } } });
  assert.equal(bundle.status, 'pending');
  assert.equal(bundle.fields[0].status, 'candidate');
  assert.equal(Object.isFrozen(bundle), true);
});

test('approves a field only with complete manufacturer provenance and rendered-page review', () => {
  const bundle = createReviewBundle({ product, sourceDocument, rawExtraction: {} });
  const approved = reviewField(bundle, {
    field: 'closedEnvelope.widthMm',
    status: 'approved',
    reviewer: 'Jagger Zhang',
    reviewedAt: '2026-07-11',
    renderedPageVerified: true,
  });
  assert.equal(approved.status, 'approved');
  assert.equal(approved.sourceDocumentId, 'doc-1');
  assert.equal(approved.page, 2);
  assert.equal(approved.quote, 'Width 600 mm');
});

test('rejects approval when any reproducibility or authorship gate is absent', () => {
  const cases = [
    ['hash', { ...sourceDocument, sha256: null }],
    ['page', { ...sourceDocument, fields: [{ ...sourceDocument.fields[0], page: null }] }],
    ['quote', { ...sourceDocument, fields: [{ ...sourceDocument.fields[0], quote: null }] }],
    ['parser', { ...sourceDocument, parserVersion: null }],
    ['author', { ...sourceDocument, authorType: 'unknown' }],
    ['identity', { ...sourceDocument, identityOutcome: 'family' }],
  ];
  for (const [label, document] of cases) {
    const bundle = createReviewBundle({ product, sourceDocument: document, rawExtraction: {} });
    assert.throws(() => reviewField(bundle, {
      field: 'closedEnvelope.widthMm', status: 'approved', reviewer: 'Jagger Zhang',
      reviewedAt: '2026-07-11', renderedPageVerified: true,
    }), /cannot approve/i, label);
  }
  const bundle = createReviewBundle({ product, sourceDocument, rawExtraction: {} });
  assert.throws(() => reviewField(bundle, {
    field: 'closedEnvelope.widthMm', status: 'approved', reviewer: 'Jagger Zhang',
    reviewedAt: '2026-07-11', renderedPageVerified: false,
  }), /cannot approve/i);
});

test('records rejected and quarantined decisions without requiring approval provenance', () => {
  const bundle = createReviewBundle({ product, sourceDocument: { ...sourceDocument, sha256: null }, rawExtraction: {} });
  const rejected = reviewField(bundle, {
    field: 'closedEnvelope.widthMm', status: 'rejected', reviewer: 'Jagger Zhang',
    reviewedAt: '2026-07-11', reason: 'quote_does_not_match_product', renderedPageVerified: true,
  });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.reason, 'quote_does_not_match_product');
});
