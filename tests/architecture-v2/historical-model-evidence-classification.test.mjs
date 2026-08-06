import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  CLASSIFICATION_ENUMS,
  buildHistoricalModelEvidenceClassification,
  buildHistoricalModelPdfBaseline,
  classifyHistoricalModelEvidence,
  renderHistoricalModelEvidenceClassificationMarkdown,
  validateHistoricalModelEvidenceClassificationPolicy,
} from '../../src/domain/historical-model-evidence-classification.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function reference(overrides = {}) {
  return {
    referenceId: 'fa_ref_one',
    category: 'fridge',
    brand: 'Example',
    model: 'EX100',
    lifecycleState: 'CURRENT_RETAIL',
    evidenceState: 'IDENTITY_ONLY',
    lookupAction: 'MEASURE_REQUIRED',
    ...overrides,
  };
}

function link(overrides = {}) {
  return {
    documentId: 'doc_one',
    evidenceObjectIds: ['object_one'],
    reasonCodes: ['EXACT_OFFICIAL_DOCUMENT'],
    corpusState: 'CURRENT_MINERU',
    sourceAuthority: 'OFFICIAL',
    identityScope: 'EXACT_MODEL',
    extractionState: 'ALL_AXIS_SCALAR',
    receiptState: 'NONE',
    ...overrides,
  };
}

test('baseline freezes the model denominator and excludes volatile environment values from its digest', () => {
  const input = {
    generatedAt: '2026-07-14T00:00:00.000Z',
    expectedReferenceCount: 2,
    historicalReference: {
      sourceSnapshotHashes: { catalog: HASH_A },
      records: [
        reference(),
        reference({
          referenceId: 'fa_ref_two', category: 'dishwasher', brand: 'Other', model: 'DW1',
          lifecycleState: 'CATALOG_ARCHIVED', evidenceState: 'REGISTRY_CONSISTENT',
          lookupAction: 'CONFIRM_REQUIRED',
        }),
      ],
    },
    artifactHashes: {
      historicalReference: HASH_A,
      sourceDocuments: HASH_B,
    },
    legacySummaries: [{ relativePath: 'data/pdf-evidence-raw/EX100.json', modelKey: 'EX100' }],
    sourceDocuments: [{ id: 'doc_one' }, { id: 'doc_two' }],
    pdfInventory: {
      entries: [{ sourcePdfSha256: HASH_A, paths: ['evidence/web/a.pdf', 'evidence/objects/a.pdf'] }],
      invalidFiles: [{ relativePath: 'evidence/web/bad.pdf', error: 'invalid PDF' }],
    },
    mineruIndexes: [{ sourcePdfSha256: HASH_A, status: 'indexed', parserVersion: '3.4.4' }],
    acceptanceBundle: { entries: [{ targetId: 'target_one', referenceId: 'fa_ref_one' }] },
    projections: { currentCount: 1, historicalCount: 2 },
    environment: {
      storageMarker: 'fitappliance-storage-v1', volumeUuid: 'volume-one', freeBytes: 10,
      parserVersion: '3.4.4', modelRevision: 'model-one',
    },
  };

  const first = buildHistoricalModelPdfBaseline(input);
  const second = buildHistoricalModelPdfBaseline({
    ...input,
    generatedAt: '2026-07-14T01:00:00.000Z',
    environment: { ...input.environment, freeBytes: 999 },
  });

  assert.equal(first.summary.models.total, 2);
  assert.deepEqual(first.summary.models.byCategory, { dishwasher: 1, fridge: 1 });
  assert.deepEqual(first.summary.pdfs, {
    physicalFiles: 3,
    validPhysicalFiles: 2,
    uniqueDocuments: 1,
    duplicatePhysicalFiles: 1,
    invalidFiles: 1,
  });
  assert.equal(first.summary.receipts.entries, 1);
  assert.equal(first.semanticBaselineSha256, second.semanticBaselineSha256);
  assert.notEqual(first.generatedAt, second.generatedAt);
  assert.notEqual(first.environment.freeBytes, second.environment.freeBytes);
});

