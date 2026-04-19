import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const {
  evaluateCompareQuality,
  verifyCompareQuality
} = require('../scripts/verify-compare-quality.js');

test('task 16 verify-quality: passes when summaries are aligned and thresholds are met', () => {
  const result = evaluateCompareQuality({
    compareSummary: {
      totalPages: 10,
      pagesWithoutBuyLinks: 0
    },
    qualitySummary: {
      totalPages: 10,
      searchOnlyPages: 0,
      noBuyPages: 0
    },
    maxSearchOnlyPages: 0,
    maxNoBuyPages: 0
  });

  assert.equal(result.ok, true);
  assert.equal(result.failures.length, 0);
});

test('task 16 verify-quality: fails when no-buy counts are inconsistent', () => {
  const result = evaluateCompareQuality({
    compareSummary: {
      totalPages: 10,
      pagesWithoutBuyLinks: 1
    },
    qualitySummary: {
      totalPages: 10,
      searchOnlyPages: 0,
      noBuyPages: 0
    },
    maxSearchOnlyPages: 0,
    maxNoBuyPages: 0
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /No-buy mismatch/);
});

test('task 16 verify-quality: fails when search-only exceeds threshold', () => {
  const result = evaluateCompareQuality({
    compareSummary: {
      totalPages: 10,
      pagesWithoutBuyLinks: 0
    },
    qualitySummary: {
      totalPages: 10,
      searchOnlyPages: 2,
      noBuyPages: 0
    },
    maxSearchOnlyPages: 0,
    maxNoBuyPages: 0
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /searchOnlyPages/);
});

test('task 16 verify-quality: integration gate passes on current repository state', async () => {
  const result = await verifyCompareQuality({
    repoRoot
  });

  assert.equal(result.ok, true);
  assert.equal(result.qualitySummary.searchOnlyPages, 0);
  assert.equal(result.qualitySummary.noBuyPages, 0);
});
