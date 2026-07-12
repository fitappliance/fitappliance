import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildPhase10EvidenceProjection,
  buildPhase10SourceDocuments,
  reviewPhase10Evidence,
} from '../../src/domain/phase10-evidence-review.mjs';

const selection = {
  products: [
    {
      legacyRuntimeId: 'fridge-a', canonicalProductId: 'fa_prod_a', category: 'fridge', brand: 'A', model: 'M1',
      sourceCandidates: [{ sourceDocumentId: 'doc_a' }],
    },
    { legacyRuntimeId: 'fridge-b', canonicalProductId: 'fa_prod_b', category: 'fridge', brand: 'B', model: 'M2' },
  ],
};

const acquisition = {
  schemaVersion: 1,
  entries: [
    {
      legacyRuntimeId: 'fridge-a', outcome: 'acquired', sourceUrl: 'https://media3.bosch-home.com/a.pdf',
      finalUrl: 'https://media3.bosch-home.com/a.pdf', contentType: 'application/pdf', retrievedAt: '2026-07-11T00:00:00.000Z',
      sha256: 'a'.repeat(64), pageCount: 4, parserVersion: 'pdftotext-1',
    },
    { legacyRuntimeId: 'fridge-b', outcome: 'no_source' },
  ],
};

const approvedFields = [
  { field: 'closedEnvelope.widthMm', value: 600, page: 2, quote: 'Width 600 mm', semanticBasis: 'explicit_axis_label' },
  { field: 'closedEnvelope.heightMm', value: 1700, page: 2, quote: 'Height 1700 mm', semanticBasis: 'explicit_axis_label' },
  { field: 'closedEnvelope.depthMm', value: 650, page: 2, quote: 'Depth 650 mm', semanticBasis: 'explicit_axis_label' },
  { field: 'installation.leftMm', value: 20, page: 3, quote: 'Sides 20 mm', semanticBasis: 'explicit_sides_label' },
  { field: 'installation.rightMm', value: 20, page: 3, quote: 'Sides 20 mm', semanticBasis: 'explicit_sides_label' },
  { field: 'operation.doorOpenDepthMm', value: 1100, page: 4, quote: 'Depth with door open 1100 mm', semanticBasis: 'labelled_door_open_diagram' },
];

const input = {
  reviewer: 'Codex PDF visual review', reviewedAt: '2026-07-11',
  reviews: [
    { legacyRuntimeId: 'fridge-a', identityOutcome: 'exact', renderedPageVerified: true, fields: approvedFields },
    { legacyRuntimeId: 'fridge-b', identityOutcome: 'no_source', fields: [], reason: 'manufacturer_pdf_not_found' },
  ],
};

test('requires one explicit outcome per selected product and preserves unknown as unknown', () => {
  const result = reviewPhase10Evidence({ selection, acquisition, input });
  assert.equal(result.outcomes.length, 2);
  assert.equal(result.outcomes[0].state, 'approved');
  assert.equal(result.outcomes[1].state, 'no_source');
  assert.equal(result.outcomes[1].fields.length, 0);
  assert.throws(
    () => reviewPhase10Evidence({ selection, acquisition, input: { ...input, reviews: input.reviews.slice(0, 1) } }),
    /cover every selected product/i,
  );
});

test('requires exact identity, official PDF provenance, rendered review, and all three dimensions', () => {
  assert.throws(() => reviewPhase10Evidence({
    selection, acquisition,
    input: { ...input, reviews: [{ ...input.reviews[0], identityOutcome: 'ambiguous', fields: approvedFields }, input.reviews[1]] },
  }), /ambiguous.*fields/i);
  assert.throws(() => reviewPhase10Evidence({
    selection, acquisition,
    input: { ...input, reviews: [{ ...input.reviews[0], renderedPageVerified: false }, input.reviews[1]] },
  }), /rendered/i);
  assert.throws(() => reviewPhase10Evidence({
    selection, acquisition,
    input: { ...input, reviews: [{ ...input.reviews[0], fields: approvedFields.slice(0, 2) }, input.reviews[1]] },
  }), /three closed-envelope dimensions/i);
});

