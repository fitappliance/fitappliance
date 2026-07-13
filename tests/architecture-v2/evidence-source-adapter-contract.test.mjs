import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEvidenceSourceResolverAdapter,
  validateEvidenceSourceCandidate,
  validateEvidenceSourceResolverResult,
} from '../../src/domain/evidence-source-adapter-contract.mjs';

const candidate = {
  sourceUrl: 'https://www.example-brand.com/manuals/ABC123.pdf#page=3',
  resolverId: 'example-official',
  resolverVersion: '1',
  discoveryMethod: 'official_support_api',
  documentType: 'installation_guide',
  sourceModelHint: 'ABC123',
  authorityMode: 'official',
  sourceRole: 'manufacturer_document',
  requiredAttempt: true,
  batchJobId: null,
};

test('typed source candidates bind discovery provenance and canonical HTTPS URL', () => {
  assert.deepEqual(validateEvidenceSourceCandidate(candidate), {
    ...candidate,
    sourceUrl: 'https://www.example-brand.com/manuals/ABC123.pdf',
  });
});

test('source candidate contract rejects parsed appliance facts and unknown fields', () => {
  for (const forbidden of [
    { widthMm: 600 },
    { dimensions: { widthMm: 600 } },
    { claims: [] },
    { clearances: { rearMm: 50 } },
    { parsedData: { height: 850 } },
  ]) {
    assert.throws(() => validateEvidenceSourceCandidate({ ...candidate, ...forbidden }), /unknown|parsed/i);
  }
});

test('resolver result rejects metadata drift, duplicates and false complete partial results', () => {
  const result = {
    schemaVersion: 1,
    resolverId: 'example-official',
    version: '1',
    scope: 'exact_model_support_documents',
    required: true,
    completion: 'complete',
    candidates: [candidate],
    failures: [],
  };
  assert.deepEqual(validateEvidenceSourceResolverResult(result), {
    ...result,
    candidates: [{
      ...candidate,
      sourceUrl: 'https://www.example-brand.com/manuals/ABC123.pdf',
    }],
  });
  assert.throws(() => validateEvidenceSourceResolverResult({
    ...result,
    candidates: [candidate, candidate],
  }), /duplicate candidate/i);
  assert.throws(() => validateEvidenceSourceResolverResult({
    ...result,
    failures: [{ code: 'product_page_timeout', sourceUrl: candidate.sourceUrl }],
  }), /cannot be complete/i);
  assert.throws(() => validateEvidenceSourceResolverResult({
    ...result,
    candidates: [{ ...candidate, resolverVersion: '2' }],
  }), /resolver version/i);
});

test('resolver adapter preserves explicit completion and normalizes candidates only', async () => {
  const adapter = createEvidenceSourceResolverAdapter({
    resolverId: 'example-official',
    version: '1',
    scope: 'exact_model_support_documents',
    required: true,
    resolve: async () => ({
      completion: 'failed',
      candidates: [candidate],
      failures: [{ code: 'second_page_failed', sourceUrl: candidate.sourceUrl }],
    }),
  });
  const result = await adapter.resolve({ brand: 'Example', model: 'ABC123' });
  assert.equal(result.completion, 'failed');
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.failures, [{
    code: 'second_page_failed',
    sourceUrl: 'https://www.example-brand.com/manuals/ABC123.pdf',
  }]);
});
