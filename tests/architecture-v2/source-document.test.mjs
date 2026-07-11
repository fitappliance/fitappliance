import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceDocument, transitionSourceDocument } from '../../src/domain/source-document.mjs';

const base = {
  id: 'doc_1', sourceUrl: 'https://manufacturer.example/spec.pdf', finalUrl: null,
  authorType: 'manufacturer', transportHostType: 'manufacturer', contentType: null,
  retrievedAt: null, sha256: null, pageCount: null, parserVersion: null,
  identityOutcome: null, fields: [], state: 'discovered', history: [],
};

test('enforces ordered document lifecycle and immutable history', () => {
  let doc = createSourceDocument(base);
  doc = transitionSourceDocument(doc, 'fetched', { finalUrl: base.sourceUrl, contentType: 'application/pdf', retrievedAt: '2026-07-11T00:00:00Z' });
  doc = transitionSourceDocument(doc, 'hashed', { sha256: 'a'.repeat(64) });
  assert.equal(doc.state, 'hashed');
  assert.equal(doc.history.length, 2);
  assert.equal(Object.isFrozen(doc), true);
  assert.throws(() => transitionSourceDocument(doc, 'approved', {}), /transition/i);
});

test('rejects HTML error payloads masquerading as PDF endpoints', () => {
  const fetched = transitionSourceDocument(createSourceDocument(base), 'fetched', {
    finalUrl: base.sourceUrl, contentType: 'text/html', retrievedAt: '2026-07-11T00:00:00Z',
  });
  const rejected = transitionSourceDocument(fetched, 'rejected', { reason: 'non_pdf_payload' });
  assert.equal(rejected.state, 'rejected');
  assert.equal(rejected.rejectionReason, 'non_pdf_payload');
});

test('approval requires exact or reviewed alias identity and page-level field evidence', () => {
  const reviewed = createSourceDocument({
    ...base, state: 'reviewed', sha256: 'b'.repeat(64), pageCount: 2, parserVersion: 'parser-v1',
    identityOutcome: 'exact', fields: [{ field: 'closedEnvelope.widthMm', value: 600, unit: 'mm', page: 2, quote: 'Width 600 mm' }],
  });
  assert.equal(transitionSourceDocument(reviewed, 'approved', {}).state, 'approved');
  assert.throws(() => transitionSourceDocument(createSourceDocument({ ...reviewed, fields: [{ field: 'x', value: 1 }] }), 'approved', {}), /field evidence/i);
  assert.throws(() => createSourceDocument({ ...base, state: 'approved' }), /approved document/i);
});
