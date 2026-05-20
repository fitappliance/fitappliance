import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const {
  auditPdfCoverage,
  buildPdfCoverageRows,
  renderPdfCoverageMarkdown,
  resolveEvidenceIndexPath
} = require(path.join(repoRoot, 'scripts', 'audit-pdf-coverage.js'));

test('PDF coverage audit counts total, verified, missing and percentage by brand', () => {
  const rows = buildPdfCoverageRows([
    { id: 'a', brand: 'Fisher & Paykel', evidence: { has_pdf_evidence: true, trust_level: 'verified_fit' } },
    { id: 'b', brand: 'Fisher & Paykel' },
    { id: 'c', brand: 'LG', evidence: { has_pdf_evidence: true, trust_level: 'dimensions_verified' } },
    { id: 'd', brand: 'LG', evidence: { trust_level: 'retailer_spec' } }
  ], {
    products: {
      c: { has_pdf_evidence: true, trust_level: 'dimensions_verified' }
    }
  });

  assert.deepEqual(rows, [
    { brand: 'Fisher & Paykel', total: 2, verified_fit: 1, dimensions_verified: 0, retailer_spec: 0, missing: 1, evidenceCoverage: 50, verifiedFitCoverage: 50 },
    { brand: 'LG', total: 2, verified_fit: 0, dimensions_verified: 1, retailer_spec: 1, missing: 0, evidenceCoverage: 100, verifiedFitCoverage: 0 }
  ]);
});

test('PDF coverage audit treats evidence-index verification as source of truth', () => {
  const rows = buildPdfCoverageRows([
    { id: 'fridge-a', brand: 'Samsung' },
    { id: 'fridge-b', brand: 'Samsung', evidence: { has_pdf_evidence: false } }
  ], {
    products: {
      'fridge-a': { status: 'verified', has_pdf_evidence: true, trust_level: 'verified_fit' },
      'fridge-b': { status: 'pending', has_pdf_evidence: false }
    }
  });

  assert.deepEqual(rows, [
    { brand: 'Samsung', total: 2, verified_fit: 1, dimensions_verified: 0, retailer_spec: 0, missing: 1, evidenceCoverage: 50, verifiedFitCoverage: 50 }
  ]);
});

test('PDF coverage markdown renders deterministic summary table', () => {
  const markdown = renderPdfCoverageMarkdown([
    { brand: 'LG', total: 10, verified_fit: 5, dimensions_verified: 2, retailer_spec: 1, missing: 2, evidenceCoverage: 80, verifiedFitCoverage: 50 },
    { brand: 'Samsung', total: 5, verified_fit: 1, dimensions_verified: 0, retailer_spec: 0, missing: 4, evidenceCoverage: 20, verifiedFitCoverage: 20 }
  ], { generatedAt: '2026-05-15' });

  assert.match(markdown, /^# Full Catalog PDF Coverage Audit/m);
  assert.match(markdown, /\| Brand \| Total SKUs \| Verified Fit \| Dimensions Verified \| Retailer Spec \| Missing Evidence \| Evidence Coverage % \| Verified Fit % \|/);
  assert.match(markdown, /\| LG \| 10 \| 5 \| 2 \| 1 \| 2 \| 80\.0% \| 50\.0% \|/);
  assert.match(markdown, /\| Samsung \| 5 \| 1 \| 0 \| 0 \| 4 \| 20\.0% \| 20\.0% \|/);
});

test('PDF coverage audit writes a report from explicit file paths', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'fitappliance-pdf-audit-'));
  const catalogPath = path.join(tmp, 'catalog-final.json');
  const evidenceIndexPath = path.join(tmp, 'evidence-index.json');
  const outputPath = path.join(tmp, 'FULL-CATALOG-AUDIT.md');

  writeFileSync(catalogPath, JSON.stringify({
    products: [
      { id: 'fp-1', brand: 'Fisher & Paykel' },
      { id: 'fp-2', brand: 'Fisher & Paykel' }
    ]
  }));
  writeFileSync(evidenceIndexPath, JSON.stringify({
    products: {
      'fp-1': { has_pdf_evidence: true }
    }
  }));

  const result = auditPdfCoverage({ catalogPath, evidenceIndexPath, outputPath, generatedAt: '2026-05-15' });
  assert.equal(result.totals.total, 2);
  assert.equal(result.totals.verified, 1);
  assert.equal(result.rows[0].brand, 'Fisher & Paykel');
  assert.match(readFileSync(outputPath, 'utf8'), /Fisher & Paykel/);
});

test('PDF coverage audit resolves public evidence-index fallback when data index is absent', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'fitappliance-pdf-audit-path-'));
  const resolved = resolveEvidenceIndexPath(tmp);
  assert.equal(resolved, path.join(tmp, 'public', 'data', 'evidence-index.json'));
});
