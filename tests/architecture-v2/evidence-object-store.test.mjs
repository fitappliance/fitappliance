import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildEvidenceObjectIndex,
  buildEvidenceObjectRecords,
  evidenceObjectPaths,
} from '../../src/domain/evidence-object-store.mjs';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const textHashA = 'c'.repeat(64);
const textHashB = 'd'.repeat(64);

test('builds deterministic SHA-sharded relative object paths', () => {
  assert.deepEqual(evidenceObjectPaths(hashA), {
    pdf: `evidence/objects/sha256/aa/${hashA}.pdf`,
    text: `evidence/text/sha256/aa/${hashA}.txt`,
    renderDirectory: `evidence/renders/sha256/aa/${hashA}`,
  });
  assert.throws(() => evidenceObjectPaths('/Volumes/UGREEN-1TB/file.pdf'), /sha-256/i);
});

test('deduplicates documents by hash while preserving product links and review pages', () => {
  const index = buildEvidenceObjectIndex([
    {
      sha256: hashA, byteSize: 100, textSha256: textHashA, textByteSize: 10, pageCount: 3, sourceUrl: 'https://manufacturer.example/a.pdf',
      legacyRuntimeId: 'fridge-a', canonicalProductId: 'fa_a', reviewPages: [2, 1],
    },
    {
      sha256: hashA, byteSize: 100, textSha256: textHashA, textByteSize: 10, pageCount: 3, sourceUrl: 'https://manufacturer.example/a.pdf',
      legacyRuntimeId: 'fridge-b', canonicalProductId: 'fa_b', reviewPages: [2, 3],
    },
    {
      sha256: hashB, byteSize: 200, textSha256: textHashB, textByteSize: 20, pageCount: 2, sourceUrl: 'https://manufacturer.example/b.pdf',
      legacyRuntimeId: 'dryer-b', canonicalProductId: 'fa_c', reviewPages: [1],
    },
  ]);
  assert.equal(index.documents.length, 2);
  assert.deepEqual(index.documents[0].reviewPages, [1, 2, 3]);
  assert.deepEqual(index.documents[0].productLinks.map((row) => row.legacyRuntimeId), ['fridge-a', 'fridge-b']);
  assert.ok(Object.values(index.documents[0].paths).every((value) => !String(value).startsWith('/')));
});

test('rejects conflicting object facts and invalid review pages', () => {
  const base = {
    sha256: hashA, byteSize: 100, textSha256: textHashA, textByteSize: 10, pageCount: 3, sourceUrl: 'https://manufacturer.example/a.pdf',
    legacyRuntimeId: 'fridge-a', canonicalProductId: 'fa_a', reviewPages: [2],
  };
  assert.throws(() => buildEvidenceObjectIndex([base, { ...base, byteSize: 101 }]), /conflicting byte size/i);
  assert.throws(() => buildEvidenceObjectIndex([{ ...base, reviewPages: [4] }]), /review page/i);
  assert.throws(() => buildEvidenceObjectIndex([{ ...base, sourceUrl: '/tmp/a.pdf' }]), /https/i);
});

test('joins review decisions to bundles and merges dimension and space review pages', () => {
  const records = buildEvidenceObjectRecords({
    dimensionReviews: [{ id: 'fridge-a', hash: hashA, pages: 3, page: 2 }],
    spaceReviews: [{
      legacyRuntimeId: 'fridge-a', documentSha256: hashA, pageCount: 3,
      fields: [{ page: 1 }, { page: 2 }],
    }],
    bundles: [{
      product: { legacyRuntimeId: 'fridge-a', canonicalProductId: 'fa_a' },
      sourceDocument: { sourceUrl: 'https://manufacturer.example/a.pdf', sha256: hashA, pageCount: 3 },
    }],
    fileFacts: new Map([['fridge-a', { byteSize: 123, textSha256: textHashA, textByteSize: 12 }]]),
  });
  assert.deepEqual(records, [{
    sha256: hashA,
    byteSize: 123,
    textSha256: textHashA,
    textByteSize: 12,
    pageCount: 3,
    sourceUrl: 'https://manufacturer.example/a.pdf',
    legacyRuntimeId: 'fridge-a',
    canonicalProductId: 'fa_a',
    reviewPages: [1, 2],
  }]);
});

test('rejects review joins with inconsistent document identity', () => {
  const input = {
    dimensionReviews: [{ id: 'fridge-a', hash: hashA, pages: 3, page: 2 }],
    spaceReviews: [],
    bundles: [{
      product: { legacyRuntimeId: 'fridge-a', canonicalProductId: 'fa_a' },
      sourceDocument: { sourceUrl: 'https://manufacturer.example/a.pdf', sha256: hashB, pageCount: 3 },
    }],
    fileFacts: new Map([['fridge-a', { byteSize: 123, textSha256: textHashA, textByteSize: 12 }]]),
  };
  assert.throws(() => buildEvidenceObjectRecords(input), /hash mismatch/i);
});

test('committed object index covers every Phase 8 and Phase 9 reviewed document', async () => {
  const [index, dimensionInput, spaceInput] = await Promise.all([
    readFile('data/architecture-v2/evidence-object-index.json', 'utf8').then(JSON.parse),
    readFile('data/architecture-v2/evidence-pilot-review-input.json', 'utf8').then(JSON.parse),
    readFile('data/architecture-v2/space-evidence-pilot-input.json', 'utf8').then(JSON.parse),
  ]);
  const byHash = new Map(index.documents.map((document) => [document.sha256, document]));
  assert.deepEqual(index.summary, {
    documents: 20,
    productLinks: 20,
    reviewPages: 24,
    totalBytes: 70178518,
    totalTextBytes: 856145,
  });
  for (const review of dimensionInput.reviews) {
    const document = byHash.get(review.hash);
    assert.ok(document, `missing dimension review object ${review.id}`);
    assert.ok(document.reviewPages.includes(review.page), `missing review page ${review.id}:${review.page}`);
  }
  for (const review of spaceInput.reviews) {
    const document = byHash.get(review.documentSha256);
    assert.ok(document, `missing space review object ${review.legacyRuntimeId}`);
    for (const field of review.fields) {
      assert.ok(document.reviewPages.includes(field.page), `missing space review page ${review.legacyRuntimeId}:${field.page}`);
    }
  }
});
