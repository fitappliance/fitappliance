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

test('typed source candidates preserve complete hash-bound support document resource provenance', () => {
  const hash = 'a'.repeat(64);
  const discoveryProvenance = {
    schemaVersion: 1,
    method: 'official_support_api',
    market: 'AU',
    sourceMarket: 'AU',
    discoveryUrl: 'https://mf-support.mfe.fisherpaykel.com/au/api/support/products/WA7560E1',
    requestedModel: 'WA7560E1',
    matchedModel: 'WA7560E1',
    artifactUrl: 'https://dam.fisherpaykel.com/install/WA60.pdf',
    artifactLinkUrl: 'https://dam.fisherpaykel.com/install/WA60.pdf',
    discoveryContentSha256: hash,
    discoveryObjectPath: `evidence/web/sha256/aa/aa/${hash}.json`,
    discoveryByteSize: 123,
    discoveryRecordType: 'support_document_resource',
    documentId: 'documentResources:0',
    documentTitleKey: 'Installation|Installation Guide (English)',
    originalFileName: 'WA60.pdf',
  };
  assert.deepEqual(validateEvidenceSourceCandidate({
    ...candidate,
    sourceUrl: discoveryProvenance.artifactUrl,
    sourceModelHint: 'WA7560E1',
    discoveryProvenance,
  }).discoveryProvenance, discoveryProvenance);
  assert.throws(() => validateEvidenceSourceCandidate({
    ...candidate,
    sourceUrl: discoveryProvenance.artifactUrl,
    sourceModelHint: 'WA7560E1',
    discoveryProvenance: { ...discoveryProvenance, documentTitleKey: undefined },
  }), /title key/i);
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

test('schema-v2 resolver results bind standard source lanes to immutable zero-result provenance', () => {
  const hash = 'b'.repeat(64);
  const provenance = {
    schemaVersion: 1,
    method: 'official_sitemap',
    market: 'AU',
    discoveryUrl: 'https://www.example-brand.com/sitemap.xml',
    requestedModel: 'ABC123',
    contentType: 'application/xml',
    contentSha256: hash,
    objectPath: `evidence/web/sha256/bb/bb/${hash}.xml`,
    byteSize: 321,
  };
  const sourceLanes = [
    {
      laneId: 'current_product', required: true, supported: true,
      status: 'complete', candidateCount: 0, provenance: [provenance], reason: null,
    },
    {
      laneId: 'discontinued_archive', required: true, supported: true,
      status: 'complete', candidateCount: 0, provenance: [provenance], reason: null,
    },
    {
      laneId: 'support_search_api', required: false, supported: false,
      status: 'unsupported', candidateCount: 0, provenance: [], reason: 'No public support API.',
    },
    {
      laneId: 'official_document_cdn', required: true, supported: true,
      status: 'complete', candidateCount: 1, provenance: [provenance], reason: null,
    },
    {
      laneId: 'official_product_detail', required: true, supported: true,
      status: 'complete', candidateCount: 0, provenance: [provenance], reason: null,
    },
  ];
  const result = {
    schemaVersion: 2,
    resolverId: 'example-official-v2',
    version: '2',
    scope: 'all_declared_official_source_lanes',
    required: true,
    completion: 'complete',
    sourceLanes,
    candidates: [{
      ...candidate,
      resolverId: 'example-official-v2',
      resolverVersion: '2',
      sourceLaneId: 'official_document_cdn',
    }],
    failures: [],
  };

  assert.deepEqual(validateEvidenceSourceResolverResult(result).sourceLanes, sourceLanes);
  assert.throws(() => validateEvidenceSourceResolverResult({
    ...result,
    sourceLanes: sourceLanes.map((lane) => lane.laneId === 'official_document_cdn'
      ? { ...lane, candidateCount: 0 }
      : lane),
  }), /candidate count/i);
  assert.throws(() => validateEvidenceSourceResolverResult({
    ...result,
    sourceLanes: sourceLanes.map((lane) => lane.laneId === 'current_product'
      ? { ...lane, provenance: [] }
      : lane),
  }), /provenance/i);
  assert.throws(() => validateEvidenceSourceResolverResult({
    ...result,
    sourceLanes: sourceLanes.map((lane) => lane.laneId === 'support_search_api'
      ? { ...lane, required: true }
      : lane),
  }), /unsupported.*required/i);
});
