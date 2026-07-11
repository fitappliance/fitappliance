import test from 'node:test';
import assert from 'node:assert/strict';
import { findEvidenceReviewCandidates } from '../../src/domain/evidence-review-candidates.mjs';

test('locates identity, dimensions, installation, and operation pages across varied manufacturer wording', () => {
  const text = [
    'Model AB-123\nOverall size (W x H x D): 600 x 850 x 650 mm',
    'Installation\nCabinet clearance at sides 20 mm and behind appliance 100 mm',
    'Product measurements\nDepth with door opened 1150 mm',
  ].join('\f');
  const result = findEvidenceReviewCandidates({ model: 'AB123', text });
  assert.deepEqual(result.identityPages, [1]);
  assert.deepEqual(result.dimensionPages, [1, 3]);
  assert.deepEqual(result.spacePages, [2, 3]);
  assert.deepEqual(result.reviewPages, [1, 2, 3]);
});

test('does not treat a family manual without the exact model token as exact identity', () => {
  const result = findEvidenceReviewCandidates({ model: 'AB-123-X', text: 'Series AB-123\nNet dimensions 600 x 850 x 650 mm' });
  assert.deepEqual(result.identityPages, []);
  assert.deepEqual(result.dimensionPages, [1]);
});
