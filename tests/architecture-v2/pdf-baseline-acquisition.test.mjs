import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildWp7aBaselineRerun,
  pdfObjectPath,
  selectExactOfficialPdfCandidates,
  validateFrozenPdfBaseline,
} from '../../src/domain/pdf-baseline-acquisition.mjs';

const BASELINE_PATH = 'data/architecture-v2/reviews/automated/pdf-failure-baseline-100.json';

function sample(overrides = {}) {
  return {
    sampleId: 'pdf_baseline_fixture',
    jobId: 'recovery_fixture',
    category: 'dishwasher',
    brand: 'Westinghouse',
    model: 'WSF6606XA',
    representedTargetCount: 1,
    referenceId: 'fa_ref_fixture',
    lifecycleState: 'CURRENT_RETAIL',
    currentLookupAction: 'MEASURE_REQUIRED',
    publicationEligible: false,
    sourceUrl: 'https://www.appliancesonline.com.au/reference.pdf',
    sourceHost: 'www.appliancesonline.com.au',
    acquisitionRoute: 'MIRROR_PARSE_AND_OFFICIAL_REDISCOVERY',
    priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS',
    sourceDocumentIds: ['doc_fixture'],
    sourcePdfSha256: null,
    documentPattern: {
      hint: 'specification_sheet',
      basis: 'url_path_hint_not_document_evidence',
      confirmed: false,
    },
    pipelineTrace: [{
      layer: 1,
      id: 'acquisition',
      status: 'missing',
      code: 'source_pdf_not_content_addressed',
      detail: 'missing',
    }],
    primaryFailure: {
      layer: 1,
      id: 'acquisition',
      code: 'source_pdf_not_content_addressed',
      detail: 'missing',
    },
    secondaryCauses: [],
    ...overrides,
  };
}

test('committed PDF baseline remains the exact frozen 25 x 4 sample', async () => {
  const baseline = JSON.parse(await readFile(BASELINE_PATH, 'utf8'));
  const validated = validateFrozenPdfBaseline(baseline);

  assert.equal(validated.baselineId, 'pdf-failure-baseline-100-2026-07-27');
  assert.equal(validated.samples.length, 100);
  assert.deepEqual(validated.summary.byCategory, {
    dishwasher: 25,
    dryer: 25,
    fridge: 25,
    washing_machine: 25,
  });
  assert.equal(new Set(validated.samples.map(({ sampleId }) => sampleId)).size, 100);
  assert.equal(new Set(validated.samples.map(({ sourceUrl }) => sourceUrl)).size, 100);
});

test('candidate gate accepts only exact-model official manufacturer documents', () => {
  const target = sample();
  const accepted = {
    sourceUrl: 'https://resource.electrolux.com.au/factsheet.pdf?model=WSF6606XA',
    authorityMode: 'official',
    sourceRole: 'manufacturer_document',
    documentType: 'specification_sheet',
    sourceModelHint: 'WSF6606XA',
    discoveryProvenance: {
      requestedModel: 'WSF6606XA',
      matchedModel: 'WSF6606XA',
      market: 'AU',
    },
  };
  const candidates = selectExactOfficialPdfCandidates(target, [
    accepted,
    { ...accepted, sourceUrl: target.sourceUrl, authorityMode: 'reference', sourceRole: 'retailer_reference' },
    { ...accepted, sourceUrl: 'https://example.test/sibling.pdf', sourceModelHint: 'WSF6606XB' },
    { ...accepted, sourceUrl: 'https://example.test/family.pdf', sourceModelHint: 'WSF6606X' },
    { ...accepted, sourceUrl: 'https://example.test/page', documentType: 'product_page', sourceRole: 'manufacturer_product_page' },
    { ...accepted, sourceUrl: 'https://example.test/mismatch.pdf', discoveryProvenance: {
      requestedModel: 'WSF6606XA', matchedModel: 'WSF6606XB', market: 'AU',
    } },
  ]);

  assert.deepEqual(candidates, [accepted]);
});