test('baseline rejects duplicate references, denominator drift, and orphan receipts', () => {
  const base = {
    generatedAt: '2026-07-14T00:00:00.000Z',
    expectedReferenceCount: 1,
    historicalReference: { records: [reference()] },
    artifactHashes: { historicalReference: HASH_A },
    legacySummaries: [], sourceDocuments: [],
    pdfInventory: { entries: [], invalidFiles: [] }, mineruIndexes: [],
    acceptanceBundle: { entries: [] }, projections: {}, environment: {},
  };

  assert.throws(() => buildHistoricalModelPdfBaseline({
    ...base,
    historicalReference: { records: [reference(), reference()] },
    expectedReferenceCount: 2,
  }), /duplicate reference/i);
  assert.throws(() => buildHistoricalModelPdfBaseline({ ...base, expectedReferenceCount: 2 }), /expected 2/i);
  assert.throws(() => buildHistoricalModelPdfBaseline({
    ...base,
    acceptanceBundle: { entries: [{ targetId: 'target_missing', referenceId: 'fa_ref_missing' }] },
  }), /receipt.*historical reference/i);
});

test('classification enums and lifecycle priorities are closed and deterministic', () => {
  assert.deepEqual(CLASSIFICATION_ENUMS.categories, ['dishwasher', 'dryer', 'fridge', 'washing_machine']);
  assert.deepEqual(CLASSIFICATION_ENUMS.priorities, [
    'P0_CURRENT_RETAIL', 'P1_CATALOG_ARCHIVED', 'P2_REGISTRY_ONLY', 'P3_CONFLICT',
  ]);
  assert.throws(() => classifyHistoricalModelEvidence({
    reference: reference({ category: 'oven' }), documentLinks: [], conflictState: 'NONE',
  }), /category/i);
});

test('committed classification policy is valid and covers every operational class', async () => {
  const policy = validateHistoricalModelEvidenceClassificationPolicy(JSON.parse(await readFile(
    new URL('../../data/architecture-v2/policies/historical-model-evidence-classification-policy.json', import.meta.url),
    'utf8',
  )));
  assert.equal(policy.policyVersion, 'historical-model-evidence-classification-v2');
  assert.equal(policy.expectedReferenceCount, 8087);
  assert.deepEqual(Object.keys(policy.actions).sort(), [...CLASSIFICATION_ENUMS.operationalClasses].sort());
});

test('classification preserves every document edge and does not infer authority from official-looking URLs', () => {
  const classified = classifyHistoricalModelEvidence({
    reference: reference(),
    conflictState: 'NONE',
    documentLinks: [
      link({ documentId: 'doc_z', corpusState: 'LEGACY_METADATA_ONLY', sourceAuthority: 'REFERENCE' }),
      link({ documentId: 'doc_a', sourceUrl: 'https://manufacturer.example/EX100.pdf', sourceAuthority: 'NONE' }),
    ],
  });

  assert.equal(classified.operationalClass, 'REFERENCE_REDISCOVERY');
  assert.equal(classified.bestCorpusState, 'CURRENT_MINERU');
  assert.deepEqual(classified.documentLinks.map((entry) => entry.documentId), ['doc_a', 'doc_z']);
  assert.deepEqual(classified.corpusSummary, { CURRENT_MINERU: 1, LEGACY_METADATA_ONLY: 1 });
  assert.equal(classified.sourceAuthority, 'REFERENCE');
});

test('exact current MinerU replays offline, but exact-authority conflicts outrank a valid receipt', () => {
  const replay = classifyHistoricalModelEvidence({
    reference: reference(), conflictState: 'NONE', documentLinks: [link()],
  });
  assert.equal(replay.operationalClass, 'OFFLINE_REPLAY');
  assert.equal(replay.nextAction, 'REPLAY_CURRENT_MINERU');

  const receiptWithConflict = classifyHistoricalModelEvidence({
    reference: reference(),
    conflictState: 'SOURCE_CONFLICT',
    documentLinks: [link({ receiptState: 'CURRENT_VALID' })],
  });
  assert.equal(receiptWithConflict.operationalClass, 'CONFLICT_QUARANTINE');
  assert.equal(receiptWithConflict.priority, 'P3_CONFLICT');
});

