import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyEvidencePilotReview, buildPilotEvidenceProjection } from '../../src/domain/evidence-review.mjs';

const bundles = JSON.parse(fs.readFileSync('data/architecture-v2/evidence-review-bundles.json', 'utf8')).bundles;
const manifest = JSON.parse(fs.readFileSync('data/architecture-v2/evidence-pilot-review-manifest.json', 'utf8'));

test('pilot review manifest covers all 20 bundles and all 60 candidate fields', () => {
  assert.equal(manifest.reviews.length, 20);
  assert.equal(new Set(manifest.reviews.map((row) => row.legacyRuntimeId)).size, 20);
  const results = applyEvidencePilotReview({ bundles, manifest });
  assert.equal(results.length, 60);
  assert.equal(results.filter((row) => row.status === 'approved').length, 36);
  assert.equal(results.filter((row) => row.status === 'quarantined').length, 24);
});

test('pilot evidence projection grants dimensions-only trust to complete three-axis reviews', () => {
  const results = applyEvidencePilotReview({ bundles, manifest });
  const projection = buildPilotEvidenceProjection(results);
  assert.equal(projection.size, 20);
  assert.equal([...projection.values()].filter((row) => row.trustLevel === 'dimensions_verified').length, 10);
  assert.equal([...projection.values()].filter((row) => row.reviewStatus === 'partial').length, 3);
  assert.equal([...projection.values()].filter((row) => row.reviewStatus === 'quarantined').length, 7);
  assert.ok([...projection.values()].every((row) => row.clearanceVerified === false));
});

test('every approved pilot field retains reproducible page evidence', () => {
  const results = applyEvidencePilotReview({ bundles, manifest });
  for (const row of results.filter((entry) => entry.status === 'approved')) {
    assert.match(row.documentSha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(row.page) && row.page > 0);
    assert.ok(row.quote.length > 5);
    assert.equal(row.renderedPageVerified, true);
    assert.equal(row.reviewer, 'Codex PDF visual review');
  }
});

test('source-document registry imports pilot lifecycle outcomes', () => {
  const registry = JSON.parse(fs.readFileSync('data/architecture-v2/source-documents.json', 'utf8'));
  const pilotDocumentIds = new Set(bundles.map((row) => row.sourceDocument.id));
  const documents = registry.documents.filter((row) => pilotDocumentIds.has(row.id));
  assert.equal(documents.filter((row) => row.state === 'approved').length, 10);
  assert.equal(documents.filter((row) => row.state === 'reviewed').length, 3);
  assert.equal(documents.filter((row) => row.state === 'quarantined').length, 7);
  assert.ok(documents.filter((row) => row.state === 'approved').every((row) => /^[a-f0-9]{64}$/.test(row.sha256)));
});
