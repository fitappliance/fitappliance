import test from 'node:test';
import assert from 'node:assert/strict';
import contract from '../../scripts/pdf-pipeline/lib/source-result-contract.js';

const { validateSourceResult } = contract;

test('common PDF source result contract classifies official manufacturer transport', () => {
  const result = validateSourceResult({
    sourceUrl: 'https://resource.electrolux.com.au/Public/File/?Id=1',
    source: 'westinghouse-official-spec_sheet', target: { brand: 'Westinghouse', sku: 'WHE1' },
  });
  assert.equal(result.transportHostType, 'manufacturer');
  assert.equal(result.documentAuthorType, 'manufacturer');
});

test('retailer transport cannot be promoted by an official-looking source label', () => {
  const result = validateSourceResult({
    sourceUrl: 'https://www.appliancesonline.com.au/spec.pdf',
    source: 'westinghouse-official-spec_sheet', target: { brand: 'Westinghouse', sku: 'WHE1' },
  });
  assert.equal(result.transportHostType, 'retailer');
  assert.equal(result.documentAuthorType, 'unknown');
  assert.equal(result.approvableTransport, false);
});

test('source result contract rejects insecure and malformed URLs', () => {
  assert.throws(() => validateSourceResult({ sourceUrl: 'http://example.com/a.pdf', source: 'x', target: {} }), /HTTPS/i);
  assert.throws(() => validateSourceResult({ sourceUrl: 'not-url', source: 'x', target: {} }), /URL/i);
});
