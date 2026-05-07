import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  auditPdfEvidenceCoverage,
  buildMarkdownReport,
  hasApprovedPdfEvidence,
  validateCatalogDimensionShape,
  writePdfEvidenceAuditReports
} = require('../scripts/audit-pdf-evidence.js');

function product(overrides = {}) {
  return {
    id: 'fridge-hisense-hrcd640tbw',
    cat: 'fridge',
    brand: 'Hisense',
    model: 'HRCD640TBW',
    w: 912,
    h: 1785,
    d: 725,
    retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/hisense-fridge' }],
    priorityScore: 60,
    ...overrides
  };
}

test('pdf evidence audit: catalog dimensions can be shape-valid without being PDF verified', () => {
  const report = auditPdfEvidenceCoverage({
    products: [product()],
    manualEvidence: { products: {} },
    now: '2026-05-07T00:00:00.000Z'
  });

  assert.equal(report.summary.totalProducts, 1);
  assert.equal(report.summary.catalogDimensionShapeValid, 1);
  assert.equal(report.summary.approvedPdfEvidenceProducts, 0);
  assert.equal(report.summary.missingPdfEvidenceProducts, 1);
  assert.equal(report.reviewQueue[0].id, 'fridge-hisense-hrcd640tbw');
});

test('pdf evidence audit: approved manufacturer PDF evidence removes product from review queue', () => {
  const report = auditPdfEvidenceCoverage({
    products: [product()],
    manualEvidence: {
      products: {
        'fridge-hisense-hrcd640tbw': {
          evidence: [{
            type: 'manufacturer_manual',
            status: 'approved',
            source_url: 'https://www.hisense.com.au/manuals/hrcd640tbw.pdf'
          }]
        }
      }
    },
    now: '2026-05-07T00:00:00.000Z'
  });

  assert.equal(report.summary.approvedPdfEvidenceProducts, 1);
  assert.equal(report.summary.missingPdfEvidenceProducts, 0);
  assert.equal(report.reviewQueue.length, 0);
});

test('pdf evidence audit: strict extracted evidence is validated with the Zod schema', () => {
  const report = auditPdfEvidenceCoverage({
    products: [product()],
    manualEvidence: {
      products: {
        'fridge-hisense-hrcd640tbw': {
          evidence: [{
            type: 'spec_sheet',
            status: 'approved',
            source_url: 'https://www.hisense.com.au/manuals/hrcd640tbw.pdf',
            extracted: {
              brand: 'Hisense',
              sku: 'HRCD640TBW',
              category: 'FRIDGE',
              dimensions: { height_mm: 1785, width_mm: 912, depth_mm: 725, door_open_90_depth_mm: null },
              clearance_requirements: { top_mm: 20, left_mm: 5, right_mm: 5, rear_mm: 10 },
              flags: { requires_plumbing: true, ventilation_required: true, reversible_door: null },
              metadata: {
                source_pdf_url: 'https://www.hisense.com.au/manuals/hrcd640tbw.pdf',
                extraction_date: '2026-05-07T00:00:00.000Z',
                confidence_score: 0.91
              }
            }
          }]
        }
      }
    },
    now: '2026-05-07T00:00:00.000Z'
  });

  assert.equal(report.summary.strictEvidenceValid, 1);
  assert.equal(report.summary.strictEvidenceInvalid, 0);
  assert.equal(report.summary.catalogPdfDimensionMismatches, 0);
});

