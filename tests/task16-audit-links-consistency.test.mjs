import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { auditCompareLinks } = require('../scripts/audit-compare-links.js');
const { auditLinkQuality } = require('../scripts/audit-link-quality.js');

test('task 16 link audits: compare-link and link-quality summaries stay consistent', async () => {
  const [{ summary: compareSummary }, { summary: qualitySummary }] = await Promise.all([
    auditCompareLinks({ repoRoot }),
    auditLinkQuality({ repoRoot })
  ]);

  assert.equal(compareSummary.totalPages, qualitySummary.totalPages);
  assert.equal(compareSummary.pagesWithoutBuyLinks, qualitySummary.noBuyPages);
  assert.equal(compareSummary.pagesWithBuyLinks, compareSummary.totalPages - qualitySummary.noBuyPages);
});

test('task 16 link audits: any page without buy links must be quality tier none', async () => {
  const [{ results }, { pageResults }] = await Promise.all([
    auditCompareLinks({ repoRoot }),
    auditLinkQuality({ repoRoot })
  ]);

  const tierBySlug = new Map(pageResults.map((row) => [row.slug, row.qualityTier]));
  for (const row of results) {
    const qualityTier = tierBySlug.get(row.slug);
    assert.ok(qualityTier, `missing page in quality results: ${row.slug}`);
    if (!row.hasBuyLink) {
      assert.equal(qualityTier, 'none', `${row.slug} expected quality tier none`);
    }
  }
});
