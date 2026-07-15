import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHistoricalMineruAudit,
  deduplicateHistoricalPdfs,
  selectHistoricalMineruBackfill,
  validateHistoricalPdfInventoryDocument,
} from '../../src/domain/historical-mineru-backfill.mjs';

function pdf(label) {
  return Buffer.from(`%PDF-1.7\n${label}`);
}

test('historical PDF inventory deduplicates physical paths by verified content hash', () => {
  const first = pdf('same-content');
  const documents = deduplicateHistoricalPdfs([
    { relativePath: 'evidence/web/a.pdf', pdfBytes: first },
    { relativePath: 'evidence/objects/a-copy.pdf', pdfBytes: Buffer.from(first) },
    { relativePath: 'evidence/objects/b.pdf', pdfBytes: pdf('different-content') },
  ]);

  assert.equal(documents.length, 2);
  assert.equal(documents.reduce((sum, document) => sum + document.paths.length, 0), 3);
  assert.deepEqual(
    documents.find((document) => document.paths.length === 2).paths,
    ['evidence/objects/a-copy.pdf', 'evidence/web/a.pdf'],
  );
  assert.deepEqual(
    documents.map((document) => document.sourcePdfSha256),
    [...documents.map((document) => document.sourcePdfSha256)].sort(),
  );
});

test('historical PDF inventory rejects invalid payloads and unsafe report paths', () => {
  assert.throws(() => deduplicateHistoricalPdfs([
    { relativePath: 'evidence/not-a-pdf.pdf', pdfBytes: Buffer.from('<html>') },
  ]), /valid PDF/i);
  assert.throws(() => deduplicateHistoricalPdfs([
    { relativePath: '../outside.pdf', pdfBytes: pdf('escape') },
  ]), /relative path/i);
});

test('frozen PDF inventory is replayed one object at a time with hash, size and path validation', () => {
  const bytes = pdf('frozen-object');
  const [document] = deduplicateHistoricalPdfs([
    { relativePath: 'evidence/web/frozen.pdf', pdfBytes: bytes },
  ]);
  assert.deepEqual(validateHistoricalPdfInventoryDocument(document, bytes), document);
  assert.throws(
    () => validateHistoricalPdfInventoryDocument(document, pdf('frozen-objecx')),
    /hash mismatch/i,
  );
  assert.throws(
    () => validateHistoricalPdfInventoryDocument({ ...document, byteSize: document.byteSize + 1 }, bytes),
    /byte size mismatch/i,
  );
});

test('historical MinerU audit classifies cache state and preserves retry history', () => {
  const documents = deduplicateHistoricalPdfs([
    { relativePath: 'evidence/a.pdf', pdfBytes: pdf('a') },
    { relativePath: 'evidence/b.pdf', pdfBytes: pdf('b') },
    { relativePath: 'evidence/c.pdf', pdfBytes: pdf('c') },
    { relativePath: 'evidence/d.pdf', pdfBytes: pdf('d') },
  ]);
  const [a, b, c, d] = documents;
  const audit = buildHistoricalMineruAudit({
    documents,
    cacheStates: [
      {
        sourcePdfSha256: a.sourcePdfSha256,
        status: 'indexed',
        derivedArtifact: { contentSha256: 'a'.repeat(64) },
        processing: { strategy: 'page_ranges', ranges: [[0, 1], [2, 3]] },
      },
      { sourcePdfSha256: b.sourcePdfSha256, status: 'stale', parserVersion: '3.3.0' },
      { sourcePdfSha256: c.sourcePdfSha256, status: 'missing' },
      { sourcePdfSha256: d.sourcePdfSha256, status: 'missing' },
    ],
    attempts: [{ sourcePdfSha256: d.sourcePdfSha256, attempts: 2, lastError: 'timeout' }],
    invalidFiles: [{ relativePath: 'evidence/bad.pdf', error: 'invalid PDF payload' }],
    generatedAt: '2026-07-12T00:00:00.000Z',
    parserVersion: '3.4.4',
    modelRevision: 'e'.repeat(40),
  });

  assert.deepEqual(audit.summary, {
    physicalFiles: 5,
    uniqueDocuments: 4,
    duplicatePhysicalFiles: 0,
    indexed: 1,
    missing: 2,
    stale: 1,
    failed: 0,
    invalidFiles: 1,
    coveragePercent: 25,
  });
  assert.equal(audit.entries.find((entry) => entry.sourcePdfSha256 === d.sourcePdfSha256).attempts, 2);
  assert.equal(audit.entries.find((entry) => entry.sourcePdfSha256 === d.sourcePdfSha256).lastError, 'timeout');
  assert.deepEqual(
    audit.entries.find((entry) => entry.sourcePdfSha256 === a.sourcePdfSha256).processing,
    { strategy: 'page_ranges', ranges: [[0, 1], [2, 3]] },
  );
});

test('historical MinerU audit bounds verbose tool failures while preserving both ends', () => {
  const [document] = deduplicateHistoricalPdfs([
    { relativePath: 'evidence/failure.pdf', pdfBytes: pdf('failure') },
  ]);
  const audit = buildHistoricalMineruAudit({
    documents: [document],
    cacheStates: [{ sourcePdfSha256: document.sourcePdfSha256, status: 'failed' }],
    attempts: [{
      sourcePdfSha256: document.sourcePdfSha256,
      attempts: 1,
      lastError: `command-start ${'progress '.repeat(2000)} final-error`,
    }],
    generatedAt: '2026-07-12T00:00:00.000Z',
    parserVersion: '3.4.4',
    modelRevision: 'e'.repeat(40),
  });
  const message = audit.entries[0].lastError;
  assert.ok(message.length <= 4096);
  assert.match(message, /^command-start/);
  assert.match(message, /final-error$/);
  assert.match(message, /truncated/);
});

test('backfill selection is deterministic, resumable, hash-filtered, and retry bounded', () => {
  const entries = [
    { sourcePdfSha256: 'a'.repeat(64), status: 'indexed', attempts: 1 },
    { sourcePdfSha256: 'b'.repeat(64), status: 'missing', attempts: 0 },
    { sourcePdfSha256: 'c'.repeat(64), status: 'stale', attempts: 1 },
    { sourcePdfSha256: 'd'.repeat(64), status: 'failed', attempts: 3 },
  ];

  assert.deepEqual(
    selectHistoricalMineruBackfill(entries, { limit: 2, maximumAttempts: 3 })
      .map((entry) => entry.sourcePdfSha256),
    ['b'.repeat(64), 'c'.repeat(64)],
  );
  assert.deepEqual(
    selectHistoricalMineruBackfill(entries, { sha256: 'c'.repeat(64) })
      .map((entry) => entry.sourcePdfSha256),
    ['c'.repeat(64)],
  );
  assert.throws(
    () => selectHistoricalMineruBackfill(entries, { sha256: 'f'.repeat(64) }),
    /not found/i,
  );
});