test('new Phase 10 acquisitions cannot approve a PDF without MinerU JSON provenance', () => {
  const modern = {
    ...acquisition,
    schemaVersion: 2,
    extractionFormat: 'mineru_content_list_v2',
    entries: acquisition.entries.map((entry) => entry.outcome !== 'acquired' ? entry : {
      ...entry,
      parserVersion: 'MinerU-3.4.4',
      derivedArtifact: {
        schemaVersion: 1, format: 'content_list_v2', parserName: 'MinerU', parserVersion: '3.4.4',
        modelRevision: 'ed6b654c018d742e65a17671e379c5e6ecc87ec9',
        backend: 'pipeline', method: 'auto', tableEnabled: true, formulaEnabled: false,
        sourcePdfSha256: entry.sha256, contentSha256: 'b'.repeat(64),
        objectPath: `evidence/derived/mineru-json/sha256/bb/bb/${'b'.repeat(64)}.json`,
        byteSize: 200, pageCount: entry.pageCount,
      },
    }),
  };
  assert.equal(reviewPhase10Evidence({ selection, acquisition: modern, input }).summary.approved, 1);
  assert.throws(() => reviewPhase10Evidence({
    selection,
    acquisition: {
      ...modern,
      entries: modern.entries.map((entry) => entry.outcome === 'acquired'
        ? { ...entry, derivedArtifact: undefined }
        : entry),
    },
    input,
  }), /MinerU|provenance/i);
});

test('builds a dimensions-only projection without inventing complete clearance', () => {
  const result = reviewPhase10Evidence({ selection, acquisition, input });
  const projection = buildPhase10EvidenceProjection(result.outcomes);
  const approved = projection.get('fa_prod_a');
  assert.equal(approved.trustLevel, 'dimensions_verified');
  assert.equal(approved.clearanceVerified, false);
  assert.equal(approved.values['closedEnvelope.widthMm'], 600);
  assert.equal(approved.values['installation.rearMm'], undefined);
  assert.equal(projection.has('fa_prod_b'), false);
});

test('preserves an explicitly labelled adjustable height range', () => {
  const rangeFields = approvedFields.map((field) => field.field === 'closedEnvelope.heightMm'
    ? { ...field, value: { minimumMm: 820, maximumMm: 880 }, quote: 'Height 820 - 880 mm' }
    : field);
  const result = reviewPhase10Evidence({
    selection, acquisition,
    input: { ...input, reviews: [{ ...input.reviews[0], fields: rangeFields }, input.reviews[1]] },
  });
  assert.deepEqual(
    buildPhase10EvidenceProjection(result.outcomes).get('fa_prod_a').values['closedEnvelope.heightMm'],
    { minimumMm: 820, maximumMm: 880 },
  );
});

test('creates approved and quarantined source documents but no phantom no-source document', () => {
  const ambiguousInput = {
    ...input,
    reviews: [input.reviews[0], { ...input.reviews[1], identityOutcome: 'no_source' }],
  };
  const result = reviewPhase10Evidence({ selection, acquisition, input: ambiguousInput });
  const documents = buildPhase10SourceDocuments(result.outcomes);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].id, 'doc_a');
  assert.equal(documents[0].state, 'approved');
  assert.equal(documents[0].fields.length, approvedFields.length);
});

test('committed Phase 10 manifest reaches source registry and public geometry conservatively', () => {
  const manifest = JSON.parse(readFileSync('data/architecture-v2/generated/phase10-evidence-review-manifest.json', 'utf8'));
  const sourceDocuments = JSON.parse(readFileSync('data/architecture-v2/generated/source-documents.json', 'utf8'));
  const projection = JSON.parse(readFileSync('data/architecture-v2/generated/public-catalog-projection.json', 'utf8'));
  assert.deepEqual(manifest.summary, {
    selected: 40, approved: 36, quarantined: 2, noSource: 2, approvedFields: 153,
  });
  const sourceByLegacy = new Map(sourceDocuments.documents.flatMap((document) =>
    document.productLinks.map((link) => [link.legacyRuntimeId, document])));
  assert.equal(sourceByLegacy.get('washing_machine-acw1520').state, 'quarantined');
  assert.notEqual(sourceByLegacy.get('ao-113734')?.state, 'approved');
  const publicByLegacy = new Map(projection.products.map((product) => [product.id, product]));
  assert.deepEqual(
    publicByLegacy.get('dishwasher-adw0959').geometry_v2.closedEnvelope.heightMm,
    { minimumMm: 857, maximumMm: 917 },
  );
  const legacyReviewedSamsung = publicByLegacy.get('discovery-dryer-samsung-dv90bb9440gh');
  assert.equal(legacyReviewedSamsung.evidence.trust_level, 'evidence_pending');
  assert.equal(legacyReviewedSamsung.evidence.clearance_verified, false);
  assert.equal(legacyReviewedSamsung.geometry_v2_provenance, undefined);
  assert.equal(legacyReviewedSamsung.geometry_v2.installation.frontMm, 490);
  assert.equal(publicByLegacy.get('washing_machine-acw1520').geometry_v2, undefined);
});