test('content-addressed PDF path is deterministic and rejects malformed hashes', () => {
  const hash = 'ab'.repeat(32);
  assert.equal(pdfObjectPath(hash), `evidence/web/sha256/ab/ab/${hash}.pdf`);
  assert.throws(() => pdfObjectPath('not-a-sha'), /sha-256/i);
});

test('WP7A rerun preserves frozen identity and publication isolation', () => {
  const frozen = {
    schemaVersion: 1,
    baselineId: 'pdf-failure-baseline-100-2026-07-27',
    builtOn: '2026-07-27',
    parserMutationCount: 0,
    selectionPolicy: {},
    inputHashes: {},
    summary: { total: 1, byCategory: { dishwasher: 1 } },
    samples: [sample()],
    familyBacklog: {},
  };
  const hash = 'ab'.repeat(32);
  const attempts = [{
    sampleId: 'pdf_baseline_fixture',
    status: 'indexed',
    officialSourceUrl: 'https://resource.electrolux.com.au/factsheet.pdf?model=WSF6606XA',
    contentSha256: hash,
    objectPath: pdfObjectPath(hash),
    byteSize: 1234,
    finalUrl: 'https://resource.electrolux.com.au/factsheet.pdf?model=WSF6606XA&download=1',
    redirectChain: [{
      status: 302,
      from: 'https://resource.electrolux.com.au/factsheet.pdf?model=WSF6606XA',
      to: 'https://resource.electrolux.com.au/factsheet.pdf?model=WSF6606XA&download=1',
    }],
    transport: 'fetch',
    documentType: 'specification_sheet',
    discoveryMethod: 'electrolux_factsheet_endpoint',
    discoveryProvenance: {
      requestedModel: 'WSF6606XA',
      matchedModel: 'WSF6606XA',
      market: 'AU',
    },
    derivedArtifact: {
      format: 'content_list_v2',
      sourcePdfSha256: hash,
      contentSha256: 'cd'.repeat(32),
      objectPath: `evidence/derived/mineru-json/sha256/cd/cd/${'cd'.repeat(32)}.json`,
      pageCount: 4,
    },
  }];

  const rerun = buildWp7aBaselineRerun(frozen, attempts, {
    baselineSha256: 'ef'.repeat(32),
    builtOn: '2026-07-27',
  });
  const result = rerun.samples[0];

  assert.equal(result.sampleId, frozen.samples[0].sampleId);
  assert.equal(result.brand, frozen.samples[0].brand);
  assert.equal(result.model, frozen.samples[0].model);
  assert.equal(result.sourceUrl, frozen.samples[0].sourceUrl);
  assert.equal(result.publicationEligible, false);
  assert.equal(result.acquisition.officialSourceUrl, attempts[0].officialSourceUrl);
  assert.equal(result.acquisition.finalUrl, attempts[0].finalUrl);
  assert.deepEqual(result.acquisition.redirectChain, attempts[0].redirectChain);
  assert.equal(result.acquisition.transport, 'fetch');
  assert.equal(result.acquisition.documentType, 'specification_sheet');
  assert.equal(result.acquisition.discoveryMethod, 'electrolux_factsheet_endpoint');
  assert.deepEqual(result.acquisition.discoveryProvenance, attempts[0].discoveryProvenance);
  assert.equal(result.sourcePdfSha256, hash);
  assert.equal(result.primaryFailure.id, 'page_table_association');
  assert.deepEqual(rerun.selection.sampleIds, ['pdf_baseline_fixture']);
});

test('WP7A rerun rejects sample drift and unknown attempt ids', () => {
  const frozen = {
    schemaVersion: 1,
    baselineId: 'pdf-failure-baseline-100-2026-07-27',
    samples: [sample()],
    summary: { total: 1, byCategory: { dishwasher: 1 } },
  };
  assert.throws(() => buildWp7aBaselineRerun(frozen, [{
    sampleId: 'unknown', status: 'official_candidate_not_found',
  }], { baselineSha256: 'ef'.repeat(32), builtOn: '2026-07-27' }), /unknown sample/i);
});
