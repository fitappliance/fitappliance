import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLegacyPdfLibraryAudit } from '../../src/domain/legacy-pdf-library-audit.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function historicalRecords() {
  return [
    {
      referenceId: 'fa_ref_one', category: 'fridge', brand: 'Example', model: 'EX100',
      catalogProductIds: ['legacy-one'], lifecycleState: 'CURRENT_RETAIL',
    },
    {
      referenceId: 'fa_ref_two', category: 'dishwasher', brand: 'Other', model: 'DW1',
      catalogProductIds: [], lifecycleState: 'REGISTRY_ONLY',
    },
  ];
}

function oldSummary(overrides = {}) {
  return {
    relativePath: 'data/pdf-evidence-raw/EX100.json',
    data: {
      product_id: 'legacy-one', category: 'fridge', brand: 'Example', model: 'EX100',
      source_url: 'https://manufacturer.example/EX100.pdf',
      extracted: {
        dimensions: { width_mm: 600, height_mm: 1700, depth_mm: 700 },
        clearance_requirements: { top_mm: 0, left_mm: 0, right_mm: 0, rear_mm: 0 },
        flags: { requires_plumbing: false, ventilation_required: false },
      },
    },
    ...overrides,
  };
}

test('legacy audit accounts for every physical PDF and old summary without trusting legacy claims', () => {
  const audit = buildLegacyPdfLibraryAudit({
    generatedAt: '2026-07-14T00:00:00.000Z',
    historicalRecords: historicalRecords(),
    legacySummaries: [
      oldSummary(),
      oldSummary({
        relativePath: 'data/pdf-evidence-raw/UNKNOWN.json',
        data: { ...oldSummary().data, product_id: 'unknown', brand: 'Ghost', model: 'UNKNOWN' },
      }),
    ],
    sourceDocuments: [{
      id: 'doc_one', sourceUrl: 'https://manufacturer.example/EX100.pdf', finalUrl: null,
      authorType: 'manufacturer', transportHostType: 'manufacturer', sha256: HASH_A,
      parserVersion: 'pdftotext-26.06.0', identityOutcome: 'exact',
      productLinks: [{ legacyRuntimeId: 'legacy-one', canonicalProductId: null }],
      fields: [{ field: 'closedEnvelope.widthMm', value: 600 }], state: 'approved',
    }],
    pdfInventory: {
      entries: [
        { sourcePdfSha256: HASH_A, byteSize: 10, paths: ['evidence/web/a.pdf', 'evidence/objects/a.pdf'] },
        { sourcePdfSha256: HASH_B, byteSize: 20, paths: ['evidence/web/b.pdf'] },
      ],
      invalidFiles: [],
    },
    mineruIndexes: [
      { sourcePdfSha256: HASH_A, status: 'indexed', parserVersion: '3.4.4', modelRevision: 'model-one' },
      { sourcePdfSha256: HASH_C, status: 'indexed', parserVersion: '3.4.4', modelRevision: 'model-one' },
    ],
    grammarDocuments: [{
      sourcePdfSha256: HASH_A,
      extractionState: 'ALL_AXIS_SCALAR',
      grammarProfileIds: ['grammar_one'],
      modelLinks: [{ category: 'fridge', brand: 'Example', model: 'EX100', identityScope: 'PAGE_SCOPED_EXACT' }],
    }],
    receiptEntries: [],
  });

  assert.deepEqual(audit.summary, {
    physicalFiles: 3,
    uniquePdfDocuments: 2,
    duplicatePhysicalFiles: 1,
    invalidPdfFiles: 0,
    mineruIndexes: 2,
    orphanMineruIndexes: 1,
    legacySummaries: 2,
    matchedLegacySummaries: 1,
    unmatchedLegacySummaries: 1,
    sourceDocuments: 1,
    modelLinks: 1,
    byRepairAction: { CONVERT_STORED_PDF: 1, OFFLINE_REPLAY: 1 },
  });
  const exact = audit.pdfDocuments.find((entry) => entry.sourcePdfSha256 === HASH_A);
  assert.equal(exact.sourceAuthority, 'OFFICIAL');
  assert.equal(exact.identityScope, 'PAGE_SCOPED_EXACT');
  assert.equal(exact.extractionState, 'ALL_AXIS_SCALAR');
  assert.equal(exact.repairAction, 'OFFLINE_REPLAY');
  assert.deepEqual(exact.physicalPaths, ['evidence/objects/a.pdf', 'evidence/web/a.pdf']);
  assert.deepEqual(exact.modelLinks.map((entry) => entry.referenceId), ['fa_ref_one']);

  const orphan = audit.pdfDocuments.find((entry) => entry.sourcePdfSha256 === HASH_B);
  assert.equal(orphan.repairAction, 'CONVERT_STORED_PDF');
  assert.ok(orphan.issueCodes.includes('ORPHAN_PHYSICAL_PDF'));
  assert.deepEqual(audit.orphanMineruIndexes.map((entry) => entry.sourcePdfSha256), [HASH_C]);

  const legacy = audit.legacySummaries.find((entry) => entry.relativePath.endsWith('/EX100.json'));
  assert.equal(legacy.claimState, 'LEGACY_UNBOUND');
  assert.equal(legacy.sourceAuthority, 'OFFICIAL');
  assert.ok(legacy.issueCodes.includes('LEGACY_ZERO_CLEARANCE_UNTRUSTED'));
  assert.ok(legacy.issueCodes.includes('LEGACY_BOOLEAN_FLAG_UNTRUSTED'));
  assert.deepEqual(legacy.referenceIds, ['fa_ref_one']);
});