test('pdf evidence audit: strict PDF evidence flags catalog dimension mismatches', () => {
  const report = auditPdfEvidenceCoverage({
    products: [product({ id: 'fridge-hisense-hrtf206', model: 'HRTF206', w: 550, h: 1410, d: 490 })],
    manualEvidence: {
      products: {
        'fridge-hisense-hrtf206': {
          evidence: [{
            type: 'spec_sheet',
            status: 'approved',
            source_url: 'https://www.hisense.com.au/manuals/hrtf206-spec.pdf',
            extracted: {
              brand: 'Hisense',
              sku: 'HRTF206',
              category: 'FRIDGE',
              dimensions: { height_mm: 1456, width_mm: 550, depth_mm: 562, door_open_90_depth_mm: null },
              clearance_requirements: { top_mm: 100, left_mm: 50, right_mm: 50, rear_mm: 50 },
              flags: { requires_plumbing: false, ventilation_required: true, reversible_door: false },
              metadata: {
                source_pdf_url: 'https://www.hisense.com.au/manuals/hrtf206-spec.pdf',
                extraction_date: '2026-05-07T00:00:00.000Z',
                confidence_score: 0.97
              }
            }
          }]
        }
      }
    },
    now: '2026-05-07T00:00:00.000Z'
  });

  assert.equal(report.summary.strictEvidenceValid, 1);
  assert.equal(report.summary.catalogPdfDimensionMismatches, 1);
  assert.equal(report.issues.some((issue) => issue.code === 'catalog_pdf_dimension_mismatch'), true);
});

test('pdf evidence audit: invalid strict evidence is reported for manual review', () => {
  const report = auditPdfEvidenceCoverage({
    products: [product()],
    manualEvidence: {
      products: {
        'fridge-hisense-hrcd640tbw': {
          evidence: [{
            type: 'manufacturer_manual',
            status: 'approved',
            source_url: 'https://www.hisense.com.au/manuals/hrcd640tbw.pdf',
            extracted: {
              brand: 'Hisense',
              sku: 'HRCD640TBW',
              category: 'FRIDGE',
              dimensions: { height_mm: 1785, width_mm: 912, depth_mm: null, door_open_90_depth_mm: null },
              clearance_requirements: { top_mm: 20, left_mm: 5, right_mm: 5, rear_mm: 10 },
              flags: { requires_plumbing: true, ventilation_required: true, reversible_door: null },
              metadata: {
                source_pdf_url: 'https://www.hisense.com.au/manuals/hrcd640tbw.pdf',
                extraction_date: '2026-05-07T00:00:00.000Z',
                confidence_score: 0.91
              }
            }
          }]
        }
      }
    },
    now: '2026-05-07T00:00:00.000Z'
  });

  assert.equal(report.summary.strictEvidenceInvalid, 1);
  assert.equal(report.issues.some((issue) => issue.code === 'strict_evidence_invalid'), true);
});

test('pdf evidence audit: review queue prioritizes retailer-linked high-score products', () => {
  const report = auditPdfEvidenceCoverage({
    products: [
      product({ id: 'low', priorityScore: 0, retailers: [] }),
      product({ id: 'high', priorityScore: 80, retailers: [{ n: 'AO', url: 'https://example.com/product' }] })
    ],
    manualEvidence: { products: {} },
    now: '2026-05-07T00:00:00.000Z'
  });

  assert.deepEqual(report.reviewQueue.map((entry) => entry.id), ['high', 'low']);
});

test('pdf evidence audit: helper functions classify dimension shape and approved PDF evidence', () => {
  assert.equal(validateCatalogDimensionShape(product()).valid, true);
  assert.equal(validateCatalogDimensionShape(product({ w: null })).valid, false);
  assert.equal(hasApprovedPdfEvidence({ evidence: [{ type: 'retailer_product_page', status: 'approved' }] }), false);
  assert.equal(hasApprovedPdfEvidence({ evidence: [{ type: 'installation_manual', status: 'approved', source_url: 'https://example.com/manual.pdf' }] }), true);
});

test('pdf evidence audit: markdown and report writer summarize the review plan', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-pdf-evidence-'));
  const report = auditPdfEvidenceCoverage({
    products: [product()],
    manualEvidence: { products: {} },
    now: '2026-05-07T00:00:00.000Z'
  });
  const markdown = buildMarkdownReport(report);
  const outputs = writePdfEvidenceAuditReports(report, { outputDir: dir });

  assert.match(markdown, /PDF Evidence Coverage Audit/);
  assert.match(markdown, /Shape-valid catalog rows are not PDF-verified rows/);
  assert.equal(fs.existsSync(outputs.jsonPath), true);
  assert.equal(fs.existsSync(outputs.markdownPath), true);
});