test('a current receipt completes dimensions only when authority, identity, extraction and evidence IDs are explicit', () => {
  const complete = classifyHistoricalModelEvidence({
    reference: reference(), conflictState: 'NONE',
    documentLinks: [link({ receiptState: 'CURRENT_VALID' })],
  });
  assert.equal(complete.operationalClass, 'COMPLETE_RECEIPT');
  assert.equal(complete.nextAction, 'NO_ACTION');

  assert.throws(() => classifyHistoricalModelEvidence({
    reference: reference(), conflictState: 'NONE',
    documentLinks: [link({ receiptState: 'CURRENT_VALID', evidenceObjectIds: [] })],
  }), /evidence object/i);
});

test('a failed current receipt replay remains a parser repair even when another source still completes the model', () => {
  const classified = classifyHistoricalModelEvidence({
    reference: reference(),
    conflictState: 'NONE',
    documentLinks: [
      link({ documentId: 'current_receipt', receiptState: 'CURRENT_VALID' }),
      link({
        documentId: 'stale_pdf_receipt',
        extractionState: 'PARSER_GAP',
        receiptState: 'LEGACY_UNBOUND',
        reasonCodes: ['CURRENT_RECEIPT_REPLAY_FAILED_CLAIM_REPLAY_MISMATCH'],
      }),
    ],
  });

  assert.equal(classified.operationalClass, 'OFFLINE_PARSER_REPAIR');
  assert.equal(classified.nextAction, 'REPAIR_SHARED_GRAMMAR');
});

test('unresolved PDF identity remains visible unless a current exact receipt supersedes it', () => {
  const unresolved = classifyHistoricalModelEvidence({
    reference: reference(), conflictState: 'NONE',
    documentLinks: [
      link({
        documentId: 'legacy_exact_label', corpusState: 'LEGACY_METADATA_ONLY',
        extractionState: 'NOT_PARSED', receiptState: 'LEGACY_UNBOUND',
      }),
      link({
        documentId: 'hybrid_audit', identityScope: 'AMBIGUOUS',
        extractionState: 'PARSER_GAP', receiptState: 'NONE',
      }),
    ],
  });
  assert.equal(unresolved.operationalClass, 'IDENTITY_RESEARCH');
  assert.equal(unresolved.identityScope, 'AMBIGUOUS');

  const receiptSuperseded = classifyHistoricalModelEvidence({
    reference: reference(), conflictState: 'NONE',
    documentLinks: [
      link({ documentId: 'current_receipt', receiptState: 'CURRENT_VALID' }),
      link({
        documentId: 'archival_ambiguous', corpusState: 'STORED_PDF',
        identityScope: 'AMBIGUOUS', extractionState: 'PARSER_GAP', receiptState: 'NONE',
      }),
    ],
  });
  assert.equal(receiptSuperseded.operationalClass, 'COMPLETE_RECEIPT');
  assert.equal(receiptSuperseded.identityScope, 'EXACT_MODEL');
});

test('a current MinerU PDF with unresolved identity routes to identity closure instead of reacquisition', () => {
  const classified = classifyHistoricalModelEvidence({
    reference: reference(),
    conflictState: 'NONE',
    documentLinks: [link({
      sourceUrl: 'https://manufacturer.example/manual.pdf',
      identityScope: 'AMBIGUOUS',
      extractionState: 'PARSER_GAP',
      receiptState: 'NONE',
    })],
  });

  assert.equal(classified.operationalClass, 'IDENTITY_RESEARCH');
  assert.equal(classified.nextAction, 'RUN_IDENTITY_CLOSURE');
});