test('legacy audit does not infer official authority from a URL and detects duplicate summary model keys', () => {
  const audit = buildLegacyPdfLibraryAudit({
    generatedAt: '2026-07-14T00:00:00.000Z',
    historicalRecords: historicalRecords(),
    legacySummaries: [
      oldSummary(),
      oldSummary({ relativePath: 'data/pdf-evidence-raw/EX100-copy.json' }),
    ],
    sourceDocuments: [],
    pdfInventory: { entries: [], invalidFiles: [] },
    mineruIndexes: [], grammarDocuments: [], receiptEntries: [],
  });

  assert.equal(audit.legacySummaries[0].sourceAuthority, 'NONE');
  assert.equal(audit.duplicateLegacyModelKeys.length, 1);
  assert.deepEqual(audit.duplicateLegacyModelKeys[0].relativePaths, [
    'data/pdf-evidence-raw/EX100-copy.json', 'data/pdf-evidence-raw/EX100.json',
  ]);
});

test('legacy audit routes stored but stale or missing MinerU objects without duplicate conversion', () => {
  const audit = buildLegacyPdfLibraryAudit({
    generatedAt: '2026-07-14T00:00:00.000Z', historicalRecords: historicalRecords(),
    legacySummaries: [], sourceDocuments: [],
    pdfInventory: {
      entries: [
        { sourcePdfSha256: HASH_A, byteSize: 10, paths: ['evidence/web/a.pdf'] },
        { sourcePdfSha256: HASH_B, byteSize: 20, paths: ['evidence/web/b.pdf'] },
      ], invalidFiles: [],
    },
    mineruIndexes: [{ sourcePdfSha256: HASH_A, status: 'stale' }],
    grammarDocuments: [], receiptEntries: [],
  });
  assert.equal(audit.pdfDocuments.find((entry) => entry.sourcePdfSha256 === HASH_A).repairAction, 'RECONVERT_STORED_PDF');
  assert.equal(audit.pdfDocuments.find((entry) => entry.sourcePdfSha256 === HASH_B).repairAction, 'CONVERT_STORED_PDF');
});

test('legacy audit does not promote source-link identity to exact PDF identity without content proof', () => {
  const audit = buildLegacyPdfLibraryAudit({
    generatedAt: '2026-07-14T00:00:00.000Z', historicalRecords: historicalRecords(),
    legacySummaries: [],
    sourceDocuments: [{
      id: 'doc_one', sourceUrl: 'https://manufacturer.example/family-manual.pdf',
      authorType: 'manufacturer', transportHostType: 'manufacturer', sha256: HASH_A,
      identityOutcome: 'exact', productLinks: [{ legacyRuntimeId: 'legacy-one' }],
    }],
    pdfInventory: { entries: [{ sourcePdfSha256: HASH_A, byteSize: 10, paths: ['evidence/web/a.pdf'] }], invalidFiles: [] },
    mineruIndexes: [{ sourcePdfSha256: HASH_A, status: 'indexed' }],
    grammarDocuments: [{
      sourcePdfSha256: HASH_A, extractionState: 'PARSER_GAP', grammarProfileIds: [],
      modelLinks: [{
        category: 'fridge', brand: 'Example', model: 'EX100', identityScope: 'UNPROVEN',
        extractionState: 'PARSER_GAP',
      }],
    }],
    receiptEntries: [],
  });

  assert.equal(audit.pdfDocuments[0].sourceAuthority, 'OFFICIAL');
  assert.equal(audit.pdfDocuments[0].identityScope, 'UNPROVEN');
  assert.equal(audit.pdfDocuments[0].repairAction, 'IDENTITY_RESEARCH');
});

test('legacy audit keeps extraction state on each PDF-model edge', () => {
  const audit = buildLegacyPdfLibraryAudit({
    generatedAt: '2026-07-14T00:00:00.000Z', historicalRecords: historicalRecords(),
    legacySummaries: [],
    sourceDocuments: [{
      id: 'doc_one', sourceUrl: 'https://manufacturer.example/EX100.pdf',
      authorType: 'manufacturer', transportHostType: 'manufacturer', sha256: HASH_A,
      productLinks: [{ legacyRuntimeId: 'legacy-one' }],
    }],
    pdfInventory: { entries: [{ sourcePdfSha256: HASH_A, byteSize: 10, paths: ['evidence/web/a.pdf'] }], invalidFiles: [] },
    mineruIndexes: [{ sourcePdfSha256: HASH_A, status: 'indexed' }],
    grammarDocuments: [{
      sourcePdfSha256: HASH_A, extractionState: 'ALL_AXIS_SCALAR', grammarProfileIds: [],
      modelLinks: [{
        category: 'fridge', brand: 'Example', model: 'EX100', identityScope: 'EXACT_MODEL',
        extractionState: 'PARSER_GAP',
      }],
    }],
    receiptEntries: [],
  });
  assert.equal(audit.pdfDocuments[0].extractionState, 'PARSER_GAP');
  assert.equal(audit.pdfDocuments[0].modelLinks[0].extractionState, 'PARSER_GAP');
  assert.equal(audit.pdfDocuments[0].repairAction, 'OFFLINE_PARSER_REPAIR');
});
