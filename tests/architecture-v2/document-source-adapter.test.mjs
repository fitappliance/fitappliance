import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentSourceAdapter, inspectDocumentPayload, deduplicateDocuments, createOcrExtraction } from '../../src/domain/document-source-adapter.mjs';

test('common adapter limits discovery to declared manufacturer hosts', () => {
  const adapter = createDocumentSourceAdapter({ id: 'electrolux', manufacturer: 'Electrolux', allowedHosts: ['resource.electrolux.com.au'], parserVersion: 'electrolux-v2' });
  assert.equal(adapter.parserVersion, 'electrolux-v2');
  assert.equal(adapter.accepts('https://resource.electrolux.com.au/Public/File/?Id=1'), true);
  assert.equal(adapter.accepts('https://retailer.example/spec.pdf'), false);
});

test('payload inspection rejects HTML and error documents at PDF-like endpoints', () => {
  assert.deepEqual(inspectDocumentPayload({ contentType: 'application/pdf', bytes: Buffer.from('%PDF-1.7') }), { accepted: true, reason: null });
  assert.deepEqual(inspectDocumentPayload({ contentType: 'text/html', bytes: Buffer.from('<html>Error</html>') }), { accepted: false, reason: 'non_pdf_content_type' });
  assert.equal(inspectDocumentPayload({ contentType: 'application/pdf', bytes: Buffer.from('error') }).reason, 'invalid_pdf_signature');
});

test('hash deduplication preserves every product identity link', () => {
  const result = deduplicateDocuments([
    { id: 'a', sha256: '1'.repeat(64), productId: 'fa_prod_1' },
    { id: 'b', sha256: '1'.repeat(64), productId: 'fa_prod_2' },
  ]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].productIds, ['fa_prod_1', 'fa_prod_2']);
});

test('OCR remains extraction evidence and requires rendered-page verification', () => {
  assert.throws(() => createOcrExtraction({ imageBased: true, renderedPageVerified: false, engine: 'tesseract', engineVersion: '5', confidence: 0.9, pages: [] }), /rendered/i);
  const result = createOcrExtraction({ imageBased: true, renderedPageVerified: true, engine: 'tesseract', engineVersion: '5', confidence: 0.9, pages: [{ page: 1, text: 'Width 600 mm' }] });
  assert.equal(result.approvalState, 'extracted_not_approved');
});