test('stored PDFs are converted before identity research and official legacy URLs are reacquired', () => {
  const stored = classifyHistoricalModelEvidence({
    reference: reference(), conflictState: 'NONE',
    documentLinks: [link({
      corpusState: 'STORED_PDF', sourceAuthority: 'NONE', identityScope: 'AMBIGUOUS',
      extractionState: 'NOT_PARSED',
    })],
  });
  assert.equal(stored.operationalClass, 'PDF_RECONVERT');

  const legacyOfficial = classifyHistoricalModelEvidence({
    reference: reference(), conflictState: 'NONE',
    documentLinks: [link({
      corpusState: 'LEGACY_METADATA_ONLY', sourceAuthority: 'OFFICIAL',
      sourceUrl: 'https://manufacturer.example/EX100.pdf', extractionState: 'NOT_PARSED',
    })],
  });
  assert.equal(legacyOfficial.operationalClass, 'OFFICIAL_REACQUIRE');
});

test('full classification accounts for every model once and renders reconciled category/brand summaries', () => {
  const policy = {
    ...JSON.parse(JSON.stringify((/** @type {any} */ ({
      schemaVersion: 1,
      policyVersion: 'test-v1',
      expectedReferenceCount: 2,
      blockingConflicts: ['SOURCE_CONFLICT', 'IDENTITY_CONFLICT', 'INVALID_DIMENSIONS'],
      receiptEligibleAuthorities: ['OFFICIAL'],
      exactIdentityScopes: ['EXACT_MODEL', 'PAGE_SCOPED_EXACT'],
      completeExtractionStates: ['ALL_AXIS_SCALAR', 'ALL_AXIS_RANGE'],
      currentReceiptState: 'CURRENT_VALID',
      lifecyclePriorities: {
        CURRENT_RETAIL: 'P0_CURRENT_RETAIL', CATALOG_ARCHIVED: 'P1_CATALOG_ARCHIVED',
        REGISTRY_ONLY: 'P2_REGISTRY_ONLY', UNKNOWN_RETAIL: 'P2_REGISTRY_ONLY',
      },
      conflictPriority: 'P3_CONFLICT',
      actions: Object.fromEntries(CLASSIFICATION_ENUMS.operationalClasses.map((value) => [value, value])),
    })))),
  };
  const snapshot = buildHistoricalModelEvidenceClassification({
    generatedAt: '2026-07-14T00:00:00.000Z',
    policy,
    historicalRecords: [
      reference(),
      reference({
        referenceId: 'fa_ref_two', category: 'dishwasher', brand: 'Other', model: 'DW1',
        lifecycleState: 'REGISTRY_ONLY', evidenceState: 'INTERNAL_CONFLICT',
      }),
    ],
    linksByReference: {
      fa_ref_one: [link({ receiptState: 'CURRENT_VALID' })],
      fa_ref_two: [],
    },
    groupsByReference: {
      fa_ref_one: [{ groupType: 'marketing_series', groupName: 'Series A', grammarProfileIds: ['grammar_one'] }],
    },
  });
  assert.equal(snapshot.records.length, 2);
  assert.deepEqual(snapshot.summary.byOperationalClass, { COMPLETE_RECEIPT: 1, OFFICIAL_DISCOVERY: 1 });
  assert.equal(snapshot.records.find((entry) => entry.referenceId === 'fa_ref_one').groups[0].groupName, 'Series A');
  const markdown = renderHistoricalModelEvidenceClassificationMarkdown(snapshot);
  assert.match(markdown, /Historical Model Evidence Classification|2 \/ 2|Series A/i);
  assert.equal(markdown.endsWith('\n\n'), false);
  assert.throws(() => buildHistoricalModelEvidenceClassification({
    generatedAt: '2026-07-14T00:00:00.000Z', policy,
    historicalRecords: [reference(), reference()], linksByReference: {}, groupsByReference: {},
  }), /duplicate reference/i);
});
